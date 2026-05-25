import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';
import { resizePdfToA5Portrait } from '@/lib/pdf/label-resize';

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
    .select('id, return_label_url')
    .eq('id', bookingId)
    .single();

  if (error || !booking?.return_label_url) {
    return NextResponse.json({ error: 'Kein Rücksendeetikett vorhanden.' }, { status: 404 });
  }

  if (!isSendcloudUrl(booking.return_label_url)) {
    return NextResponse.json({ error: 'Label-URL ist keine Sendcloud-URL.' }, { status: 502 });
  }

  const { publicKey, secretKey } = await getSendcloudKeys();
  const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  const labelRes = await fetch(booking.return_label_url, { headers: { Authorization: auth } });
  if (!labelRes.ok) {
    return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
  }

  const srcBuffer = await labelRes.arrayBuffer();

  // Konsistent zum Hin-Etikett (label/[id]) auf A5 Hochformat skalieren.
  let pdf: Uint8Array;
  try {
    pdf = await resizePdfToA5Portrait(srcBuffer);
  } catch (e) {
    console.error('[return-label] A5-Skalierung fehlgeschlagen, gebe Original zurueck:', e);
    pdf = new Uint8Array(srcBuffer);
  }

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ruecksendeetikett-${bookingId}.pdf"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
