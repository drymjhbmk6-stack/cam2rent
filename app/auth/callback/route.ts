import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 *
 * Verarbeitet alle Supabase Auth-Callbacks:
 * - E-Mail-Bestätigung nach Registrierung
 * - Passwort-Reset-Link
 * - OAuth (Google etc.)
 *
 * Der ?code=xxx wird gegen eine Session ausgetauscht.
 * Dann Weiterleitung zu ?next= (oder /konto als Standard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/konto';
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`
    );
  }

  if (code) {
    try {
      const cookieStore = await cookies();

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Cookies koennen in bestimmten Kontexten nicht gesetzt werden
              }
            },
          },
        }
      );

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        // Pruefen ob Profil verifiziert ist — wenn nicht, zur Verifizierungs-Seite
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && next === '/konto') {
            const { data: profile } = await supabase
              .from('profiles')
              .select('verification_status')
              .eq('id', user.id)
              .maybeSingle();

            if (!profile || profile.verification_status === 'none' || !profile.verification_status) {
              return NextResponse.redirect(`${origin}/konto/verifizierung`);
            }
          }
        } catch {
          // Profil-Check fehlgeschlagen — trotzdem weiterleiten
        }
        return NextResponse.redirect(`${origin}${next}`);
      }

      console.error('[auth/callback] Code-Austausch fehlgeschlagen:', error.message);
    } catch (err) {
      console.error('[auth/callback] Unerwarteter Fehler:', err);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=Anmeldung+fehlgeschlagen.+Bitte+erneut+versuchen.`
  );
}
