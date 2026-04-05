import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/claim-guest-bookings
 *
 * Verknüpft alle Gast-Buchungen (user_id = NULL) mit dem
 * eingeloggten Konto, wenn die E-Mail-Adresse übereinstimmt.
 * Wird automatisch nach Login/Registrierung aufgerufen.
 */
export async function POST() {
  const cookieStore = await cookies();

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

  if (!user?.email) {
    return NextResponse.json({ claimed: 0 });
  }

  const supabase = createServiceClient();

  // Alle Gast-Buchungen mit gleicher E-Mail dem Konto zuweisen
  const { data: guestBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('customer_email', user.email)
    .is('user_id', null);

  if (!guestBookings?.length) {
    return NextResponse.json({ claimed: 0 });
  }

  const ids = guestBookings.map((b) => b.id);

  const { error } = await supabase
    .from('bookings')
    .update({ user_id: user.id })
    .in('id', ids);

  if (error) {
    console.error('Claim guest bookings error:', error);
    return NextResponse.json({ claimed: 0 });
  }

  // Booking-Count im Profil aktualisieren
  const { data: profile } = await supabase
    .from('profiles')
    .select('booking_count')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) {
    await supabase
      .from('profiles')
      .update({
        booking_count: (profile.booking_count ?? 0) + ids.length,
      })
      .eq('id', user.id);
  }

  return NextResponse.json({ claimed: ids.length });
}
