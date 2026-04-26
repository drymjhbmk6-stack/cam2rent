import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: 'endpoint fehlt' }, { status: 400 });

    const supabase = createServiceClient();
    await supabase.from('customer_push_subscriptions').delete().eq('endpoint', endpoint);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Fehler' },
      { status: 500 },
    );
  }
}
