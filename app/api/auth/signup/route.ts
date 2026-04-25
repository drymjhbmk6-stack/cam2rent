import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Registrierungs-Rate-Limiter — pro IP.
 *
 * Supabase Free Tier limitiert global auf 4 Signups/Stunde. Wir hatten frueher
 * einen GLOBALEN In-Memory-Counter — das war eine DoS-Falle: ein Angreifer
 * konnte alle 3 Slots/h aus einer einzigen IP heraus aufbrauchen und damit
 * jeden anderen legitimen Signup fuer eine Stunde blockieren.
 * Loesung: per-IP-Limit ueber den bestehenden `lib/rate-limit.ts`-Helper.
 *
 * 3 Signups/IP/Stunde ist grosszuegig fuer normale Nutzung (eine Familie
 * registriert selten mehr als 3 Konten), aber dicht genug, dass IP-Rotation
 * spuerbar bleibt.
 */
const SIGNUPS_PER_IP_PER_HOUR = 3;
const limiter = rateLimit({ maxAttempts: SIGNUPS_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 });

/**
 * GET /api/auth/signup
 * Status-Hint fuer das UI — keine Counter-Erhoehung. Nutzt einen anderen
 * Bucket-Key, damit der GET-Aufruf nicht das eigentliche POST-Kontingent frisst.
 */
const statusLimiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 60 * 1000 });
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const { success, remaining } = statusLimiter.check(`signup-status:${ip}`);
  return NextResponse.json({
    allowed: success,
    remaining: Math.max(0, remaining),
  });
}

/**
 * POST /api/auth/signup
 * Vor- ODER Nach-Signup-Counter-Increment. Returnt 429 wenn die IP ihr
 * Stunden-Kontingent erschoepft hat.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success, remaining } = limiter.check(`signup:${ip}`);
  if (!success) {
    return NextResponse.json(
      {
        error: 'Zu viele Registrierungsversuche von dieser IP. Bitte in einer Stunde erneut versuchen.',
        rateLimited: true,
      },
      { status: 429 },
    );
  }
  return NextResponse.json({ success: true, remaining });
}
