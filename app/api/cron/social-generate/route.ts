/**
 * Cron: Social-Post generieren (analog blog-generate)
 *
 * Laeuft stuendlich. Arbeitet den Redaktionsplan ab:
 * 1. Waehlt naechsten offenen Eintrag aus social_editorial_plan
 *    (scheduled_date <= heute + schedule_days_before Tage)
 * 2. Beruecksichtigt Wochentag + Zeitfenster aus social_settings
 * 3. Re-Entry-Schutz via admin_settings.social_generation_status
 * 4. Generiert Caption + Bild via KI (mit 3-stufigem Faktencheck)
 * 5. Legt Post als 'scheduled' an, verknuepft mit plan-entry
 * 6. Updated plan-entry auf status='generated'
 *
 * Crontab: 0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/social-generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import Anthropic from '@anthropic-ai/sdk';
import { generateCaption, generateSocialImage } from '@/lib/meta/ai-content';

const STALE_LOCK_MINUTES = 10;

interface SocialSettings {
  auto_generate?: boolean;
  auto_generate_mode?: 'semi' | 'voll';
  schedule_days_before?: number;
  weekdays?: string[]; // ['mo','di',...]
  time_from?: string;  // '09:00'
  time_to?: string;    // '18:00'
  interval?: 'daily' | 'weekly';
  fact_check_enabled?: boolean;
}

async function getSocialSettings(): Promise<SocialSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'social_settings').maybeSingle();
  if (!data?.value) return {};
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as SocialSettings);
  } catch { return {}; }
}

async function getAnthropicKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').single();
  if (!data?.value) return null;
  try {
    const s = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return s?.anthropic_api_key ?? null;
  } catch { return null; }
}

async function setGenerationStatus(value: Record<string, unknown>): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('admin_settings').upsert({
    key: 'social_generation_status',
    value,
    updated_at: new Date().toISOString(),
  });
}

async function factCheck(apiKey: string, caption: string): Promise<string> {
  // 3-stufiger Faktencheck fuer Social-Posts (kuerzer als Blog)
  const client = new Anthropic({ apiKey });

  const passes = [
    {
      role: 'Brand-Waechter',
      instruction: 'Pruefe ob der Post gegen cam2rent-Regeln verstoesst:\n- "Versicherung/versichert" ist VERBOTEN, ersetzt durch "Haftungsschutz/abgesichert"\n- Umlaute muessen korrekt sein (ae oe ue sind VERBOTEN, nur ä ö ü)\n- Keine erfundenen Kamera-Specs/Preise\n- Keine unrealistischen Versprechen\n\nGib den komplett korrigierten Post zurueck. Keine Erklaerungen.',
    },
    {
      role: 'Stil-Pruefer',
      instruction: 'Pruefe den Post auf Stil:\n- KI-typische Floskeln entfernen ("Tauchen wir ein", "Schnapp dir", "In der Welt des...")\n- Uebertriebene Superlative raus ("absolut beste", "revolutionaer")\n- Max 500 Zeichen Haupttext (ohne Hashtags)\n- CTA am Ende muss konkret sein\n\nGib den korrigierten Post zurueck. Keine Erklaerungen.',
    },
  ];

  let current = caption;
  for (const pass of passes) {
    try {
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Du bist ${pass.role} bei cam2rent.de. ${pass.instruction}`,
        messages: [{ role: 'user', content: current }],
      });
      const text = res.content.find((c) => c.type === 'text');
      if (text && text.type === 'text' && text.text.trim().length > 20) {
        current = text.text.trim();
      }
    } catch (err) {
      console.warn('[social-generate] factcheck pass failed:', err);
    }
  }
  return current;
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const settings = await getSocialSettings();
  const mode = settings.auto_generate_mode ?? 'semi';
  const daysBefore = settings.schedule_days_before ?? 2;

  // Auto-Gen deaktiviert?
  if (settings.auto_generate === false) {
    return NextResponse.json({ skipped: 'auto_generate disabled' });
  }

  // Force-Parameter: fuer manuelle Aufrufe, umgeht Zeitfenster-Check
  const force = req.nextUrl.searchParams.get('force') === '1';

  // Wochentag + Zeitfenster pruefen (Europe/Berlin)
  if (!force) {
    const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const currentHour = berlinNow.getHours();
    const dayMap = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
    const todayKey = dayMap[berlinNow.getDay()];

    const weekdays = settings.weekdays ?? ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
    if (!weekdays.includes(todayKey)) {
      return NextResponse.json({ skipped: `heute (${todayKey}) nicht im Plan` });
    }

    const fromHour = settings.time_from ? parseInt(settings.time_from.split(':')[0]) : 9;
    const toHour = settings.time_to ? parseInt(settings.time_to.split(':')[0]) : 18;
    if (currentHour < fromHour || currentHour >= toHour) {
      return NextResponse.json({ skipped: `ausserhalb Zeitfenster ${fromHour}-${toHour}` });
    }
  }

  // Re-Entry-Schutz
  const { data: statusRow } = await supabase.from('admin_settings').select('value').eq('key', 'social_generation_status').maybeSingle();
  if (statusRow?.value) {
    const parsed = typeof statusRow.value === 'string' ? JSON.parse(statusRow.value) : statusRow.value;
    if (parsed?.status === 'generating' && parsed?.started_at) {
      const ageMs = Date.now() - new Date(parsed.started_at).getTime();
      if (ageMs < STALE_LOCK_MINUTES * 60 * 1000) {
        return NextResponse.json({ skipped: `bereits aktiv seit ${Math.floor(ageMs / 1000)}s` });
      }
      // Stale: alte generating-Eintraege aufraeumen
      await supabase.from('social_editorial_plan').update({ status: 'planned' }).eq('status', 'generating');
    }
  }

  // Naechsten offenen Plan-Eintrag finden
  const today = new Date();
  const latest = new Date(today);
  latest.setDate(latest.getDate() + daysBefore);
  const latestDateStr = latest.toISOString().split('T')[0];

  const { data: entry, error: entryError } = await supabase
    .from('social_editorial_plan')
    .select('*')
    .eq('status', 'planned')
    .lte('scheduled_date', latestDateStr)
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 });
  if (!entry) return NextResponse.json({ skipped: 'kein offener Eintrag faellig' });

  // Lock setzen
  await setGenerationStatus({ status: 'generating', started_at: new Date().toISOString(), entry_id: entry.id });
  await supabase.from('social_editorial_plan').update({ status: 'generating' }).eq('id', entry.id);

  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    await setGenerationStatus({ status: 'error', error: 'Anthropic API Key fehlt' });
    await supabase.from('social_editorial_plan').update({ status: 'planned', error_message: 'API Key fehlt' }).eq('id', entry.id);
    return NextResponse.json({ error: 'Anthropic API Key fehlt' }, { status: 400 });
  }

  try {
    // Zeitstempel fuer Scheduling
    const scheduledAt = new Date(`${entry.scheduled_date}T${(entry.scheduled_time || '10:00').slice(0, 5)}:00`).toISOString();

    // Caption-Prompt zusammenbauen
    const captionPrompt = entry.prompt?.trim() || `Schreibe einen Social-Media-Post:
Thema: ${entry.topic}
${entry.angle ? `Kernaussage: ${entry.angle}` : ''}
Keywords: ${(entry.keywords ?? []).join(', ')}
Max 500 Zeichen, klarer CTA am Ende.`;

    const imagePrompt = entry.with_image
      ? `A real photograph about: ${entry.topic}. ${entry.angle ?? ''}. Outdoor/action sports context, natural moment, everyday scene. No text, logos, or watermarks.`
      : undefined;

    // Caption + optional Bild generieren
    const generated = await generateCaption(captionPrompt, {}, {
      maxLength: 500,
      defaultHashtags: (entry.keywords ?? []).map((k: string) => k.startsWith('#') ? k : `#${k}`),
    });

    // 3-stufiger Faktencheck (kann per Setting abgeschaltet werden)
    let finalCaption = generated.caption;
    if (settings.fact_check_enabled !== false) {
      finalCaption = await factCheck(apiKey, generated.caption);
    }

    let image_url: string | undefined;
    if (imagePrompt) {
      try {
        const sourceText = [entry.topic, entry.angle, (entry.keywords ?? []).join(' ')].filter(Boolean).join(' ');
        image_url = await generateSocialImage(imagePrompt, sourceText);
      } catch (e) {
        console.warn('[social-generate] image failed:', e);
      }
    }

    // Accounts
    const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('is_active', true);
    const fbAccount = accounts?.find((a) => a.platform === 'facebook');
    const igAccount = accounts?.find((a) => a.platform === 'instagram');

    const platforms = entry.platforms as string[];

    // Post anlegen
    // Im Voll-Modus: direkt scheduled mit scheduled_at → Cron social-publish uebernimmt
    // Im Semi-Modus: draft — Admin muss reviewen
    const postStatus = mode === 'voll' ? 'scheduled' : 'draft';

    const { data: post, error: postError } = await supabase.from('social_posts').insert({
      caption: finalCaption,
      hashtags: generated.hashtags,
      media_urls: image_url ? [image_url] : [],
      media_type: image_url ? 'image' : 'text',
      platforms,
      fb_account_id: platforms.includes('facebook') ? fbAccount?.id ?? null : null,
      ig_account_id: platforms.includes('instagram') ? igAccount?.id ?? null : null,
      status: postStatus,
      scheduled_at: postStatus === 'scheduled' ? scheduledAt : null,
      source_type: 'auto_schedule',
      source_id: entry.id,
      template_id: entry.template_id,
      ai_generated: true,
      ai_model: 'claude-sonnet-4-6',
      ai_prompt: captionPrompt,
      created_by: 'system',
    }).select('id').single();

    if (postError || !post) throw postError ?? new Error('Post-Insert fehlgeschlagen');

    // Plan-Eintrag updaten
    await supabase.from('social_editorial_plan').update({
      status: 'generated',
      generated_at: new Date().toISOString(),
      post_id: post.id,
      error_message: null,
    }).eq('id', entry.id);

    // Serien-Part updaten falls vorhanden
    if (entry.series_part_id) {
      await supabase.from('social_series_parts').update({
        used: true,
        used_at: new Date().toISOString(),
        post_id: post.id,
      }).eq('id', entry.series_part_id);
    }

    await setGenerationStatus({ status: 'idle', last_success_at: new Date().toISOString(), last_entry_id: entry.id });
    return NextResponse.json({ generated: true, entry_id: entry.id, post_id: post.id, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setGenerationStatus({ status: 'error', error: msg, last_entry_id: entry.id });
    await supabase.from('social_editorial_plan').update({
      status: 'planned',
      error_message: msg,
    }).eq('id', entry.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = POST;
