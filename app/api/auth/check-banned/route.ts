import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 1000 }); // 10/min pro IP

/**
 * POST /api/auth/check-banned  { email }
 *
 * Liefert { banned: boolean } für eine E-Mail. Wird vom Login NUR nach einem
 * fehlgeschlagenen Anmeldeversuch aufgerufen, um „Konto gesperrt" statt der
 * generischen „E-Mail/Passwort falsch"-Meldung anzuzeigen — Supabase maskiert
 * einen Ban je nach Version als generischen Fehler.
 *
 * Banned = Auth-User ist gebannt (banned_until in der Zukunft) ODER
 * profiles.blacklisted=true. Beides wird beim Sperren gesetzt
 * (POST /api/admin/kunden/blacklist).
 */
export async function POST(req: NextRequest) {
  try {
    const { success } = limiter.check(getClientIp(req));
    if (!success) {
      return NextResponse.json({ banned: false }, { status: 429 });
    }

    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    const target = (email || '').trim().toLowerCase();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return NextResponse.json({ banned: false });
    }

    const supabase = createServiceClient();

    // Auth-User per E-Mail finden (Shop ist klein → perPage 1000 reicht).
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const hit = (list?.users ?? []).find(
      (u) => (u.email || '').toLowerCase() === target,
    );
    if (!hit) return NextResponse.json({ banned: false });

    // 1) Auth-Ban (banned_until in der Zukunft)
    const bannedUntil = (hit as { banned_until?: string | null }).banned_until;
    const authBanned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    // 2) Profil-Flag als zweite Quelle
    let profileBlacklisted = false;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('blacklisted')
        .eq('id', hit.id)
        .maybeSingle();
      profileBlacklisted = !!profile?.blacklisted;
    } catch { /* egal */ }

    return NextResponse.json({ banned: authBanned || profileBlacklisted });
  } catch {
    return NextResponse.json({ banned: false });
  }
}
