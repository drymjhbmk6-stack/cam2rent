import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/2fa/status
 * Gibt zurück ob 2FA aktiviert ist.
 */
export async function GET() {
  try {
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
