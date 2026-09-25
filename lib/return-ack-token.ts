import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-Token fuer die Rueckmeldung des Kunden auf die Nachsende-Mail
 * („Gelesen — ich schicke es zurueck" / „Habe ich nicht mehr").
 *
 * Gleiches Muster wie `lib/survey-token.ts`, aber mit eigenem Zweck-Praefix,
 * damit ein Umfrage-Token hier nicht gilt (und umgekehrt).
 * Format: `<timestamp>.<32-hex>`, gueltig 60 Tage.
 */

const TOKEN_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const v = process.env.SURVEY_HMAC_SECRET || process.env.ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!v) throw new Error('No HMAC secret available');
  return v;
}

function computeHmac(bookingId: string, timestamp: number): string {
  return createHmac('sha256', getSecret())
    .update(`return-ack:${bookingId}:${timestamp}`)
    .digest('hex')
    .slice(0, 32);
}

export function generateReturnAckToken(bookingId: string): string {
  const ts = Date.now();
  return `${ts}.${computeHmac(bookingId, ts)}`;
}

export function verifyReturnAckToken(bookingId: string, token: string): boolean {
  if (!bookingId || !token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) return false;
  const ts = Number(token.slice(0, dot));
  const part = token.slice(dot + 1);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const age = Date.now() - ts;
  if (age < 0 || age > TOKEN_EXPIRY_MS) return false;
  let expected: string;
  try {
    expected = computeHmac(bookingId, ts);
  } catch {
    return false;
  }
  if (part.length !== expected.length || !/^[0-9a-f]+$/i.test(part)) return false;
  try {
    return timingSafeEqual(Buffer.from(part, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
