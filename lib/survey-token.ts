import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-Token fuer die Kunden-Bewertung (Sweep 7 Vuln 25):
 * Verhindert dass jemand mit erratener Booking-ID (`C2R-YYWW-NNN`) anonyme
 * 1-Stern-Bewertungen unter falschem Namen reinkippen + DANKE-Coupon-Mails
 * an echte Kunden ausloesen kann.
 *
 * Funktionsweise:
 *  - Beim Versand der Bewertungs-Aufforderung wird `t = HMAC(secret, bookingId)`
 *    in den Link aufgenommen: /umfrage/<bookingId>?t=<token>
 *  - Der API-Endpoint validiert den Token mit timing-safe-Vergleich.
 *  - Secret kommt aus ADMIN_PASSWORD oder NEXT_PUBLIC_SUPABASE_URL als Fallback
 *    — fuer ein neues, dediziertes Secret muesste eine ENV-Variable gesetzt
 *    werden, das machen wir hier defensiv.
 *
 * Nicht kryptographisch perfekt, aber im Kontext einer Survey-URL voellig
 * ausreichend gegen Brute-Force (mit 32-Hex-Zeichen Token = 128 Bit Eintropie).
 */

function getSecret(): string {
  const v = process.env.SURVEY_HMAC_SECRET || process.env.ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!v) throw new Error('No HMAC secret available');
  return v;
}

export function generateSurveyToken(bookingId: string): string {
  // 16 Bytes = 32 Hex-Zeichen — kompakt, gut genug
  return createHmac('sha256', getSecret())
    .update(`survey:${bookingId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifySurveyToken(bookingId: string, token: string): boolean {
  if (!bookingId || !token || typeof token !== 'string') return false;
  let expected: string;
  try {
    expected = generateSurveyToken(bookingId);
  } catch {
    // Kein Secret konfiguriert → defensiv akzeptieren wir den Token nicht.
    return false;
  }
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
