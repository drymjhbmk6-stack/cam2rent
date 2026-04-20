import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Sehr restriktiv — Account-Löschung darf nicht im Sekundentakt
// hintereinander versucht werden (Brute-Force auf Re-Auth-Passwort).
const deleteAccountLimiter = rateLimit({ maxAttempts: 3, windowMs: 60 * 60 * 1000 });

/**
 * POST /api/delete-account
 * Body: { password: string }
 *
 * Self-service account deletion with password re-authentication.
 * Anonymizes profile data, disables auth account, signs user out.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!deleteAccountLimiter.check(`delacc:${ip}`).success) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
      { status: 429 }
    );
  }
  const cookieStore = await cookies();

  // Verify session server-side
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

  const body = await req.json();
  const { password } = body as { password: string };

  if (!password) {
    return NextResponse.json({ error: 'Passwort fehlt.' }, { status: 400 });
  }

  // Re-authenticate: verify password is correct
  const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email: user.email!,
    password,
  });

  if (signInError) {
    return NextResponse.json(
      { error: 'Falsches Passwort.' },
      { status: 403 }
    );
  }

  const supabase = createServiceClient();

  // Check for active bookings
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'shipped'])
    .limit(1);

  if (activeBookings?.length) {
    return NextResponse.json(
      {
        error:
          'Du hast noch aktive Buchungen. Dein Konto kann erst nach Abschluss aller Buchungen gelöscht werden.',
      },
      { status: 400 }
    );
  }

  // Anonymize profile data
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: 'Gelöschter Kunde',
      phone: null,
      address_street: null,
      address_zip: null,
      address_city: null,
      anonymized: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (profileError) {
    console.error('[delete-account] Profile anonymization error:', profileError);
    return NextResponse.json(
      { error: 'Kontolöschung fehlgeschlagen. Bitte versuche es erneut.' },
      { status: 500 }
    );
  }

  // Disable auth account
  try {
    await supabase.auth.admin.updateUserById(user.id, {
      email: `deleted_${user.id}@anonymisiert.local`,
      user_metadata: { full_name: 'Gelöschter Kunde' },
      ban_duration: '876000h', // ~100 years = effectively permanent
    });
  } catch (authErr) {
    console.error('[delete-account] Auth deactivation error:', authErr);
  }

  // Sign the user out
  await supabaseAuth.auth.signOut();

  return NextResponse.json({ success: true });
}
