import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { approvePendingBooking } from '@/lib/booking-approve';

/**
 * POST /api/admin/approve-booking
 *
 * Admin genehmigt eine pending_verification Buchung:
 * 1. Markiert Konto als verifiziert
 * 2. Erstellt Stripe Payment Link
 * 3. Speichert Link in der Buchung
 * 4. Sendet Email an Kunden mit Zahlungslink (non-blocking)
 *
 * Die eigentliche Logik liegt in `lib/booking-approve.ts` und wird auch
 * vom Auto-Approve-Flow nach Kunden-Verifizierung wiederverwendet (dort
 * ohne Mail).
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { bookingId } = (await req.json()) as { bookingId: string };
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId erforderlich.' }, { status: 400 });
    }

    const result = await approvePendingBooking(bookingId, { sendEmail: true });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json({
      success: true,
      paymentUrl: result.paymentUrl,
      paymentLinkId: result.paymentLinkId,
      emailSent: result.emailSent,
      emailError: result.emailError,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[approve-booking] Unerwarteter Fehler:', msg, err);
    return NextResponse.json({ error: `Unerwarteter Fehler: ${msg}` }, { status: 500 });
  }
}
