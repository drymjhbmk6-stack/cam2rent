import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 60;

/**
 * GET /api/seasonal-action
 * Liefert die aktuelle Saison-Aktion (oder null wenn aus / abgelaufen).
 * Public, caching 60s.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'seasonal_action')
      .maybeSingle();

    if (!data?.value) return NextResponse.json({ action: null });

    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!v?.enabled) return NextResponse.json({ action: null });

    // Ablauf-Pruefung
    if (v.validUntil) {
      const until = new Date(v.validUntil);
      if (until.getTime() < Date.now()) return NextResponse.json({ action: null });
    }

    return NextResponse.json({
      action: {
        title: String(v.title ?? '').slice(0, 100),
        subtitle: String(v.subtitle ?? '').slice(0, 200),
        badgeText: String(v.badgeText ?? '').slice(0, 30),
        ctaLabel: String(v.ctaLabel ?? 'Jetzt sichern').slice(0, 40),
        ctaUrl: String(v.ctaUrl ?? '/kameras').slice(0, 200),
        couponCode: v.couponCode ? String(v.couponCode).slice(0, 30) : null,
        validUntil: v.validUntil ?? null,
      },
    });
  } catch {
    return NextResponse.json({ action: null });
  }
}
