import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Berechnet den erwarteten Admin-Token als SHA-256-Hash des Passworts.
 * Gecached damit nicht bei jedem Request neu gehasht wird.
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
 * node:crypto/timingSafeEqual ist im Edge-Runtime nicht verfügbar,
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Wartungsmodus ─────────────────────────────────────────────────────────
  if (process.env.MAINTENANCE_MODE === 'true') {
    // Wartungsseite, Admin, API und statische Dateien durchlassen
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
  // Whitelist: Login + Logout müssen ohne Cookie erreichbar sein.
  // GET auf /api/admin/settings und /api/admin/blog/categories wird von
  // öffentlichen Seiten (Brand-Colors, Construction-Banner, Blog-Übersicht)
  // konsumiert — die Routen-Handler enthalten eine Key-Whitelist bzw. sind
  // von Natur aus unbedenklich.
  if (pathname.startsWith('/api/admin')) {
    const isGet = request.method === 'GET';
    const isPublic =
      pathname === '/api/admin/login' ||
      pathname === '/api/admin/logout' ||
      (isGet && pathname === '/api/admin/settings') ||
      (isGet && pathname === '/api/admin/blog/categories');

    if (!isPublic) {
      const adminToken = request.cookies.get('admin_token')?.value ?? '';
      const adminPassword = process.env.ADMIN_PASSWORD ?? '';

      if (!adminPassword) {
        return NextResponse.json(
          { error: 'Admin-Passwort nicht konfiguriert.' },
          { status: 500 }
        );
      }

      const expectedToken = await computeAdminToken(adminPassword);
      if (!safeStringEqual(adminToken, expectedToken)) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    return NextResponse.next();
  }

  // ── Admin-Bereich (/admin/*) ──────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Login-Seite immer durchlassen
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    const adminToken = request.cookies.get('admin_token')?.value ?? '';
    const adminPassword = process.env.ADMIN_PASSWORD ?? '';

    if (adminPassword) {
      const expectedToken = await computeAdminToken(adminPassword);
      if (!safeStringEqual(adminToken, expectedToken)) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        return NextResponse.redirect(url);
      }
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
