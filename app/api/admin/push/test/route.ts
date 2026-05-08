import { NextResponse } from 'next/server';
import { sendPushToAdmins, getVapidPublicKey } from '@/lib/push';

/**
 * POST /api/admin/push/test
 * Sendet eine Test-Notification an alle registrierten Admin-Geräte und
 * liefert die echte Send-Statistik zurück, damit die UI ehrlich zeigen
 * kann, ob ein Geraet wirklich erreicht wurde — vorher antwortete der
 * Endpoint stets mit `success: true`, auch wenn auf dem Push-Service
 * 0 Geraete erfolgreich beliefert wurden.
 */
export async function POST() {
  if (!getVapidPublicKey()) {
    return NextResponse.json(
      { error: 'VAPID nicht konfiguriert.' },
      { status: 503 }
    );
  }

  const stats = await sendPushToAdmins({
    title: 'cam2rent Admin — Test-Push',
    body: 'Wenn du das siehst, sind Push-Notifications korrekt eingerichtet.',
    url: '/admin',
    tag: 'test',
  });

  return NextResponse.json({ success: true, stats });
}
