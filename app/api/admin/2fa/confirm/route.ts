import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { logAudit } from '@/lib/audit';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/2fa/confirm
 * Bestätigt das TOTP-Setup mit einem Code und speichert das Secret.
 * Body: { secret: string, token: string }
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
