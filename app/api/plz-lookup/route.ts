import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * PLZ → Stadt-Lookup für deutsche Postleitzahlen.
 *
 * Proxy auf zippopotam.us (kostenlos, kein API-Key). Cached pro PLZ
 * im Module-Scope, damit wiederholte Anfragen nicht bei jedem Tippen
 * an externe API gehen.
 *
 * Rückgabe:
 *   200 { city: string, state?: string }
 *   400 { error: 'invalid_plz' }
 *   404 { error: 'not_found' }
 *   429 { error: 'rate_limited' }
 *   502 { error: 'upstream_error' }
 */

type CacheEntry = { city: string; state?: string; ts: number };
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const cache = new Map<string, CacheEntry>();

const lookupLimiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 1000 });

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = lookupLimiter.check(`plz-lookup:${ip}`);
  if (!limit.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const plz = (req.nextUrl.searchParams.get('plz') || '').trim();
  if (!/^\d{5}$/.test(plz)) {
    return NextResponse.json({ error: 'invalid_plz' }, { status: 400 });
  }

  const cached = cache.get(plz);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ city: cached.city, state: cached.state });
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.zippopotam.us/de/${plz}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }

    const data = (await res.json()) as {
      places?: Array<{ 'place name'?: string; state?: string }>;
    };
    const place = data.places?.[0];
    const city = place?.['place name']?.trim() || '';
    const state = place?.state?.trim();

    if (!city) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    cache.set(plz, { city, state, ts: Date.now() });
    return NextResponse.json({ city, state });
  } catch {
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
  }
}
