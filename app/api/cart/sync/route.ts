import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST /api/cart/sync
 * Sweep 8 M4: User-ID + E-Mail werden aus der Session gepinnt.
 * Vorher: Body-userId/email — anonymer Angreifer konnte Cart-Recovery-Mails
 * an beliebige fremde Adressen ausloesen (Spam-Vehikel mit cam2rent-Branding).
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  try {
    const { items, cartTotal } = (await req.json()) as {
      items?: unknown[];
      cartTotal?: number;
    };

    const userId = user.id;
    const email = user.email;
    const supabase = createServiceClient();

    // Wenn Warenkorb leer: Eintrag löschen
    if (!items || items.length === 0) {
      await supabase
        .from('abandoned_carts')
        .delete()
        .eq('user_id', userId)
        .eq('recovered', false);
      return NextResponse.json({ ok: true });
    }

    // Prüfen ob schon ein aktiver Eintrag existiert
    const { data: existing } = await supabase
      .from('abandoned_carts')
      .select('id')
      .eq('user_id', userId)
      .eq('recovered', false)
      .maybeSingle();

    if (existing) {
      // Update
      await supabase
        .from('abandoned_carts')
        .update({
          items,
          cart_total: cartTotal ?? 0,
          email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insert
      await supabase
        .from('abandoned_carts')
        .insert({
          user_id: userId,
          email,
          items,
          cart_total: cartTotal ?? 0,
        });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Cart sync error:', err);
    return NextResponse.json({ error: 'Sync fehlgeschlagen.' }, { status: 500 });
  }
}
