import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/2fa/confirm
 * Bestätigt das TOTP-Setup mit einem Code und speichert das Secret.
 * Body: { secret: string, token: string }
 *
 * Owner-only (Sweep 7 Vuln 2). Siehe setup/route.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Nur Owner dürfen 2FA verwalten.' }, { status: 403 });
    }

    const { secret, token } = (await req.json()) as { secret: string; token: string };

    if (!secret || !token) {
      return NextResponse.json({ error: 'Secret und Code erforderlich.' }, { status: 400 });
    }

    const valid = verifyToken(secret, token);
    if (!valid) {
      return NextResponse.json({ error: 'Ungültiger Code. Bitte versuche es erneut.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        key: 'totp_secret',
        value: secret,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Save TOTP secret error:', error);
      return NextResponse.json({ error: 'Fehler beim Speichern.' }, { status: 500 });
    }

    await logAudit({
      action: 'auth.2fa_setup',
      entityType: 'auth',
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('2FA confirm error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
