import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push';

/**
 * GET /api/admin/push/vapid-key
 * Liefert den öffentlichen VAPID-Key für Subscribe im Browser.
 * Wird vom Admin-Frontend benötigt, um eine PushSubscription anzulegen.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID nicht konfiguriert. Setze VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in den Env-Variablen.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
