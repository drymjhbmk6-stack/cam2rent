import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
}

// Hard-Cap: Schützt gegen Memory-Exhaustion durch IP-Rotation.
// Bei Überschreitung wird die älteste Entry rausgeworfen (LRU-artig).
const MAX_STORE_SIZE = 10_000;

export function rateLimit({ maxAttempts, windowMs }: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();

  // Cleanup abgelaufener Einträge alle 60 Sekunden
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  };

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  const ensureCleanup = () => {
    if (!cleanupTimer) {
      cleanupTimer = setInterval(cleanup, 60_000);
      // Timer soll den Prozess nicht am Beenden hindern
      if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
        cleanupTimer.unref();
      }
    }
  };

  return {
    check(key: string): RateLimitResult {
      ensureCleanup();
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        // Bei Hard-Cap: älteste Entry zuerst löschen (Map-Insertion-Order = FIFO)
        if (store.size >= MAX_STORE_SIZE) {
          const oldestKey = store.keys().next().value;
          if (oldestKey !== undefined) store.delete(oldestKey);
        }
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: maxAttempts - 1 };
      }

      entry.count++;

      if (entry.count > maxAttempts) {
        return { success: false, remaining: 0 };
      }

      return { success: true, remaining: maxAttempts - entry.count };
    },
  };
}

/**
 * Extrahiert die Client-IP aus dem Request.
 *
 * Per default werden X-Forwarded-For / X-Real-IP NUR vertraut, wenn die App
 * laut TRUST_PROXY_HEADERS=true hinter einem vertrauenswürdigen Reverse-Proxy
 * läuft (Coolify/nginx auf dem Hetzner-Server). Das ist der Standardfall im
 * Produktionsbetrieb — daher Default-an in Production.
 *
 * Ohne diesen Vertrauens-Switch könnten Angreifer beliebige IPs senden und
 * IP-basiertes Rate-Limiting komplett umgehen (jede Request mit anderer
 * gefälschter IP → eigener Rate-Limit-Bucket).
 */
function trustsProxyHeaders(): boolean {
  const env = process.env.TRUST_PROXY_HEADERS;
  if (env === 'true') return true;
  if (env === 'false') return false;
  // Default: in Production-NodeJS-Umgebung true (Coolify/nginx), sonst false.
  return process.env.NODE_ENV === 'production';
}

export function getClientIp(req: NextRequest): string {
  if (trustsProxyHeaders()) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      // Vom Reverse-Proxy hinzugefügt: erstes Element ist die Original-IP.
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }
  return '127.0.0.1';
}
