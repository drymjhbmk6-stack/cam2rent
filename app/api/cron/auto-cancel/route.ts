import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createAdminNotification } from '@/lib/admin-notifications';

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

  // Batch-Update statt N einzelner UPDATE-Queries
  const allIds = bookings.map((b) => b.id);
  const { error: bulkUpdateErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .in('id', allIds);
  if (bulkUpdateErr) {
    console.error('Auto-cancel bulk update error:', bulkUpdateErr);
    return NextResponse.json({ error: bulkUpdateErr.message }, { status: 500 });
  }
  const cancelledIds: string[] = [...allIds];

  for (const booking of bookings) {
    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'booking_cancelled',
      title: `Auto-Stornierung: ${booking.id}`,
      message: `${booking.customer_name} — Zahlung nicht eingegangen`,
      link: `/admin/buchungen/${booking.id}`,
    });

    // Kunde informieren
    if (booking.customer_email) {
      sendAndLog({
        to: booking.customer_email,
        subject: `Buchung ${booking.id} automatisch storniert`,
        html: `
          <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-weight: 900; font-size: 20px;">cam<span style="color: #3b82f6;">2</span>rent</span>
            </div>
            <h1 style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
              Buchung storniert
            </h1>
            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
              Hallo ${booking.customer_name || 'dort'},<br/>
              deine Buchung <strong>${booking.id}</strong> für <strong>${booking.product_name}</strong>
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
}
