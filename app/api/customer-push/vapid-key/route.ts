import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push';

/**
 * GET /api/customer-push/vapid-key
 * Public Endpoint — VAPID-Public-Key fuer den Endkunden-Subscribe-Flow.
 * Public-Keys sind per Definition oeffentlich, kein Sicherheits-Issue.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Server nicht bereit.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ publicKey });
}
