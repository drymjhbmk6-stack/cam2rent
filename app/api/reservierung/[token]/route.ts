import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { normalizeReservationItems } from '@/lib/reservation-holds';
import { buildCartItemsFromReservation } from '@/lib/reservation-cart';

export const runtime = 'nodejs';

/**
 * GET /api/reservierung/[token]
 *
 * Liefert die reservierte Auswahl als fertige Warenkorb-Positionen — nur wenn
 * der eingeloggte User der Reservierungs-Kunde ist (Ownership + unguessbarer
 * Token = doppelte Sicherung). Der Client legt die Items in den Warenkorb und
 * leitet zum Checkout.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Kein Token.' }, { status: 400 });

  // Eingeloggten Kunden ermitteln.
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* read-only */ },
        },
      },
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id, user_id, status, expires_at, rental_from, rental_to, delivery_mode, shipping_method, items')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    if (/reservations|relation .* does not exist|schema cache|PGRST|42P01/i.test(error.message || '')) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
  if (!reservation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (reservation.user_id !== userId) {
    return NextResponse.json({ error: 'wrong_user' }, { status: 403 });
  }
  if (reservation.status !== 'open') {
    return NextResponse.json({ error: 'not_open', status: reservation.status }, { status: 410 });
  }
  if (new Date(reservation.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const items = await buildCartItemsFromReservation({
    rentalFrom: reservation.rental_from as string,
    rentalTo: reservation.rental_to as string,
    deliveryMode: reservation.delivery_mode === 'abholung' ? 'abholung' : 'versand',
    shippingMethod: reservation.shipping_method === 'express' ? 'express' : 'standard',
    items: normalizeReservationItems(reservation.items),
  });

  return NextResponse.json({
    ok: true,
    expiresAt: reservation.expires_at,
    rentalFrom: reservation.rental_from,
    rentalTo: reservation.rental_to,
    items,
  });
}
