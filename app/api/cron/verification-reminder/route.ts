import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';
import { getSiteUrl } from '@/lib/env-mode';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/cron/verification-reminder
 *
 * Taeglich auszufuehren (z.B. 08:00 Uhr Berlin-Zeit). Findet Buchungen mit
 * `verification_required=true` und noch offenem Ausweis-Check, deren
 * Mietbeginn in 5/4/3 Tagen ist, und sendet eine eskalierende Erinnerungsmail
 * mit Link zum Ausweis-Upload. Der Auto-Storno greift dann bei T-2.
 *
 * Idempotenz: es wird im email_log geprueft, ob heute schon eine Erinnerung
 * fuer diese Buchung rausging — verhindert doppelte Mails bei Mehrfach-Cron.
 *
 * Crontab-Beispiel (Hetzner):
 *   0 8 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *       https://cam2rent.de/api/cron/verification-reminder
 */
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Re-Entry-Schutz: doppelte Cron-Trigger duerfen nicht zweimal Mails senden.
  const lock = await acquireCronLock('verification-reminder');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason });
  }
  try {

  const supabase = createServiceClient();

  // Alle noch offenen Buchungen mit Verification-Gate laden.
  // Query ist defensiv — wenn die Migration noch nicht durch ist, faellt die
  // Query mit Fehler zurueck und wir antworten mit 0 Reminders.
  let bookings: Array<{
    id: string;
    customer_email: string | null;
    customer_name: string | null;
    product_name: string | null;
    rental_from: string;
    user_id: string | null;
  }> = [];
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, product_name, rental_from, user_id')
      .eq('verification_required', true)
      .is('verification_gate_passed_at', null)
      .in('status', ['confirmed', 'shipped']);
    if (error) throw error;
    bookings = data ?? [];
  } catch (err) {
    console.error('[verification-reminder] select fehlgeschlagen (Migration fehlt?):', err);
    return NextResponse.json({ ok: true, processed: 0, error: 'migration_missing' });
  }

  // Profile mit inzwischen verifiziertem Status ausfiltern (Customer hat
  // Ausweis hochgeladen + Admin hat verifiziert, aber das Gate wurde noch
  // nicht manuell gesetzt — dann kein Reminder mehr).
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean) as string[])];
  const verifiedUserIds = new Set<string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, verification_status')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      if (p.verification_status === 'verified') verifiedUserIds.add(p.id);
    }
  }

  // Duplikats-Schutz: heutige Reminders holen
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayLog } = await supabase
    .from('email_log')
    .select('booking_id')
    .eq('email_type', 'verification_reminder')
    .gte('created_at', todayStart.toISOString());
  const alreadySent = new Set((todayLog ?? []).map((e) => e.booking_id).filter(Boolean));

  const baseUrl = await getSiteUrl();
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const b of bookings) {
    if (!b.customer_email) { skipped++; continue; }
    if (b.user_id && verifiedUserIds.has(b.user_id)) { skipped++; continue; }
    if (alreadySent.has(b.id)) { skipped++; continue; }

    // Tage bis Mietbeginn
    const rentalStart = new Date(b.rental_from);
    const diffDays = Math.ceil((rentalStart.getTime() - Date.now()) / 86_400_000);
    // Nur an 5/4/3 Tagen erinnern. Auto-Storno greift bei T-2.
    if (![5, 4, 3].includes(diffDays)) { skipped++; continue; }

    const uploadUrl = `${baseUrl}/konto/verifizierung?booking=${encodeURIComponent(b.id)}`;
    const urgency = `in ${diffDays} Tagen`;
    const isFinal = diffDays === 3; // letzte Erinnerung vor Auto-Storno
    const subject = isFinal
      ? `LETZTE ERINNERUNG: Ausweis fuer Buchung ${b.id} — Storno in 24h`
      : `Ausweis-Upload fuer deine Buchung ${b.id} (${urgency})`;
    const html = `<!DOCTYPE html>
<html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${BUSINESS.name}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#9a3412;">${isFinal ? 'Letzte Erinnerung — morgen wird storniert' : 'Ausweis fehlt noch'}</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${b.customer_name || 'Kunde'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${b.id}</strong> (${b.product_name || 'Kamera'}) startet <strong>${urgency}</strong>. Damit wir die Kamera rechtzeitig versenden koennen, brauchen wir eine Kopie deines Personalausweises.</p>
    <p style="margin:0 0 24px;"><a href="${uploadUrl}" style="display:inline-block;padding:14px 28px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Ausweis jetzt hochladen</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${isFinal
      ? 'Wenn bis morgen Mittag kein Ausweis vorliegt, stornieren wir die Buchung automatisch und erstatten dir den vollen Betrag. Einfacher fuer alle, wenn du den Upload jetzt erledigst — dauert 30 Sekunden.'
      : 'Ohne verifizierten Ausweis wird die Buchung kurz vor Mietbeginn automatisch storniert, weil wir sonst den Versandtermin nicht halten koennen. Bei rechtzeitigem Upload ist das kein Problem.'}</p>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Fragen? Einfach auf diese Mail antworten.</p>
  </td></tr>
</table></td></tr></table></body></html>`;

    try {
      await sendAndLog({
        to: b.customer_email,
        subject,
        html,
        bookingId: b.id,
        emailType: 'verification_reminder',
      });
      processed++;
    } catch (err) {
      errors.push(`${b.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    total: bookings.length,
    errors: errors.length > 0 ? errors : undefined,
  });
  } finally {
    await releaseCronLock('verification-reminder');
  }
}
