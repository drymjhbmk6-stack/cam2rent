import { cookies } from 'next/headers';
import { createHash } from 'crypto';

/**
 * Prüft ob der aktuelle Request einen gültigen Admin-Token hat.
 * Liest den admin_token Cookie und vergleicht gegen den
 * SHA-256-Hash von ADMIN_PASSWORD + '_cam2rent_admin'.
 */
export async function checkAdminAuth(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (!token) return false;
  const expected = createHash('sha256')
    .update((process.env.ADMIN_PASSWORD ?? '') + '_cam2rent_admin')
    .digest('hex');
  return token === expected;
}
