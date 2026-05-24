import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase';
import type { PermissionKey } from '@/lib/admin-users';

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

export interface PushSendStats {
  vapidConfigured: boolean;
  totalSubscriptions: number;   // Geraete in der DB insgesamt
  attempted: number;            // nach Permission-Filter uebrig
  sent: number;                 // Erfolgreich an den Push-Service uebergeben
  failed: number;               // Fehlschlag mit anderem Status (z.B. 403, 5xx)
  expired: number;              // 404/410 — aus DB entfernt
  firstError?: string;          // Erste echte Fehlermeldung fuer das UI
}

/**
 * Sendet eine Push-Notification an alle registrierten Admin-Geräte.
 * Bei expired/invalid Subscriptions (404, 410) wird die Subscription
 * automatisch aus der DB entfernt.
 *
 * Fehler werden geloggt, aber niemals geworfen — Push ist non-blocking
 * und darf andere Workflows (z.B. Buchungsbestätigung) nicht abbrechen.
 *
 * Permission-Filter: Wenn `requiredPermission` gesetzt ist, gehen Pushes
 * nur an Geraete, deren Mitarbeiter die Permission hat (Owner immer).
 * Subscriptions ohne `admin_user_id` (Legacy-ENV-Login) gelten als Owner
 * und bekommen alles — Backward-Compat fuer Bestands-Setups.
 *
 * Rueckgabe: Diagnose-Statistik. Aufrufer wie Notification-Trigger nutzen
 * `void sendPushToAdmins(...)` und ignorieren den Wert — der Test-Endpoint
 * verwendet ihn, um in der UI ehrlich zu zeigen, ob etwas angekommen ist.
 */
export async function sendPushToAdmins(
  payload: PushPayload,
  opts?: { requiredPermission?: PermissionKey },
): Promise<PushSendStats> {
  const stats: PushSendStats = {
    vapidConfigured: false,
    totalSubscriptions: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    expired: 0,
  };

  if (!configureVapid()) {
    // VAPID-Keys nicht konfiguriert — Push ist optional, kein Fehler.
    return stats;
  }
  stats.vapidConfigured = true;

  try {
    const supabase = createServiceClient();
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, admin_user_id, admin_users(role, permissions, is_active)');

    if (error) {
      console.error('[push] Subscriptions-Load-Fehler:', error.message);
      stats.firstError = `DB: ${error.message}`;
      return stats;
    }

    if (!subs || subs.length === 0) return stats;
    stats.totalSubscriptions = subs.length;

    // Permission-Filter
    const required = opts?.requiredPermission;
    const filtered = subs.filter((s) => {
      // Legacy-Subscription (keine User-Bindung) → wie Owner behandeln
      if (!s.admin_user_id) return true;
      const u = Array.isArray(s.admin_users) ? s.admin_users[0] : s.admin_users;
      if (!u || u.is_active === false) return false;
      if (u.role === 'owner') return true;
      if (!required) return true; // ohne Filter: alle aktiven User
      const perms = Array.isArray(u.permissions) ? (u.permissions as string[]) : [];
      return perms.includes(required);
    });

    stats.attempted = filtered.length;
    if (filtered.length === 0) return stats;

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
      filtered.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload
          );
          stats.sent += 1;
          // last_used_at aktualisieren (best-effort, kein await blocking)
          void supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          const message = (err as Error)?.message || 'Unbekannter Fehler';
          // 404 = Subscription endpoint not found, 410 = Subscription expired
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
            stats.expired += 1;
          } else {
            stats.failed += 1;
            if (!stats.firstError) {
              stats.firstError = status ? `HTTP ${status}: ${message}` : message;
            }
            console.error('[push] Send-Fehler:', message);
          }
        }
      })
    );

    // Abgelaufene Subscriptions aufräumen
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (err) {
    const message = (err as Error).message;
    console.error('[push] Unerwarteter Fehler:', message);
    if (!stats.firstError) stats.firstError = message;
  }

  return stats;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Push an genau einen Mitarbeiter (z.B. persönlicher Termin-Reminder).
 * Liefert dieselbe Diagnose-Statistik wie sendPushToAdmins. Legacy-ENV-User
 * (id='legacy-env') hat keine Subscriptions — sendet dann an alle Legacy-
 * Subscriptions ohne admin_user_id (Backward-Compat: Master-Passwort-Logins).
 */
export async function sendPushToUser(
  adminUserId: string,
  payload: PushPayload,
): Promise<PushSendStats> {
  const stats: PushSendStats = {
    vapidConfigured: false,
    totalSubscriptions: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    expired: 0,
  };

  if (!configureVapid()) return stats;
  stats.vapidConfigured = true;

  try {
    const supabase = createServiceClient();
    let query = supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, admin_user_id');

    if (adminUserId === 'legacy-env') {
      query = query.is('admin_user_id', null);
    } else {
      query = query.eq('admin_user_id', adminUserId);
    }

    const { data: subs, error } = await query;

    if (error) {
      stats.firstError = `DB: ${error.message}`;
      return stats;
    }
    if (!subs || subs.length === 0) return stats;

    stats.totalSubscriptions = subs.length;
    stats.attempted = subs.length;

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
          stats.sent += 1;
          void supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          const message = (err as Error)?.message || 'Unbekannter Fehler';
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
            stats.expired += 1;
          } else {
            stats.failed += 1;
            if (!stats.firstError) {
              stats.firstError = status ? `HTTP ${status}: ${message}` : message;
            }
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (err) {
    stats.firstError = (err as Error).message;
  }

  return stats;
}
