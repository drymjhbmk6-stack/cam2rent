import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { timingSafeEqual } from 'crypto';
import {
  createSession,
  getAdminUserByLoginId,
  verifyPassword,
} from '@/lib/admin-users';
import { logAudit } from '@/lib/audit';

/** Timing-safer String-Vergleich — sonst verrät Response-Zeit Teil-Treffer. */
function safeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

const loginLimiter = rateLimit({ maxAttempts: 5, windowMs: 15 * 60 * 1000 }); // 5 pro 15 Min

/**
 * POST /api/admin/login
 * Body: { email?: string, password: string, totpCode?: string }
 *
 * Zwei Login-Modi:
 *   a) Multi-User: email + password -> admin_users-Tabelle (scrypt-Hash)
 *   b) Legacy: nur password -> prueft gegen ADMIN_PASSWORD (Bootstrap / Notfall)
 *
 * 2FA (TOTP) gilt nur fuer den Legacy-Owner-Login.
 */

async function computeLegacyAdminToken(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password + '_cam2rent_admin');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = loginLimiter.check(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Zu viele Anmeldeversuche. Bitte warte 15 Minuten.' },
      { status: 429 }
    );
  }

  const body = (await req.json()) as {
    email?: string;
    username?: string;
    loginId?: string;
    password?: string;
    totpCode?: string;
  };
  const { email, username, loginId, password, totpCode } = body;

  if (!password) {
    return NextResponse.json({ error: 'Passwort fehlt.' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent');

  // E-Mail oder Benutzername — beides moeglich, beides optional.
  // Wenn nichts kommt, faellt der Flow auf Legacy-ENV-Passwort.
  const loginIdentifier = (loginId || email || username || '').trim();

  // ── Variante A: Multi-User-Login (E-Mail/Benutzername + Passwort) ──────────
  if (loginIdentifier) {
    const user = await getAdminUserByLoginId(loginIdentifier);
    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'Falscher Login oder Passwort.' }, { status: 401 });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Falscher Login oder Passwort.' }, { status: 401 });
    }
    const { token, expiresAt } = await createSession(user.id, { userAgent, ipAddress: ip });

    await logAudit({
      action: 'auth.login',
      entityType: 'auth',
      entityId: user.id,
      entityLabel: user.name,
      adminUserId: user.id,
      adminUserName: user.name,
      changes: { mode: 'multi_user', role: user.role },
      request: req,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, username: user.username, name: user.name, role: user.role },
    });
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
    return response;
  }

  // ── Variante B: Legacy ENV-Passwort (Bootstrap / Notfall-Owner) ────────────
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword) {
    return NextResponse.json(
      { error: 'Admin-Passwort nicht konfiguriert.' },
      { status: 500 }
    );
  }

  if (!safeEqualStrings(password, adminPassword)) {
    return NextResponse.json({ error: 'Falsches Passwort.' }, { status: 401 });
  }

  // 2FA fuer Legacy-Login
  const supabase = createServiceClient();
  const { data: totpSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'totp_secret')
    .maybeSingle();

  if (totpSetting?.value) {
    if (!totpCode) return NextResponse.json({ requires2FA: true });
    const valid = verifyToken(totpSetting.value, totpCode);
    if (!valid) {
      return NextResponse.json({ error: 'Ungültiger 2FA-Code.' }, { status: 401 });
    }
  }

  const token = await computeLegacyAdminToken(adminPassword);

  await logAudit({
    action: 'auth.login',
    entityType: 'auth',
    adminUserName: 'Admin (ENV)',
    changes: { mode: 'legacy_env' },
    request: req,
  });

  const response = NextResponse.json({ success: true, user: { role: 'owner', name: 'Admin (ENV)' } });
  response.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    // Kürzere Session (24h statt 7 Tagen) — falls das Admin-Tablet
    // gestohlen wird oder das Cookie geleakt wird, ist das Fenster
    // für Missbrauch deutlich kleiner. Bei aktiver Nutzung wird der
    // Admin durch tägliches Re-Login kaum beeinträchtigt.
    maxAge: 60 * 60 * 24, // 1 Tag
  });
  return response;
}
