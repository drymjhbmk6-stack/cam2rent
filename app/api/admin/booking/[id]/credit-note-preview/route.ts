import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  buildCreditNotePdfDataFromRow,
  buildCreditNotePreviewData,
  renderCreditNotePdfBuffer,
} from '@/lib/buchhaltung/credit-note-document';

/**
 * GET /api/admin/booking/[id]/credit-note-preview?amount=12.34&reason=...
 *
 * Liefert das Stornierungsbeleg-PDF inline (zur Ansicht im PDF-Viewer):
 *  - Existiert bereits eine Gutschrift zur Buchung → deren echte Fassung.
 *  - Sonst → eine Vorschau aus Buchung + `amount` (Nummer „Vorschau").
 * Schreibt NICHTS.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const { data: cn } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const url = new URL(req.url);
  // Stornobetrag = voller Buchungsbetrag. `refunded` = tatsaechlich erstattet
  // (fuer die "davon erstattet"-Zeile in der Vorschau).
  const refunded = Math.max(0, Number(url.searchParams.get('refunded') || '0') || 0);
  const reason = url.searchParams.get('reason') || undefined;
  const priceTotal = Number(booking.price_total ?? 0);
  const refundedClamped = priceTotal > 0 ? Math.min(priceTotal, refunded) : refunded;

  const data = cn
    ? await buildCreditNotePdfDataFromRow(supabase, cn)
    : await buildCreditNotePreviewData(supabase, booking, {
        grossAmount: priceTotal,
        refundedAmount: refundedClamped,
        reason,
      });

  const pdf = await renderCreditNotePdfBuffer(data);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Stornierungsbeleg-Vorschau.pdf"',
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
