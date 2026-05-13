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
  seoText: { title: string; markdown: string } | null;
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
  const [heroResult, seasonalResult, bannerResult, seoTextResult] = await Promise.all([
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

    // SEO-Textblock (Server-rendered, sichtbar für Crawler)
    supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'home_seo_text')
      .maybeSingle(),
  ]);

  // Hero — leere Strings sollen nicht die Fallbacks überschreiben,
  // damit ein Admin der nur Überschrift ändert nicht versehentlich den
  // CTA-Button leert.
  const heroContent = (heroResult.data?.content ?? {}) as Partial<Omit<HomePageData['hero'], 'is_active'>>;
  const hero = {
    ueberschrift: heroContent.ueberschrift || HERO_FALLBACK.ueberschrift,
    untertitel: heroContent.untertitel || HERO_FALLBACK.untertitel,
    cta_text: heroContent.cta_text || HERO_FALLBACK.cta_text,
    cta_link: heroContent.cta_link || HERO_FALLBACK.cta_link,
    is_active: heroResult.data?.is_active !== false,
  };

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

  // SEO-Textblock
  let seoText: HomePageData['seoText'] = null;
  if (seoTextResult.data?.value) {
    try {
      const parsed = typeof seoTextResult.data.value === 'string'
        ? JSON.parse(seoTextResult.data.value)
        : seoTextResult.data.value;
      const enabled = parsed?.enabled === true;
      const markdown = typeof parsed?.markdown === 'string' ? parsed.markdown.trim() : '';
      const title = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
      if (enabled && markdown) {
        seoText = { title: title || 'Action-Cams mieten – das musst du wissen', markdown };
      }
    } catch {}
  }

  return {
    hero,
    seasonalImage,
    seasonalMonth: month,
    showConstructionBanner,
    seoText,
  };
}
