import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog, escapeHtml, stripSubject } from '@/lib/email';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { createAdminNotification } from '@/lib/admin-notifications';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';

/**
 * GET /api/cron/auto-cancel
 *
 * Storniert automatisch unbezahlte Buchungen (pending_verification / awaiting_payment)
 * wenn der Mietbeginn erreicht oder ueberschritten ist.
 *
 * Sollte taeglich via Coolify Cron oder externem Service aufgerufen werden.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('auto-cancel');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
  const supabase = createServiceClient();
  // Heute in Berlin-Zeit — sonst wuerde der Cron zwischen 22-24 Uhr Berlin
  // schon fuer den naechsten Tag stornieren (UTC ist 1-2h zurueck)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  // Alle unbezahlten Buchungen deren Mietbeginn heute oder frueher ist
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, customer_email, customer_name, product_name, rental_from, status')
    .in('status', ['pending_verification', 'awaiting_payment'])
    .lte('rental_from', today);

  if (error) {
    console.error('Auto-cancel query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!bookings?.length) {
    return NextResponse.json({ cancelled: 0, message: 'Keine Buchungen zu stornieren.' });
  }

  // Atomarer Bulk-Update mit Status-Guard: Race-Schutz, falls zwischen
  // SELECT und UPDATE der Stripe-Webhook eine Zahlung als 'confirmed' geschrieben hat.
  // Sonst wuerde eine bezahlte Buchung trotzdem auf 'cancelled' gesetzt.
  const allIds = bookings.map((b) => b.id);
  const { data: updated, error: bulkUpdateErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .in('id', allIds)
    .in('status', ['pending_verification', 'awaiting_payment'])
    .select('id');
  if (bulkUpdateErr) {
    console.error('Auto-cancel bulk update error:', bulkUpdateErr);
    return NextResponse.json({ error: bulkUpdateErr.message }, { status: 500 });
  }
  const cancelledIds: string[] = (updated ?? []).map((r) => r.id);
  // bookings auf die wirklich stornierten reduzieren — wenn eine Buchung
  // zwischenzeitlich bezahlt wurde, soll sie keine Storno-Mail bekommen.
  const cancelledSet = new Set(cancelledIds);
  const cancelledBookings = bookings.filter((b) => cancelledSet.has(b.id));

  // Zubehoer-Exemplare aller stornierten Buchungen freigeben (non-blocking,
  // einzeln pro Buchung damit nicht eine Buchung die andere mit-killt)
  for (const id of cancelledIds) {
    releaseAccessoryUnitsFromBooking(id)
      .catch((err) => console.error('[auto-cancel] accessory-unit release failed', id, err));
  }

  for (const booking of cancelledBookings) {
    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'booking_cancelled',
      title: `Auto-Stornierung: ${booking.id}`,
      message: `${booking.customer_name} — Zahlung nicht eingegangen`,
      link: `/admin/buchungen/${booking.id}`,
    });

    // Kunde informieren — alle User-Werte escaped (Audit-Sweep 8: K5)
    if (booking.customer_email) {
      const safeName = escapeHtml(booking.customer_name || 'dort');
      const safeId = escapeHtml(booking.id);
      const safeProduct = escapeHtml(booking.product_name || '');
      sendAndLog({
        to: booking.customer_email,
        subject: stripSubject(`Buchung ${booking.id} automatisch storniert`),
        html: `
          <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-weight: 900; font-size: 20px;">cam<span style="color: #3b82f6;">2</span>rent</span>
            </div>
            <h1 style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
              Buchung storniert
            </h1>
            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
              Hallo ${safeName},<br/>
              deine Buchung <strong>${safeId}</strong> für <strong>${safeProduct}</strong>
              wurde automatisch storniert, da keine Zahlung vor dem Mietbeginn eingegangen ist.
            </p>
            <p style="color: #64748b; font-size: 14px; margin-top: 16px;">
              Du kannst jederzeit eine neue Buchung erstellen.
              Bei Fragen melde dich gerne bei uns.
            </p>
          </div>
        `,
        bookingId: booking.id,
        emailType: 'auto_cancel',
      }).catch((err) => console.error(`Auto-cancel email ${booking.id}:`, err));
    }
  }

  console.log(`[Auto-Cancel] ${cancelledIds.length} Buchungen storniert: ${cancelledIds.join(', ')}`);

  return NextResponse.json({
    cancelled: cancelledIds.length,
    ids: cancelledIds,
  });
  } finally {
    await releaseCronLock('auto-cancel');
  }
}
