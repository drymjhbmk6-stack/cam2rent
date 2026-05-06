import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/log-client-error
 *
 * Schreibt Frontend-Fehler aus app/error.tsx + app/global-error.tsx in die DB,
 * damit wir sie im Admin nachverfolgen koennen, ohne dass der Kunde DevTools
 * offen hat.
 *
 * Public-Endpoint (auch Gaeste sollen Fehler loggen koennen). Rate-limited
 * gegen Spam/DoS.
 */

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60_000 });

const MAX_LEN = {
  message: 2000,
  stack: 8000,
  url: 2000,
  userAgent: 500,
  digest: 200,
};

function clamp(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = limiter.check(`log-client-error:${ip}`);
    if (!limit.success) {
      return NextResponse.json({ ok: true, throttled: true }, { status: 200 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Defekter JSON-Body — trotzdem 200, damit der Client nicht endlos retried
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const message = clamp(body.message, MAX_LEN.message);
    const stack = clamp(body.stack, MAX_LEN.stack);
    const url = clamp(body.url, MAX_LEN.url);
    const userAgent = clamp(body.userAgent, MAX_LEN.userAgent) ?? clamp(req.headers.get('user-agent'), MAX_LEN.userAgent);
    const digest = clamp(body.digest, MAX_LEN.digest);

    // Mindestens irgendeine Info muss da sein
    if (!message && !stack && !digest) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }

    // User-Session (optional)
    let userId: string | null = null;
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const cookieStore = await cookies();
      const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() {},
          },
        }
      );
      const { data } = await supabaseAuth.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch {
      // ignore — Logging soll nicht an Auth-Fehlern scheitern
    }

    const cookieStore = await cookies();
    const isAdmin = !!cookieStore.get('admin_token')?.value;

    const context = body.context && typeof body.context === 'object' ? body.context : null;
    const testMode = await isTestMode().catch(() => false);

    const supabase = createServiceClient();
    const { error } = await supabase.from('client_errors').insert({
      digest,
      message,
      stack,
      url,
      user_agent: userAgent,
      user_id: userId,
      is_admin: isAdmin,
      ip_address: ip,
      context,
      is_test: testMode,
    });

    if (error) {
      console.error('[log-client-error] insert failed:', error);
      // Trotzdem 200 zurueckgeben — der Client soll nicht in einer Fehler-Schleife landen
      return NextResponse.json({ ok: true, persisted: false }, { status: 200 });
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (err) {
    console.error('[log-client-error] unexpected:', err);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
