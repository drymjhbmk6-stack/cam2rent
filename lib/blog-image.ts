import OpenAI from 'openai';
import { createServiceClient } from '@/lib/supabase';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';

/**
 * Gemeinsame Bildquelle für Blog-Titelbilder.
 * Versucht zuerst OpenAI (DALL-E 3) und faellt bei JEDEM Fehler automatisch
 * auf ein passendes Unsplash-Bild zurueck. Wird vom manuellen Editor
 * (/api/admin/blog/generate-image) UND vom Cron (/api/cron/blog-generate)
 * genutzt.
 *
 * Hinweis: Der frueher gesetzte `style: 'natural'`-Parameter wird von der
 * OpenAI-Image-API inzwischen mit `400 Unknown parameter: 'style'` abgelehnt
 * und ist deshalb entfernt.
 */

export interface BlogImageResult {
  url: string;
  alt: string;
  source: 'openai' | 'unsplash';
  /** Gesetzt, wenn OpenAI fehlschlug und der Unsplash-Fallback griff. */
  warning?: string;
}

function isUnsplashUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return ['images.unsplash.com', 'plus.unsplash.com', 'api.unsplash.com', 'unsplash.com'].includes(
      u.hostname,
    );
  } catch {
    return false;
  }
}

/** Baut aus Titel/Keywords einen kurzen Unsplash-Suchbegriff. */
function deriveQuery(title?: string, keywords?: string, fallbackQuery?: string): string {
  if (fallbackQuery && fallbackQuery.trim()) return fallbackQuery.trim();
  if (keywords && keywords.trim()) {
    const first = keywords.split(',')[0]?.trim();
    if (first) return first;
  }
  if (title && title.trim()) {
    const words = title
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 4);
    if (words.length) return words.join(' ');
  }
  return 'action camera outdoor';
}

async function uploadToBlogImages(buffer: Buffer, prefix: string): Promise<string> {
  const detected = detectImageType(buffer);
  const ext = detected === 'jpeg' ? 'jpg' : (detected ?? 'png');
  const contentType = detected ? `image/${detected}` : 'image/png';
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`);
  const { data } = supabase.storage.from('blog-images').getPublicUrl(filename);
  return data.publicUrl;
}

/** DALL-E 3 → Storage-URL. Wirft bei Fehler. */
async function generateOpenAIImage(openaiKey: string, prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey: openaiKey });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024', // Landscape für Blog-Header
    quality: 'hd',
  });
  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error('Kein Bild generiert.');
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Bild-Download fehlgeschlagen: HTTP ${imageRes.status}`);
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  if (!isAllowedImage(buffer, ['jpeg', 'png', 'webp'])) {
    throw new Error('OpenAI lieferte kein gueltiges Bildformat.');
  }
  return uploadToBlogImages(buffer, 'blog-ai');
}

/** Unsplash-Suche → Storage-URL. Liefert null, wenn nichts gefunden/kein Key. */
async function unsplashFallback(
  unsplashKey: string | null,
  query: string,
  alt?: string,
): Promise<{ url: string; alt: string } | null> {
  if (!unsplashKey) return null;
  const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    query,
  )}&page=1&per_page=1&orientation=landscape`;
  const res = await fetch(searchUrl, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data.results?.[0];
  if (!first) return null;

  // Download-Event tracken (Unsplash-API-Pflicht), Key im Header.
  const dl = first.links?.download_location;
  if (dl && isUnsplashUrl(dl)) {
    fetch(dl, { headers: { Authorization: `Client-ID ${unsplashKey}` } }).catch(() => {});
  }

  const imgUrl: string | undefined = first.urls?.regular || first.urls?.full;
  if (!imgUrl || !isUnsplashUrl(imgUrl)) return null;
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) return null;
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  if (!isAllowedImage(buffer, ['jpeg', 'png', 'webp'])) return null;
  const url = await uploadToBlogImages(buffer, 'blog-unsplash');
  return { url, alt: alt || first.alt_description || query };
}

/**
 * Erzeugt ein Blog-Titelbild: erst OpenAI, dann automatisch Unsplash.
 * Wirft nur, wenn BEIDE Quellen nicht liefern.
 */
export async function generateBlogImageWithFallback(opts: {
  openaiKey: string | null;
  unsplashKey: string | null;
  prompt: string;
  title?: string;
  keywords?: string;
  fallbackQuery?: string;
}): Promise<BlogImageResult> {
  const { openaiKey, unsplashKey, prompt, title, keywords, fallbackQuery } = opts;
  let openaiError: string | null = null;

  if (openaiKey && prompt) {
    try {
      const url = await generateOpenAIImage(openaiKey, prompt);
      return { url, alt: title || 'KI-generiertes Titelbild', source: 'openai' };
    } catch (err) {
      openaiError = err instanceof Error ? err.message : 'Unbekannter Fehler';
    }
  } else if (!openaiKey) {
    openaiError = 'Kein OpenAI-Key konfiguriert';
  }

  // Automatischer Unsplash-Fallback
  const query = deriveQuery(title, keywords, fallbackQuery);
  const fb = await unsplashFallback(unsplashKey, query, title);
  if (fb) {
    return {
      url: fb.url,
      alt: fb.alt,
      source: 'unsplash',
      warning: openaiError
        ? `KI-Bild fehlgeschlagen (${openaiError}) — automatisch Unsplash-Bild genutzt.`
        : 'Unsplash-Bild genutzt.',
    };
  }

  throw new Error(
    openaiError
      ? `Bild-Generierung fehlgeschlagen: ${openaiError}. Unsplash-Fallback lieferte kein Bild (Key gesetzt? Suchbegriff „${query}"?).`
      : 'Keine Bildquelle verfügbar.',
  );
}
