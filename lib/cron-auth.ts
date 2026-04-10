import { NextRequest } from 'next/server';

/**
 * Zentrale Cron-Authentifizierung.
 * Akzeptiert NUR Header-basierte Auth — keine URL-Parameter (Sicherheit).
 *
 * Unterstuetzte Methoden:
 * - Header: x-cron-secret: <secret>
 * - Header: Authorization: Bearer <secret>
 */
export function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const headerSecret = req.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}
