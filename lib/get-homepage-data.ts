/**
 * Server-seitige Daten für die Homepage.
 * Wird in app/page.tsx aufgerufen — kein Client-Fetch nötig.
 */
import { createServiceClient } from '@/lib/supabase';
import { yearMonthKey, type SeasonalImage } from '@/lib/seasonal-themes';

export interface HomePageData {
  hero: {
    ueberschrift: string;
    untertitel: string;
    cta_text: string;
    cta_link: string;
    is_active: boolean;
  };
  seasonalImage: SeasonalImage | null;
  seasonalMonth: number;
  showConstructionBanner: boolean;
}

const HERO_FALLBACK = {
  ueberschrift: 'Action-Cams mieten statt kaufen',
  untertitel: 'Hochwertige Action-Kameras ab 9,90 €/Tag. Mit Haftungsschutz, schnell geliefert, flexibel.',
  cta_text: 'Kameras entdecken',
  cta_link: '/kameras',
  is_active: true,
};

export async function getHomePageData(): Promise<HomePageData> {
  const supabase = createServiceClient();

  // Alle Daten parallel laden
  const [heroResult, seasonalResult, bannerResult] = await Promise.all([
    // Hero-Text — Tabelle muss mit /api/shop-content übereinstimmen,
    // sonst zeigt die Startseite immer den Fallback (siehe Bug 2026-04-17).
    supabase
      .from('shop_page_content')
      .select('content, is_active')
      .eq('page', 'startseite')
      .eq('section', 'hero')
      .maybeSingle(),

    // Saisonales Bild
    supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'seasonal_images')
      .maybeSingle(),

    // Construction Banner
    supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'show_construction_banner')
      .maybeSingle(),
  ]);

  // Hero
  const heroContent = heroResult.data?.content;
  const hero = heroContent
    ? { ...HERO_FALLBACK, ...heroContent, is_active: heroResult.data?.is_active !== false }
    : HERO_FALLBACK;

  // Saisonales Bild
  const now = new Date();
  const month = now.getMonth() + 1;
  const key = yearMonthKey(now.getFullYear(), month);
  let seasonalImage: SeasonalImage | null = null;
  if (seasonalResult.data?.value) {
    try {
      const all = typeof seasonalResult.data.value === 'string'
        ? JSON.parse(seasonalResult.data.value)
        : seasonalResult.data.value;
      seasonalImage = all?.hero?.[key] ?? null;
    } catch {}
  }

  // Banner
  const bannerValue = bannerResult.data?.value;
  const showConstructionBanner = bannerValue === null || bannerValue === 'true' || bannerValue === true;

  return {
    hero,
    seasonalImage,
    seasonalMonth: month,
    showConstructionBanner,
  };
}
