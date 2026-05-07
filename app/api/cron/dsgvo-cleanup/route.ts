import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET/POST /api/cron/dsgvo-cleanup
 *
 * Sweep 8 K13/H3/H15: DSGVO-Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO).
 * Datenschutzerklaerung verspricht Auto-Loeschung — der Cron muss den Inhalt
 * dieses Versprechens auch wirklich umsetzen, sonst hohes Bussgeldrisiko.
 *
 * Pflicht-Bereinigungen:
 * 1. Ausweis-Scans nach 90 Tagen ab Verifizierung loeschen (Storage + DB).
 * 2. page_views nach 90 Tagen loeschen (Datenschutz Z. 184).
 * 3. client_errors nach 30 Tagen loeschen (IP+UA+URL — log-client-error
 *    Sweep 8 H15).
 * 4. email_log nach 24 Monaten ohne booking_id loeschen (mit booking_id
 *    bleiben sie wegen GoBD-Aufbewahrung 10 Jahre).
 *
 * Empfohlener Crontab-Eintrag (taeglich 03:30):
 *   30 3 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/dsgvo-cleanup
 */
async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('dsgvo-cleanup');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const results: Record<string, unknown> = {};

    // Sweep 9 H2: 3 Branches statt 1 — Postgres `&lt; cutoff` matcht nie NULL,
    // d.h. Profile mit verification_status='pending' (Ausweis hochgeladen, nie
    // geprueft) und 'rejected' (abgelehnt) blieben fuer immer im Bucket.
    // Datenschutzerklaerung verspricht aber Sofort-Loeschung bei Ablehnung.
    const wipeIdDocs = async (rows: Array<{ id: string }> | null | undefined) => {
      let n = 0;
      for (const p of rows ?? []) {
        try {
          const { data: files } = await supabase.storage.from('id-documents').list(p.id);
          if (files && files.length > 0) {
            const paths = files.map((f) => `${p.id}/${f.name}`);
            await supabase.storage.from('id-documents').remove(paths);
          }
          await supabase
            .from('profiles')
            .update({ id_front_url: null, id_back_url: null })
            .eq('id', p.id);
          n++;
        } catch (e) {
          console.error('[dsgvo-cleanup] id-doc cleanup error', p.id, e);
        }
      }
      return n;
    };

    // 1a) Verifizierte Profile: Loeschung 90 Tage nach verified_at
    try {
      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: verifiedRows } = await supabase
        .from('profiles')
        .select('id, id_front_url, id_back_url, verified_at')
        .eq('verification_status', 'verified')
        .lt('verified_at', cutoff90)
        .or('id_front_url.not.is.null,id_back_url.not.is.null')
        .limit(200);
      results.id_documents_verified_deleted = await wipeIdDocs(verifiedRows);
    } catch (e) {
      results.id_documents_verified_error = (e as Error).message;
    }

    // 1b) Abgelehnte Profile: SOFORT loeschen (Datenschutzerklaerung Versprechen)
    try {
      const { data: rejectedRows } = await supabase
        .from('profiles')
        .select('id, id_front_url, id_back_url')
        .eq('verification_status', 'rejected')
        .or('id_front_url.not.is.null,id_back_url.not.is.null')
        .limit(200);
      results.id_documents_rejected_deleted = await wipeIdDocs(rejectedRows);
    } catch (e) {
      results.id_documents_rejected_error = (e as Error).message;
    }

    // 1c) Pending Profile mit Upload >= 30 Tage ohne Verifizierungs-Aktion
    try {
      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: pendingRows } = await supabase
        .from('profiles')
        .select('id, id_front_url, id_back_url, updated_at')
        .eq('verification_status', 'pending')
        .lt('updated_at', cutoff30)
        .or('id_front_url.not.is.null,id_back_url.not.is.null')
        .limit(200);
      results.id_documents_pending_deleted = await wipeIdDocs(pendingRows);
    } catch (e) {
      results.id_documents_pending_error = (e as Error).message;
    }

    // 2) page_views nach 90 Tagen
    try {
      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('page_views')
        .delete({ count: 'exact' })
        .lt('created_at', cutoff90);
      if (error) throw error;
      results.page_views_deleted = count ?? 0;
    } catch (e) {
      // Tabelle existiert evtl. nicht
      results.page_views_error = (e as Error).message;
    }

    // 3) client_errors nach 30 Tagen
    try {
      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('client_errors')
        .delete({ count: 'exact' })
        .lt('created_at', cutoff30);
      if (error) throw error;
      results.client_errors_deleted = count ?? 0;
    } catch (e) {
      results.client_errors_error = (e as Error).message;
    }

    // 4) email_log nach 24 Monaten OHNE booking_id (mit Booking → 10 Jahre GoBD)
    try {
      // Sweep 9 M2: korrekt mit setMonth(-24) statt 24*30 Tage
      const cutoffDate24m = new Date();
      cutoffDate24m.setMonth(cutoffDate24m.getMonth() - 24);
      const cutoff24m = cutoffDate24m.toISOString();
      const { count, error } = await supabase
        .from('email_log')
        .delete({ count: 'exact' })
        .is('booking_id', null)
        .lt('sent_at', cutoff24m);
      if (error) throw error;
      results.email_log_deleted = count ?? 0;
    } catch (e) {
      results.email_log_error = (e as Error).message;
    }

    return NextResponse.json({ ok: true, ...results });
  } finally {
    await releaseCronLock('dsgvo-cleanup');
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
