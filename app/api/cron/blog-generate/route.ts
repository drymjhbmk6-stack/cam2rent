import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { verifyCronAuth } from '@/lib/cron-auth';
import OpenAI from 'openai';
import { isTestMode } from '@/lib/env-mode';
import { buildBlogSystemPrompt, HUMANIZER_PASS } from '@/lib/blog/system-prompt';
import { sanitizePromptInput, sanitizePromptInputList } from '@/lib/prompt-sanitize';

const LENGTH_MAP: Record<string, string> = {
  kurz: 'ca. 500 Wörter',
  mittel: 'ca. 1000 Wörter',
  lang: 'ca. 1500 Wörter',
};

const TONE_MAP: Record<string, string> = {
  informativ: 'sachlich-informativ, gut recherchiert',
  locker: 'locker und unterhaltsam, mit persönlicher Note',
  professionell: 'professionell und vertrauenswürdig, Experten-Ton',
};

/** POST /api/cron/blog-generate - Automatische Artikel-Generierung */
export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Im Test-Modus keine Artikel generieren — spart Claude/DALL-E-Kosten.
  if (await isTestMode()) {
    return NextResponse.json({ skipped: 'test_mode' });
  }

  // force=true überspringt den Scheduler (für manuelle Tests)
  const forceGenerate = req.headers.get('x-force-generate') === 'true';

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

  // Prüfen ob Auto-Generierung aktiv
  if (!blogSettings.auto_generate) {
    return NextResponse.json({ message: 'Auto-Generierung ist deaktiviert.' });
  }

  // ── Scheduler (wird bei force=true uebersprungen) ──
  if (!forceGenerate) {
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

  // Wochentag-Check — nur bei weekly/biweekly, NICHT bei daily/monthly
  if (interval !== 'daily' && interval !== 'monthly') {
    if (!weekdays.includes(todayKey)) {
      return NextResponse.json({ message: `Heute (${todayKey.toUpperCase()}) ist kein geplanter Tag.` });
    }
  }

  // Uhrzeit-Check
  const fromHour = timeFrom ? parseInt(timeFrom.split(':')[0]) : 9;
  const toHour = timeTo ? parseInt(timeTo.split(':')[0]) + 1 : 24;
  if (currentHour < fromHour || currentHour >= toHour) {
    return NextResponse.json({ message: `Aktuelle Uhrzeit (${currentHour}:${String(currentMinute).padStart(2, '0')}) liegt ausserhalb des Zeitfensters ${timeFrom}-${timeTo}.` });
  }

  // Duplikat-Check: Max 5 Artikel pro Tag
  const todayStart = new Date(berlinTime);
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('ai_generated', true)
    .gte('created_at', todayStart.toISOString());

  if ((todayCount ?? 0) >= 5) {
    return NextResponse.json({ message: 'Heute wurden bereits 5 Artikel generiert.' });
  }
  } // ── Ende Scheduler ─────────────────────────────────────────────

  // Modus: semi = Entwurf, voll/true = veröffentlichen
  const autoMode = (blogSettings.auto_generate_mode as string) ?? 'semi';

  const apiKey = (blogSettings.anthropic_api_key as string) || null;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kein Anthropic API Key konfiguriert.' }, { status: 400 });
  }

  // Re-Entry-Schutz: Wenn schon eine Generierung läuft und der Status
  // nicht stale ist (< 15 Min alt), abbrechen — sonst würden bei jedem
  // Cron-Tick parallel weitere Läufe starten. Stale-Locks (> 15 Min)
  // werden ignoriert, weil sie auf einen abgebrochenen vorigen Lauf
  // hindeuten (Function-Timeout).
  const STALE_LOCK_MINUTES = 15;
  const { data: statusRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_generation_status')
    .maybeSingle();

  if (statusRow?.value) {
    try {
      const parsed = typeof statusRow.value === 'string' ? JSON.parse(statusRow.value) : statusRow.value;
      if (parsed.status === 'generating' && parsed.started_at) {
        const ageMs = Date.now() - new Date(parsed.started_at).getTime();
        if (ageMs < STALE_LOCK_MINUTES * 60 * 1000) {
          return NextResponse.json({
            message: `Generierung läuft bereits (seit ${Math.floor(ageMs / 1000)}s).`,
          });
        }
        // Stale Lock — alten generating-Schedule-Eintrag aufräumen,
        // damit das Thema wieder in die Auswahl rein kann.
        await supabase
          .from('blog_schedule')
          .update({ status: 'planned' })
          .eq('status', 'generating');
      }
    } catch { /* ungültiger JSON — ignoriere alten Status */ }
  }

  // Status-Flag: Generierung läuft
  async function setGenerationStatus(status: 'generating' | 'idle', topic?: string) {
    await supabase.from('admin_settings').upsert({
      key: 'blog_generation_status',
      value: JSON.stringify({ status, topic: topic ?? '', started_at: status === 'generating' ? new Date().toISOString() : null, finished_at: status === 'idle' ? new Date().toISOString() : null }),
      updated_at: new Date().toISOString(),
    });
  }

  // ── Priorität 0: Redaktionsplan prüfen ────────────────────────
  // Artikel werden X Tage VOR dem Veröffentlichungsdatum generiert,
  // damit der Admin sie vorher prüfen kann
  const daysBeforeGenerate = parseInt(String(blogSettings.schedule_days_before ?? '3')) || 3;
  // Berlin-Datum als Basis, damit der Cron zwischen 22-24 Uhr Berlin
  // nicht schon fuer den Folgetag generiert.
  const todayBerlin = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [gy, gm, gd] = todayBerlin.split('-').map((n) => parseInt(n, 10));
  const generateBeforeDate = new Date(Date.UTC(gy, gm - 1, gd + daysBeforeGenerate));
  const generateBeforeDateStr = generateBeforeDate.toISOString().split('T')[0];

  let scheduleQuery = supabase
    .from('blog_schedule')
    .select('*')
    .eq('status', 'planned')
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1);

  // Bei force=true: nächsten Eintrag nehmen, egal welches Datum
  // Sonst: Einträge deren Veröffentlichungsdatum innerhalb der nächsten X Tage liegt
  if (!forceGenerate) {
    scheduleQuery = scheduleQuery.lte('scheduled_date', generateBeforeDateStr);
  }

  const { data: scheduleEntry } = await scheduleQuery.maybeSingle();

  // ── Nur Redaktionsplan — kein Pool/Serien-Fallback ───────────
  let topicData: { topic: string; prompt?: string | null; keywords?: string[]; category_id?: string | null; tone: string; target_length: string; id: string } | null = null;
  let scheduleId: string | null = null;
  // Serien-Kontext (wird aktuell nicht befüllt, Platzhalter für zukünftige Serien-Logik)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const seriesContext = null as { id: string; title: string; part_number: number; total_parts: number; description: string; partId: string } | null;

  if (scheduleEntry) {
    topicData = {
      id: scheduleEntry.id,
      topic: scheduleEntry.topic,
      prompt: scheduleEntry.prompt || null,
      keywords: scheduleEntry.keywords,
      category_id: scheduleEntry.category_id,
      tone: scheduleEntry.tone ?? 'informativ',
      target_length: scheduleEntry.target_length ?? 'mittel',
    };
    scheduleId = scheduleEntry.id;
    await supabase.from('blog_schedule').update({ status: 'generating' }).eq('id', scheduleEntry.id);
  }

  if (!topicData) {
    return NextResponse.json({ message: 'Kein fälliger Artikel im Zeitplan.' });
  }

  const length = LENGTH_MAP[topicData.target_length] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[topicData.tone] ?? TONE_MAP.informativ;

  // Defense-in-Depth: User-Input (auch von Admin-Eingabe in Redaktionsplan)
  // sanitizen, bevor wir es in Claude-Prompts einbauen.
  const safeTopic = sanitizePromptInput(topicData.topic, 300);
  const safePrompt = topicData.prompt ? sanitizePromptInput(topicData.prompt, 5000) : '';
  const safeKeywords = sanitizePromptInputList(topicData.keywords, 30, 60);

  const keywordHint = safeKeywords.length
    ? `\nWichtige Keywords für SEO: ${safeKeywords.join(', ')}`
    : '';

  const detailedPrompt = safePrompt
    ? `\n\nAUSFÜHRLICHE ANWEISUNGEN VOM REDAKTEUR:\n${safePrompt}`
    : '';

  const seriesHint = seriesContext
    ? `\n\nDIESER ARTIKEL IST TEIL EINER SERIE:
- Serientitel: "${seriesContext.title}"
- Teil ${seriesContext.part_number} von ${seriesContext.total_parts}
- Serienbeschreibung: ${seriesContext.description}
- Erwähne am Anfang kurz die Serie und welcher Teil das ist
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

  // Aktuelles Jahr in Berlin-Zeit — sonst fehlt in der Silvester-Nacht das neue Jahr
  const currentYear = parseInt(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 4), 10);

  const systemPrompt = buildBlogSystemPrompt({
    currentYear,
    shopProductsInfo,
    kiContext: (blogSettings.ki_context as string) ?? '',
    length,
    toneDesc,
    keywordHint,
    seriesHint,
  });

  try {
    await setGenerationStatus('generating', topicData.topic);
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `Schreibe einen Blog-Artikel über: ${safeTopic}${detailedPrompt}${keywordHint}${seriesHint}` }],
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
      { role: 'Faktenprüfer', instruction: 'Prüfe auf erfundene Specs, Preise, Features, Technologien. Korrigiere alles was nicht belegbar ist. Entferne konkrete Zahlen wenn du dir nicht sicher bist und ersetze sie durch allgemeine Formulierungen.' },
      HUMANIZER_PASS,
      { role: 'Chefredakteur', instruction: 'Letzte Prüfung: Würdest du das mit deinem Namen veröffentlichen? Korrigiere letzte Details. Stelle sicher dass "Versicherung" nirgends vorkommt — nur "Haftungsschutz".' },
    ];

    let checkedContent = parsed.content;
    for (const pass of REVIEW_PASSES) {
      try {
        const reviewMsg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: `Du bist ${pass.role} bei cam2rent.de. ${pass.instruction}

Antworte NUR mit dem korrigierten Artikel-Text in Markdown. Keine Erklärungen, keine Kommentare — nur der fertige Text.`,
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
    // - Zeitplan-Artikel: immer als "scheduled" mit geplantem Datum (Admin prüft vorher)
    // - Andere Artikel: Semi = draft, Voll = published
    const now = new Date().toISOString();
    let postStatus: string;
    let publishedAt: string | null = null;
    let scheduledAt: string | null = null;

    if (scheduleId && scheduleEntry) {
      // Zeitplan: Artikel als "scheduled" mit dem geplanten Veröffentlichungsdatum
      postStatus = 'scheduled';
      const time = (scheduleEntry.scheduled_time || '09:00').slice(0, 5); // HH:MM
      // Timezone-korrekt: Deutsche Zeit (CET/CEST) in UTC umrechnen
      const localDate = new Date(`${scheduleEntry.scheduled_date}T${time}:00`);
      const berlinOffset = new Date(localDate.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getTime() - new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
      const utcDate = new Date(localDate.getTime() - berlinOffset);
      scheduledAt = utcDate.toISOString();
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
        schedule_id: scheduleId || null,
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
          if (!imgFetch.ok) {
            throw new Error(`Bild-Download von OpenAI fehlgeschlagen: HTTP ${imgFetch.status}`);
          }
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
          imageError = 'DALL-E hat kein Bild zurückgegeben';
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

      // generated_parts Zähler erhöhen
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
    }

    // Redaktionsplan-Eintrag aktualisieren (unabhängig von Series/Themenpool)
    if (scheduleId) {
      await supabase.from('blog_schedule').update({
        status: 'generated',
        post_id: post.id,
        generated_at: now,
      }).eq('id', scheduleId);
    }

    // Thema als verwendet markieren (nur wenn KEIN Zeitplan-Eintrag)
    if (!scheduleId && !seriesContext) {
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
