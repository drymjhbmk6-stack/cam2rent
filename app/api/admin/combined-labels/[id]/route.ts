import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';
import { combineLabelsOnA4Landscape, resizePdfToA5Portrait } from '@/lib/pdf/label-resize';

const STORAGE_BUCKET = 'return-labels';

/**
 * GET /api/admin/combined-labels/[id]
 *
 * Liefert ein einzelnes PDF im A4-Querformat, auf dem Hin- und
 * Retour-Etikett (jeweils A5 Hochformat) nebeneinander platziert sind —
 * fuer Drucker, die mit vorgestanzten A4-Boegen "2x A5 Hochformat" arbeiten.
 *
 * Hin-Etikett: Sendcloud-PDF aus bookings.label_url.
 * Retour-Etikett: zwei Quellen je nach `return_label_url`-Prefix
 *   - `https://...` (Sendcloud-Legacy) → herunterladen + auf A5 resizen
 *   - relativer Storage-Pfad (`return-labels/<id>.pdf`) → bereits A5,
 *     direkt laden
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
    return NextResponse.json({ error: 'Retourlabel fehlt — bitte zuerst hochladen.' }, { status: 422 });
  }
  if (!isSendcloudUrl(booking.label_url)) {
    return NextResponse.json({ error: 'Hin-Etikett-URL ist keine Sendcloud-URL.' }, { status: 502 });
  }

  const { publicKey, secretKey } = await getSendcloudKeys();
  const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  // Hin-Etikett: immer von Sendcloud ziehen.
  const outRes = await fetch(booking.label_url, { headers: { Authorization: auth } });
  if (!outRes.ok) {
    return NextResponse.json({ error: 'Hin-Etikett konnte nicht geladen werden.' }, { status: 502 });
  }
  const outboundBuf = await outRes.arrayBuffer();

  // Retour-Etikett: aus Storage oder Sendcloud-Legacy.
  let returnBuf: ArrayBuffer;
  const returnUrl = booking.return_label_url;
  if (returnUrl.startsWith('https://')) {
    if (!isSendcloudUrl(returnUrl)) {
      return NextResponse.json({ error: 'Retour-URL ist keine Sendcloud-URL.' }, { status: 502 });
    }
    const retRes = await fetch(returnUrl, { headers: { Authorization: auth } });
    if (!retRes.ok) {
      return NextResponse.json({ error: 'Retour-Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    // Sendcloud-PDF auf A5 resizen, damit der Slot exakt passt.
    try {
      const raw = await retRes.arrayBuffer();
      const a5 = await resizePdfToA5Portrait(raw);
      returnBuf = a5.buffer.slice(a5.byteOffset, a5.byteOffset + a5.byteLength) as ArrayBuffer;
    } catch (e) {
      console.error('[combined-labels] A5-Skalierung Retour fehlgeschlagen:', e);
      returnBuf = await retRes.arrayBuffer();
    }
  } else {
    // Neuer Storage-Pfad — schon A5.
    const path = returnUrl.startsWith(`${STORAGE_BUCKET}/`)
      ? returnUrl.slice(STORAGE_BUCKET.length + 1)
      : returnUrl;
    const { data, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (dlErr || !data) {
      console.error('[combined-labels] Storage-Download fehlgeschlagen:', dlErr?.message);
      return NextResponse.json({ error: 'Retour-Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    returnBuf = await data.arrayBuffer();
  }

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
