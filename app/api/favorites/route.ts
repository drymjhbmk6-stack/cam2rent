import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60_000 });

/**
 * GET /api/favorites
 * Returns all favorites for the authenticated user.
 */
export async function GET() {
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
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: favorites, error } = await supabase
    .from('favorites')
    .select('product_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ favorites: [] });
  }

  return NextResponse.json({ favorites: favorites ?? [] });
}

/**
 * POST /api/favorites
 * Toggle a favorite. Body: { product_id: string }
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = limiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

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
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const body = await req.json();
  const productId = body.product_id;
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'product_id fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check if already favorited
  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .single();

  if (existing) {
    // Remove favorite
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);
    return NextResponse.json({ favorited: false });
  } else {
    // Add favorite
    await supabase
      .from('favorites')
      .insert({ user_id: user.id, product_id: productId });
    return NextResponse.json({ favorited: true });
  }
}
