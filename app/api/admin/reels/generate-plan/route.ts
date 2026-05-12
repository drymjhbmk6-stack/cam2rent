/**
 * KI-Reel-Plan-Generator (Background-Job):
 *
 * POST   /api/admin/reels/generate-plan → startet Job, gibt sofort 202 zurück
 * GET    /api/admin/reels/generate-plan → aktueller Status
 * DELETE /api/admin/reels/generate-plan → bricht ab / setzt zurück
 *
 * Legt Einträge in social_reel_plan an (Status: 'planned').
 * Der reels-generate-Cron übernimmt die Generierung.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import Anthropic from '@anthropic-ai/sdk';
import { seasonPromptBlock, isTopicOutOfSeason } from '@/lib/meta/season';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface GenerateRequest {
  days?: number;
  reels_per_week?: number;
  start_date?: string;
  reel_hour?: number;
  platforms?: string[];
  template_id?: string | null;
}

interface JobStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  message?: string;
  error?: string;
  recent?: Array<{ ok: boolean; topic: string; error?: string }>;
}

const JOB_KEY = 'reels_plan_job';

async function getAnthropicKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').single();
  if (!data?.value) return null;
  try {
    const s = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return s?.anthropic_api_key ?? null;
  } catch { return null; }
}

async function setJobStatus(patch: Partial<JobStatus>): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  const current = (data?.value as JobStatus) ?? { status: 'idle', total: 0, completed: 0, failed: 0 };
  const merged = { ...current, ...patch };
  await supabase.from('admin_settings').upsert({ key: JOB_KEY, value: merged, updated_at: new Date().toISOString() });
}

function isBerlinWorkday(date: Date): boolean {
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const dow = d.getDay(); // 0=So, 6=Sa
  return dow >= 1 && dow <= 5;
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  return NextResponse.json(data?.value ?? { status: 'idle', total: 0, completed: 0, failed: 0 });
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const reset = url.searchParams.get('reset') === '1';

  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  const current = (data?.value as JobStatus) ?? { status: 'idle', total: 0, completed: 0, failed: 0 };

  if (reset) {
    await supabase.from('admin_settings').upsert({ key: JOB_KEY, value: { status: 'idle', total: 0, completed: 0, failed: 0 }, updated_at: new Date().toISOString() });
    return NextResponse.json({ cancelled: true });
  }

  if (current.status === 'running') {
    await setJobStatus({ status: 'cancelled', finished_at: new Date().toISOString() });
    return NextResponse.json({ cancelled: true });
  }

  await supabase.from('admin_settings').upsert({ key: JOB_KEY, value: { status: 'idle', total: 0, completed: 0, failed: 0 }, updated_at: new Date().toISOString() });
  return NextResponse.json({ cancelled: true });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body: GenerateRequest = await req.json();

  const apiKey = await getAnthropicKey();
  if (!apiKey) return NextResponse.json({ error: 'Kein Anthropic API-Key hinterlegt. Bitte unter Einstellungen → Blog-KI ergänzen.' }, { status: 400 });

  const supabase = createServiceClient();

  // Staleness-Check: Job > 10 Min alt → darf überschrieben werden
  const { data: existingData } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
  const existing = existingData?.value as JobStatus | undefined;
  if (existing?.status === 'running' && existing.started_at) {
    const ageMs = Date.now() - new Date(existing.started_at).getTime();
    if (ageMs < 10 * 60 * 1000) {
      return NextResponse.json({ error: 'Job läuft bereits. Bitte warten oder abbrechen.' }, { status: 409 });
    }
  }

  const days = Math.min(body.days ?? 28, 90);
  const reelsPerWeek = Math.min(body.reels_per_week ?? 2, 7);
  const reelHour = body.reel_hour ?? 10;
  const platforms = body.platforms ?? ['instagram', 'facebook'];
  const templateId = body.template_id ?? null;

  // Gesamtanzahl: days/7 * reels_per_week
  const totalReels = Math.round((days / 7) * reelsPerWeek);

  await setJobStatus({ status: 'running', total: totalReels, completed: 0, failed: 0, started_at: new Date().toISOString(), recent: [] });

  // Fire-and-forget
  runJob({ apiKey, days, reelsPerWeek, reelHour, platforms, templateId, totalReels }).catch(async (err) => {
    await setJobStatus({ status: 'error', error: err instanceof Error ? err.message : String(err), finished_at: new Date().toISOString() });
  });

  return NextResponse.json({ started: true, total: totalReels }, { status: 202 });
}

async function runJob({ apiKey, days, reelsPerWeek, reelHour, platforms, templateId, totalReels }: {
  apiKey: string; days: number; reelsPerWeek: number; reelHour: number;
  platforms: string[]; templateId: string | null; totalReels: number;
}) {
  const supabase = createServiceClient();

  // Vorhandene Themen aus social_reels (letzte 90 Tage) für Deduplizierung
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const { data: existingReels } = await supabase
    .from('social_reels')
    .select('script_json')
    .gte('created_at', cutoff.toISOString())
    .limit(30);
  const existingTopics: string[] = (existingReels ?? [])
    .map((r: { script_json?: { hook?: string; topic?: string } | null }) => r.script_json?.topic ?? r.script_json?.hook ?? '')
    .filter(Boolean);

  // Vorhandene geplante Einträge ebenfalls als bereits verwendet betrachten
  const { data: existingPlan } = await supabase.from('social_reel_plan').select('topic').gte('scheduled_date', new Date().toISOString().split('T')[0]);
  const plannedTopics: string[] = (existingPlan ?? []).map((e: { topic: string }) => e.topic).filter(Boolean);
  const allUsedTopics = [...existingTopics, ...plannedTopics].slice(0, 40);

  const client = new Anthropic({ apiKey });
  const today = new Date();
  const seasonBlock = seasonPromptBlock(today);

  // Themenideen generieren
  const noRepeat = allUsedTopics.length > 0
    ? `\n\nBereits verwendete Themen (NICHT wiederholen):\n${allUsedTopics.slice(0, 20).map(t => `- ${t}`).join('\n')}`
    : '';

  const topicsPrompt = `Du planst ${totalReels} Action-Cam-Verleih-Reels für Instagram und Facebook.
${seasonBlock}

Erstelle ${totalReels} kurze, konkrete Reel-Themenideen für cam2rent (Action-Cam-Verleih in Berlin).
Fokus: Action-Kameras (GoPro, DJI, Insta360), Abenteuer, Sport, Reisen.
Jedes Thema soll sich für ein 15-30-Sekunden-Reel eignen.

Typen: Produkt-Spotlight, Action-Tipp, Before/After, Destination-Clip, FAQ, Saisonbezug.
${noRepeat}

Antworte NUR mit einem JSON-Array. Kein Text davor/danach:
[
  {"topic": "...", "keywords": ["...", "..."]},
  ...
]`;

  let ideas: Array<{ topic: string; keywords: string[] }> = [];
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: topicsPrompt }],
    });
    const text = (resp.content[0] as { text: string }).text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) ideas = JSON.parse(jsonMatch[0]);
  } catch {
    await setJobStatus({ status: 'error', error: 'KI-Themen-Generierung fehlgeschlagen', finished_at: new Date().toISOString() });
    return;
  }

  // Saison-Filter
  ideas = ideas.filter(idea => !isTopicOutOfSeason(idea.topic, today));

  if (ideas.length === 0) {
    await setJobStatus({ status: 'error', error: 'Keine passenden Themen generiert', finished_at: new Date().toISOString() });
    return;
  }

  // Termine verteilen (Wochentage bevorzugt)
  const dates: Date[] = [];
  const cur = new Date(today);
  cur.setDate(cur.getDate() + 1); // ab morgen

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);

  // Wochentag-Slots pro Woche
  while (cur <= endDate && dates.length < totalReels) {
    if (reelsPerWeek >= 7 || isBerlinWorkday(cur)) {
      dates.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
    // Bei reelsPerWeek < 7: pro Woche nur so viele nehmen wie gewünscht
    if (dates.length % reelsPerWeek === 0 && reelsPerWeek < 7) {
      // Springe zum nächsten Montag
      const daysToMon = (8 - cur.getDay()) % 7;
      if (daysToMon > 0) cur.setDate(cur.getDate() + daysToMon);
    }
  }

  // Fallback: einfach jeden N-ten Tag
  if (dates.length < Math.min(ideas.length, totalReels)) {
    const step = Math.max(1, Math.round(7 / reelsPerWeek));
    const fb = new Date(today);
    fb.setDate(fb.getDate() + 1);
    while (dates.length < totalReels && fb <= endDate) {
      if (!dates.some(d => d.toISOString().split('T')[0] === fb.toISOString().split('T')[0])) {
        dates.push(new Date(fb));
      }
      fb.setDate(fb.getDate() + step);
    }
  }

  const recentLog: Array<{ ok: boolean; topic: string; error?: string }> = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < Math.min(ideas.length, dates.length, totalReels); i++) {
    // Job-Abbruch prüfen
    const { data: statusData } = await supabase.from('admin_settings').select('value').eq('key', JOB_KEY).maybeSingle();
    const currentStatus = (statusData?.value as JobStatus)?.status;
    if (currentStatus === 'cancelled') break;

    const idea = ideas[i];
    const date = dates[i];
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = `${String(reelHour).padStart(2, '0')}:00`;

    try {
      await supabase.from('social_reel_plan').insert({
        topic: idea.topic,
        template_id: templateId,
        keywords: idea.keywords ?? [],
        platforms,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        status: 'planned',
      });
      completed++;
      recentLog.unshift({ ok: true, topic: idea.topic });
      if (recentLog.length > 10) recentLog.pop();
      await setJobStatus({ completed, failed, recent: recentLog, message: `${completed}/${totalReels} Einträge angelegt…` });
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      recentLog.unshift({ ok: false, topic: idea.topic, error: errMsg });
      if (recentLog.length > 10) recentLog.pop();
      await setJobStatus({ completed, failed, recent: recentLog });
    }

    // Kurze Pause zwischen Einträgen
    await new Promise(r => setTimeout(r, 200));
  }

  await setJobStatus({
    status: 'completed',
    completed,
    failed,
    recent: recentLog,
    finished_at: new Date().toISOString(),
    message: `${completed} Reels geplant!`,
  });
}
