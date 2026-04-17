import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/admin/push/unsubscribe
 * Löscht eine PushSubscription anhand des Endpoints.
 *
 * Body: { endpoint: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint fehlt.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
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
