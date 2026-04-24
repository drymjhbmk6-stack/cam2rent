import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

type Params = Promise<{ bookingId: string }>;

/**
 * GET /api/customer-ugc/[bookingId]
 * Liefert aktuelle Submission (falls vorhanden) fuer eine Buchung des eingeloggten Kunden.
 * Auth: Bearer-Token.
 */
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { bookingId } = await params;
  if (!bookingId) {
    return NextResponse.json({ error: 'Buchungsnummer fehlt.' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Buchung-Eigentuemer pruefen
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status, product_name, rental_from, rental_to')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const { data: submission } = await supabase
    .from('customer_ugc_submissions')
    .select(
      'id, status, file_paths, file_kinds, file_sizes, caption, consent_use_website, consent_use_social, consent_use_blog, consent_use_marketing, consent_name_visible, reward_coupon_code, bonus_coupon_code, featured_at, featured_channel, rejected_reason, admin_note, created_at, reviewed_at, withdrawn_at',
    )
    .eq('booking_id', bookingId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Signed URLs fuer Vorschau (nur bei aktiver Submission)
  let previews: { path: string; kind: string; url: string }[] = [];
  if (submission && Array.isArray(submission.file_paths) && submission.file_paths.length > 0) {
    const paths: string[] = submission.file_paths;
    const kinds: string[] = submission.file_kinds ?? [];
    const signed = await Promise.all(
      paths.map((p) => supabase.storage.from('customer-ugc').createSignedUrl(p, 60 * 60)),
    );
    previews = paths.map((p, i) => ({
      path: p,
      kind: kinds[i] ?? 'image',
      url: signed[i].data?.signedUrl ?? '',
    }));
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      productName: booking.product_name,
      rentalFrom: booking.rental_from,
      rentalTo: booking.rental_to,
    },
    submission: submission
      ? {
          ...submission,
          previews,
        }
      : null,
  });
}
