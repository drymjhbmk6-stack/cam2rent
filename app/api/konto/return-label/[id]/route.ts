import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';

/**
 * GET /api/konto/return-label/[id]
 * Proxied Rücksendeetikett als PDF für den eingeloggten Kunden.
 * Prüft, dass die Buchung dem angemeldeten User gehört.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  // Auth: Benutzer eingeloggt?
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  // Buchung laden + prüfen ob sie dem User gehört
  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, user_id, return_label_url, sendcloud_return_parcel_id, status')
    .eq('id', bookingId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  if (!booking.return_label_url) {
    return NextResponse.json({ error: 'Kein Rücksendeetikett vorhanden. Bitte beim Support melden.' }, { status: 404 });
  }

  const url = booking.return_label_url as string;
  let pdfBuffer: ArrayBuffer;

  if (url.startsWith('https://')) {
    // Legacy: Sendcloud-URL — als Proxy mit Basic-Auth laden.
    if (!isSendcloudUrl(url)) {
      return NextResponse.json({ error: 'Label-URL ist keine Sendcloud-URL.' }, { status: 502 });
    }
    const { publicKey, secretKey } = await getSendcloudKeys();
    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    const labelRes = await fetch(url, { headers: { Authorization: auth } });
    if (!labelRes.ok) {
      return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    pdfBuffer = await labelRes.arrayBuffer();
  } else {
    // Neu: hochgeladenes Etikett aus Supabase-Storage (return-labels-Bucket).
    // Format `return-labels/<bookingId>.pdf`, schon beim Upload auf A5
    // konvertiert. Gleiche Quelle wie GET /api/admin/return-label/[id].
    const prefix = 'return-labels/';
    const storagePath = url.startsWith(prefix) ? url.slice(prefix.length) : url;
    const { data, error: dlErr } = await supabase.storage.from('return-labels').download(storagePath);
    if (dlErr || !data) {
      console.error('[konto/return-label] Storage-Download fehlgeschlagen:', dlErr?.message);
      return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    pdfBuffer = await data.arrayBuffer();
  }

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ruecksendeetikett-${bookingId}.pdf"`,
      'Content-Length': String(pdfBuffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
