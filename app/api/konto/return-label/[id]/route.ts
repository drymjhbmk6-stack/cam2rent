import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

  // Sendcloud Label-PDF als Proxy laden
  const pub = process.env.SENDCLOUD_PUBLIC_KEY!;
  const sec = process.env.SENDCLOUD_SECRET_KEY!;
  const auth = 'Basic ' + Buffer.from(`${pub}:${sec}`).toString('base64');

  const labelRes = await fetch(booking.return_label_url, {
    headers: { Authorization: auth },
  });

  if (!labelRes.ok) {
    return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
  }

  const pdfBuffer = await labelRes.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ruecksendeetikett-${bookingId}.pdf"`,
    },
  });
}
