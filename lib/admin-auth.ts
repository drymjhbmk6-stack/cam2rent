import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Prüft ob der aktuelle Request einen gültigen Admin-Token hat.
 * Liest den admin_token Cookie und vergleicht gegen den
 * SHA-256-Hash von ADMIN_PASSWORD + '_cam2rent_admin'.
 *
 * Nutzt `timingSafeEqual` statt `===`, damit Angreifer über
 * Response-Zeiten keine Teil-Treffer des Tokens erkennen können.
 */
export async function checkAdminAuth(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (!token) return false;
  const expected = createHash('sha256')
    .update((process.env.ADMIN_PASSWORD ?? '') + '_cam2rent_admin')
    .digest('hex');
  // timingSafeEqual erfordert gleiche Länge → sonst automatisch false.
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
