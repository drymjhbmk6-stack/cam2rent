import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/check-email
 * Body: { email: string }
 * Response: { exists: boolean }
 *
 * Nutzt Admin-API, um zu pruefen ob eine E-Mail bereits registriert ist.
 * Wird vom Client beim Verlassen des E-Mail-Felds in /registrierung und
 * im ExpressSignup aufgerufen, damit wir den User frueh informieren und
 * nicht erst nach Submit die Supabase-Privacy-Falle aufdecken muessen.
 *
 * Rate-Limit 30/min pro IP — verhindert E-Mail-Enumeration durch Scraping.
 */

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60 * 1000 });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = limiter.check(`check-email:${ip}`);
  if (!success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ exists: false });
  }

  try {
    const supabase = createServiceClient();
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const exists = !!data?.users?.some((u) => u.email?.toLowerCase() === email);
    return NextResponse.json({ exists });
  } catch (err) {
    console.error('[check-email] listUsers fehlgeschlagen:', err);
    // Im Fehlerfall lieber "exists: false" zurueckgeben — der Submit-Weg
    // hat als Fallback noch die identities-Detection + Server-Error.
    return NextResponse.json({ exists: false });
  }
}
