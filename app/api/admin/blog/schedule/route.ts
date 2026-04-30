import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/blog/schedule — Redaktionsplan laden
 * POST /api/admin/blog/schedule — KI-Zeitplan generieren ODER einzelnen Eintrag hinzufügen
 * PUT /api/admin/blog/schedule — Eintrag aktualisieren (Datum, Reihenfolge, reviewed)
 * DELETE /api/admin/blog/schedule?id=... — Eintrag löschen
 */

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_schedule')
    .select('*')
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Kategorien und Posts separat laden für robustere Abfrage
  const entries = data ?? [];
  const catIds = [...new Set(entries.map((e) => e.category_id).filter(Boolean))];
  const postIds = [...new Set(entries.map((e) => e.post_id).filter(Boolean))];

  const cats: Record<string, { id: string; name: string; slug: string; color: string }> = {};
  const posts: Record<string, { id: string; title: string; slug: string; status: string }> = {};

  if (catIds.length > 0) {
    const { data: catData } = await supabase.from('blog_categories').select('id, name, slug, color').in('id', catIds);
    for (const c of catData ?? []) cats[c.id] = c;
  }
  if (postIds.length > 0) {
    const { data: postData } = await supabase.from('blog_posts').select('id, title, slug, status').in('id', postIds);
    for (const p of postData ?? []) posts[p.id] = p;
  }

  const enriched = entries.map((e) => ({
    ...e,
    blog_categories: e.category_id ? cats[e.category_id] ?? null : null,
    blog_posts: e.post_id ? posts[e.post_id] ?? null : null,
  }));

  return NextResponse.json({ schedule: enriched });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  // Option A: KI-Zeitplan generieren (läuft im Hintergrund)
  if (body.action === 'generate_plan') {
    const { weeks = 4, postsPerWeek = 2, categoryIds, startDate } = body;

    // API Key laden
    const { data: settingsData } = await supabase
      .from('admin_settings').select('value').eq('key', 'blog_settings').single();

    let apiKey = '';
    let kiContext = '';
    if (settingsData?.value) {
      const parsed = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
      apiKey = parsed.anthropic_api_key || '';
      kiContext = parsed.ki_context || '';
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API Key nicht konfiguriert.' }, { status: 400 });
    }

    // Status setzen: Planung läuft
    await supabase.from('admin_settings').upsert({
      key: 'blog_plan_status',
      value: JSON.stringify({ status: 'planning', total: weeks * postsPerWeek, created: 0, started_at: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    });

    // Sofort antworten — Generierung im Hintergrund
    void (async () => {
      try {

    // Kategorien laden
    const { data: categories } = await supabase
      .from('blog_categories').select('id, name').order('sort_order');

    // Echte Produkte aus dem Shop laden
    const { data: productConfig } = await supabase
      .from('admin_config').select('value').eq('key', 'products').single();

    let productNames: string[] = [];
    if (productConfig?.value && typeof productConfig.value === 'object') {
      const products = productConfig.value as Record<string, { name: string; brand: string }>;
      productNames = Object.values(products).map((p) => `${p.brand} ${p.name}`);
    }

    const productInfo = productNames.length > 0
      ? `\n\nAKTUELLE PRODUKTE IM SHOP (NUR diese Kameras für Vergleiche/Tests verwenden!):\n${productNames.map((n) => `- ${n}`).join('\n')}`
      : '';

    const catInfo = (categories ?? []).map((c) => c.name).join(', ');
    const catFilterInfo = categoryIds?.length
      ? `\nBeschränke die Themen auf diese Kategorien: ${categoryIds.map((id: string) => categories?.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}`
      : '';

    // Bestehende Artikel + geplante Themen laden (Duplikat-Vermeidung)
    const { data: existingPosts } = await supabase
      .from('blog_posts')
      .select('title')
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: existingSchedule } = await supabase
      .from('blog_schedule')
      .select('topic')
      .order('created_at', { ascending: false })
      .limit(100);

    const existingTopics = [
      ...(existingPosts ?? []).map((p) => p.title),
      ...(existingSchedule ?? []).map((s) => s.topic),
    ];

    const duplicateInfo = existingTopics.length > 0
      ? `\n\nBEREITS VORHANDENE ARTIKEL UND GEPLANTE THEMEN (KEINE Dopplungen oder ähnliche Themen erstellen!):\n${existingTopics.map((t) => `- ${t}`).join('\n')}`
      : '';

    const today = new Date();
    const currentMonth = today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
    const currentYear = parseInt(today.toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Europe/Berlin' }), 10);

    const totalPosts = weeks * postsPerWeek;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `Du bist Redaktionsplaner für cam2rent.de, einen deutschen Action-Cam Verleih.

AKTUELLES DATUM: ${currentMonth}
AKTUELLES JAHR: ${currentYear}

Erstelle einen Redaktionsplan mit ${totalPosts} Blog-Themen für die nächsten ${weeks} Wochen.

Vorhandene Kategorien: ${catInfo}${catFilterInfo}${productInfo}${duplicateInfo}

WICHTIGE REGELN:
- Verwende NUR aktuelle Produkte (${currentYear}). KEINE veralteten Modelle wie GoPro Hero 12, DJI Action 4, Insta360 X3 etc.
- Wenn du Produkte erwähnst, nutze NUR die oben gelisteten Shop-Produkte oder allgemeine Themen ohne spezifische Modellnamen
- Abwechslungsreiche Themen: Vergleiche, Tipps, Guides, Tutorials, Saisonale Themen, Anwendungsfälle
- SEO-relevante Themen die Leute im Jahr ${currentYear} wirklich suchen
- Jedes Thema mit 3-5 Keywords
- NIEMALS "Versicherung" — nur "Haftungsschutz"
- Saisonale Themen passend zum aktuellen Monat (${currentMonth}):
  - Frühling: Wandern, Radfahren, erste Outdoor-Abenteuer
  - Sommer: Wassersport, Urlaub, Tauchen, Festivals
  - Herbst: Herbstwanderungen, Indoor-Sport, Drohnen
  - Winter: Skifahren, Snowboard, Winterlandschaften
- Mische spezifische Produktthemen mit allgemeinen Ratgeber-Themen
- DUPLIKATE STRIKT VERMEIDEN: Prüfe die Liste der vorhandenen Artikel oben. Kein Thema darf inhaltlich ähnlich sein. Keine Wiederholungen, keine leichten Variationen (z.B. "Beste Action-Cam 2026" und "Top Action-Cams 2026" wäre ein Duplikat). Jedes Thema muss einen NEUEN Blickwinkel bieten
${kiContext ? `\nZUSÄTZLICHER KONTEXT VOM ADMIN:\n${kiContext}` : ''}

Antworte NUR als JSON-Array (kein Markdown-Codeblock):
[
  {
    "topic": "Thema / Titel des Artikels",
    "prompt": "Ausführlicher Prompt für die KI (3-6 Sätze): Beschreibe genau was der Artikel enthalten soll. Welche Produkte sollen verglichen werden? Welche Tipps/Tricks? Welche Zielgruppe? Welche Struktur (Einleitung, Vergleichstabelle, Fazit)? Welche Fragen soll der Artikel beantworten?",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "category": "Kategorie-Name",
    "tone": "informativ|locker|professionell",
    "length": "kurz|mittel|lang"
  }
]

WICHTIG für das "prompt"-Feld:
- Sei SEHR ausführlich und spezifisch — je detaillierter, desto besser der Artikel
- Nenne konkrete Produkte aus dem Shop die verglichen oder empfohlen werden sollen
- Beschreibe die gewünschte Artikelstruktur (z.B. "Beginne mit einer persönlichen Anekdote, dann Vergleichstabelle, dann Fazit")
- Erwähne spezifische Tipps die enthalten sein sollen
- Gib an welche Fragen der Leser beantwortet bekommen soll
- Nenne 2-3 Callout-Boxen die sinnvoll wären (Tipp, Wichtig, Fazit)`,
      messages: [{ role: 'user', content: `Erstelle ${totalPosts} Blog-Themen für die nächsten ${weeks} Wochen ab ${currentMonth}.` }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    let topics;
    try {
      topics = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) topics = JSON.parse(match[0]);
      else return NextResponse.json({ error: 'KI-Antwort konnte nicht geparst werden.' }, { status: 500 });
    }

    // Blog-Einstellungen laden (Wochentage + Uhrzeit)
    const { data: blogSettingsData } = await supabase
      .from('admin_settings').select('value').eq('key', 'blog_settings').single();

    let blogSettings: Record<string, unknown> = {};
    if (blogSettingsData?.value) {
      try {
        blogSettings = typeof blogSettingsData.value === 'string'
          ? JSON.parse(blogSettingsData.value) : blogSettingsData.value;
      } catch { /* leer */ }
    }

    // Einstellungen für Zeitplan
    const dayMap: Record<string, number> = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };
    const allowedWeekdays = (blogSettings.auto_generate_weekdays as string[]) ?? ['mo', 'do'];
    const allowedDayNumbers = allowedWeekdays.map((d) => dayMap[d]).filter((n) => n !== undefined);
    const timeFrom = (blogSettings.auto_generate_time_from as string) ?? '09:00';
    const timeTo = (blogSettings.auto_generate_time_to as string) ?? '18:00';

    // Zufällige Uhrzeit innerhalb des Zeitfensters generieren
    function randomTime(): string {
      const fromH = parseInt(timeFrom.split(':')[0]) || 9;
      const toH = parseInt(timeTo.split(':')[0]) || 18;
      const h = fromH + Math.floor(Math.random() * (toH - fromH));
      const m = Math.floor(Math.random() * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Zeitplan erstellen — Themen auf konfigurierte Wochentage verteilen
    const start = startDate ? new Date(startDate) : new Date();
    start.setDate(start.getDate() + 1); // Ab morgen
    const scheduleEntries = [];
    const currentDate = new Date(start);
    let topicIndex = 0;

    // Durch die Wochen iterieren und Themen auf erlaubte Tage setzen
    while (topicIndex < topics.length) {
      const dayOfWeek = currentDate.getDay();

      if (allowedDayNumbers.includes(dayOfWeek)) {
        const t = topics[topicIndex];
        const cat = categories?.find((c) => c.name.toLowerCase() === (t.category || '').toLowerCase());

        scheduleEntries.push({
          topic: t.topic,
          prompt: t.prompt || null,
          keywords: t.keywords ?? [],
          category_id: cat?.id || null,
          tone: t.tone || 'informativ',
          target_length: t.length || 'mittel',
          scheduled_date: currentDate.toISOString().split('T')[0],
          scheduled_time: randomTime(),
          sort_order: topicIndex,
          status: 'planned',
        });

        topicIndex++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('blog_schedule')
      .insert(scheduleEntries)
      .select();

    if (insertError) {
        console.error('[blog-plan] Insert error:', insertError.message);
      } else {
        console.log(`[blog-plan] ${inserted?.length ?? 0} Themen erstellt`);
      }

      // Status: fertig
      await supabase.from('admin_settings').upsert({
        key: 'blog_plan_status',
        value: JSON.stringify({ status: 'done', total: scheduleEntries.length, created: inserted?.length ?? 0, finished_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      });
      } catch (err) {
        console.error('[blog-plan] Background error:', err);
        await supabase.from('admin_settings').upsert({
          key: 'blog_plan_status',
          value: JSON.stringify({ status: 'error', error: err instanceof Error ? err.message : 'Unbekannter Fehler', finished_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        });
      }
    })();

    await logAudit({
      action: 'blog_schedule.generate_plan',
      entityType: 'blog_schedule',
      changes: { weeks, postsPerWeek, total: weeks * postsPerWeek },
      request: req,
    });

    // Sofort antworten
    return NextResponse.json({ background: true, message: 'Planung läuft im Hintergrund...' });
  }

  // Option B: Einzelnen Eintrag hinzufügen
  const { topic, keywords, category_id, tone, target_length, scheduled_date, scheduled_time } = body;
  if (!topic || !scheduled_date) {
    return NextResponse.json({ error: 'Thema und Datum sind erforderlich.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('blog_schedule')
    .insert({
      topic, keywords: keywords ?? [], category_id: category_id || null,
      tone: tone ?? 'informativ', target_length: target_length ?? 'mittel',
      scheduled_date, scheduled_time: scheduled_time ?? '09:00', status: 'planned',
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_schedule.create',
    entityType: 'blog_schedule',
    entityId: data?.id,
    entityLabel: topic,
    request: req,
  });

  return NextResponse.json({ entry: data });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'ID erforderlich.' }, { status: 400 });

  const supabase = createServiceClient();

  // Reviewed-Markierung
  if ('reviewed' in updates) {
    updates.reviewed_at = updates.reviewed ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from('blog_schedule').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Wenn Datum oder Uhrzeit geändert wurde: auch blog_posts.scheduled_at aktualisieren
  if (data?.post_id && ('scheduled_date' in updates || 'scheduled_time' in updates)) {
    const date = data.scheduled_date;
    const time = (data.scheduled_time || '09:00').slice(0, 5);
    // Deutsche Zeit nach UTC umrechnen
    const localDate = new Date(`${date}T${time}:00`);
    const berlinOffset = new Date(localDate.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getTime() - new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const utcDate = new Date(localDate.getTime() - berlinOffset);

    await supabase.from('blog_posts').update({
      scheduled_at: utcDate.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', data.post_id);
  }

  await logAudit({
    action: 'blog_schedule.update',
    entityType: 'blog_schedule',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID erforderlich.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_schedule.delete',
    entityType: 'blog_schedule',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
