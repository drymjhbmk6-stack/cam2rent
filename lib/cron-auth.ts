import { NextRequest } from 'next/server';

/**
 * Zentrale Cron-Authentifizierung.
 *
 * Bevorzugt Header-Auth (sicher — Secrets erscheinen nicht in Server-Logs):
 * - Header: x-cron-secret: <secret>
 * - Header: Authorization: Bearer <secret>
 *
 * Rückwärtskompatibel: URL-Parameter (?secret=...) wird akzeptiert, wenn nicht
 * über CRON_DISABLE_URL_SECRET=true explizit deaktiviert. Sobald die Hetzner-
 * Crontab auf Header-Auth umgestellt ist, sollte CRON_DISABLE_URL_SECRET=true
 * gesetzt werden — dann verschwinden die Secrets aus den Access-Logs.
 *
 * Migration der Crontab (Hetzner):
 *   Vorher: curl -s -X POST "https://.../api/cron/blog-publish?secret=$SECRET"
 *   Nachher: curl -s -X POST -H "x-cron-secret: $SECRET" "https://.../api/cron/blog-publish"
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

  // URL-Parameter (Legacy): nur wenn nicht via env deaktiviert.
  if (process.env.CRON_DISABLE_URL_SECRET !== 'true') {
    const urlSecret = req.nextUrl.searchParams.get('secret');
    if (urlSecret === cronSecret) return true;
  }

  return false;
}
