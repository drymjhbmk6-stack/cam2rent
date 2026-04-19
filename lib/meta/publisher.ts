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
  fb_image_position?: string | null;
  ig_image_position?: string | null;
}

/**
 * Parsed "50% 30%" → { x: 0.5, y: 0.3 } (0..1 Focal-Point).
 * Fallback: center.
 */
function parseFocalPoint(value: string | null | undefined): { x: number; y: number } {
  if (!value) return { x: 0.5, y: 0.5 };
  const m = value.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return { x: 0.5, y: 0.5 };
  return {
    x: Math.max(0, Math.min(1, parseFloat(m[1]) / 100)),
    y: Math.max(0, Math.min(1, parseFloat(m[2]) / 100)),
  };
}

/**
 * Croppt ein Bild auf das Zielseitenverhaeltnis rund um den Focal-Point und
 * laedt das Ergebnis in den blog-images-Bucket hoch. Gibt die public URL
 * zurueck. Wenn sharp nicht verfuegbar ist oder Position=center, gibt die
 * Original-URL zurueck (kein Crop noetig).
 */
async function cropImageForPlatform(
  sourceUrl: string,
  targetAspect: number, // width / height
  position: string | null | undefined
): Promise<string> {
  // Center + default Aspect → kein Crop noetig
  if (!position || position === 'center center' || position === '50% 50%') {
    return sourceUrl;
  }

  try {
    const { default: sharp } = await import('sharp');
    const imgRes = await fetch(sourceUrl);
    if (!imgRes.ok) return sourceUrl;
    const inputBuffer = Buffer.from(await imgRes.arrayBuffer());

    const img = sharp(inputBuffer);
    const meta = await img.metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    if (!srcW || !srcH) return sourceUrl;

    const srcAspect = srcW / srcH;
    let cropW = srcW;
    let cropH = srcH;
    if (srcAspect > targetAspect) {
      // Quelle breiter als Ziel → horizontal zuschneiden
      cropW = Math.round(srcH * targetAspect);
    } else if (srcAspect < targetAspect) {
      // Quelle hoeher als Ziel → vertikal zuschneiden
      cropH = Math.round(srcW / targetAspect);
    } else {
      return sourceUrl; // Passt schon
    }

    const focal = parseFocalPoint(position);
    const maxLeft = srcW - cropW;
    const maxTop = srcH - cropH;
    const left = Math.round(Math.max(0, Math.min(maxLeft, focal.x * srcW - cropW / 2)));
    const top = Math.round(Math.max(0, Math.min(maxTop, focal.y * srcH - cropH / 2)));

    const outputBuffer = await img.extract({ left, top, width: cropW, height: cropH }).jpeg({ quality: 90 }).toBuffer();

    const supabase = createServiceClient();
    const filename = `social-crop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('blog-images')
      .upload(filename, outputBuffer, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      console.warn('[publisher] Crop-Upload fehlgeschlagen:', uploadError.message);
      return sourceUrl;
    }
    const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(filename);
    return urlData?.publicUrl ?? sourceUrl;
  } catch (err) {
    console.warn('[publisher] Crop fehlgeschlagen, nutze Original:', err);
    return sourceUrl;
  }
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
        // FB-Feed zeigt oft 4:5 portrait — crop auf 4:5 wenn Position != center
        const fbUrl = await cropImageForPlatform(typedPost.media_urls[0], 4 / 5, typedPost.fb_image_position);
        const res = await publishFacebookPhotoPost(acc.external_id, acc.access_token, fbUrl, caption);
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
        // IG-Feed erzwingt 1:1 — crop mit gewaehlter Position damit der
        // Ausschnitt der Vorschau entspricht
        const igUrl = await cropImageForPlatform(typedPost.media_urls[0], 1, typedPost.ig_image_position);
        const res = await publishInstagramImage(acc.external_id, acc.access_token, igUrl, caption);
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
