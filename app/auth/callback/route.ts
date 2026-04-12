import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * GET /auth/callback
 *
 * Verarbeitet alle Supabase Auth-Callbacks:
 * - E-Mail-Bestätigung nach Registrierung (token_hash + type ODER code)
 * - Passwort-Reset-Link
 * - OAuth (Google etc.)
 *
 * Unterstuetzt zwei Flows:
 * 1. Token-Hash-Flow (?token_hash=xxx&type=signup) — funktioniert geraetuebergreifend
 * 2. PKCE-Flow (?code=xxx) — nur im selben Browser wie die Registrierung
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/konto';
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`
    );
  }

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

    let authSuccess = false;

    // Flow 1: Token-Hash (E-Mail-Bestätigung, Passwort-Reset — geraetuebergreifend)
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error) {
        authSuccess = true;
      } else {
        console.error('[auth/callback] Token-Hash-Verifizierung fehlgeschlagen:', error.message);
      }
    }

    // Flow 2: PKCE Code-Austausch (OAuth, selber Browser)
    if (!authSuccess && code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        authSuccess = true;
      } else {
        console.error('[auth/callback] Code-Austausch fehlgeschlagen:', error.message);
      }
    }

    if (authSuccess) {
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
  } catch (err) {
    console.error('[auth/callback] Unerwarteter Fehler:', err);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Anmeldung+fehlgeschlagen.+Bitte+erneut+versuchen.`
  );
}
