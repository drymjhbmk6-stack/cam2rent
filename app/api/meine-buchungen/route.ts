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

  // Use service role to query bookings by user_id OR customer_email
  const supabase = createServiceClient();
  const selectFields =
    'id, product_id, product_name, rental_from, rental_to, days, price_total, status, delivery_mode, haftung, created_at, tracking_number, tracking_url, shipped_at, return_label_url, contract_signed, contract_signed_at, original_rental_to, extended_at';

  // Suche per user_id UND per E-Mail (für noch nicht verknüpfte Gast-Buchungen)
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(selectFields)
    .or(`user_id.eq.${user.id},and(customer_email.eq.${user.email},user_id.is.null)`)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ bookings: [] });
  }

  return NextResponse.json({ bookings: bookings ?? [] });
}
