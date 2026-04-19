/**
 * KI-Plan-Generator (Background-Job):
 *
 * POST  /api/admin/social/generate-plan  → startet Job, gibt sofort 202 zurueck
 * GET   /api/admin/social/generate-plan  → aktueller Status
 * DELETE /api/admin/social/generate-plan → bricht laufenden Job ab
 *
 * Der Job laeuft im Hintergrund und aktualisiert den Status in
 * admin_settings.social_plan_job nach jedem erstellten Post.
 * User kann die Seite verlassen / wiederkommen — Status bleibt erhalten.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import Anthropic from '@anthropic-ai/sdk';
import { generateCaption, generateImage } from '@/lib/meta/ai-content';

interface GenerateRequest {
  days?: number;
  posts_per_week?: number;
  start_date?: string;
  post_hour?: number;
  platforms?: string[];
  with_images?: boolean;
}

interface PostIdea {
  topic: string;
  angle: string;
  category: 'produkt' | 'tipp' | 'inspiration' | 'aktion' | 'behind_the_scenes';
  keywords: string[];
}

interface JobStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  step?: 'topics' | 'posts';
  total: number;
  completed: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  message?: string;
  error?: string;
  recent?: Array<{ ok: boolean; topic: string; error?: string }>;
}

const JOB_KEY = 'social_plan_job';

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

async function setJobStatus(patch: Partial<JobStatus>): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  const current = (data?.value as JobStatus) ?? { status: 'idle', total: 0, completed: 0, failed: 0 };
  const merged = { ...current, ...patch };
  await supabase.from('admin_settings').upsert({
    key: JOB_KEY,
    value: merged,
    updated_at: new Date().toISOString(),
  });
}

async function getJobStatus(): Promise<JobStatus> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  return (data?.value as JobStatus) ?? { status: 'idle', total: 0, completed: 0, failed: 0 };
}

async function isCancelled(): Promise<boolean> {
  const s = await getJobStatus();
  return s.status === 'cancelled';
}

async function generateTopicList(apiKey: string, count: number): Promise<PostIdea[]> {
  const client = new Anthropic({ apiKey });
  const prompt = `Du bist Social-Media-Stratege fuer cam2rent.de (Action-Cam-Verleih: GoPro, DJI, Insta360).
Generiere exakt ${count} UNTERSCHIEDLICHE Post-Ideen fuer Instagram + Facebook, die Kunden zum Mieten animieren.

Verteile die Ideen ausgewogen auf diese Kategorien:
- produkt: Kamera- oder Set-Spotlight
- tipp: Nutzer-Tipps
- inspiration: Anwendungsfaelle
- aktion: Verleih-Tipps
- behind_the_scenes: Einblicke

Antworte AUSSCHLIESSLICH als JSON-Array:
[{"topic": "Titel max 60 Zeichen", "angle": "Kernaussage 1-2 Saetze", "category": "produkt|tipp|inspiration|aktion|behind_the_scenes", "keywords": ["tag1","tag2","tag3"]}]`;

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

async function runJob(config: Required<GenerateRequest>, apiKey: string): Promise<void> {
  const supabase = createServiceClient();
  const totalPosts = Math.ceil((config.days / 7) * config.posts_per_week);

  try {
    await setJobStatus({
      status: 'running',
      step: 'topics',
      total: totalPosts,
      completed: 0,
      failed: 0,
      message: 'Claude generiert Themen-Ideen…',
    });

    const ideas = await generateTopicList(apiKey, totalPosts);

    if (await isCancelled()) return;

    const startDate = config.start_date ? new Date(config.start_date) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dates = spreadDates(ideas.length, startDate, config.posts_per_week, config.post_hour);

    const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('is_active', true);
    const fbAccount = accounts?.find((a) => a.platform === 'facebook');
    const igAccount = accounts?.find((a) => a.platform === 'instagram');

    await setJobStatus({
      step: 'posts',
      total: ideas.length,
      message: 'Erstelle Posts…',
      recent: [],
    });

    const recent: Array<{ ok: boolean; topic: string; error?: string }> = [];

    for (let i = 0; i < ideas.length; i++) {
      if (await isCancelled()) return;

      const idea = ideas[i];
      const date = dates[i];

      try {
        const captionPrompt = `Schreibe einen ansprechenden Social-Media-Post:
Thema: ${idea.topic}
Kernaussage: ${idea.angle}
Max 500 Zeichen, 2-3 Emoji, klarer CTA am Ende.`;

        const generated = await generateCaption(captionPrompt, {}, {
          maxLength: 500,
          defaultHashtags: idea.keywords.map((k) => k.startsWith('#') ? k : `#${k}`).concat(['#cam2rent', '#kameramieten']),
        });

        let image_url: string | undefined;
        if (config.with_images) {
          try {
            const imgPrompt = `Photorealistic social media image about: ${idea.topic}. ${idea.angle}. Professional, clean, outdoor/action sports context. No text overlays.`;
            image_url = await generateImage(imgPrompt);
          } catch (e) {
            console.warn('[plan] Bild fehlgeschlagen:', e);
          }
        }

        await supabase.from('social_posts').insert({
          caption: generated.caption,
          hashtags: generated.hashtags,
          media_urls: image_url ? [image_url] : [],
          media_type: image_url ? 'image' : 'text',
          platforms: config.platforms,
          fb_account_id: config.platforms.includes('facebook') ? fbAccount?.id ?? null : null,
          ig_account_id: config.platforms.includes('instagram') ? igAccount?.id ?? null : null,
          status: 'scheduled',
          scheduled_at: date.toISOString(),
          source_type: 'auto_schedule',
          ai_generated: true,
          ai_model: 'claude-sonnet-4-6',
          ai_prompt: captionPrompt,
          created_by: 'system',
        });

        recent.unshift({ ok: true, topic: idea.topic });
      } catch (err) {
        recent.unshift({ ok: false, topic: idea.topic, error: err instanceof Error ? err.message : String(err) });
      }

      const okCount = recent.filter((r) => r.ok).length;
      const failCount = recent.filter((r) => !r.ok).length;
      await setJobStatus({
        completed: okCount,
        failed: failCount,
        recent: recent.slice(0, 10),
        message: `${okCount}/${ideas.length} Posts erstellt`,
      });
    }

    await setJobStatus({
      status: 'completed',
      finished_at: new Date().toISOString(),
      message: `${recent.filter((r) => r.ok).length} Posts erfolgreich erstellt${recent.filter((r) => !r.ok).length > 0 ? `, ${recent.filter((r) => !r.ok).length} Fehler` : ''}.`,
    });
  } catch (err) {
    await setJobStatus({
      status: 'error',
      finished_at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      message: 'Generierung fehlgeschlagen',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Laeuft schon ein Job?
  const current = await getJobStatus();
  if (current.status === 'running') {
    return NextResponse.json({ error: 'Es laeuft bereits ein Plan-Job. Bitte warten oder abbrechen.' }, { status: 409 });
  }

  const body = (await req.json()) as GenerateRequest;
  const config: Required<GenerateRequest> = {
    days: Math.min(Math.max(body.days ?? 30, 1), 90),
    posts_per_week: Math.min(Math.max(body.posts_per_week ?? 3, 1), 7),
    start_date: body.start_date ?? '',
    post_hour: Math.min(Math.max(body.post_hour ?? 10, 6), 22),
    platforms: body.platforms ?? ['facebook', 'instagram'],
    with_images: body.with_images ?? false,
  };

  const apiKey = await getAnthropicKey();
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API Key nicht konfiguriert' }, { status: 400 });

  const totalPosts = Math.ceil((config.days / 7) * config.posts_per_week);

  // Status initial setzen — danach Job starten ohne zu awaiten
  await setJobStatus({
    status: 'running',
    step: 'topics',
    total: totalPosts,
    completed: 0,
    failed: 0,
    started_at: new Date().toISOString(),
    finished_at: undefined,
    message: 'Job gestartet…',
    error: undefined,
    recent: [],
  });

  // Fire-and-forget: Job laeuft im Hintergrund
  runJob(config, apiKey).catch(async (err) => {
    console.error('[plan] runJob error:', err);
    await setJobStatus({ status: 'error', error: String(err), finished_at: new Date().toISOString() });
  });

  return NextResponse.json({ started: true, total: totalPosts }, { status: 202 });
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = await getJobStatus();
  return NextResponse.json({ status });
}

export async function DELETE() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const current = await getJobStatus();
  if (current.status !== 'running') {
    return NextResponse.json({ error: 'Kein laufender Job' }, { status: 400 });
  }
  await setJobStatus({
    status: 'cancelled',
    finished_at: new Date().toISOString(),
    message: 'Abgebrochen durch Benutzer',
  });
  return NextResponse.json({ cancelled: true });
}
