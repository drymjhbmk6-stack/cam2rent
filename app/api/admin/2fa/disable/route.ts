import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/rate-limit';

// Sweep 8 H7: TOTP-Code-Brute-Force-Schutz. Ohne Rate-Limit kann ein
// Angreifer mit gestohlenem Owner-Cookie 1 Mio 6-stellige Codes durchprobieren
// und 2FA disablen. 10 Versuche pro Stunde reichen — der echte Owner braucht
// max 1-2 Versuche (Authenticator zeigt klaren Code).
const totpLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

/**
 * POST /api/admin/2fa/disable
 * Deaktiviert 2FA nach Code-Bestätigung.
 * Body: { token: string }
 *
 * Owner-only (Sweep 7 Vuln 2). Siehe setup/route.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Nur Owner dürfen 2FA verwalten.' }, { status: 403 });
    }

    // Pro Owner-User-ID rate-limiten — gestohlenes Cookie kann nicht mehr brute-forcen
    const { success } = totpLimiter.check(`2fa-disable:${me.id}`);
    if (!success) {
      return NextResponse.json(
        { error: 'Zu viele Versuche. Bitte spaeter erneut versuchen.' },
        { status: 429 }
      );
    }

    const { token } = (await req.json()) as { token: string };

    if (!token) {
      return NextResponse.json({ error: 'Code erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Aktuelles Secret laden
    const { data: setting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'totp_secret')
      .maybeSingle();

    if (!setting?.value) {
      return NextResponse.json({ error: '2FA ist nicht aktiviert.' }, { status: 400 });
    }

    const valid = verifyToken(setting.value, token);
    if (!valid) {
      return NextResponse.json({ error: 'Ungültiger Code.' }, { status: 400 });
    }

    // Secret löschen
    await supabase
      .from('admin_settings')
      .delete()
      .eq('key', 'totp_secret');

    await logAudit({
      action: 'auth.2fa_disable',
      entityType: 'auth',
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('2FA disable error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
