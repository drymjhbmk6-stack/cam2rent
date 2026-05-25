import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  // Admin auth check
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_token')?.value;
  if (!adminAuth) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, label_url')
    .eq('id', bookingId)
    .single();

  if (error || !booking?.label_url) {
    return NextResponse.json({ error: 'Kein Versandetikett vorhanden.' }, { status: 404 });
  }

  // Sweep 8 H8: Defense-in-Depth — Sendcloud-Credentials nur an Sendcloud-Host
  // schicken. Falls bookings.label_url durch eine andere Schwachstelle
  // manipuliert wurde, bleiben die Credentials safe.
  if (!isSendcloudUrl(booking.label_url)) {
    return NextResponse.json({ error: 'Label-URL ist keine Sendcloud-URL.' }, { status: 502 });
  }

  const { publicKey, secretKey } = await getSendcloudKeys();
  const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  const labelRes = await fetch(booking.label_url, { headers: { Authorization: auth } });

  if (!labelRes.ok) {
    return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
  }

  const pdfBuffer = await labelRes.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // inline + Content-Length: PDF wird im iframe des In-App-Viewers angezeigt
      // (statt Download zu erzwingen) und der "Drucken"-Button kann
      // iframe.contentWindow.print() aufrufen (same-origin).
      'Content-Disposition': `inline; filename="versandetikett-${bookingId}.pdf"`,
      'Content-Length': String(pdfBuffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
