import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase';

/**
 * Web-Push fuer Endkunden.
 * Nutzt dieselben VAPID-Keys wie Admin (siehe lib/push.ts), separate
 * Subscriptions-Tabelle damit Permissions/Filter eigenstaendig bleiben.
 *
 * Trigger sind hier noch nicht angeschlossen — die Infrastruktur ist
 * vorhanden, damit spaeter z.B. "Neue Kamera im Shop" oder "Saison-Aktion
 * gestartet" automatisch verschickt werden koennen.
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

export interface CustomerPushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export async function sendPushToCustomers(
  payload: CustomerPushPayload,
  opts?: { topic?: string },
): Promise<void> {
  if (!configureVapid()) return;

  try {
    const supabase = createServiceClient();
    let query = supabase
      .from('customer_push_subscriptions')
      .select('id, endpoint, p256dh, auth, topics');

    if (opts?.topic) {
      query = query.contains('topics', [opts.topic, 'all']);
    }

    const { data: subs, error } = await query;
    if (error || !subs || subs.length === 0) return;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body || '',
      url: payload.url || '/',
      tag: payload.tag,
      icon: payload.icon || '/icon-192.png',
      badge: '/icon-192.png',
    });

    const expiredIds: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notificationPayload,
          );
          void supabase
            .from('customer_push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
          } else {
            console.error('[customer-push] Send-Fehler:', (err as Error).message);
          }
        }
      }),
    );

    if (expiredIds.length > 0) {
      await supabase.from('customer_push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (err) {
    console.error('[customer-push] Unerwarteter Fehler:', (err as Error).message);
  }
}
