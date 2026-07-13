import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog, escapeHtml, stripSubject } from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';
import { getStripe } from '@/lib/stripe';
import { BUSINESS } from '@/lib/business-config';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { isTestMode } from '@/lib/env-mode';
import { getBerlinDateString } from '@/lib/timezone';
import { loadBufferDays, computeShipDate, toIsoDate } from '@/lib/booking-buffer';
import { loadContractReminderConfig } from '@/lib/contract-reminder-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET/POST /api/cron/contract-auto-cancel
 *
 * Täglich auszuführen (z.B. 09:00 Berlin, nach der Reminder-Mail). Storniert
 * aktive Buchungen ohne unterschriebenen Mietvertrag, sobald der Puffertag
 * (Versand-/Übergabetag) erreicht ist — „wenn die Puffertage beginnen würden".
 * Ohne Vertrag kann die Kamera nicht raus, deshalb wird die Buchung storniert,
 * die Zahlung (optional) per Stripe erstattet und der Kunde informiert.
 *
 * Konfigurierbar über `admin_settings.contract_reminder_config`:
 *  - autocancel_versand / autocancel_abholung (pro Lieferart an/aus)
 *  - refund_on_cancel (Stripe-Erstattung + Kaution-Freigabe)
 *
 * Hinweis Abholung: der Vertrag kann bei Abholung auch bei der Übergabe
 * unterschrieben werden. Wer Abholung NICHT auto-stornieren will, setzt
 * `autocancel_abholung: false` im Setting.
 *
 * Idempotenz: atomarer Status-Flip mit Status- + contract_signed-Guard.
 *
 * Crontab (Hetzner, --resolve umgeht Cloudflare — siehe CLAUDE.md):
 *   0 9 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/contract-auto-cancel
 */
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

const PRE_FULFILLMENT_STATUSES = ['confirmed', 'preparing_shipment', 'awaiting_pickup'];

function daysUntil(dateStr: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('contract-auto-cancel');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason });
  }
  try {
    const supabase = createServiceClient();
    const config = await loadContractReminderConfig(supabase);
    if (!config.enabled) {
      return NextResponse.json({ ok: true, cancelled: 0, skipped: 'disabled' });
    }
    if (!config.autocancel_versand && !config.autocancel_abholung) {
      return NextResponse.json({ ok: true, cancelled: 0, skipped: 'autocancel_off' });
    }

    const testMode = await isTestMode();
    const today = getBerlinDateString();
    const buf = await loadBufferDays(supabase);

    let rows: Record<string, unknown>[] = [];
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('is_test', testMode)
        .in('status', PRE_FULFILLMENT_STATUSES);
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    } catch (err) {
      console.error('[contract-auto-cancel] select fehlgeschlagen:', err);
      return NextResponse.json({ ok: true, cancelled: 0, error: 'db_error' });
    }

    const candidates = rows.filter((b) => {
      if (b.contract_signed === true) return false;
      if (b.booking_type === 'kauf') return false;
      return true;
    });

    const cancelledIds: string[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (const b of candidates) {
      const id = b.id as string;
      const rentalFrom = String(b.rental_from ?? '').slice(0, 10);
      if (!rentalFrom) { skipped++; continue; }

      const mode = b.delivery_mode === 'abholung' ? 'abholung' : 'versand';
      if (mode === 'versand' && !config.autocancel_versand) { skipped++; continue; }
      if (mode === 'abholung' && !config.autocancel_abholung) { skipped++; continue; }

      const override = (b.ship_date_override as string | null | undefined) ?? null;
      const shipDate = toIsoDate(computeShipDate(rentalFrom, mode, buf, override));
      // Erst stornieren, wenn der Puffertag erreicht/überschritten ist.
      if (daysUntil(shipDate, today) > 0) { skipped++; continue; }

      const reason = 'Automatische Stornierung: Mietvertrag wurde nicht rechtzeitig unterschrieben';
      const existingNotes = b.notes ? `${String(b.notes)} | ` : '';

      // Atomarer Flip: Status-Guard + contract_signed-Guard (deckt NULL + false
      // ab, schließt eine Last-Minute-Unterschrift = true aus).
      const { data: updatedRow, error: updateErr } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          notes: `${existingNotes}Stornierungsgrund: ${reason}`,
        })
        .eq('id', id)
        .in('status', PRE_FULFILLMENT_STATUSES)
        .or('contract_signed.is.null,contract_signed.eq.false')
        .select('id')
        .maybeSingle();
      if (updateErr) {
        errors.push(`${id}: ${updateErr.message}`);
        continue;
      }
      if (!updatedRow) { skipped++; continue; } // Race verloren / inzwischen unterschrieben

      // Zubehör-Exemplare freigeben (non-blocking)
      releaseAccessoryUnitsFromBooking(id).catch((e) =>
        console.error('[contract-auto-cancel] accessory-unit release failed', id, e),
      );

      // Stripe-Erstattung (optional) + Kaution-Freigabe
      const paymentIntentId = b.payment_intent_id as string | null;
      const depositIntentId = b.deposit_intent_id as string | null;
      if (
        config.refund_on_cancel &&
        paymentIntentId &&
        paymentIntentId.startsWith('pi_')
      ) {
        try {
          const stripe = await getStripe();
          await stripe.refunds.create(
            {
              payment_intent: paymentIntentId,
              reason: 'requested_by_customer',
              metadata: { auto_cancel: 'contract_missing', booking_id: id },
            },
            { idempotencyKey: `contract-auto-cancel:${id}` },
          );
        } catch (refundErr) {
          console.error(`[contract-auto-cancel] Refund fehlgeschlagen für ${id}:`, refundErr);
          try {
            await supabase
              .from('bookings')
              .update({ refund_status: 'failed_pending_admin' })
              .eq('id', id);
            await createAdminNotification(supabase, {
              type: 'payment_failed',
              title: `Refund fehlgeschlagen (${id})`,
              message: 'Auto-Storno wegen fehlendem Mietvertrag — Refund konnte nicht ausgeführt werden. Bitte manuell prüfen.',
              link: `/admin/buchungen/${id}`,
            });
          } catch (notifyErr) {
            console.error('[contract-auto-cancel] Notification-Fehler:', notifyErr);
          }
        }

        if (depositIntentId) {
          try {
            const stripe = await getStripe();
            await stripe.paymentIntents.cancel(depositIntentId);
          } catch (depositErr) {
            console.error(`[contract-auto-cancel] Deposit-Cancel fehlgeschlagen für ${id}:`, depositErr);
          }
        }
      }

      cancelledIds.push(id);

      // Admin-Notification
      createAdminNotification(supabase, {
        type: 'booking_cancelled',
        title: `Auto-Storno (Vertrag fehlt): ${id}`,
        message: `${(b.customer_name as string) || 'Kunde'} — Mietvertrag nicht rechtzeitig unterschrieben`,
        link: `/admin/buchungen/${id}`,
      }).catch((e) => console.error('[contract-auto-cancel] Admin-Notification-Fehler:', e));

      // Kunde informieren
      const customerEmail = b.customer_email as string | null;
      if (customerEmail) {
        try {
          const isPickup = mode === 'abholung';
          const safeBusiness = escapeHtml(BUSINESS.name);
          const safeName = escapeHtml((b.customer_name as string) || 'Kunde');
          const safeId = escapeHtml(id);
          const safeProduct = escapeHtml((b.product_name as string) || 'Kamera');
          const refunded = config.refund_on_cancel && paymentIntentId?.startsWith('pi_');
          const refundLine = refunded
            ? '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Die Zahlung haben wir automatisch erstattet — das Geld sollte innerhalb von 5–10 Werktagen wieder auf deinem Konto sein.</p>'
            : '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Zu einer eventuellen Erstattung melden wir uns separat bei dir.</p>';
          await sendAndLog({
            to: customerEmail,
            subject: stripSubject(`Buchung ${id} storniert — Mietvertrag fehlte`),
            html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${safeBusiness}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#991b1b;">Deine Buchung wurde storniert</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${safeId}</strong> (${safeProduct}) wurde storniert, weil bis ${isPickup ? 'zur Übergabe' : 'zum Versandtermin'} kein unterschriebener Mietvertrag vorlag. Ohne gültigen Mietvertrag können wir aus rechtlichen Gründen keine Kamera ${isPickup ? 'übergeben' : 'versenden'}.</p>
    ${refundLine}
    <p style="margin:0;font-size:14px;color:#6b7280;">Gerne kannst du jederzeit neu buchen — denk dann bitte daran, den Mietvertrag direkt im Buchungsprozess bzw. unter <a href="https://cam2rent.de/konto/buchungen" style="color:#3b82f6;">Mein Konto → Meine Buchungen</a> zu unterschreiben, damit wir rechtzeitig ${isPickup ? 'übergeben' : 'versenden'} können.</p>
  </td></tr>
</table></td></tr></table></body></html>`,
            bookingId: id,
            emailType: 'contract_auto_cancel',
          });
        } catch (mailErr) {
          console.error(`[contract-auto-cancel] Mail fehlgeschlagen für ${id}:`, mailErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      cancelled: cancelledIds.length,
      ids: cancelledIds,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } finally {
    await releaseCronLock('contract-auto-cancel');
  }
}
