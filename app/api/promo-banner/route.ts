import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isAllowedNotificationLink } from '@/lib/url-allowlist';
import { getBerlinDateString } from '@/lib/timezone';

export const runtime = 'nodejs';
export const revalidate = 30;

type RawBanner = {
  id?: string;
  enabled?: boolean;
  headline?: string;
  subline?: string;
  bgColor?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  validFrom?: string;
  validUntil?: string;
};

// Liefert die Banner-Liste — wrappt das alte Flach-Objekt rueckwaertskompatibel.
function toBannerList(v: unknown): RawBanner[] {
  if (!v || typeof v !== 'object') return [];
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj.banners)) return obj.banners as RawBanner[];
  if (typeof obj.headline === 'string') return [obj as RawBanner];
  return [];
}

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
    const banners = toBannerList(v);
    const today = getBerlinDateString();

    // Aktiv = aktiviert UND heute im Zeitraum (validUntil inklusive des ganzen Tages).
    const active = banners.filter((b) => {
      if (!b?.enabled) return false;
      const from = typeof b.validFrom === 'string' ? b.validFrom : '';
      const until = typeof b.validUntil === 'string' ? b.validUntil : '';
      if (from && from > today) return false;
      if (until && until < today) return false;
      return true;
    });

    if (active.length === 0) return NextResponse.json({ banner: null });

    // Bei Ueberschneidung gewinnt das spaeteste validFrom (datierte Kampagne
    // schlaegt einen Dauer-Banner mit leerem validFrom).
    active.sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
    const winner = active[0];

    return NextResponse.json({
      banner: {
        headline: String(winner.headline ?? '').slice(0, 120),
        subline: String(winner.subline ?? '').slice(0, 200),
        bgColor: /^#[0-9a-fA-F]{6}$/.test(winner.bgColor ?? '') ? winner.bgColor : '#FF5C00',
        ctaLabel: winner.ctaLabel ? String(winner.ctaLabel).slice(0, 40) : null,
        ctaUrl: (() => {
          if (!winner.ctaUrl) return null;
          const raw = String(winner.ctaUrl).slice(0, 200);
          return isAllowedNotificationLink(raw) ? raw : null;
        })(),
        validUntil: winner.validUntil ?? null,
      },
    });
  } catch {
    return NextResponse.json({ banner: null });
  }
}
