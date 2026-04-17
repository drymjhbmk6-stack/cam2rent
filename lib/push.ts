import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase';

/**
 * Web-Push Hilfsfunktionen für Admin-PWA-Notifications.
 *
 * Setup:
 * 1. VAPID-Keypair einmalig generieren:
 *      npx web-push generate-vapid-keys
 * 2. Env-Variablen setzen (Coolify):
 *      VAPID_PUBLIC_KEY=...
 *      VAPID_PRIVATE_KEY=...
 *      VAPID_SUBJECT=mailto:kontakt@cam2rent.de
 * 3. SQL-Migration `supabase-push-subscriptions.sql` ausführen.
 */

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:kontakt@cam2rent.de';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;     // Klick-Ziel (relative URL, default /admin)
  tag?: string;     // Notification-Gruppierung (z.B. 'new_booking')
  icon?: string;    // Default: /icon-192.png
}

/**
 * Sendet eine Push-Notification an alle registrierten Admin-Geräte.
 * Bei expired/invalid Subscriptions (404, 410) wird die Subscription
 * automatisch aus der DB entfernt.
 *
 * Fehler werden geloggt, aber niemals geworfen — Push ist non-blocking
 * und darf andere Workflows (z.B. Buchungsbestätigung) nicht abbrechen.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!configureVapid()) {
    // VAPID-Keys nicht konfiguriert — Push ist optional, kein Fehler.
    return;
  }

  try {
    const supabase = createServiceClient();
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');

    if (error) {
      console.error('[push] Subscriptions-Load-Fehler:', error.message);
      return;
    }

    if (!subs || subs.length === 0) return;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body || '',
      url: payload.url || '/admin',
      tag: payload.tag,
      icon: payload.icon || '/admin-icon-192.png',
      badge: '/admin-icon-192.png',
    });

    const expiredIds: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload
          );
          // last_used_at aktualisieren (best-effort, kein await blocking)
          void supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          // 404 = Subscription endpoint not found, 410 = Subscription expired
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
          } else {
            console.error('[push] Send-Fehler:', (err as Error).message);
          }
        }
      })
    );

    // Abgelaufene Subscriptions aufräumen
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (err) {
    console.error('[push] Unerwarteter Fehler:', (err as Error).message);
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}
