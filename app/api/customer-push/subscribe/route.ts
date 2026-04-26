import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isTestMode } from '@/lib/env-mode';

export const runtime = 'nodejs';

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 60 * 1000 }); // 10/h pro IP

/**
 * POST /api/customer-push/subscribe
 * Body: { subscription, email?, topics? }
 * Public (kein Login noetig). Rate-limited gegen Spam.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Versuche.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const sub = body?.subscription;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
    const topics = Array.isArray(body?.topics) && body.topics.length > 0
      ? body.topics.map(String).slice(0, 10)
      : ['all'];

    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: 'Ungültige Subscription.' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent')?.slice(0, 200) ?? null;

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('customer_push_subscriptions')
      .upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent,
          email,
          topics,
          is_test: await isTestMode(),
        },
        { onConflict: 'endpoint' },
      );

    if (error) {
      console.error('[customer-push/subscribe] DB-Fehler:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Unbekannter Fehler' },
      { status: 500 },
    );
  }
}
