import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

// ============================================================
// Admin-Token-Pruefung (Legacy ENV + Session-Token)
// ============================================================

/**
 * SHA-256-Hash des Legacy-ENV-Passworts (cached).
 */
let cachedAdminToken: string | null = null;
let cachedAdminPassword: string | null = null;

async function computeAdminToken(password: string): Promise<string> {
  if (cachedAdminToken && cachedAdminPassword === password) return cachedAdminToken;
  const msgBuffer = new TextEncoder().encode(password + '_cam2rent_admin');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  cachedAdminToken = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  cachedAdminPassword = password;
  return cachedAdminToken;
}

/**
 * Timing-safer String-Vergleich (Edge-Runtime-kompatibel).
 * node:crypto/timingSafeEqual ist im Edge-Runtime nicht verfuegbar,
 * deshalb eine eigene konstanzzeit-Implementierung.
 */
function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * In-Memory-Cache fuer Session-Lookups (60s), damit nicht jeder Admin-Request
 * einen Supabase-Roundtrip ausloest. Middleware laeuft im Node-Runtime.
 */
interface SessionCacheEntry {
  permissions: string[];
  role: 'owner' | 'employee';
  isActive: boolean;
  expiresAt: number; // DB-Session-Ablauf
  cacheUntil: number;
  userAgent: string | null;
}
const sessionCache = new Map<string, SessionCacheEntry>();
// Kurzes TTL: bei Rechte-Entzug, Mitarbeiter-Deaktivierung oder Logout greift
// die Aenderung nach max. 5 s. Frueher waren es 60 s — in der Lueckenphase
// liefen Requests mit den alten Permissions weiter, was Privesc-Window
// erzeugte. Trade-off: bei jeder Anfrage ein Supabase-Roundtrip (idR. <50 ms).
const SESSION_CACHE_TTL_MS = 5 * 1000;

/**
 * Sweep 7 Vuln 13 — UA-Binding auch in der Middleware:
 * Sweep 6 Vuln 15 hat UA-Binding in `getUserBySession` (lib/admin-users.ts)
 * eingebaut. Die Middleware nutzte aber `lookupSession` ohne UA-Vergleich,
 * sodass ein gestohlenes Cookie auf 90 % der Admin-Routen weiter funktionierte
 * (alle Routen, die nur durch die Middleware geschuetzt sind, nicht zusaetzlich
 * durch checkAdminAuth).
 *
 * Logik:
 *  - Beide UA-Werte (Request + DB) = vorhanden → mit Equality vergleichen.
 *  - Mismatch → Session toeten (DB-DELETE, Cache invalidieren) + null.
 *  - DB-UA = NULL (Legacy-Sessions vor Migration) → Skip-Check (Backward-Compat).
 *  - Request-UA = NULL → Skip-Check (Bots, manche Curl-Aufrufe).
 */
async function lookupSession(token: string, currentUserAgent: string | null): Promise<SessionCacheEntry | null> {
  const now = Date.now();
  const cached = sessionCache.get(token);
  if (cached && cached.cacheUntil > now && cached.expiresAt > now && cached.isActive) {
    if (currentUserAgent && cached.userAgent && currentUserAgent !== cached.userAgent) {
      sessionCache.delete(token);
      // DB-Eintrag killen — gestohlenes Cookie ist nicht mehr nutzbar
      void killSession(token);
      return null;
    }
    return cached;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb
      .from('admin_sessions')
      .select('expires_at, user_agent, admin_users!inner(is_active, role, permissions)')
      .eq('token', token)
      .maybeSingle();
    if (!data) {
      sessionCache.delete(token);
      return null;
    }
    const expiresAt = new Date(data.expires_at).getTime();
    if (expiresAt < now) {
      sessionCache.delete(token);
      return null;
    }
    const u = Array.isArray(data.admin_users) ? data.admin_users[0] : data.admin_users;
    if (!u || !u.is_active) return null;
    const dbUa: string | null = data.user_agent ?? null;
    if (currentUserAgent && dbUa && currentUserAgent !== dbUa) {
      sessionCache.delete(token);
      await sb.from('admin_sessions').delete().eq('token', token);
      return null;
    }
    const entry: SessionCacheEntry = {
      permissions: Array.isArray(u.permissions) ? (u.permissions as string[]) : [],
      role: u.role,
      isActive: u.is_active,
      expiresAt,
      cacheUntil: now + SESSION_CACHE_TTL_MS,
      userAgent: dbUa,
    };
    sessionCache.set(token, entry);
    // LRU-Schutz: Cache nicht unbegrenzt wachsen lassen
    if (sessionCache.size > 500) {
      const firstKey = sessionCache.keys().next().value;
      if (firstKey) sessionCache.delete(firstKey);
    }
    return entry;
  } catch {
    return null;
  }
}

async function killSession(token: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    await sb.from('admin_sessions').delete().eq('token', token);
  } catch {
    // best-effort
  }
}

// Permission-Mapping (duplikatfrei zu lib/admin-users.ts — Edge-sicher ohne Import).
interface PermRule { prefix: string; perm: string }
const PATH_PERMISSIONS: PermRule[] = [
  { prefix: '/admin/einstellungen/mitarbeiter', perm: 'mitarbeiter_verwalten' },
  { prefix: '/admin/buchungen', perm: 'tagesgeschaeft' },
  { prefix: '/admin/verfuegbarkeit', perm: 'tagesgeschaeft' },
  { prefix: '/admin/versand', perm: 'tagesgeschaeft' },
  { prefix: '/admin/retouren', perm: 'tagesgeschaeft' },
  { prefix: '/admin/schaeden', perm: 'tagesgeschaeft' },
  { prefix: '/admin/kunden-material', perm: 'kunden' },
  { prefix: '/admin/kunden', perm: 'kunden' },
  { prefix: '/admin/nachrichten', perm: 'kunden' },
  { prefix: '/admin/bewertungen', perm: 'kunden' },
  { prefix: '/admin/warteliste', perm: 'kunden' },
  { prefix: '/admin/preise/kameras', perm: 'katalog' },
  { prefix: '/admin/sets', perm: 'katalog' },
  { prefix: '/admin/zubehoer', perm: 'katalog' },
  { prefix: '/admin/einkauf', perm: 'katalog' },
  { prefix: '/admin/anlagen', perm: 'finanzen' },
  { prefix: '/admin/preise', perm: 'preise' },
  { prefix: '/admin/gutscheine', perm: 'preise' },
  { prefix: '/admin/rabatte', perm: 'preise' },
  { prefix: '/admin/warenkorb-erinnerung', perm: 'preise' },
  { prefix: '/admin/newsletter', perm: 'preise' },
  { prefix: '/admin/startseite', perm: 'content' },
  { prefix: '/admin/blog', perm: 'content' },
  { prefix: '/admin/social', perm: 'content' },
  { prefix: '/admin/buchhaltung', perm: 'finanzen' },
  { prefix: '/admin/analytics', perm: 'berichte' },
  { prefix: '/admin/emails', perm: 'berichte' },
  { prefix: '/admin/beta-feedback', perm: 'berichte' },
  { prefix: '/admin/aktivitaetsprotokoll', perm: 'berichte' },
  { prefix: '/admin/legal', perm: 'system' },
  { prefix: '/admin/einstellungen', perm: 'system' },
];

// Spiegel der UI-Permissions auf API-Pfade. Bisher schuetzte die Middleware nur
// Seiten-Navigation — die APIs liefen mit reinem "eingeloggt"-Check, sodass jeder
// Mitarbeiter via direkter API-Anfrage Daten lesen/aendern konnte.
//
// Konvention: prefix `/api/admin/...` matcht das jeweilige Modul. Alles, was hier
// keinen Eintrag hat, bleibt erreichbar fuer alle eingeloggten Admins (z.B. /me,
// /notifications, /push, /dashboard-data, /availability-gantt — bewusst global).
const API_PATH_PERMISSIONS: PermRule[] = [
  // Mitarbeiterverwaltung
  { prefix: '/api/admin/employees', perm: 'mitarbeiter_verwalten' },
  // Tagesgeschaeft
  { prefix: '/api/admin/booking', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/alle-buchungen', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/manual-booking', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/update-booking-status', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/approve-booking', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/return-booking', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/return-checklist', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/return-label', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/ship-booking', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/sign-contract', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/find-free-unit', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/versand', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/versand-buchungen', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/damage', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/accessory-damage', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/sendcloud', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/label', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/handover', perm: 'tagesgeschaeft' },
  { prefix: '/api/admin/scan-lookup', perm: 'tagesgeschaeft' },
  // Kunden & Kommunikation
  { prefix: '/api/admin/kunden', perm: 'kunden' },
  { prefix: '/api/admin/customer', perm: 'kunden' },
  { prefix: '/api/admin/customer-notes', perm: 'kunden' },
  { prefix: '/api/admin/customer-ugc', perm: 'kunden' },
  { prefix: '/api/admin/anonymize-customer', perm: 'kunden' },
  { prefix: '/api/admin/verify-customer', perm: 'kunden' },
  { prefix: '/api/admin/id-document-url', perm: 'kunden' },
  { prefix: '/api/admin/waitlist', perm: 'kunden' },
  { prefix: '/api/admin/nachrichten', perm: 'kunden' },
  { prefix: '/api/admin/reviews', perm: 'kunden' },
  // Katalog
  { prefix: '/api/admin/accessories', perm: 'katalog' },
  { prefix: '/api/admin/accessory-units', perm: 'katalog' },
  { prefix: '/api/admin/product-units', perm: 'katalog' },
  { prefix: '/api/admin/suppliers', perm: 'katalog' },
  { prefix: '/api/admin/purchase-items', perm: 'katalog' },
  // Rabatte & Aktionen
  { prefix: '/api/admin/coupons', perm: 'preise' },
  { prefix: '/api/admin/newsletter', perm: 'preise' },
  { prefix: '/api/admin/customer-push', perm: 'preise' },
  // Content
  { prefix: '/api/admin/blog', perm: 'content' },
  { prefix: '/api/admin/social', perm: 'content' },
  { prefix: '/api/admin/reels', perm: 'content' },
  { prefix: '/api/admin/seasonal-images', perm: 'content' },
  // Finanzen
  { prefix: '/api/admin/anlagen', perm: 'finanzen' },
  { prefix: '/api/admin/assets', perm: 'finanzen' },
  { prefix: '/api/admin/buchhaltung', perm: 'finanzen' },
  { prefix: '/api/admin/datev-export', perm: 'finanzen' },
  { prefix: '/api/admin/invoices', perm: 'finanzen' },
  { prefix: '/api/admin/purchases', perm: 'finanzen' },
  { prefix: '/api/admin/deposit', perm: 'finanzen' },
  // Berichte
  { prefix: '/api/admin/analytics', perm: 'berichte' },
  { prefix: '/api/admin/email-log', perm: 'berichte' },
  { prefix: '/api/admin/email-templates', perm: 'berichte' },
  { prefix: '/api/admin/audit-log', perm: 'berichte' },
  { prefix: '/api/admin/utilization', perm: 'berichte' },
  { prefix: '/api/admin/weekly-report', perm: 'berichte' },
  // System
  { prefix: '/api/admin/legal', perm: 'system' },
  { prefix: '/api/admin/env-mode', perm: 'system' },
  { prefix: '/api/admin/test-email', perm: 'system' },
  { prefix: '/api/admin/business-config', perm: 'system' },
  { prefix: '/api/admin/checkout-config', perm: 'system' },
  { prefix: '/api/admin/config', perm: 'system' },
  { prefix: '/api/admin/2fa', perm: 'system' },
  // /api/admin/settings: GET ist public (siehe isPublic oben), POST braucht system
  { prefix: '/api/admin/settings', perm: 'system' },
];

function requiredPermission(pathname: string): string | null {
  if (pathname === '/admin' || pathname === '/admin/') return null;
  if (pathname === '/admin/login') return null;
  for (const rule of PATH_PERMISSIONS) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) return rule.perm;
  }
  return null;
}

function requiredApiPermission(pathname: string): string | null {
  for (const rule of API_PATH_PERMISSIONS) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) return rule.perm;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Wartungsmodus ─────────────────────────────────────────────────────────
  if (process.env.MAINTENANCE_MODE === 'true') {
    const isExcluded =
      pathname === '/wartung' ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/_next') ||
      pathname.includes('.');
    if (!isExcluded) {
      const url = request.nextUrl.clone();
      url.pathname = '/wartung';
      return NextResponse.rewrite(url);
    }
  }

  // ── Admin-APIs (/api/admin/*) ─────────────────────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    const isGet = request.method === 'GET';
    const isPublic =
      pathname === '/api/admin/login' ||
      pathname === '/api/admin/logout' ||
      (isGet && pathname === '/api/admin/settings') ||
      (isGet && pathname === '/api/admin/blog/categories');

    if (!isPublic) {
      const adminToken = request.cookies.get('admin_token')?.value ?? '';
      if (!adminToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Session-Token (Multi-User)
      if (adminToken.startsWith('sess_')) {
        const session = await lookupSession(adminToken, request.headers.get('user-agent'));
        if (!session) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Permission-Check fuer API-Routen — sonst koennte ein Mitarbeiter mit
        // nur 'tagesgeschaeft' direkt /api/admin/buchhaltung/... aufrufen,
        // obwohl die Sidebar das UI versteckt.
        const neededApi = requiredApiPermission(pathname);
        if (neededApi && session.role !== 'owner' && !session.permissions.includes(neededApi)) {
          return NextResponse.json(
            { error: 'Forbidden', required: neededApi },
            { status: 403 }
          );
        }
      } else {
        // Legacy-ENV-Token (hat alle Rechte, keine Permission-Pruefung noetig)
        const adminPassword = process.env.ADMIN_PASSWORD ?? '';
        if (!adminPassword) {
          return NextResponse.json(
            { error: 'Admin-Passwort nicht konfiguriert.' },
            { status: 500 }
          );
        }
        const expectedToken = await computeAdminToken(adminPassword);
        if (!safeStringEqual(adminToken, expectedToken)) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    }

    return NextResponse.next();
  }

  // ── Admin-Bereich (/admin/*) ──────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    const adminToken = request.cookies.get('admin_token')?.value ?? '';

    // Session-Token (Multi-User)
    if (adminToken.startsWith('sess_')) {
      const session = await lookupSession(adminToken, request.headers.get('user-agent'));
      if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        return NextResponse.redirect(url);
      }
      // Permission-Check
      const needed = requiredPermission(pathname);
      if (needed && session.role !== 'owner' && !session.permissions.includes(needed)) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        url.searchParams.set('forbidden', needed);
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Legacy-ENV-Token (hat automatisch alle Rechte)
    const adminPassword = process.env.ADMIN_PASSWORD ?? '';
    if (!adminPassword) {
      return NextResponse.next();
    }
    const expectedToken = await computeAdminToken(adminPassword);
    if (!safeStringEqual(adminToken, expectedToken)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Kunden-Konto (/konto/*) — Supabase Auth ───────────────────────────────
  if (!pathname.startsWith('/konto')) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     * This allows maintenance mode to intercept any public page,
     * while /konto and /admin routes still get auth checks.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|sw\\.js).*)',
  ],
};
