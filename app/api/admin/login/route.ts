import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { timingSafeEqual } from 'crypto';

/** Timing-safer String-Vergleich — sonst verrät Response-Zeit Teil-Treffer. */
function safeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

const loginLimiter = rateLimit({ maxAttempts: 5, windowMs: 15 * 60 * 1000 }); // 5 pro 15 Min

/**
 * POST /api/admin/login
 * Body: { password: string, totpCode?: string }
 *
 * 1. Prüft Passwort gegen ADMIN_PASSWORD
 * 2. Falls 2FA aktiv und kein totpCode → { requires2FA: true }
 * 3. Falls 2FA aktiv und totpCode → verifizieren
 * 4. Bei Erfolg: httpOnly-Cookie setzen
 */

async function computeAdminToken(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password + '_cam2rent_admin');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = loginLimiter.check(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Zu viele Anmeldeversuche. Bitte warte 15 Minuten.' },
      { status: 429 }
    );
  }

  const { password, totpCode } = (await req.json()) as {
    password?: string;
    totpCode?: string;
  };

  if (!password) {
    return NextResponse.json({ error: 'Passwort fehlt.' }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword) {
    return NextResponse.json(
      { error: 'Admin-Passwort nicht konfiguriert.' },
      { status: 500 }
    );
  }

  if (!safeEqualStrings(password, adminPassword)) {
    return NextResponse.json({ error: 'Falsches Passwort.' }, { status: 401 });
  }

  // Prüfe ob 2FA aktiviert ist
  const supabase = createServiceClient();
  const { data: totpSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'totp_secret')
    .maybeSingle();

  if (totpSetting?.value) {
    // 2FA ist aktiv
    if (!totpCode) {
      // Kein Code mitgesendet → Frontend soll 2FA-Feld zeigen
      return NextResponse.json({ requires2FA: true });
    }

    // Code verifizieren
    const valid = verifyToken(totpSetting.value, totpCode);
    if (!valid) {
      return NextResponse.json({ error: 'Ungültiger 2FA-Code.' }, { status: 401 });
    }
  }

  // Alles OK → Cookie setzen
  const token = await computeAdminToken(adminPassword);

  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    // Kürzere Session (24h statt 7 Tagen) — falls das Admin-Tablet
    // gestohlen wird oder das Cookie geleakt wird, ist das Fenster
    // für Missbrauch deutlich kleiner. Bei aktiver Nutzung wird der
    // Admin durch tägliches Re-Login kaum beeinträchtigt.
    maxAge: 60 * 60 * 24, // 1 Tag
  });

  return response;
}
