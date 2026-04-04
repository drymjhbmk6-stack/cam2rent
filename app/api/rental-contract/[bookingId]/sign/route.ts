import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * POST /api/rental-contract/[bookingId]/sign
 * Save signature and mark contract as signed.
 * Body: { signatureDataUrl: string, signerName: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const ip = getClientIp(req);
  const { success } = limiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  // Auth check
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const { signatureDataUrl, signerName } = await req.json();
  if (!signatureDataUrl || !signerName?.trim()) {
    return NextResponse.json({ error: 'Unterschrift und Name erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify booking ownership
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, contract_signed, user_id')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (booking.contract_signed) {
    return NextResponse.json({ error: 'Vertrag wurde bereits unterschrieben.' }, { status: 400 });
  }

  if (!['confirmed', 'shipped'].includes(booking.status)) {
    return NextResponse.json({ error: 'Vertrag kann für diese Buchung nicht unterschrieben werden.' }, { status: 400 });
  }

  // Convert base64 data URL to buffer
  const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${bookingId}.png`;
  const { error: uploadError } = await supabase.storage
    .from('signatures')
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error('Signature upload error:', uploadError);
    return NextResponse.json({ error: 'Unterschrift konnte nicht gespeichert werden.' }, { status: 500 });
  }

  // Update booking
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      contract_signed: true,
      contract_signature_url: storagePath,
      contract_signed_at: new Date().toISOString(),
      contract_signer_name: signerName.trim(),
    })
    .eq('id', bookingId);

  if (updateError) {
    return NextResponse.json({ error: 'Vertrag konnte nicht aktualisiert werden.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
