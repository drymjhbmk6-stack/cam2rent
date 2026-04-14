import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';

/**
 * GET /api/reviews?productId=xxx
 * Gibt genehmigte Reviews + Durchschnitt zurück.
 */
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('id, rating, title, text, created_at, admin_reply, admin_reply_at')
    .eq('product_id', productId)
    .eq('approved', true)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = reviews?.length ?? 0;
  const avgRating = count > 0
    ? Math.round((reviews!.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
    : 0;

  return NextResponse.json({ reviews: reviews ?? [], avgRating, count });
}

/**
 * POST /api/reviews
 * Body: { bookingId, productId, rating, title?, text? }
 * Erstellt eine neue Bewertung (muss eingeloggt sein, Buchung muss dem User gehören + completed).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { bookingId, productId, rating, title, text } = body as {
    bookingId?: string;
    productId?: string;
    rating?: number;
    title?: string;
    text?: string;
  };

  if (!bookingId || !productId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: 'bookingId, productId und rating (1-5) erforderlich.' },
      { status: 400 }
    );
  }

  // User aus Cookie holen
  const { createServerClient } = await import('@supabase/ssr');
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Prüfen: Buchung gehört dem User und ist completed
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status, product_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  if (booking.status !== 'completed') {
    return NextResponse.json(
      { error: 'Bewertung nur nach abgeschlossener Buchung möglich.' },
      { status: 400 }
    );
  }

  // Prüfen: Noch keine Bewertung für diese Buchung
  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (existingReview) {
    return NextResponse.json({ error: 'Du hast diese Buchung bereits bewertet.' }, { status: 409 });
  }

  // Review erstellen
  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId,
    user_id: user.id,
    product_id: productId,
    rating,
    title: title?.trim() || null,
    text: text?.trim() || null,
  });

  if (error) {
    console.error('Review insert error:', error);
    return NextResponse.json({ error: 'Bewertung konnte nicht gespeichert werden.' }, { status: 500 });
  }

  // Admin-Benachrichtigung (fire-and-forget)
  createAdminNotification(supabase, {
    type: 'new_review',
    title: `Neue Bewertung (${rating}/5)`,
    message: title || 'Ohne Titel',
    link: `/admin/bewertungen`,
  });

  return NextResponse.json({ success: true });
}
