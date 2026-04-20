/**
 * Auto-Post-Helper: Wird aus anderen Stellen aufgerufen (Blog-Publish,
 * neues Produkt, neues Set, neuer Gutschein) und erstellt automatisch einen
 * Social-Post-Entwurf (oder plant ihn direkt zur nächsten vollen Stunde).
 *
 * Das Verhalten (Entwurf vs. direkt planen) wird in admin_settings.social_settings
 * konfiguriert — Standard: Entwurf (User muss freigeben).
 */

import { createServiceClient } from '@/lib/supabase';
import { generateFromTemplate } from '@/lib/meta/ai-content';
import { createAdminNotification } from '@/lib/admin-notifications';
import { isTestMode } from '@/lib/env-mode';

type TriggerType = 'blog_publish' | 'product_added' | 'set_added' | 'voucher_created';

interface SocialSettings {
  auto_post_mode?: 'draft' | 'scheduled'; // Standard: 'draft'
  auto_post_delay_minutes?: number; // Wenn 'scheduled': wie viele Minuten nach Trigger
  enabled_triggers?: Record<TriggerType, boolean>;
}

async function getSocialSettings(): Promise<SocialSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'social_settings').maybeSingle();
  if (!data?.value) return {};
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as SocialSettings);
  } catch {
    return {};
  }
}

async function getDefaultAccounts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('social_accounts')
    .select('id, platform')
    .eq('is_active', true);
  return {
    fb: data?.find((a) => a.platform === 'facebook')?.id ?? null,
    ig: data?.find((a) => a.platform === 'instagram')?.id ?? null,
  };
}

async function getTemplateFor(trigger: TriggerType) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('social_templates')
    .select('*')
    .eq('trigger_type', trigger)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Erstellt einen Auto-Post-Entwurf aus einem Trigger + Kontext.
 * Non-blocking: Fehler werden geloggt, aber nicht geworfen.
 */
export async function autoPost(
  trigger: TriggerType,
  sourceId: string | null,
  variables: Record<string, string | number | undefined>,
  opts: { link_url?: string } = {}
): Promise<void> {
  try {
    // Im Test-Modus nichts auf Meta posten — waere sonst echte Reichweite.
    if (await isTestMode()) {
      console.info(`[auto-post] Test-Modus aktiv — Trigger "${trigger}" uebersprungen.`);
      return;
    }

    const settings = await getSocialSettings();

    // Trigger explizit deaktiviert?
    if (settings.enabled_triggers?.[trigger] === false) return;

    const template = await getTemplateFor(trigger);
    if (!template) {
      console.info(`[auto-post] Kein Template für Trigger "${trigger}" — Überspringe.`);
      return;
    }

    const accounts = await getDefaultAccounts();
    if (!accounts.fb && !accounts.ig) {
      console.info('[auto-post] Keine verknüpften Social-Accounts — Überspringe.');
      return;
    }

    const generated = await generateFromTemplate({
      caption_prompt: template.caption_prompt,
      image_prompt: template.image_prompt,
      default_hashtags: template.default_hashtags ?? [],
      variables,
    });

    const mode = settings.auto_post_mode ?? 'draft';
    const delayMinutes = settings.auto_post_delay_minutes ?? 30;
    const scheduled_at = mode === 'scheduled' ? new Date(Date.now() + delayMinutes * 60 * 1000).toISOString() : null;
    const status = mode === 'scheduled' ? 'scheduled' : 'draft';

    const platforms: string[] = template.platforms ?? ['facebook', 'instagram'];
    const fb_account_id = platforms.includes('facebook') ? accounts.fb : null;
    const ig_account_id = platforms.includes('instagram') ? accounts.ig : null;

    const supabase = createServiceClient();
    const { data: newPost, error } = await supabase
      .from('social_posts')
      .insert({
        caption: generated.caption,
        hashtags: generated.hashtags,
        media_urls: generated.image_url ? [generated.image_url] : [],
        media_type: generated.image_url ? 'image' : 'text',
        link_url: opts.link_url ?? null,
        platforms,
        fb_account_id,
        ig_account_id,
        status,
        scheduled_at,
        source_type: `auto_${trigger.replace('_publish', '').replace('_added', '').replace('_created', '')}` as string,
        source_id: sourceId,
        template_id: template.id,
        ai_generated: true,
        ai_prompt: template.caption_prompt,
        ai_model: 'claude-sonnet-4-6',
        created_by: 'system',
      })
      .select('id')
      .single();

    if (error) throw error;

    // Admin-Benachrichtigung
    if (newPost) {
      await createAdminNotification(supabase, {
        type: 'new_booking', // TODO: neuen Typ "social_post_ready" ergänzen
        title: mode === 'scheduled' ? 'Social-Post geplant' : 'Social-Post Entwurf bereit',
        message: generated.caption.slice(0, 120),
        link: '/admin/social/posts/' + newPost.id,
      });
    }
  } catch (err) {
    console.error(`[auto-post] Trigger "${trigger}" fehlgeschlagen:`, err);
  }
}
