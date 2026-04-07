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

/** POST /api/cron/blog-generate - Automatische Artikel-Generierung */
export async function POST(req: NextRequest) {
  // Absicherung via Secret
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Pruefen ob Auto-Generierung aktiv
  const { data: enabledSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_auto_enabled')
    .single();

  if (!enabledSetting?.value) {
    return NextResponse.json({ message: 'Auto-Generierung ist deaktiviert.' });
  }

  // API-Key laden
  const { data: keySetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_anthropic_api_key')
    .single();

  const apiKey = keySetting?.value as string | null;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kein Anthropic API Key konfiguriert.' }, { status: 400 });
  }

  // Naechstes ungenutztes Thema holen
  const { data: topicData } = await supabase
    .from('blog_auto_topics')
    .select('*, blog_categories(id, name, slug)')
    .eq('used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!topicData) {
    return NextResponse.json({ message: 'Keine ungenutzten Themen im Pool.' });
  }

  const length = LENGTH_MAP[topicData.target_length] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[topicData.tone] ?? TONE_MAP.informativ;
  const keywordHint = topicData.keywords?.length
    ? `\nWichtige Keywords fuer SEO: ${topicData.keywords.join(', ')}`
    : '';

  const systemPrompt = `Du bist ein erfahrener Content-Writer fuer cam2rent.de, einen deutschen Online-Verleih fuer Action-Kameras (GoPro, DJI, Insta360 etc.).

Deine Aufgabe: Schreibe einen SEO-optimierten Blog-Artikel auf Deutsch.

Regeln:
- Schreibe ${length} in ${toneDesc}m Stil
- Verwende Markdown-Formatierung (## fuer Ueberschriften, **fett**, Listen etc.)
- Beginne NICHT mit dem Titel im Content (der wird separat gesetzt)
- Nutze Zwischenueberschriften (## und ###) fuer gute Lesbarkeit
- WICHTIG: Nenne Haftungsoptionen NIEMALS "Versicherung" — verwende "Haftungsschutz" oder "Haftungsbegrenzung"
- Erwaehne cam2rent.de als Verleih-Service wo passend, aber nicht aufdringlich${keywordHint}

Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown-Codeblock, nur reines JSON):
{
  "title": "Artikel-Titel (max 60 Zeichen, SEO-optimiert)",
  "slug": "url-freundlicher-slug",
  "content": "Kompletter Artikel in Markdown",
  "excerpt": "Kurzbeschreibung (max 160 Zeichen)",
  "seoTitle": "SEO-Titel (max 60 Zeichen)",
  "seoDescription": "Meta-Description (max 155 Zeichen)",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `Schreibe einen Blog-Artikel ueber: ${topicData.topic}` }],
      system: systemPrompt,
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) parsed = JSON.parse(match[1]);
      else return NextResponse.json({ error: 'KI-Antwort konnte nicht geparst werden.' }, { status: 500 });
    }

    const wordCount = (parsed.content || '').split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Auto-Publish Einstellung pruefen
    const { data: autoPublish } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'blog_auto_publish')
      .single();

    const shouldPublish = autoPublish?.value === true || autoPublish?.value === 'true';
    const now = new Date().toISOString();

    // Artikel speichern
    const { data: post, error: postError } = await supabase
      .from('blog_posts')
      .insert({
        title: parsed.title,
        slug: parsed.slug,
        content: parsed.content,
        excerpt: parsed.excerpt,
        category_id: topicData.category_id || null,
        tags: parsed.suggestedTags ?? [],
        status: shouldPublish ? 'published' : 'draft',
        seo_title: parsed.seoTitle,
        seo_description: parsed.seoDescription,
        author: 'cam2rent',
        ai_generated: true,
        ai_prompt: topicData.topic,
        ai_model: 'claude-sonnet-4-20250514',
        reading_time_min: readingTime,
        published_at: shouldPublish ? now : null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 500 });
    }

    // Thema als verwendet markieren
    await supabase
      .from('blog_auto_topics')
      .update({ used: true, used_at: now })
      .eq('id', topicData.id);

    return NextResponse.json({ success: true, post });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `Auto-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
