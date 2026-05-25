import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';
import { combineLabelsOnA4Landscape } from '@/lib/pdf/label-resize';

/**
 * GET /api/admin/combined-labels/[id]
 *
 * Liefert ein einzelnes PDF im A4-Querformat, auf dem Hin- und
 * Retour-Etikett (jeweils A5 Hochformat) nebeneinander platziert sind —
 * fuer Drucker, die mit vorgestanzten A4-Bogen "2x A5 Hochformat"
 * arbeiten. Erfordert beide gesetzte Label-URLs an der Buchung.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_token')?.value;
  if (!adminAuth) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, label_url, return_label_url')
    .eq('id', bookingId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (!booking.label_url) {
    return NextResponse.json({ error: 'Versandetikett fehlt — bitte zuerst erstellen.' }, { status: 422 });
  }
  if (!booking.return_label_url) {
    return NextResponse.json({ error: 'Retourlabel fehlt — bitte zuerst erstellen.' }, { status: 422 });
  }
  if (!isSendcloudUrl(booking.label_url) || !isSendcloudUrl(booking.return_label_url)) {
    return NextResponse.json({ error: 'Label-URL ist keine Sendcloud-URL.' }, { status: 502 });
  }

  const { publicKey, secretKey } = await getSendcloudKeys();
  const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  const [outRes, retRes] = await Promise.all([
    fetch(booking.label_url, { headers: { Authorization: auth } }),
    fetch(booking.return_label_url, { headers: { Authorization: auth } }),
  ]);
  if (!outRes.ok || !retRes.ok) {
    return NextResponse.json({ error: 'Etiketten konnten nicht geladen werden.' }, { status: 502 });
  }
  const [outboundBuf, returnBuf] = await Promise.all([outRes.arrayBuffer(), retRes.arrayBuffer()]);

  let pdf: Uint8Array;
  try {
    pdf = await combineLabelsOnA4Landscape(outboundBuf, returnBuf);
  } catch (e) {
    console.error('[combined-labels] PDF-Kombination fehlgeschlagen:', e);
    return NextResponse.json({ error: 'Kombi-PDF konnte nicht erzeugt werden.' }, { status: 500 });
  }

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="etiketten-kombi-${bookingId}.pdf"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
