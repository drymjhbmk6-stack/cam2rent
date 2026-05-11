import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isAllowedNotificationLink } from '@/lib/url-allowlist';

export const runtime = 'nodejs';
export const revalidate = 30;

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'promo_banner')
      .maybeSingle();

    if (!data?.value) return NextResponse.json({ banner: null });

    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!v?.enabled) return NextResponse.json({ banner: null });

    if (v.validUntil) {
      if (new Date(v.validUntil).getTime() < Date.now()) {
        return NextResponse.json({ banner: null });
      }
    }

    return NextResponse.json({
      banner: {
        headline: String(v.headline ?? '').slice(0, 120),
        subline: String(v.subline ?? '').slice(0, 200),
        bgColor: /^#[0-9a-fA-F]{6}$/.test(v.bgColor ?? '') ? v.bgColor : '#FF5C00',
        ctaLabel: v.ctaLabel ? String(v.ctaLabel).slice(0, 40) : null,
        ctaUrl: (() => {
          if (!v.ctaUrl) return null;
          const raw = String(v.ctaUrl).slice(0, 200);
          return isAllowedNotificationLink(raw) ? raw : null;
        })(),
        validUntil: v.validUntil ?? null,
      },
    });
  } catch {
    return NextResponse.json({ banner: null });
  }
}
