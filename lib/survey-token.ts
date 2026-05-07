import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-Token fuer die Kunden-Bewertung (Sweep 7 Vuln 25 + Sweep 8 H5):
 * Verhindert dass jemand mit erratener Booking-ID (`C2R-YYWW-NNN`) anonyme
 * 1-Stern-Bewertungen unter falschem Namen reinkippen + DANKE-Coupon-Mails
 * an echte Kunden ausloesen kann.
 *
 * Funktionsweise:
 *  - Beim Versand der Bewertungs-Aufforderung wird ein Token mit Timestamp
 *    erzeugt: t = `${timestamp}.${HMAC(secret, "survey:" + bookingId + ":" + timestamp)}`
 *  - Der API-Endpoint validiert: Token-Format + Ablauf (max 90 Tage) + HMAC.
 *  - Secret kommt aus SURVEY_HMAC_SECRET (oder ADMIN_PASSWORD als Fallback).
 *
 * Sweep 8 H5: Token laeuft jetzt nach 90 Tagen ab. Vorher: unbegrenzt
 * gueltig — geleakte Survey-Links blieben fuer immer ausnutzbar.
 */

const TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 Tage

function getSecret(): string {
  const v = process.env.SURVEY_HMAC_SECRET || process.env.ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!v) throw new Error('No HMAC secret available');
  return v;
}

function computeHmac(bookingId: string, timestamp: number): string {
  // 16 Bytes = 32 Hex-Zeichen — kompakt, gut genug
  return createHmac('sha256', getSecret())
    .update(`survey:${bookingId}:${timestamp}`)
    .digest('hex')
    .slice(0, 32);
}

export function generateSurveyToken(bookingId: string): string {
  const ts = Date.now();
  const hmac = computeHmac(bookingId, ts);
  return `${ts}.${hmac}`;
}

export function verifySurveyToken(bookingId: string, token: string): boolean {
  if (!bookingId || !token || typeof token !== 'string') return false;

  // Format: <timestamp>.<32-hex>
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx >= token.length - 1) {
    // Backward-Compat: alte Tokens ohne Timestamp (32 Hex direkt) — laufen 0
    // Tage gultig, weil Idempotenz nicht garantiert war. Wir lehnen sie ab.
    return false;
  }

  const tsStr = token.slice(0, dotIdx);
  const hmacPart = token.slice(dotIdx + 1);

  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) return false;

  // Ablauf-Pruefung
  const ageMs = Date.now() - ts;
  if (ageMs < 0 || ageMs > TOKEN_EXPIRY_MS) return false;

  let expected: string;
  try {
    expected = computeHmac(bookingId, ts);
  } catch {
    return false;
  }
  if (hmacPart.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hmacPart, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
