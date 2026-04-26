import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/push/subscribe
 * Speichert eine PushSubscription für ein Admin-Gerät.
 *
 * Body:
 * {
 *   subscription: { endpoint, keys: { p256dh, auth } },
 *   deviceLabel?: string  // optional, z.B. "iPhone Lars"
 * }
 *
 * Endpoint ist UNIQUE — bei Re-Subscription wird die alte Zeile per
 * upsert() aktualisiert. Damit gibt es nie Duplikate.
 *
 * Wird unter dem Mitarbeiter-Cookie aufgerufen, schreibt admin_user_id mit,
 * damit Notifications spaeter nach Permission gefiltert werden koennen.
 * Beim Legacy-ENV-Login (ohne echten Mitarbeiter-Account) bleibt das Feld
 * NULL — solche Geraete bekommen weiterhin alle Notifications (Owner-Verhalten).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sub = body?.subscription;
    const deviceLabel = typeof body?.deviceLabel === 'string' ? body.deviceLabel.slice(0, 80) : null;

    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json(
        { error: 'Ungültige Subscription (endpoint/keys fehlen).' },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get('user-agent')?.slice(0, 200) || null;

    const me = await getCurrentAdminUser();
    // Legacy-ENV-User hat die feste ID 'legacy-env' und keinen DB-Eintrag —
    // FK wuerde scheitern, also auf NULL setzen (Backward-Compat-Pfad).
    const adminUserId = me && me.id !== 'legacy-env' ? me.id : null;

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent,
          device_label: deviceLabel,
          admin_user_id: adminUserId,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[push/subscribe] Supabase-Fehler:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Unbekannter Fehler' },
      { status: 500 }
    );
  }
}
