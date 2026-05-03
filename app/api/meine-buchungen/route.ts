import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/meine-buchungen
 *
 * Gibt alle Buchungen des eingeloggten Nutzers zurück.
 * Verifiziert die Session serverseitig, bevor Daten ausgegeben werden.
 */
export async function GET() {
  const cookieStore = await cookies();

  // Verify the session server-side
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  // Use service role to query bookings by user_id only.
  //
  // Frueher gab es einen Fallback: zusaetzlich `customer_email`-Match auf
  // `user_id IS NULL`-Buchungen. Das ergab in Verbindung mit Express-Signup
  // einen One-Shot-Account-Hijack (Audit Sweep 6, Vuln 14): Sobald jemand
  // sich mit der E-Mail einer Gastbuchung registrierte, sah er die fremde
  // Buchung sofort. Gastbuchungen muessen daher manuell vom Admin via
  // /admin/buchungen/[id] dem Konto zugewiesen werden.
  const supabase = createServiceClient();
  const selectFields =
    'id, product_id, product_name, rental_from, rental_to, days, price_total, status, delivery_mode, haftung, created_at, tracking_number, tracking_url, shipped_at, return_label_url, contract_signed, contract_signed_at, original_rental_to, extended_at, stripe_payment_link_id';

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(selectFields)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ bookings: [] });
  }

  return NextResponse.json({ bookings: bookings ?? [] });
}
