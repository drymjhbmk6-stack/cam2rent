import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getSiteUrl } from '@/lib/env-mode';

export const runtime = 'nodejs';

/**
 * GET /api/newsletter/unsubscribe?token=...
 * One-Click-Abmeldung — kein Login noetig, jeder mit dem Token kann
 * abmelden. Setzt unsubscribed=true. Idempotent.
 */
export async function GET(req: NextRequest) {
  const baseUrl = await getSiteUrl();
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/newsletter/abgemeldet?status=error`);
  }

  try {
    const supabase = createServiceClient();
    const { data: sub } = await supabase
      .from('newsletter_subscribers')
      .select('id, unsubscribed')
      .eq('unsubscribe_token', token)
      .maybeSingle();

    if (!sub) {
      return NextResponse.redirect(`${baseUrl}/newsletter/abgemeldet?status=invalid`);
    }
    if (sub.unsubscribed) {
      return NextResponse.redirect(`${baseUrl}/newsletter/abgemeldet?status=already`);
    }

    await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed: true, unsubscribed_at: new Date().toISOString() })
      .eq('id', sub.id);

    return NextResponse.redirect(`${baseUrl}/newsletter/abgemeldet?status=ok`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/newsletter/abgemeldet?status=error`);
  }
}
