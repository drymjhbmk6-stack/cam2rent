import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';
import { getStripe } from '@/lib/stripe';
import { BUSINESS } from '@/lib/business-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/cron/verification-auto-cancel
 *
 * Storniert Buchungen mit Express-Signup-Flag (verification_required=true),
 * wenn der Mietbeginn in maximal 2 Tagen startet (T-2) und der Ausweis noch
 * nicht freigegeben wurde. T-2 ist gewaehlt, damit Standard-Versand (2 Tage
 * Versanddauer) bei rechtzeitiger Verifizierung noch punktgenau den Mietbeginn
 * trifft. Erstattet die Zahlung ueber Stripe (Refund).
 *
 * Idempotenz: Buchungen mit Status=cancelled werden uebersprungen.
 *
 * Crontab-Beispiel (Hetzner):
 *   0 14 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *       https://cam2rent.de/api/cron/verification-auto-cancel
 */
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  // T-2: Buchungen deren Mietbeginn in max. 2 Tagen ist (Berlin-Zeit).
  // Gibt dem Kunden genug Vorlauf, dass er nach den Reminder-Mails
  // (T-5/T-4/T-3) noch reagieren koennte, und dem Admin, dass er Standard-
  // Versand (2 Tage Laufzeit) rechtzeitig starten kann, wenn die
  // Verifizierung vorher durchgeht.
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 2);
  const deadlineStr = deadline.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  let bookings: Array<{
    id: string;
    customer_email: string | null;
    customer_name: string | null;
    product_name: string | null;
    rental_from: string;
    user_id: string | null;
    payment_intent_id: string | null;
    deposit_intent_id: string | null;
  }> = [];
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, product_name, rental_from, user_id, payment_intent_id, deposit_intent_id')
      .eq('verification_required', true)
      .is('verification_gate_passed_at', null)
      .eq('status', 'confirmed')
      .lte('rental_from', deadlineStr);
    if (error) throw error;
    bookings = data ?? [];
  } catch (err) {
    console.error('[verification-auto-cancel] select fehlgeschlagen:', err);
    return NextResponse.json({ ok: true, cancelled: 0, error: 'migration_missing' });
  }

  // Verifizierte Kunden rausfiltern (Ausweis wurde hochgeladen + freigegeben,
  // Gate wurde nur noch nicht manuell gesetzt — in dem Fall kein Storno).
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean) as string[])];
  const verifiedUsers = new Set<string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, verification_status')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      if (p.verification_status === 'verified') verifiedUsers.add(p.id);
    }
  }

  const cancelledIds: string[] = [];
  const errors: string[] = [];

  for (const b of bookings) {
    if (b.user_id && verifiedUsers.has(b.user_id)) continue; // Kunde hat inzwischen verifiziert

    // Status auf cancelled + Grund in notes (wie /api/admin/booking/[id])
    const { data: existing } = await supabase
      .from('bookings')
      .select('notes')
      .eq('id', b.id)
      .maybeSingle();
    const existingNotes = existing?.notes ? `${existing.notes} | ` : '';
    const reason = 'Automatische Stornierung: Ausweis-Upload wurde nicht fristgerecht erbracht';
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        notes: `${existingNotes}Stornierungsgrund: ${reason}`,
      })
      .eq('id', b.id);
    if (updateErr) {
      errors.push(`${b.id}: ${updateErr.message}`);
      continue;
    }

    // Stripe-Refund versuchen (best effort — Stornierung ist auch ohne Refund gueltig)
    if (b.payment_intent_id && !b.payment_intent_id.startsWith('MANUAL')) {
      try {
        const stripe = await getStripe();
        await stripe.refunds.create({
          payment_intent: b.payment_intent_id,
          reason: 'requested_by_customer',
          metadata: { auto_cancel: 'verification_missing', booking_id: b.id },
        });
      } catch (refundErr) {
        console.error(`[verification-auto-cancel] Refund fehlgeschlagen fuer ${b.id}:`, refundErr);
      }

      // Kaution-Vorautorisierung freigeben
      if (b.deposit_intent_id) {
        try {
          const stripe = await getStripe();
          await stripe.paymentIntents.cancel(b.deposit_intent_id);
        } catch (depositErr) {
          console.error(`[verification-auto-cancel] Deposit-Cancel fehlgeschlagen fuer ${b.id}:`, depositErr);
        }
      }
    }

    cancelledIds.push(b.id);

    // Admin-Notification
    createAdminNotification(supabase, {
      type: 'booking_cancelled',
      title: `Auto-Storno (Ausweis fehlt): ${b.id}`,
      message: `${b.customer_name ?? 'Kunde'} — Ausweis nicht rechtzeitig hochgeladen`,
      link: `/admin/buchungen/${b.id}`,
    });

    // Kunde informieren
    if (b.customer_email) {
      try {
        await sendAndLog({
          to: b.customer_email,
          subject: `Buchung ${b.id} storniert — Ausweis fehlte`,
          html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${BUSINESS.name}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#991b1b;">Deine Buchung wurde storniert</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${b.customer_name || 'Kunde'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${b.id}</strong> (${b.product_name || 'Kamera'}) wurde storniert, weil bis zum Versand-Termin kein verifizierter Ausweis vorlag. Ohne Ausweisprueung koennen wir aus rechtlichen Gruenden keine Kamera versenden.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Die Zahlung haben wir automatisch erstattet — das Geld sollte innerhalb von 5–10 Werktagen wieder auf deinem Konto sein.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">Gerne kannst du eine neue Buchung anlegen. Lade vorab deinen Ausweis unter <a href="https://cam2rent.de/konto/verifizierung" style="color:#3b82f6;">Mein Konto → Verifizierung</a> hoch, damit wir beim naechsten Mal direkt versenden koennen.</p>
  </td></tr>
</table></td></tr></table></body></html>`,
          bookingId: b.id,
          emailType: 'verification_auto_cancel',
        });
      } catch (mailErr) {
        console.error(`[verification-auto-cancel] Mail fehlgeschlagen fuer ${b.id}:`, mailErr);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    cancelled: cancelledIds.length,
    ids: cancelledIds,
    errors: errors.length > 0 ? errors : undefined,
  });
}
