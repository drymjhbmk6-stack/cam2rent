/**
 * Reel-Publisher — parallel zu lib/meta/publisher.ts, aber nur für Reels.
 *
 * Trennt Reels-Flow sauber von Photo-/Carousel-Flow.
 */

import { createServiceClient } from '@/lib/supabase';
import {
  publishFacebookReel,
  publishInstagramReel,
  getFacebookPermalink,
  getInstagramPermalink,
  MetaApiError,
} from '@/lib/meta/graph-api';
import { isTestMode } from '@/lib/env-mode';

export interface ReelPublishResult {
  success: boolean;
  fb_reel_id?: string;
  ig_reel_id?: string;
  errors: Array<{ platform: string; message: string }>;
}

interface SocialReel {
  id: string;
  caption: string;
  hashtags: string[];
  video_url: string | null;
  platforms: string[];
  fb_account_id?: string | null;
  ig_account_id?: string | null;
}

interface SocialAccount {
  id: string;
  platform: 'facebook' | 'instagram';
  external_id: string;
  access_token: string;
}

function buildCaption(reel: SocialReel): string {
  const parts = [reel.caption.trim()];
  if (reel.hashtags.length > 0) {
    parts.push('');
    parts.push(reel.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  }
  return parts.join('\n').trim();
}

/**
 * Liest reels_settings.publish_in_test_mode — wenn true, wird auch im Test-Modus
 * tatsaechlich auf Meta hochgeladen. Default false (= alter Schutz bleibt aktiv).
 */
async function shouldPublishInTestMode(): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
    if (!data?.value) return false;
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return Boolean(parsed?.publish_in_test_mode);
  } catch {
    return false;
  }
}

export async function publishReel(reelId: string): Promise<ReelPublishResult> {
  const supabase = createServiceClient();
  const errors: Array<{ platform: string; message: string }> = [];
  let fb_reel_id: string | undefined;
  let ig_reel_id: string | undefined;
  let fb_permalink: string | null = null;
  let ig_permalink: string | null = null;
  let fbPageToken: string | undefined;
  let igPageToken: string | undefined;

  // Im Test-Modus: nur ueberspringen, wenn der Admin nicht explizit zugestimmt hat,
  // dass auch Test-Reels echt auf Meta gehen sollen (reels_settings.publish_in_test_mode).
  if (await isTestMode()) {
    const allow = await shouldPublishInTestMode();
    if (!allow) {
      await supabase
        .from('social_reels')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          error_message: 'TEST-Modus: Kein echter Upload zu Meta',
        })
        .eq('id', reelId);
      return { success: true, errors: [{ platform: 'system', message: 'Test-Modus — simulierter Publish' }] };
    }
    // Sonst durchlaufen lassen — echter Publish auch im Test-Modus
  }

  const { data: reel, error: reelError } = await supabase.from('social_reels').select('*').eq('id', reelId).single();
  if (reelError || !reel) {
    return { success: false, errors: [{ platform: 'system', message: reelError?.message ?? 'Reel nicht gefunden' }] };
  }
  const typed = reel as SocialReel;

  if (!typed.video_url) {
    return { success: false, errors: [{ platform: 'system', message: 'Reel hat keine video_url (noch nicht gerendert?)' }] };
  }

  await supabase.from('social_reels').update({ status: 'publishing' }).eq('id', reelId);
  const caption = buildCaption(typed);

  // ── Facebook Reels ────────────────────────────────────────────────────────
  if (typed.platforms.includes('facebook') && typed.fb_account_id) {
    try {
      const { data: acc } = await supabase.from('social_accounts').select('*').eq('id', typed.fb_account_id).single();
      if (!acc) throw new Error('FB-Account nicht gefunden');
      const a = acc as SocialAccount;
      const res = await publishFacebookReel(a.external_id, a.access_token, typed.video_url, caption);
      fb_reel_id = res.id;
      fbPageToken = a.access_token;
      await supabase.from('social_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', a.id);
    } catch (err) {
      const msg = err instanceof MetaApiError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err);
      errors.push({ platform: 'facebook', message: msg });
    }
  }

  // ── Instagram Reels ──────────────────────────────────────────────────────
  if (typed.platforms.includes('instagram') && typed.ig_account_id) {
    try {
      const { data: acc } = await supabase.from('social_accounts').select('*').eq('id', typed.ig_account_id).single();
      if (!acc) throw new Error('IG-Account nicht gefunden');
      const a = acc as SocialAccount;
      const res = await publishInstagramReel(a.external_id, a.access_token, typed.video_url, caption);
      ig_reel_id = res.id;
      igPageToken = a.access_token;
      await supabase.from('social_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', a.id);
    } catch (err) {
      const msg = err instanceof MetaApiError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err);
      errors.push({ platform: 'instagram', message: msg });
    }
  }

  if (fb_reel_id && fbPageToken) fb_permalink = await getFacebookPermalink(fb_reel_id, fbPageToken);
  if (ig_reel_id && igPageToken) ig_permalink = await getInstagramPermalink(ig_reel_id, igPageToken);

  const anySuccess = Boolean(fb_reel_id || ig_reel_id);
  const allSuccess = errors.length === 0 && anySuccess;
  const status = allSuccess ? 'published' : anySuccess ? 'partial' : 'failed';

  await supabase
    .from('social_reels')
    .update({
      status,
      fb_reel_id: fb_reel_id ?? null,
      ig_reel_id: ig_reel_id ?? null,
      fb_permalink,
      ig_permalink,
      published_at: anySuccess ? new Date().toISOString() : null,
      error_message: errors.length > 0 ? errors.map((e) => `${e.platform}: ${e.message}`).join(' | ') : null,
    })
    .eq('id', reelId);

  return { success: allSuccess, fb_reel_id, ig_reel_id, errors };
}
