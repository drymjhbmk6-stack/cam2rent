import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyToken } from '@/lib/totp';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/2fa/disable
 * Deaktiviert 2FA nach Code-Bestätigung.
 * Body: { token: string }
 */
export async function POST(req: NextRequest) {
  try {
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
