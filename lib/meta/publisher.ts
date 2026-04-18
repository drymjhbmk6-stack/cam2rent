/**
 * Social-Post-Publisher: Nimmt einen DB-Post, veröffentlicht ihn auf FB + IG
 * und aktualisiert den Status in der DB.
 */

import { createServiceClient } from '@/lib/supabase';
import {
  publishFacebookPhotoPost,
  publishFacebookMultiPhotoPost,
  publishFacebookTextPost,
  publishInstagramImage,
  publishInstagramCarousel,
  MetaApiError,
} from '@/lib/meta/graph-api';

export interface PublishResult {
  success: boolean;
  fb_post_id?: string;
  ig_post_id?: string;
  errors: Array<{ platform: string; message: string }>;
}

interface SocialPost {
  id: string;
  caption: string;
  hashtags: string[];
  media_urls: string[];
  media_type: string;
  link_url?: string | null;
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

function buildFullCaption(post: SocialPost): string {
  const parts = [post.caption.trim()];
  if (post.hashtags.length > 0) {
    parts.push('');
    parts.push(post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  }
  return parts.join('\n').trim();
}

export async function publishPost(postId: string): Promise<PublishResult> {
  const supabase = createServiceClient();
  const errors: Array<{ platform: string; message: string }> = [];
  let fb_post_id: string | undefined;
  let ig_post_id: string | undefined;

  // Post laden
  const { data: post, error: postError } = await supabase.from('social_posts').select('*').eq('id', postId).single();
  if (postError || !post) {
    return { success: false, errors: [{ platform: 'system', message: postError?.message ?? 'Post nicht gefunden' }] };
  }

  const typedPost = post as SocialPost;

  // Status auf "publishing" setzen
  await supabase.from('social_posts').update({ status: 'publishing' }).eq('id', postId);

  const caption = buildFullCaption(typedPost);

  // ── Facebook ──────────────────────────────────────────────────────────
  if (typedPost.platforms.includes('facebook') && typedPost.fb_account_id) {
    try {
      const { data: fbAccount } = await supabase.from('social_accounts').select('*').eq('id', typedPost.fb_account_id).single();
      if (!fbAccount) throw new Error('FB-Account nicht gefunden');
      const acc = fbAccount as SocialAccount;

      if (typedPost.media_urls.length === 0) {
        // Text-Post
        const res = await publishFacebookTextPost(acc.external_id, acc.access_token, caption, typedPost.link_url ?? undefined);
        fb_post_id = res.id;
      } else if (typedPost.media_urls.length === 1) {
        const res = await publishFacebookPhotoPost(acc.external_id, acc.access_token, typedPost.media_urls[0], caption);
        fb_post_id = res.post_id ?? res.id;
      } else {
        const res = await publishFacebookMultiPhotoPost(acc.external_id, acc.access_token, typedPost.media_urls, caption);
        fb_post_id = res.id;
      }

      await supabase.from('social_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', acc.id);
    } catch (err) {
      const msg = err instanceof MetaApiError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err);
      errors.push({ platform: 'facebook', message: msg });
    }
  }

  // ── Instagram ─────────────────────────────────────────────────────────
  if (typedPost.platforms.includes('instagram') && typedPost.ig_account_id) {
    try {
      const { data: igAccount } = await supabase.from('social_accounts').select('*').eq('id', typedPost.ig_account_id).single();
      if (!igAccount) throw new Error('IG-Account nicht gefunden');
      const acc = igAccount as SocialAccount;

      if (typedPost.media_urls.length === 0) {
        throw new Error('Instagram verlangt mindestens ein Bild');
      } else if (typedPost.media_urls.length === 1) {
        const res = await publishInstagramImage(acc.external_id, acc.access_token, typedPost.media_urls[0], caption);
        ig_post_id = res.id;
      } else {
        const res = await publishInstagramCarousel(acc.external_id, acc.access_token, typedPost.media_urls, caption);
        ig_post_id = res.id;
      }

      await supabase.from('social_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', acc.id);
    } catch (err) {
      const msg = err instanceof MetaApiError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err);
      errors.push({ platform: 'instagram', message: msg });
    }
  }

  // ── Status aktualisieren ───────────────────────────────────────────────
  const anySuccess = Boolean(fb_post_id || ig_post_id);
  const allSuccess = errors.length === 0 && anySuccess;
  const status = allSuccess ? 'published' : anySuccess ? 'partial' : 'failed';

  await supabase
    .from('social_posts')
    .update({
      status,
      fb_post_id: fb_post_id ?? null,
      ig_post_id: ig_post_id ?? null,
      published_at: anySuccess ? new Date().toISOString() : null,
      error_message: errors.length > 0 ? errors.map((e) => `${e.platform}: ${e.message}`).join(' | ') : null,
    })
    .eq('id', postId);

  return { success: allSuccess, fb_post_id, ig_post_id, errors };
}
