import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const DEFAULT_NEWS_BANNER = {
  enabled: true,
  messages: [
    { id: '1', text: 'Neu im Shop: GoPro Hero 13 Black', active: true },
    { id: '2', text: 'Jetzt Sets buchen und sparen', active: true },
    { id: '3', text: 'Kostenloser Standardversand ab 50 \u20ac Bestellwert', active: true },
  ],
};

const DEFAULT_HERO = {
  ueberschrift: 'Action-Cams mieten statt kaufen',
  untertitel: 'Hochwertige Action-Kameras ab 9,90 \u20ac/Tag. Mit Haftungsschutz, schnell geliefert, flexibel.',
  cta_text: 'Kameras entdecken',
  cta_link: '/kameras',
};

const DEFAULT_USPS = {
  items: [
    { icon: 'shield', text: 'Mit Haftungsschutz' },
    { icon: 'truck', text: 'Kostenloser Versand' },
    { icon: 'clock', text: '24h Lieferung' },
    { icon: 'star', text: 'Top-bewerteter Service' },
  ],
};

const DEFAULT_REVIEWS_CONFIG = {
  show_reviews: true,
  count: 6,
};

const DEFAULTS: Record<string, unknown> = {
  news_banner: DEFAULT_NEWS_BANNER,
  hero: DEFAULT_HERO,
  usps: DEFAULT_USPS,
  reviews_config: DEFAULT_REVIEWS_CONFIG,
};

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get('page');
  const section = req.nextUrl.searchParams.get('section');

  try {
    const supabase = createServiceClient();

    // Alle Sektionen einer Seite laden
    if (page) {
      const { data, error } = await supabase
        .from('shop_page_content')
        .select('*')
        .eq('page', page)
        .order('sort_order', { ascending: true });

      if (error || !data || data.length === 0) {
        // Defaults zurueckgeben fuer Startseite
        if (page === 'startseite') {
          return NextResponse.json([
            { page: 'startseite', section: 'hero', content: DEFAULT_HERO, is_active: true, sort_order: 0 },
            { page: 'startseite', section: 'news_banner', content: DEFAULT_NEWS_BANNER, is_active: true, sort_order: 1 },
            { page: 'startseite', section: 'usps', content: DEFAULT_USPS, is_active: true, sort_order: 2 },
            { page: 'startseite', section: 'reviews_config', content: DEFAULT_REVIEWS_CONFIG, is_active: true, sort_order: 3 },
          ]);
        }
        return NextResponse.json([]);
      }

      return NextResponse.json(data);
    }

    // Einzelne Sektion laden (Rueckwaertskompatibel)
    if (section) {
      const { data, error } = await supabase
        .from('shop_page_content')
        .select('content, is_active')
        .eq('section', section)
        .single();

      if (error || !data) {
        const fallback = DEFAULTS[section];
        if (fallback) return NextResponse.json(fallback);
        return NextResponse.json({ error: 'Sektion nicht gefunden' }, { status: 404 });
      }

      // Fuer news_banner: Content direkt zurueckgeben (Kompatibilitaet)
      if (section === 'news_banner') {
        return NextResponse.json(data.content);
      }

      return NextResponse.json({ ...data.content, is_active: data.is_active });
    }

    return NextResponse.json({ error: 'Parameter "page" oder "section" erforderlich' }, { status: 400 });
  } catch {
    // Tabelle existiert noch nicht oder Verbindungsfehler
    if (section) {
      const fallback = DEFAULTS[section];
      if (fallback) return NextResponse.json(fallback);
    }
    if (page === 'startseite') {
      return NextResponse.json([
        { page: 'startseite', section: 'hero', content: DEFAULT_HERO, is_active: true, sort_order: 0 },
        { page: 'startseite', section: 'news_banner', content: DEFAULT_NEWS_BANNER, is_active: true, sort_order: 1 },
        { page: 'startseite', section: 'usps', content: DEFAULT_USPS, is_active: true, sort_order: 2 },
        { page: 'startseite', section: 'reviews_config', content: DEFAULT_REVIEWS_CONFIG, is_active: true, sort_order: 3 },
      ]);
    }
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { page, section, content, is_active } = body;

    if (!page || !section) {
      return NextResponse.json({ error: 'page und section sind erforderlich' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const updateData: Record<string, unknown> = {
      page,
      section,
      content: content ?? {},
      updated_at: new Date().toISOString(),
    };

    if (typeof is_active === 'boolean') {
      updateData.is_active = is_active;
    }

    const { data, error } = await supabase
      .from('shop_page_content')
      .upsert(updateData, { onConflict: 'page,section' })
      .select()
      .single();

    if (error) {
      console.error('Shop content upsert error:', error);
      return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Shop content PUT error:', err);
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
}
