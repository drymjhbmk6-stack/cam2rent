import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { BUSINESS } from '@/lib/business-config';
import {
  parseImapMessage,
  isAutomatedEmail,
  processInboundEmail,
} from '@/lib/inbound-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET/POST /api/cron/inbound-email-poll
 *
 * Holt neue Kunden-E-Mails per IMAP aus dem Support-Postfach
 * (Google Workspace) und schreibt sie ueber processInboundEmail() in
 * /admin/nachrichten. Kostenlose Alternative zum Resend-Inbound-Webhook.
 *
 * Zustand (zuletzt verarbeitete IMAP-UID) liegt in admin_settings, damit
 * der Lesestatus im Gmail-Postfach NICHT veraendert wird.
 *
 * Crontab (alle 3 Min):
 *   *\/3 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cam2rent.de/api/cron/inbound-email-poll
 */

const STATE_KEY = 'inbound_email_imap_state';
const MAX_PER_RUN = 50;

interface ImapState {
  uidValidity: string;
  lastUid: number;
}

async function loadState(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<ImapState | null> {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', STATE_KEY)
    .maybeSingle();
  let value: unknown = data?.value;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (value && typeof value === 'object') {
    const v = value as { uidValidity?: unknown; lastUid?: unknown };
    if (typeof v.uidValidity === 'string' && typeof v.lastUid === 'number') {
      return { uidValidity: v.uidValidity, lastUid: v.lastUid };
    }
  }
  return null;
}

async function saveState(
  supabase: ReturnType<typeof createServiceClient>,
  state: ImapState,
): Promise<void> {
  await supabase
    .from('admin_settings')
    .upsert({ key: STATE_KEY, value: state }, { onConflict: 'key' });
}

async function handler(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = process.env.INBOUND_IMAP_USER;
  const pass = process.env.INBOUND_IMAP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ skipped: 'not_configured' });
  }
  const host = process.env.INBOUND_IMAP_HOST || 'imap.gmail.com';
  const port = Number(process.env.INBOUND_IMAP_PORT || '993');

  const lock = await acquireCronLock('inbound-email-poll');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  const supabase = createServiceClient();
  const ownSuffix = `@${BUSINESS.domain}`.toLowerCase();

  try {
    const state = await loadState(supabase);

    const client = new ImapFlow({
      host, port, secure: true,
      auth: { user, pass },
      logger: false,
    });

    let fetched: Array<{ uid: number; source: Buffer }> = [];
    let uidValidity = '';
    let highestUid = 0;

    await client.connect();
    const mboxLock = await client.getMailboxLock('INBOX');
    try {
      const mb = client.mailbox;
      if (!mb) throw new Error('INBOX nicht verfuegbar');
      uidValidity = mb.uidValidity.toString();
      highestUid = Math.max(0, mb.uidNext - 1);

      // Erster Lauf oder UID-Reset (UIDVALIDITY geaendert): nur "scharf
      // stellen" — ab jetzt eingehende Mails werden erfasst, der Bestand
      // davor nicht rueckwirkend importiert.
      if (!state || state.uidValidity !== uidValidity) {
        await saveState(supabase, { uidValidity, lastUid: highestUid });
      } else if (highestUid > state.lastUid) {
        const messages = await client.fetchAll(
          `${state.lastUid + 1}:*`,
          { uid: true, source: true },
          { uid: true },
        );
        for (const m of messages) {
          // IMAP-Quirk: "N:*" liefert bei N>max die letzte Mail mit.
          if (m.uid <= state.lastUid || !m.source) continue;
          fetched.push({ uid: m.uid, source: m.source });
        }
        fetched.sort((a, b) => a.uid - b.uid);
        if (fetched.length > MAX_PER_RUN) fetched = fetched.slice(0, MAX_PER_RUN);
      }
    } finally {
      mboxLock.release();
    }
    await client.logout();

    if (fetched.length === 0) {
      return NextResponse.json({ ok: true, armed: !state, processed: 0 });
    }

    let processedUpTo = state!.lastUid;
    let created = 0, duplicate = 0, skipped = 0, errors = 0;
    let migrationPending = false;

    for (const item of fetched) {
      let mail;
      try {
        const parsed = await simpleParser(item.source);
        if (isAutomatedEmail(parsed)) {
          skipped++;
          processedUpTo = item.uid;
          continue;
        }
        mail = parseImapMessage(parsed);
      } catch {
        errors++;
        processedUpTo = item.uid;
        continue;
      }

      // Eigene System-/Report-Mails an das Support-Postfach ueberspringen.
      if (!mail || mail.from.endsWith(ownSuffix)) {
        skipped++;
        processedUpTo = item.uid;
        continue;
      }

      const result = await processInboundEmail(supabase, mail);
      if (result.status === 'migration_pending') {
        // Migration fehlt — Lauf abbrechen, Zustand NICHT vorruecken,
        // damit nach der Migration ab hier weitergemacht wird.
        migrationPending = true;
        break;
      }
      if (result.status === 'created') created++;
      else if (result.status === 'duplicate') duplicate++;
      else errors++;
      processedUpTo = item.uid;
    }

    if (processedUpTo > state!.lastUid) {
      await saveState(supabase, { uidValidity, lastUid: processedUpTo });
    }

    return NextResponse.json({
      ok: !migrationPending,
      migration_pending: migrationPending,
      created, duplicate, skipped, errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'IMAP-Fehler' },
      { status: 500 },
    );
  } finally {
    await releaseCronLock('inbound-email-poll');
  }
}

export const GET = handler;
export const POST = handler;
