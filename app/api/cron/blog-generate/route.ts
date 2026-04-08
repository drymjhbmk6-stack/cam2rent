import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

  // Blog-Settings laden (ein JSON-Objekt unter key 'blog_settings')
  const { data: settingsData } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();

  let blogSettings: Record<string, unknown> = {};
  if (settingsData?.value) {
    try {
      blogSettings = typeof settingsData.value === 'string'
        ? JSON.parse(settingsData.value)
        : settingsData.value;
    } catch { /* leer */ }
  }

  // Pruefen ob Auto-Generierung aktiv
  if (!blogSettings.auto_generate) {
    return NextResponse.json({ message: 'Auto-Generierung ist deaktiviert.' });
  }

  // ── Intelligenter Scheduler ──────────────────────────────────────
  // Prueft: richtiger Wochentag? Richtige Uhrzeit? Heute schon generiert?
  // Zufaellige Minute pro Stunde fuer natuerliches Timing
  const now = new Date();
  const berlinTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const currentHour = berlinTime.getHours();
  const currentMinute = berlinTime.getMinutes();

  const interval = (blogSettings.auto_generate_interval as string) ?? 'weekly';
  const weekdays = (blogSettings.auto_generate_weekdays as string[]) ?? ['mo', 'do'];
  const timeFrom = (blogSettings.auto_generate_time_from as string) ?? '09:00';
  const timeTo = (blogSettings.auto_generate_time_to as string) ?? '18:00';

  const dayMap = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
  const todayKey = dayMap[berlinTime.getDay()];

  // Wochentag-Check (bei weekly/biweekly)
  if (interval === 'weekly' || interval === 'biweekly') {
    if (!weekdays.includes(todayKey)) {
      return NextResponse.json({ message: `Heute (${todayKey.toUpperCase()}) ist kein geplanter Tag.` });
    }
  }

  // Uhrzeit-Check: Liegt die aktuelle Stunde im Zeitfenster?
  const fromHour = parseInt(timeFrom.split(':')[0]) || 9;
  const toHour = parseInt(timeTo.split(':')[0]) || 18;
  if (currentHour < fromHour || currentHour >= toHour) {
    return NextResponse.json({ message: `Aktuelle Uhrzeit (${currentHour}:${String(currentMinute).padStart(2, '0')}) liegt ausserhalb des Zeitfensters ${timeFrom}-${timeTo}.` });
  }

  // Zufaellige Minute: Generiere nur wenn die aktuelle Minute
  // in einen zufaelligen 10-Minuten-Slot faellt (basierend auf Datum als Seed)
  // So wird pro Stunde nur einmal generiert, aber zu einer "zufaelligen" Minute
  const dateSeed = berlinTime.getFullYear() * 10000 + (berlinTime.getMonth() + 1) * 100 + berlinTime.getDate();
  const randomSlotStart = ((dateSeed * 7 + currentHour * 13) % 50); // 0-49, laesst 10 Min Puffer
  const randomSlotEnd = randomSlotStart + 10;
  if (currentMinute < randomSlotStart || currentMinute >= randomSlotEnd) {
    return NextResponse.json({ message: `Warte auf Zufallsminute (Slot ${randomSlotStart}-${randomSlotEnd}, jetzt ${currentMinute}).` });
  }

  // Duplikat-Check: Wurde heute schon ein Artikel generiert?
  const todayStart = new Date(berlinTime);
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('ai_generated', true)
    .gte('created_at', todayStart.toISOString());

  // Bei daily: max 1 pro Tag. Bei weekly: auch max 1 pro Tag (aber nur an geplanten Tagen)
  if ((todayCount ?? 0) >= 1) {
    return NextResponse.json({ message: 'Heute wurde bereits ein Artikel generiert.' });
  }
  // ── Ende Scheduler ───────────────────────────────────────────────

  // Modus: semi = Entwurf, voll/true = veroeffentlichen
  const autoMode = (blogSettings.auto_generate_mode as string) ?? 'semi';

  const apiKey = (blogSettings.anthropic_api_key as string) || null;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kein Anthropic API Key konfiguriert.' }, { status: 400 });
  }

  // Naechstes ungenutztes Thema holen — erst Serien, dann normale Themen
  // 1. Pruefen ob eine aktive Serie einen offenen Teil hat
  const { data: seriesPart } = await supabase
    .from('blog_series_parts')
    .select('*, blog_series!inner(id, title, slug, description, category_id, tone, target_length, status, total_parts, generated_parts, blog_categories(id, name, slug))')
    .eq('used', false)
    .eq('blog_series.status', 'active')
    .order('part_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  let topicData: { topic: string; keywords?: string[]; category_id?: string | null; tone: string; target_length: string; id: string } | null = null;
  let seriesContext: { id: string; title: string; part_number: number; total_parts: number; description: string; partId: string } | null = null;

  if (seriesPart?.blog_series) {
    const s = seriesPart.blog_series as { id: string; title: string; total_parts: number; description: string; category_id: string | null; tone: string; target_length: string };
    topicData = {
      id: seriesPart.id,
      topic: seriesPart.topic,
      keywords: seriesPart.keywords,
      category_id: s.category_id,
      tone: s.tone,
      target_length: s.target_length,
    };
    seriesContext = {
      id: s.id,
      title: s.title,
      part_number: seriesPart.part_number,
      total_parts: s.total_parts,
      description: s.description,
      partId: seriesPart.id,
    };
  }

  // 2. Wenn keine Serie offen, normales Thema nehmen
  if (!topicData) {
    const { data: normalTopic } = await supabase
      .from('blog_auto_topics')
      .select('*, blog_categories(id, name, slug)')
      .eq('used', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (normalTopic) {
      topicData = normalTopic;
    }
  }

  if (!topicData) {
    return NextResponse.json({ message: 'Keine ungenutzten Themen im Pool und keine offenen Serien.' });
  }

  const length = LENGTH_MAP[topicData.target_length] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[topicData.tone] ?? TONE_MAP.informativ;
  const keywordHint = topicData.keywords?.length
    ? `\nWichtige Keywords fuer SEO: ${topicData.keywords.join(', ')}`
    : '';

  const seriesHint = seriesContext
    ? `\n\nDIESER ARTIKEL IST TEIL EINER SERIE:
- Serientitel: "${seriesContext.title}"
- Teil ${seriesContext.part_number} von ${seriesContext.total_parts}
- Serienbeschreibung: ${seriesContext.description}
- Erwaehne am Anfang kurz die Serie und welcher Teil das ist
- Verweise am Ende auf die weiteren Teile der Serie
- Der Titel sollte den Serientitel und die Teilnummer enthalten (z.B. "Serientitel — Teil ${seriesContext.part_number}")`
    : '';

  const systemPrompt = `Du bist ein erfahrener Content-Writer fuer cam2rent.de, einen deutschen Online-Verleih fuer Action-Kameras (GoPro, DJI, Insta360 etc.).

Deine Aufgabe: Schreibe einen SEO-optimierten Blog-Artikel auf Deutsch.

Regeln:
- Schreibe ${length} in ${toneDesc}m Stil
- Verwende Markdown-Formatierung (## fuer Ueberschriften, **fett**, Listen, Tabellen etc.)
- Nutze Markdown-Tabellen (| Spalte1 | Spalte2 |) bei Vergleichen, technischen Daten, Vor-/Nachteilen oder wenn mehrere Produkte/Optionen gegenueber gestellt werden. Tabellen machen Vergleiche uebersichtlicher als Fliesstext.
- Beginne NICHT mit dem Titel im Content (der wird separat gesetzt)
- Nutze Zwischenueberschriften (## und ###) fuer gute Lesbarkeit
- WICHTIG: Nenne Haftungsoptionen NIEMALS "Versicherung" — verwende "Haftungsschutz" oder "Haftungsbegrenzung"
- Erwaehne cam2rent.de als Verleih-Service wo passend, aber nicht aufdringlich${keywordHint}${seriesHint}

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

    // Semi = Entwurf, Voll = direkt veroeffentlichen
    const shouldPublish = autoMode === 'voll';
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
        series_id: seriesContext?.id || null,
        series_part: seriesContext?.part_number || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 500 });
    }

    // Titelbild generieren wenn OpenAI Key vorhanden und imagePrompt existiert
    const openaiKey = (blogSettings.openai_api_key as string) || null;
    if (openaiKey && parsed.imagePrompt && post) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const imgResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: parsed.imagePrompt,
          n: 1,
          size: '1792x1024',
          quality: 'hd',
          style: 'natural',
        });
        const imgUrl = imgResponse.data?.[0]?.url;
        if (imgUrl) {
          const imgFetch = await fetch(imgUrl);
          const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
          const imgFilename = `blog-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          const { error: uploadErr } = await supabase.storage
            .from('blog-images')
            .upload(imgFilename, imgBuffer, { contentType: 'image/png' });
          if (!uploadErr) {
            const { data: imgUrlData } = supabase.storage.from('blog-images').getPublicUrl(imgFilename);
            await supabase.from('blog_posts').update({
              featured_image: imgUrlData.publicUrl,
              featured_image_alt: parsed.title,
            }).eq('id', post.id);
          }
        }
      } catch { /* Bild-Generierung fehlgeschlagen — Artikel bleibt ohne Bild */ }
    }

    // Thema als verwendet markieren
    if (seriesContext) {
      // Serien-Teil als verwendet markieren + post_id setzen
      await supabase
        .from('blog_series_parts')
        .update({ used: true, used_at: now, post_id: post.id })
        .eq('id', seriesContext.partId);

      // generated_parts zaehler erhoehen
      await supabase
        .from('blog_series')
        .update({ generated_parts: seriesContext.part_number })
        .eq('id', seriesContext.id);

      // Serie als completed markieren wenn alle Teile generiert
      if (seriesContext.part_number >= seriesContext.total_parts) {
        await supabase
          .from('blog_series')
          .update({ status: 'completed' })
          .eq('id', seriesContext.id);
      }
    } else {
      // Normales Thema als verwendet markieren
      await supabase
        .from('blog_auto_topics')
        .update({ used: true, used_at: now })
        .eq('id', topicData.id);
    }

    return NextResponse.json({ success: true, post, series: seriesContext ? { id: seriesContext.id, part: seriesContext.part_number } : null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `Auto-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
