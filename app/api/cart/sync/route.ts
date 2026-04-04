import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/cart/sync
 * Synchronisiert den Warenkorb eines eingeloggten Users mit Supabase.
 * Wird vom CartProvider aufgerufen wenn sich der Warenkorb ändert.
 *
 * Body: { userId, email, items, cartTotal }
 * Bei items=[] wird der Eintrag gelöscht.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, email, items, cartTotal } = (await req.json()) as {
      userId?: string;
      email?: string;
      items?: unknown[];
      cartTotal?: number;
    };

    if (!userId || !email) {
      return NextResponse.json({ error: 'userId und email erforderlich.' }, { status: 400 });
    }

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
