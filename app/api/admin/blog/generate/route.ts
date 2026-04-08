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

  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API Key nicht konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  const length = LENGTH_MAP[targetLength] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[tone] ?? TONE_MAP.informativ;

  let productContext = '';
  if (referenceProducts?.length) {
    productContext = `\n\nReferenz-Produkte aus dem Shop (erwaehne diese natuerlich im Artikel):\n${referenceProducts.map((p: string) => `- ${p}`).join('\n')}`;
  }

  const keywordHint = keywords?.length
    ? `\nWichtige Keywords fuer SEO: ${keywords.join(', ')}`
    : '';

  const systemPrompt = `Du bist ein erfahrener Content-Writer fuer cam2rent.de, einen deutschen Online-Verleih fuer Action-Kameras (GoPro, DJI, Insta360 etc.).

Deine Aufgabe: Schreibe einen SEO-optimierten Blog-Artikel auf Deutsch.

Regeln:
- Schreibe ${length} in ${toneDesc}m Stil
- Verwende Markdown-Formatierung (## fuer Ueberschriften, **fett**, Listen etc.)
- Nutze Markdown-Tabellen NUR wenn es wirklich sinnvoll ist — z.B. bei direkten Produkt-Vergleichen mit mehreren Specs oder einer Gegenuberstellung von 3+ Optionen. Nicht jeder Artikel braucht eine Tabelle. Im Zweifel lieber Fliesstext oder Listen verwenden.
- Beginne NICHT mit dem Titel im Content (der wird separat gesetzt)
- Nutze Zwischenueberschriften (## und ###) fuer gute Lesbarkeit
- Schreibe SEO-freundlich: natuerliche Keyword-Integration, gute Struktur
- WICHTIG: Nenne Haftungsoptionen NIEMALS "Versicherung" — verwende "Haftungsschutz" oder "Haftungsbegrenzung"
- Erwaehne cam2rent.de als Verleih-Service wo passend, aber nicht aufdringlich
- Der Leser ist typischerweise jemand der eine Action-Cam mieten moechte fuer Urlaub, Sport, Events etc.${productContext}${keywordHint}

Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown-Codeblock, nur reines JSON):
{
  "title": "Artikel-Titel (max 60 Zeichen, SEO-optimiert)",
  "slug": "url-freundlicher-slug",
  "content": "Kompletter Artikel in Markdown",
  "excerpt": "Kurzbeschreibung (max 160 Zeichen)",
  "seoTitle": "SEO-Titel (max 60 Zeichen)",
  "seoDescription": "Meta-Description (max 155 Zeichen)",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "imagePrompt": "Write a detailed DALL-E 3 image prompt IN ENGLISH for a photorealistic blog header image. Requirements: Landscape format (16:9), photorealistic photography style, natural lighting, vibrant but not oversaturated colors, no text/logos/watermarks, no people's faces (use back views or hands only), focus on the action camera or the activity/scenery described in the article. The image should feel like a professional editorial photo from a travel or tech magazine. Be specific about camera angle, lighting, environment and mood."
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
