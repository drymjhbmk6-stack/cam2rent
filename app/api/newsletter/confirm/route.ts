import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getSiteUrl } from '@/lib/env-mode';
import { getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/newsletter/confirm?token=...
 * Bestaetigt die Newsletter-Anmeldung. Setzt confirmed=true und leitet
 * zur Erfolgsseite weiter.
 */
export async function GET(req: NextRequest) {
  const baseUrl = await getSiteUrl();
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=error`);
  }

  try {
    const supabase = createServiceClient();
    const ip = getClientIp(req);

    const { data: sub } = await supabase
      .from('newsletter_subscribers')
      .select('id, confirmed, confirm_token_expires_at')
      .eq('confirm_token', token)
      .maybeSingle();

    if (!sub) {
      return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=invalid`);
    }
    if (sub.confirmed) {
      return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=already`);
    }
    if (sub.confirm_token_expires_at && new Date(sub.confirm_token_expires_at).getTime() < Date.now()) {
      return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=expired`);
    }

    await supabase
      .from('newsletter_subscribers')
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_ip: ip,
        confirm_token: null,
        confirm_token_expires_at: null,
      })
      .eq('id', sub.id);

    return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=ok`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/newsletter/bestaetigt?status=error`);
  }
}
