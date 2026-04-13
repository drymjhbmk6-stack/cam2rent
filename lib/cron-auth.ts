import { NextRequest } from 'next/server';

/**
 * Zentrale Cron-Authentifizierung.
 * Akzeptiert NUR Header-basierte Auth — keine URL-Parameter (Sicherheit).
 *
 * Unterstützte Methoden:
 * - Header: x-cron-secret: <secret>
 * - Header: Authorization: Bearer <secret>
 */
export function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Header: x-cron-secret
  const headerSecret = req.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Header: Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // URL-Parameter: ?secret=<secret> (für einfache Cron-Setups)
  const urlSecret = req.nextUrl.searchParams.get('secret');
  if (urlSecret === cronSecret) return true;

  return false;
}
