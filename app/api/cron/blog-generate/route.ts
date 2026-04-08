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
  const url = new URL(req.url);
  const secret = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // force=true ueberspringt den Scheduler (fuer manuelle Tests)
  const forceGenerate = url.searchParams.get('force') === 'true';

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

  // ── Intelligenter Scheduler (wird bei force=true uebersprungen) ──
  if (!forceGenerate) {
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
  } // ── Ende Scheduler ─────────────────────────────────────────────

  // Modus: semi = Entwurf, voll/true = veroeffentlichen
  const autoMode = (blogSettings.auto_generate_mode as string) ?? 'semi';

  const apiKey = (blogSettings.anthropic_api_key as string) || null;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kein Anthropic API Key konfiguriert.' }, { status: 400 });
  }

  // Status-Flag: Generierung laeuft
  async function setGenerationStatus(status: 'generating' | 'idle', topic?: string) {
    await supabase.from('admin_settings').upsert({
      key: 'blog_generation_status',
      value: JSON.stringify({ status, topic: topic ?? '', started_at: status === 'generating' ? new Date().toISOString() : null, finished_at: status === 'idle' ? new Date().toISOString() : null }),
      updated_at: new Date().toISOString(),
    });
  }

  // ── Prioritaet 0: Redaktionsplan pruefen ────────────────────────
  // Artikel werden X Tage VOR dem Veroeffentlichungsdatum generiert,
  // damit der Admin sie vorher pruefen kann
  const daysBeforeGenerate = parseInt(String(blogSettings.schedule_days_before ?? '3')) || 3;
  const todayDate = new Date();
  const generateBeforeDate = new Date(todayDate);
  generateBeforeDate.setDate(generateBeforeDate.getDate() + daysBeforeGenerate);
  const generateBeforeDateStr = generateBeforeDate.toISOString().split('T')[0];

  let scheduleQuery = supabase
    .from('blog_schedule')
    .select('*')
    .eq('status', 'planned')
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1);

  // Bei force=true: naechsten Eintrag nehmen, egal welches Datum
  // Sonst: Eintraege deren Veroeffentlichungsdatum innerhalb der naechsten X Tage liegt
  if (!forceGenerate) {
    scheduleQuery = scheduleQuery.lte('scheduled_date', generateBeforeDateStr);
  }

  const { data: scheduleEntry } = await scheduleQuery.maybeSingle();

  // ── Prioritaet 1+2: Serien, dann Themenpool ───────────────────
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
  let scheduleId: string | null = null;

  // Redaktionsplan hat hoechste Prio
  if (scheduleEntry) {
    topicData = {
      id: scheduleEntry.id,
      topic: scheduleEntry.topic,
      keywords: scheduleEntry.keywords,
      category_id: scheduleEntry.category_id,
      tone: scheduleEntry.tone ?? 'informativ',
      target_length: scheduleEntry.target_length ?? 'mittel',
    };
    scheduleId = scheduleEntry.id;
    await supabase.from('blog_schedule').update({ status: 'generating' }).eq('id', scheduleEntry.id);
  }
  let seriesContext: { id: string; title: string; part_number: number; total_parts: number; description: string; partId: string } | null = null;

  if (topicData) {
    // topicData kommt vom Redaktionsplan — Serien/Pool ueberspringen
  } else if (seriesPart?.blog_series) {
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

  // Echte Produkte aus dem Shop laden
  const { data: productConfig } = await supabase
    .from('admin_config').select('value').eq('key', 'products').single();

  let shopProductsInfo = '';
  if (productConfig?.value && typeof productConfig.value === 'object') {
    const products = productConfig.value as Record<string, { name: string; brand: string; slug: string }>;
    const productList = Object.values(products).map((p) => `- ${p.brand} ${p.name} (Link: /kameras/${p.slug})`).join('\n');
    shopProductsInfo = `\n\nAKTUELLE PRODUKTE IM CAM2RENT SHOP (verlinke diese wenn relevant):\n${productList}\n\nVerwende NUR diese Produkte oder allgemeine Themen. KEINE veralteten Modelle erfinden.`;
  }

  const currentYear = new Date().getFullYear();

  const kiContext = (blogSettings.ki_context as string)
    ? `\n\nZUSAETZLICHER KONTEXT VOM ADMIN:\n${blogSettings.ki_context}`
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
- Schliesse mit einem kurzen, praegnanten Fazit ab${keywordHint}${seriesHint}

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
    await setGenerationStatus('generating', topicData.topic);
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

    // ── Automatischer 3-stufiger Faktencheck ──────────────────────
    const REVIEW_PASSES = [
      { role: 'Faktenpruefer', instruction: 'Pruefe auf erfundene Specs, Preise, Features, Technologien. Korrigiere alles was nicht belegbar ist. Entferne konkrete Zahlen wenn du dir nicht sicher bist und ersetze sie durch allgemeine Formulierungen.' },
      { role: 'Qualitaetsredakteur', instruction: 'Pruefe auf uebertriebene Superlative, Marketing-Luegen, Widersprueche, KI-typische Floskeln. Korrigiere den Ton auf ehrlich und nachvollziehbar.' },
      { role: 'Chefredakteur', instruction: 'Letzte Pruefung: Wuerdest du das mit deinem Namen veroeffentlichen? Korrigiere letzte Details. Stelle sicher dass "Versicherung" nirgends vorkommt — nur "Haftungsschutz".' },
    ];

    let checkedContent = parsed.content;
    for (const pass of REVIEW_PASSES) {
      try {
        const reviewMsg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: `Du bist ${pass.role} bei cam2rent.de. ${pass.instruction}

Antworte NUR mit dem korrigierten Artikel-Text in Markdown. Keine Erklaerungen, keine Kommentare — nur der fertige Text.`,
          messages: [{ role: 'user', content: checkedContent }],
        });
        const reviewText = reviewMsg.content[0].type === 'text' ? reviewMsg.content[0].text : '';
        if (reviewText.trim().length > 100) {
          checkedContent = reviewText;
        }
      } catch { /* Faktencheck-Durchgang fehlgeschlagen — weiter */ }
    }
    parsed.content = checkedContent;
    // ── Ende Faktencheck ──────────────────────────────────────────

    // Status bestimmen:
    // - Zeitplan-Artikel: immer als "scheduled" mit geplantem Datum (Admin prueft vorher)
    // - Andere Artikel: Semi = draft, Voll = published
    const now = new Date().toISOString();
    let postStatus: string;
    let publishedAt: string | null = null;
    let scheduledAt: string | null = null;

    if (scheduleId && scheduleEntry) {
      // Zeitplan: Artikel als "scheduled" mit dem geplanten Veroeffentlichungsdatum
      postStatus = 'scheduled';
      const time = (scheduleEntry.scheduled_time || '09:00').slice(0, 5); // HH:MM
      scheduledAt = `${scheduleEntry.scheduled_date}T${time}:00`;
    } else if (autoMode === 'voll') {
      postStatus = 'published';
      publishedAt = now;
    } else {
      postStatus = 'draft';
    }

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
        status: postStatus,
        seo_title: parsed.seoTitle,
        seo_description: parsed.seoDescription,
        author: 'cam2rent',
        ai_generated: true,
        ai_prompt: topicData.topic,
        ai_model: 'claude-sonnet-4-20250514',
        reading_time_min: readingTime,
        published_at: publishedAt,
        scheduled_at: scheduledAt,
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
    let imageError: string | null = null;

    if (!openaiKey) {
      imageError = 'OpenAI API Key nicht konfiguriert';
    } else if (!parsed.imagePrompt) {
      imageError = 'Kein imagePrompt von Claude erhalten';
    } else if (post) {
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
          } else {
            imageError = `Upload fehlgeschlagen: ${uploadErr.message}`;
          }
        } else {
          imageError = 'DALL-E hat kein Bild zurueckgegeben';
        }
      } catch (imgErr: unknown) {
        imageError = imgErr instanceof Error ? imgErr.message : 'Unbekannter Bild-Fehler';
      }
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
    } else if (scheduleId) {
      // Redaktionsplan-Eintrag aktualisieren
      await supabase.from('blog_schedule').update({
        status: 'generated',
        post_id: post.id,
        generated_at: now,
      }).eq('id', scheduleId);
      // Post mit schedule_id verknuepfen
      await supabase.from('blog_posts').update({ schedule_id: scheduleId }).eq('id', post.id);
    } else {
      // Normales Thema als verwendet markieren
      await supabase
        .from('blog_auto_topics')
        .update({ used: true, used_at: now })
        .eq('id', topicData.id);
    }

    await setGenerationStatus('idle', topicData.topic);
    return NextResponse.json({ success: true, post, imageError, series: seriesContext ? { id: seriesContext.id, part: seriesContext.part_number } : null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    await setGenerationStatus('idle');
    return NextResponse.json({ error: `Auto-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
