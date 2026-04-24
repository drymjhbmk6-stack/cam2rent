import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import {
  type AdminUser,
  type PermissionKey,
  getUserBySession,
  hasPermission as userHasPermission,
  isSessionToken,
  legacyEnvUser,
} from '@/lib/admin-users';

/**
 * Prueft den `admin_token`-Cookie.
 *
 * Zwei Arten:
 *   1) Session-Token (beginnt mit "sess_") -> DB-Lookup via admin_sessions
 *   2) Legacy-ENV-Token = SHA-256(ADMIN_PASSWORD + '_cam2rent_admin')
 *      -> virtueller Owner-User (Bootstrap, falls noch keine DB-Accounts)
 */
export async function checkAdminAuth(): Promise<boolean> {
  return (await getCurrentAdminUser()) !== null;
}

/**
 * Liefert den aktuell eingeloggten Admin-User (inkl. Permissions) oder null.
 * Legacy-Env-Passwort wird zu einem virtuellen Owner-User.
 */
export async function getCurrentAdminUser(): Promise<AdminUser | null> {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (!token) return null;

  if (isSessionToken(token)) {
    return await getUserBySession(token);
  }

  // Legacy: SHA-256-Vergleich gegen ENV-Passwort
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword) return null;
  const expected = createHash('sha256').update(adminPassword + '_cam2rent_admin').digest('hex');
  if (token !== expected) return null;
  return legacyEnvUser();
}

/**
 * Prueft ob der aktuell eingeloggte Admin eine bestimmte Permission hat.
 * Gibt `false` zurueck wenn nicht eingeloggt.
 */
export async function currentUserHasPermission(perm: PermissionKey): Promise<boolean> {
  const user = await getCurrentAdminUser();
  return userHasPermission(user, perm);
}
