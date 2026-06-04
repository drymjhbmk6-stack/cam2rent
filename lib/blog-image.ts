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

/**
 * Baut mehrere Such-Kandidaten (vom spezifischsten zum generischsten).
 * Keywords zuerst — die liefern bei Unsplash zuverlaessig Treffer, der Titel
 * mit Fuellwoertern (z.B. "Slow Motion bei Actioncams") dagegen oft nicht.
 */
function buildQueryCandidates(title?: string, keywords?: string, fallbackQuery?: string): string[] {
  const cands: string[] = [];
  const add = (s?: string) => {
    const t = (s ?? '').trim();
    if (t) cands.push(t);
  };

  if (fallbackQuery) add(fallbackQuery);

  if (keywords && keywords.trim()) {
    const parts = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (parts[0]) add(parts[0]); // erstes Keyword (z.B. "slow-motion")
    if (parts.length > 1) add(parts.slice(0, 2).join(' '));
  }

  if (title && title.trim()) {
    const words = title
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (words[0]) add(words.slice(0, 2).join(' '));
  }

  add('action camera'); // letzter generischer Rettungsanker

  // Dedupe (case-insensitiv), Reihenfolge erhalten.
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/** OpenAI (gpt-image-1) → Storage-URL. Wirft bei Fehler. */
async function generateOpenAIImage(openaiKey: string, prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey: openaiKey });
  // gpt-image-1 ist das aktuelle Modell; 'dall-e-3' existiert fuer neuere
  // Accounts nicht mehr ("400 The model 'dall-e-3' does not exist").
  // gpt-image-1 liefert immer b64_json (keine URL), kein 'style'-Param.
  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt,
    n: 1,
    size: '1536x1024', // Landscape für Blog-Header
    quality: 'high',
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('Kein Bild generiert.');
  const buffer = Buffer.from(b64, 'base64');
  if (!isAllowedImage(buffer, ['jpeg', 'png', 'webp'])) {
    throw new Error('OpenAI lieferte kein gueltiges Bildformat.');
  }
  return uploadToBlogImages(buffer, 'blog-ai');
}

/** Eine Unsplash-Suche fuer GENAU einen Begriff. null = kein Treffer. */
async function unsplashSearchOne(
  unsplashKey: string,
  query: string,
  orientation: 'landscape' | '',
): Promise<{ url: string; alt: string } | null> {
  const orientationParam = orientation ? `&orientation=${orientation}` : '';
  const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    query,
  )}&page=1&per_page=1${orientationParam}`;
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
  return { url, alt: first.alt_description || query };
}

/**
 * Robuste Unsplash-Suche: probiert mehrere Begriffe (Keywords zuerst), erst
 * Querformat, dann ohne Orientierungs-Filter. Liefert das erste Treffer-Bild.
 */
async function unsplashFallback(
  unsplashKey: string | null,
  candidates: string[],
): Promise<{ url: string; alt: string } | null> {
  if (!unsplashKey) return null;
  // 1. Runde: Querformat bevorzugt (passt zum Blog-Header).
  for (const q of candidates) {
    const hit = await unsplashSearchOne(unsplashKey, q, 'landscape');
    if (hit) return hit;
  }
  // 2. Runde: ohne Orientierungs-Filter (mehr Treffer).
  for (const q of candidates) {
    const hit = await unsplashSearchOne(unsplashKey, q, '');
    if (hit) return hit;
  }
  return null;
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

  // Automatischer Unsplash-Fallback — mehrere Suchbegriffe, robust.
  const candidates = buildQueryCandidates(title, keywords, fallbackQuery);
  const fb = await unsplashFallback(unsplashKey, candidates);
  if (fb) {
    return {
      url: fb.url,
      alt: fb.alt || title || candidates[0] || 'Titelbild',
      source: 'unsplash',
      warning: openaiError
        ? `KI-Bild fehlgeschlagen (${openaiError}) — automatisch Unsplash-Bild genutzt.`
        : 'Unsplash-Bild genutzt.',
    };
  }

  throw new Error(
    !unsplashKey
      ? `Bild-Generierung fehlgeschlagen: ${openaiError ?? 'kein KI-Bild'}. Kein Unsplash-Key hinterlegt — bitte unter Blog → Einstellungen eintragen.`
      : `Bild-Generierung fehlgeschlagen: ${openaiError ?? 'kein KI-Bild'}. Unsplash lieferte zu „${candidates.join('", "')}" kein Bild.`,
  );
}
