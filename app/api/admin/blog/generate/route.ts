import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const LENGTH_MAP: Record<string, string> = {
  kurz: 'ca. 500 Woerter',
  mittel: 'ca. 1000 Woerter',
  lang: 'ca. 1500 Woerter',
};

const TONE_MAP: Record<string, string> = {
  informativ: 'sachlich-informativ, gut recherchiert',
  locker: 'locker und unterhaltsam, mit persoenlicher Note',
  professionell: 'professionell und vertrauenswuerdig, Experten-Ton',
};

async function getBlogSettings(): Promise<Record<string, string> | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();
  if (!data?.value) return null;
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return null;
  }
}

async function getApiKey(): Promise<string | null> {
  const settings = await getBlogSettings();
  return settings?.anthropic_api_key || null;
}

/** POST /api/admin/blog/generate - Artikel mit KI generieren */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    topic,
    keywords,
    tone = 'informativ',
    targetLength = 'mittel',
    referenceProducts,
  } = body;

  if (!topic) {
    return NextResponse.json({ error: 'Thema ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API Key nicht konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  const length = LENGTH_MAP[targetLength] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[tone] ?? TONE_MAP.informativ;

  // Echte Produkte aus dem Shop laden
  const { data: productConfig } = await supabase
    .from('admin_config').select('value').eq('key', 'products').single();

  let shopProducts: string[] = [];
  if (productConfig?.value && typeof productConfig.value === 'object') {
    const products = productConfig.value as Record<string, { name: string; brand: string; slug: string }>;
    shopProducts = Object.values(products).map((p) => `${p.brand} ${p.name} (Link: /kameras/${p.slug})`);
  }

  const currentYear = new Date().getFullYear();

  let productContext = '';
  if (referenceProducts?.length) {
    productContext = `\n\nReferenz-Produkte aus dem Shop (erwaehne diese natuerlich im Artikel):\n${referenceProducts.map((p: string) => `- ${p}`).join('\n')}`;
  }

  const keywordHint = keywords?.length
    ? `\nWichtige Keywords fuer SEO: ${keywords.join(', ')}`
    : '';

  const shopProductsInfo = shopProducts.length > 0
    ? `\n\nAKTUELLE PRODUKTE IM CAM2RENT SHOP (verlinke diese wenn relevant):\n${shopProducts.map((p) => `- ${p}`).join('\n')}\n\nVerwende NUR diese Produkte oder allgemeine Themen. KEINE veralteten Modelle erfinden.`
    : '';

  // Zusaetzlicher Admin-Kontext aus Einstellungen
  const allSettings = await getBlogSettings();
  const kiContext = allSettings?.ki_context
    ? `\n\nZUSAETZLICHER KONTEXT VOM ADMIN:\n${allSettings.ki_context}`
    : '';

  const systemPrompt = `Du bist ein erfahrener Redakteur fuer cam2rent.de, einen deutschen Online-Verleih fuer Action-Kameras.

AKTUELLES JAHR: ${currentYear}. Verwende NUR aktuelle Informationen und Produkte.${shopProductsInfo}${kiContext}

Deine Aufgabe: Schreibe einen hochwertigen, redaktionellen Blog-Artikel auf Deutsch der NICHT nach KI klingt.

STIL-REGELN:
- Schreibe ${length} in ${toneDesc}m Stil
- Schreibe wie ein erfahrener Journalist/Blogger — mit Persoenlichkeit, nicht wie ein Lexikon
- Kurze Absaetze (max 3-4 Saetze), dann Absatzwechsel
- Variiere die Satzlaenge — kurze knackige Saetze mischen mit laengeren
- Verwende "du" statt "Sie", schreibe direkt und nahbar
- Beginne Absaetze NICHT immer gleich — variiere den Einstieg
- Keine leeren Floskeln wie "In der heutigen Zeit" oder "Es ist wichtig zu beachten"
- Beginne NICHT mit dem Titel im Content

FORMATIERUNGS-REGELN (Markdown):
- ## fuer Hauptueberschriften, ### fuer Unterueberschriften
- **Fett** fuer Produktnamen und wichtige Begriffe
- Nutze Blockquotes fuer farbige Info-Boxen im Artikel (werden automatisch gestylt):
  - > **Tipp:** Text — fuer Miet-Hinweise und praktische Tipps (z.B. cam2rent erwaehnen)
  - > **Fazit:** Text — fuer Zwischen-Fazits nach wichtigen Abschnitten
  - > **Wichtig:** Text — fuer Warnungen oder wichtige Hinweise
  - > **Gut zu wissen:** Text — fuer interessante Zusatzinfos
- Nutze MINDESTENS 2-3 Blockquote-Boxen pro Artikel fuer visuelle Abwechslung
- Nutze Listen (- oder 1.) fuer Aufzaehlungen, aber nicht fuer alles
- Tabellen bei direkten Vergleichen von 2+ Produkten mit Specs — Feature in Spalte 1, Produkte in weiteren Spalten
- Lockere den Text auf mit Zwischenfragen an den Leser
- Beginne den Artikel mit einem kurzen Lead-Absatz (2-3 Saetze, der das Thema auf den Punkt bringt)

INHALTLICHE REGELN:
- Schreibe SEO-freundlich mit natuerlicher Keyword-Integration
- NIEMALS "Versicherung" — nur "Haftungsschutz" oder "Haftungsbegrenzung"
- Erwaehne cam2rent.de natuerlich, z.B. "Bei cam2rent kannst du die XY einfach mieten und testen"
- Zielgruppe: Abenteurer, Reisende, Content Creator die Action-Cams mieten wollen
- Schliesse mit einem kurzen, praegnanten Fazit ab${productContext}${keywordHint}

Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown-Codeblock, nur reines JSON):
{
  "title": "Artikel-Titel (max 60 Zeichen, SEO-optimiert)",
  "slug": "url-freundlicher-slug",
  "content": "Kompletter Artikel in Markdown",
  "excerpt": "Kurzbeschreibung (max 160 Zeichen)",
  "seoTitle": "SEO-Titel (max 60 Zeichen)",
  "seoDescription": "Meta-Description (max 155 Zeichen)",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "imagePrompt": "Write a detailed DALL-E 3 prompt IN ENGLISH for a stunning photorealistic blog header. CRITICAL RULES: Do NOT render any cameras, electronics, gadgets or tech products — they always look fake. Instead, show the ACTIVITY or SCENERY the article is about (e.g. surfing, mountain biking, underwater diving, travel landscapes, skiing, hiking). Style: Shot on Sony A7IV, 35mm lens, f/2.8, golden hour lighting, shallow depth of field. No text, no logos, no UI elements, no hands holding devices. Think National Geographic or Red Bull magazine photo. The scene should evoke adventure, freedom and excitement."
}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `Schreibe einen Blog-Artikel ueber: ${topic}` }],
      system: systemPrompt,
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // JSON aus der Antwort parsen
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Versuche JSON aus Markdown-Codeblock zu extrahieren
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        return NextResponse.json({ error: 'KI-Antwort konnte nicht geparst werden.', raw: text }, { status: 500 });
      }
    }

    // Lesezeit berechnen (ca. 200 Woerter/Minute)
    const wordCount = (parsed.content || '').split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    return NextResponse.json({
      ...parsed,
      reading_time_min: readingTime,
      ai_model: 'claude-sonnet-4-20250514',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `KI-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
