/**
 * Kern-Logik zur Generierung eines Social-Posts aus einem
 * social_editorial_plan-Eintrag. Wird genutzt von:
 *   - Cron /api/cron/social-generate (stuendlich, mit Scheduler-Check)
 *   - API /api/admin/social/editorial-plan/[id]/generate (manuell, sofort)
 */

import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { generateCaption, generateImage } from '@/lib/meta/ai-content';

export interface GenerateEntryResult {
  success: boolean;
  post_id?: string;
  error?: string;
}

interface SocialSettings {
  auto_generate_mode?: 'semi' | 'voll';
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

async function factCheck(apiKey: string, caption: string): Promise<string> {
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
      console.warn('[generate-entry] factcheck pass failed:', err);
    }
  }
  return current;
}

/**
 * Generiert den Post fuer einen konkreten Plan-Eintrag.
 * Beruecksichtigt Voll/Semi-Modus (Voll -> Post wird scheduled, sonst draft).
 * Setzt den Eintrag-Status auf 'generating' am Anfang und 'generated' am Ende.
 */
export async function generateEntryPost(entryId: string): Promise<GenerateEntryResult> {
  const supabase = createServiceClient();

  const { data: entry, error: entryError } = await supabase
    .from('social_editorial_plan')
    .select('*')
    .eq('id', entryId)
    .single();
  if (entryError || !entry) {
    return { success: false, error: entryError?.message ?? 'Eintrag nicht gefunden' };
  }

  if (entry.status === 'generating') {
    return { success: false, error: 'Wird bereits generiert' };
  }

  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return { success: false, error: 'Anthropic API Key nicht konfiguriert' };
  }

  const settings = await getSocialSettings();
  const mode = settings.auto_generate_mode ?? 'semi';
  const factCheckEnabled = settings.fact_check_enabled !== false;

  // Lock setzen
  await supabase.from('social_editorial_plan').update({ status: 'generating' }).eq('id', entryId);

  try {
    const scheduledAt = new Date(`${entry.scheduled_date}T${(entry.scheduled_time || '10:00').slice(0, 5)}:00`).toISOString();

    const captionPrompt = entry.prompt?.trim() || `Schreibe einen Social-Media-Post:
Thema: ${entry.topic}
${entry.angle ? `Kernaussage: ${entry.angle}` : ''}
Keywords: ${(entry.keywords ?? []).join(', ')}
Max 500 Zeichen, klarer CTA am Ende.`;

    const imagePrompt = entry.with_image
      ? `A real photograph about: ${entry.topic}. ${entry.angle ?? ''}. Outdoor/action sports context, natural moment, everyday scene. No text, logos, or watermarks.`
      : undefined;

    const generated = await generateCaption(captionPrompt, {}, {
      maxLength: 500,
      defaultHashtags: (entry.keywords ?? []).map((k: string) => k.startsWith('#') ? k : `#${k}`),
    });

    let finalCaption = generated.caption;
    if (factCheckEnabled) {
      finalCaption = await factCheck(apiKey, generated.caption);
    }

    let image_url: string | undefined;
    if (imagePrompt) {
      try {
        image_url = await generateImage(imagePrompt);
      } catch (e) {
        console.warn('[generate-entry] image failed:', e);
      }
    }

    const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('is_active', true);
    const fbAccount = accounts?.find((a) => a.platform === 'facebook');
    const igAccount = accounts?.find((a) => a.platform === 'instagram');

    const platforms = entry.platforms as string[];
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

    await supabase.from('social_editorial_plan').update({
      status: 'generated',
      generated_at: new Date().toISOString(),
      post_id: post.id,
      error_message: null,
    }).eq('id', entryId);

    if (entry.series_part_id) {
      await supabase.from('social_series_parts').update({
        used: true,
        used_at: new Date().toISOString(),
        post_id: post.id,
      }).eq('id', entry.series_part_id);
    }

    return { success: true, post_id: post.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('social_editorial_plan').update({
      status: 'planned',
      error_message: msg,
    }).eq('id', entryId);
    return { success: false, error: msg };
  }
}
