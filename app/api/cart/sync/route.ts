import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { syncCartHolds, releaseUserCartHolds, type CartHoldItem } from '@/lib/cart-holds';
import { isUserTester } from '@/lib/tester-mode';

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

    // Wenn Warenkorb leer: Eintrag löschen + alle Holds des Users freigeben
    if (!items || items.length === 0) {
      await supabase
        .from('abandoned_carts')
        .delete()
        .eq('user_id', userId)
        .eq('recovered', false);
      await releaseUserCartHolds(supabase, userId);
      return NextResponse.json({ ok: true });
    }

    // ── Warenkorb-Reservierungen (Holds) synchronisieren ──────────────────
    // Jede Kamera im Warenkorb blockt ihren Zeitraum 30 Min fuer andere Kunden.
    // Gleitende Frist: jeder Sync (Cart-Aenderung, alle 2s debounced clientseitig)
    // setzt expires_at neu. Best-effort — fehlende Migration ist kein Fehler.
    try {
      const holdItems: CartHoldItem[] = (items as Array<Record<string, unknown>>)
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          cartItemId: String(it.id ?? ''),
          productId: String(it.productId ?? ''),
          productName: typeof it.productName === 'string' ? it.productName : null,
          rentalFrom: String(it.rentalFrom ?? ''),
          rentalTo: String(it.rentalTo ?? ''),
          deliveryMode: it.deliveryMode === 'abholung' ? 'abholung' : 'versand',
        }))
        .filter((it) => it.cartItemId && it.productId && it.rentalFrom && it.rentalTo);
      const isTest = await isUserTester(userId);
      await syncCartHolds(supabase, userId, holdItems, { isTest });
    } catch (holdErr) {
      console.error('[cart/sync] Hold-Sync fehlgeschlagen:', holdErr);
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
