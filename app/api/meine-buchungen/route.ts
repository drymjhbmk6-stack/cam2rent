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
  const baseFields =
    'id, product_id, product_name, rental_from, rental_to, days, price_total, status, delivery_mode, haftung, created_at, tracking_number, tracking_url, shipped_at, return_label_url, contract_signed, contract_signed_at, original_rental_to, extended_at, stripe_payment_link_id';
  // Zusaetzliche Felder fuer Storno-Anker + Verlege-Gating im Kundenkonto.
  // Defensiv: fehlen die Verlege-Spalten (Migration noch nicht durch), wird
  // ohne sie erneut geladen.
  const postponeFields =
    'cancellation_anchor_date, postpone_count, postponed_at, postpone_target_date, ship_date_override, contract_locked';

  const primary = await supabase
    .from('bookings')
    .select(`${baseFields}, ${postponeFields}`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  let bookings: Record<string, unknown>[] | null = primary.data as Record<string, unknown>[] | null;
  let error = primary.error;

  if (error) {
    // Fallback ohne die neuen Verlege-Spalten (Migration ausstehend).
    const retry = await supabase
      .from('bookings')
      .select(baseFields)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    bookings = retry.data as Record<string, unknown>[] | null;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ bookings: [] });
  }

  return NextResponse.json({ bookings: bookings ?? [] });
}
