import { NextResponse } from 'next/server';
import { sendPushToAdmins, getVapidPublicKey } from '@/lib/push';

/**
 * POST /api/admin/push/test
 * Sendet eine Test-Notification an alle registrierten Admin-Geräte.
 * Praktisch zum Verifizieren nach dem Subscribe-Flow.
 */
export async function POST() {
  if (!getVapidPublicKey()) {
    return NextResponse.json(
      { error: 'VAPID nicht konfiguriert.' },
      { status: 503 }
    );
  }

  await sendPushToAdmins({
    title: 'cam2rent Admin — Test-Push',
    body: 'Wenn du das siehst, sind Push-Notifications korrekt eingerichtet.',
    url: '/admin',
    tag: 'test',
  });

  return NextResponse.json({ success: true });
}
