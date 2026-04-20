import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * GET /auth/callback
 *
 * Verarbeitet alle Supabase Auth-Callbacks:
 * - E-Mail-Bestätigung (code aus ConfirmationURL — Supabase bestätigt die E-Mail
 *   bereits serverseitig, bevor hierher redirected wird)
 * - Passwort-Reset-Link
 * - OAuth / PKCE
 *
 * Wenn der PKCE Code-Austausch fehlschlägt (anderer Browser/Gerät),
 * wird trotzdem zum Login weitergeleitet mit Erfolgsmeldung,
 * da die E-Mail-Bestätigung bereits durch Supabase erfolgt ist.
 */
/**
 * Erlaubt nur relative, hostlose URLs als `next`-Ziel (Open-Redirect-Schutz).
 * Akzeptiert: "/konto", "/konto/buchungen?x=1", "/auth/passwort-aendern".
 * Lehnt ab: "//evil.com", "https://evil.com", "javascript:…", Backslashes,
 * Protocol-Relative-URLs, newlines, null-Bytes.
 */
function sanitizeNext(next: string | null | undefined, fallback: string): string {
  if (!next || typeof next !== 'string') return fallback;
  // Muss mit genau einem "/" starten, nicht "//" (Protocol-Relative) und kein ":" am Anfang
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // Keine Protokoll-Schema-Marker oder Steuerzeichen
  if (/[\r\n\t\0]|[\u0000-\u001F]/.test(next)) return fallback;
  if (next.toLowerCase().includes('javascript:')) return fallback;
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = sanitizeNext(searchParams.get('next'), '/konto');
  const errorParam = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');

  // Sichere Base-URL
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const baseUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://test.cam2rent.de');

  // Fehler von Supabase (z.B. otp_expired)
  if (errorParam) {
    // Bei abgelaufenen Links: freundliche Meldung
    if (errorCode === 'otp_expired') {
      return NextResponse.redirect(
        `${baseUrl}/login?info=Link+abgelaufen.+Bitte+erneut+registrieren+oder+einloggen.`
      );
    }
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent(errorDescription || errorParam)}`
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
              // Cookies können in bestimmten Kontexten nicht gesetzt werden
            }
          },
        },
      }
    );

    let authSuccess = false;
    let pkceFailedWithCodeVerifier = false;

    // Flow 1: Token-Hash (falls vorhanden)
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error) {
        authSuccess = true;
      } else {
        console.error('[auth/callback] Token-Hash fehlgeschlagen:', error.message);
      }
    }

    // Flow 2: PKCE Code-Austausch
    if (!authSuccess && code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        authSuccess = true;
      } else {
        console.error('[auth/callback] Code-Austausch fehlgeschlagen:', error.message);
        // Wenn PKCE fehlschlaegt weil Code-Verifier fehlt (anderer Browser),
        // ist die E-Mail trotzdem bereits von Supabase bestaetigt worden.
        if (error.message.includes('code verifier') || error.message.includes('PKCE')) {
          pkceFailedWithCodeVerifier = true;
        }
      }
    }

    if (authSuccess) {
      // Prüfen ob Profil verifiziert ist
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && next === '/konto') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('verification_status')
            .eq('id', user.id)
            .maybeSingle();

          if (!profile || profile.verification_status === 'none' || !profile.verification_status) {
            return NextResponse.redirect(`${baseUrl}/konto/verifizierung`);
          }
        }
      } catch {
        // Profil-Check fehlgeschlagen — trotzdem weiterleiten
      }

      // Passwort-Reset: zur Passwort-Aendern-Seite
      if (next.includes('passwort')) {
        return NextResponse.redirect(`${baseUrl}${next}`);
      }
      return NextResponse.redirect(`${baseUrl}${next}`);
    }

    // PKCE fehlgeschlagen, aber E-Mail wurde von Supabase bestaetigt
    // → User zum Login mit Erfolgsmeldung schicken
    if (pkceFailedWithCodeVerifier) {
      return NextResponse.redirect(
        `${baseUrl}/login?success=E-Mail+bestaetigt!+Bitte+melde+dich+jetzt+an.`
      );
    }
  } catch (err) {
    console.error('[auth/callback] Unerwarteter Fehler:', err);
  }

  return NextResponse.redirect(
    `${baseUrl}/login?error=Anmeldung+fehlgeschlagen.+Bitte+erneut+versuchen.`
  );
}
