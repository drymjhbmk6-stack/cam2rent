import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * GET /api/admin/2fa/status
 * Gibt zurück ob 2FA aktiviert ist.
 *
 * Owner-only (Sweep 7 Vuln 2): TOTP-Status ist eine Owner-Information,
 * Mitarbeiter haben damit nichts zu tun.
 */
export async function GET() {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Nur Owner dürfen 2FA verwalten.' }, { status: 403 });
    }

    const supabase = createServiceClient();

    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'totp_secret')
      .maybeSingle();

    return NextResponse.json({ enabled: !!data?.value });
  } catch (err) {
    console.error('2FA status error:', err);
    return NextResponse.json({ enabled: false });
  }
}
