/**
 * KI-Plan-Generator: Erstellt N Post-Entwuerfe fuer die naechsten X Tage.
 *
 * Claude generiert zuerst N Post-Themen (Ideen) fuer cam2rent, dann fuer jedes
 * Thema eine Caption + Hashtags. Bildgenerierung wird optional spaeter nachgeholt
 * (DALL-E ist teuer und langsam — Posts gehen erstmal als Text-Entwuerfe in die
 * Warteschlange, Admin kann Bilder einzeln generieren oder hochladen).
 *
 * Die Posts werden als 'scheduled' mit scheduled_at verteilt ueber die N Tage
 * angelegt. Der Cron veroeffentlicht sie dann automatisch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import Anthropic from '@anthropic-ai/sdk';
import { generateCaption, generateImage } from '@/lib/meta/ai-content';

interface GenerateRequest {
  days?: number;           // wieviele Tage im voraus (default 30)
  posts_per_week?: number; // wieviele Posts pro Woche (default 3)
  start_date?: string;     // YYYY-MM-DD (default: morgen)
  post_hour?: number;      // Uhrzeit (default 10)
  platforms?: string[];    // ['facebook', 'instagram']
  with_images?: boolean;   // DALL-E fuer jeden Post (dauert ~15s/Post)
}

interface PostIdea {
  topic: string;
  angle: string;
  category: 'produkt' | 'tipp' | 'inspiration' | 'aktion' | 'behind_the_scenes';
  keywords: string[];
}

async function getAnthropicKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').single();
  if (!data?.value) return null;
  try {
    const s = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return s?.anthropic_api_key ?? null;
  } catch {
    return null;
  }
}

async function generateTopicList(apiKey: string, count: number): Promise<PostIdea[]> {
  const client = new Anthropic({ apiKey });
  const prompt = `Du bist Social-Media-Stratege fuer cam2rent.de (Action-Cam-Verleih: GoPro, DJI, Insta360).
Generiere exakt ${count} UNTERSCHIEDLICHE Post-Ideen fuer Instagram + Facebook, die Kunden zum Mieten animieren.

Verteile die Ideen ausgewogen auf diese Kategorien:
- produkt: Kamera- oder Set-Spotlight (z.B. "GoPro Hero 13 — was kann die neue?")
- tipp: Nutzer-Tipps (z.B. "5 Fehler beim Filmen auf dem Berg", "So schuetzt du deine Action-Cam im Wasser")
- inspiration: Anwendungsfaelle (z.B. "Die perfekte Ski-Aufnahme", "360 Grad auf dem Trail")
- aktion: Verleih-Tipps (z.B. "Mieten statt kaufen — warum das clever ist", "Wochenend-Trips mit gemieteter Kamera")
- behind_the_scenes: Einblicke (z.B. "Wie wir jede Kamera reinigen und pruefen")

Antworte AUSSCHLIESSLICH als JSON-Array, kein Markdown, keine Kommentare:
[
  {"topic": "Kurzer Titel max 60 Zeichen", "angle": "Was genau gesagt wird (1-2 Saetze)", "category": "produkt|tipp|inspiration|aktion|behind_the_scenes", "keywords": ["tag1","tag2","tag3"]},
  ...
]`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content.find((c) => c.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Leere Antwort von Claude');

  let raw = text.text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();

  const ideas = JSON.parse(raw) as PostIdea[];
  if (!Array.isArray(ideas)) throw new Error('Antwort ist kein Array');
  return ideas;
}

function spreadDates(count: number, startDate: Date, postsPerWeek: number, hour: number): Date[] {
  // Verteile Posts ueber die gewuenschte Dauer. Posts pro Woche bestimmt Intervall.
  const intervalDays = 7 / postsPerWeek;
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.round(i * intervalDays));
    d.setHours(hour, 0, 0, 0);
    dates.push(d);
  }
  return dates;
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as GenerateRequest;
  const days = Math.min(Math.max(body.days ?? 30, 1), 90);
  const postsPerWeek = Math.min(Math.max(body.posts_per_week ?? 3, 1), 7);
  const postHour = Math.min(Math.max(body.post_hour ?? 10, 6), 22);
  const startDate = body.start_date ? new Date(body.start_date) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const platforms = body.platforms ?? ['facebook', 'instagram'];
  const withImages = body.with_images ?? false;

  const totalPosts = Math.ceil((days / 7) * postsPerWeek);

  const apiKey = await getAnthropicKey();
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API Key nicht konfiguriert' }, { status: 400 });

  // 1) Claude generiert Themen-Liste
  let ideas: PostIdea[];
  try {
    ideas = await generateTopicList(apiKey, totalPosts);
  } catch (err) {
    return NextResponse.json({ error: 'Themen-Generierung fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }

  // 2) Fuer jedes Thema: Caption + optional Bild
  const supabase = createServiceClient();
  const dates = spreadDates(ideas.length, startDate, postsPerWeek, postHour);

  const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('is_active', true);
  const fbAccount = accounts?.find((a) => a.platform === 'facebook');
  const igAccount = accounts?.find((a) => a.platform === 'instagram');

  const results: Array<{ ok: boolean; topic: string; id?: string; error?: string }> = [];

  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    const date = dates[i];

    try {
      const captionPrompt = `Schreibe einen ansprechenden Social-Media-Post zu diesem Thema:
Thema: ${idea.topic}
Kernaussage: ${idea.angle}
Stil: locker, einladend, mit 2-3 Emoji, max 500 Zeichen.
Am Ende ein klarer CTA (z.B. "Jetzt auf cam2rent.de mieten").`;

      const generated = await generateCaption(captionPrompt, {}, {
        maxLength: 500,
        defaultHashtags: idea.keywords.map((k) => k.startsWith('#') ? k : `#${k}`).concat(['#cam2rent', '#kameramieten']),
      });

      let image_url: string | undefined;
      if (withImages) {
        try {
          const imgPrompt = `Photorealistic social media image about: ${idea.topic}. ${idea.angle}. Professional, clean, outdoor/action sports context. No text overlays.`;
          image_url = await generateImage(imgPrompt);
        } catch (e) {
          console.warn('[plan] Bildgenerierung failed:', e);
        }
      }

      const { data: post, error } = await supabase.from('social_posts').insert({
        caption: generated.caption,
        hashtags: generated.hashtags,
        media_urls: image_url ? [image_url] : [],
        media_type: image_url ? 'image' : 'text',
        platforms,
        fb_account_id: platforms.includes('facebook') ? fbAccount?.id ?? null : null,
        ig_account_id: platforms.includes('instagram') ? igAccount?.id ?? null : null,
        status: 'scheduled',
        scheduled_at: date.toISOString(),
        source_type: 'auto_schedule',
        ai_generated: true,
        ai_model: 'claude-sonnet-4-6',
        ai_prompt: captionPrompt,
        created_by: 'system',
      }).select('id').single();

      if (error) throw error;
      results.push({ ok: true, topic: idea.topic, id: post.id });
    } catch (err) {
      results.push({ ok: false, topic: idea.topic, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    total: ideas.length,
    ok: okCount,
    failed: ideas.length - okCount,
    results,
  });
}
