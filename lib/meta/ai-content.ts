/**
 * KI-Content-Generierung für Social-Posts:
 *   - Claude (Anthropic) generiert Caption + Hashtag-Vorschläge
 *   - DALL-E 3 generiert optional ein Bild
 *
 * API-Keys werden aus admin_settings.blog_settings geholt (derselbe Key-Store
 * wie beim Blog-System, damit nichts doppelt konfiguriert werden muss).
 */

import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { toFile } from 'openai';
import { seasonPromptBlock } from '@/lib/meta/season';
import { resolveProductForPost, modernCameraHint, type ProductImageMatch } from '@/lib/meta/product-image-resolver';

async function getApiKeys(): Promise<{ anthropic?: string; openai?: string }> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').single();
  if (!data?.value) return {};
  try {
    const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return { anthropic: settings?.anthropic_api_key, openai: settings?.openai_api_key };
  } catch {
    return {};
  }
}

interface SocialSettings {
  default_tone?: string;
  ki_context?: string;
  default_hashtags?: string[];
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

async function getShopContext(): Promise<string> {
  // Lädt Shop-Produkte für KI-Kontext (wie beim Blog-Generator)
  const supabase = createServiceClient();
  const { data: productConfig } = await supabase.from('admin_config').select('value').eq('key', 'products').single();
  if (!productConfig?.value || typeof productConfig.value !== 'object') return '';
  const products = productConfig.value as Record<string, { name: string; brand: string; slug: string }>;
  const list = Object.values(products).slice(0, 20).map((p) => `- ${p.brand} ${p.name} (https://cam2rent.de/kameras/${p.slug})`);
  return list.join('\n');
}

export interface GeneratedCaption {
  caption: string;
  hashtags: string[];
}

/**
 * Generiert Caption + Hashtags aus einem Prompt-Template + Kontext-Variablen.
 *
 * Das Template kann Platzhalter wie {title}, {product_name} enthalten —
 * diese werden vorher ersetzt (simple String-Replace).
 */
export async function generateCaption(
  promptTemplate: string,
  variables: Record<string, string | number | undefined> = {},
  options: { maxLength?: number; defaultHashtags?: string[]; postDate?: Date } = {}
): Promise<GeneratedCaption> {
  const { anthropic: apiKey } = await getApiKeys();
  if (!apiKey) {
    throw new Error('Anthropic API Key nicht konfiguriert (Blog → Einstellungen)');
  }

  // Platzhalter ersetzen
  let filledPrompt = promptTemplate;
  for (const [key, value] of Object.entries(variables)) {
    filledPrompt = filledPrompt.replaceAll(`{${key}}`, String(value ?? ''));
  }

  const maxLength = options.maxLength ?? 500;

  // Social-Settings + Shop-Kontext laden (sichtbar im Admin unter /admin/social/einstellungen)
  const [socialSettings, shopContext] = await Promise.all([getSocialSettings(), getShopContext()]);
  const toneInstruction = socialSettings.default_tone
    ? `Ton: ${socialSettings.default_tone}`
    : 'Ton: locker, einladend, mit 2-4 Emojis';
  const extraContext = socialSettings.ki_context?.trim() ? `\n\nZusatz-Kontext:\n${socialSettings.ki_context.trim()}` : '';
  const productContext = shopContext ? `\n\nAktuelle Kameras im Shop:\n${shopContext}` : '';
  const seasonContext = `\n\n${seasonPromptBlock(options.postDate)}`;

  const systemPrompt = `Du bist ein Social-Media-Redakteur für cam2rent.de, einen deutschen Action-Cam-Verleih (GoPro, DJI, Insta360).
Schreibe Instagram-/Facebook-Posts auf Deutsch. Ziele:
- ${toneInstruction}
- Maximal ${maxLength} Zeichen im Haupttext
- KEINE Hashtags im Text selbst — die kommen separat
- NIEMALS "Versicherung" oder "versichert" — immer "Haftungsschutz" oder "abgesichert"
- Umlaute korrekt: ä ö ü (nicht ae oe ue)
- Am Ende ein klarer CTA (z.B. "Jetzt auf cam2rent.de mieten", "Link in der Bio")${seasonContext}${extraContext}${productContext}

Antworte ausschließlich im folgenden JSON-Format, ohne Markdown-Codefences:
{"caption": "...", "hashtags": ["#tag1", "#tag2"]}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: filledPrompt }],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Leere KI-Antwort');
  }

  // JSON extrahieren (auch falls doch Codefences drumherum sind)
  let raw = textBlock.text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  let parsed: GeneratedCaption;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: Ganze Antwort als Caption, Default-Hashtags
    return { caption: textBlock.text.trim(), hashtags: options.defaultHashtags ?? [] };
  }

  // Hashtags normalisieren
  const hashtags = (parsed.hashtags ?? [])
    .map((h) => (typeof h === 'string' ? (h.startsWith('#') ? h : `#${h}`) : ''))
    .filter(Boolean);

  // Mit Default-Hashtags mergen (unique) — Caller + Social-Settings
  const globalDefaults = socialSettings.default_hashtags ?? [];
  const merged = Array.from(new Set([...hashtags, ...(options.defaultHashtags ?? []), ...globalDefaults]));

  return { caption: parsed.caption ?? textBlock.text.trim(), hashtags: merged };
}

/**
 * Verstärkt einen Prompt mit Foto-Realismus-Anweisungen, damit die Bilder
 * weniger nach KI/CGI aussehen. DALL-E 3 hat von sich aus einen "KI-Look";
 * diese Tricks helfen gegen Symmetrie-Perfektion, glossy surfaces, uncanny
 * lighting und Cartoon-artige Darstellung.
 */
function enhanceForPhotoRealism(prompt: string, opts: { addModernCameraHint?: boolean } = {}): string {
  // Falls der User selbst schon einen Stil vorgibt (artistic, illustration,
  // watercolor, etc.), nicht überschreiben.
  const explicitStyle = /\b(illustration|drawing|painting|watercolor|cartoon|anime|digital art|3d render|cgi|sketch)\b/i.test(prompt);
  if (explicitStyle) return prompt;

  const photoBooster = [
    'Shot on iPhone 15 Pro, natural lighting, unposed candid moment',
    'amateur photography style, slight lens imperfections',
    'authentic, real-world scene, documentary style',
    'NOT digital art, NOT 3D render, NOT illustration, NOT CGI',
    'realistic skin textures, natural skin tones, no plastic look',
    'natural composition, asymmetric framing, real photograph',
  ].join('. ');

  const cameraGuard = opts.addModernCameraHint ? ` ${modernCameraHint()}` : '';
  return `${prompt.trim()}. ${photoBooster}. High resolution 35mm photography, sharp focus, realistic depth of field.${cameraGuard}`;
}

async function uploadToSocialStorage(buffer: Buffer): Promise<string> {
  const filename = `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images') // dasselbe Bucket wie Blog (vereinfacht Setup)
    .upload(filename, buffer, { contentType: 'image/png', upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(filename);
  return urlData.publicUrl;
}

async function fetchAsFile(url: string, idx: number): Promise<Awaited<ReturnType<typeof toFile>>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Referenzbild ${url} konnte nicht geladen werden (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  // Extension aus URL ableiten — gpt-image-1 akzeptiert png/jpeg/webp
  const match = url.match(/\.(png|jpe?g|webp)(\?|$)/i);
  const ext = (match?.[1] ?? 'png').toLowerCase().replace('jpg', 'jpeg');
  const mime = `image/${ext}`;
  return toFile(buf, `ref-${idx}.${ext === 'jpeg' ? 'jpg' : ext}`, { type: mime });
}

/**
 * Generiert ein Post-Bild mit einem echten Produktbild als Referenz
 * (gpt-image-1 edit-Endpoint). Die KI kopiert die exakte Kamera aus der
 * Vorlage in die neue Szene — keine erfundenen Retro-Modelle mehr.
 * Gibt die oeffentliche URL zurueck.
 */
export async function generateImageWithProductReference(
  scenePrompt: string,
  product: ProductImageMatch,
  options: { size?: '1024x1024' | '1536x1024' | '1024x1536' } = {}
): Promise<string> {
  const { openai: apiKey } = await getApiKeys();
  if (!apiKey) throw new Error('OpenAI API Key nicht konfiguriert (Blog → Einstellungen)');

  const refFiles = await Promise.all(product.imageUrls.map((u, i) => fetchAsFile(u, i)));

  const fullPrompt = [
    `Create a photorealistic outdoor/action-sports scene: ${scenePrompt.trim()}.`,
    `The scene MUST prominently feature the exact action camera shown in the reference image(s) — a ${product.brand} ${product.productName}.`,
    'Preserve the camera design, proportions, color, lens placement and branding from the reference. Do not modify the camera shape.',
    'Do NOT add any text, logos or watermarks to the image. No UI overlays.',
    'Photojournalism style, natural light, shallow depth of field, shot on full-frame 35mm.',
  ].join(' ');

  const client = new OpenAI({ apiKey });
  // gpt-image-1 edit: image kann ein File oder File[] sein
  const response = await client.images.edit({
    model: 'gpt-image-1',
    image: refFiles.length === 1 ? refFiles[0] : refFiles,
    prompt: fullPrompt,
    size: options.size ?? '1024x1024',
    quality: 'high',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 hat kein Bild geliefert');
  const buffer = Buffer.from(b64, 'base64');
  return uploadToSocialStorage(buffer);
}

/**
 * Smart-Wrapper: Versucht erst ein passendes Produkt im Text zu finden und
 * nutzt dann gpt-image-1 mit Produktbild als Referenz. Faellt auf DALL-E 3
 * zurueck (inkl. Modern-Camera-Hinweis), wenn kein Produkt gematcht werden
 * kann oder gpt-image-1 fehlschlaegt.
 *
 * `sourceText` = topic + angle + keywords (zum Matchen).
 * `scenePrompt` = die reine Szenenbeschreibung fuer die KI.
 */
export async function generateSocialImage(
  scenePrompt: string,
  sourceText: string,
  options: { size?: '1024x1024' | '1792x1024' | '1024x1792' } = {}
): Promise<string> {
  // Schritt 1: Passendes Produkt suchen
  let match: ProductImageMatch | null = null;
  try {
    match = await resolveProductForPost(sourceText);
  } catch (err) {
    console.warn('[social-image] Produkt-Match fehlgeschlagen:', err);
  }

  // Schritt 2: Wenn Match → gpt-image-1 mit Referenz
  if (match) {
    try {
      const sizeRef = options.size === '1792x1024' ? '1536x1024' : options.size === '1024x1792' ? '1024x1536' : '1024x1024';
      return await generateImageWithProductReference(scenePrompt, match, { size: sizeRef });
    } catch (err) {
      console.warn('[social-image] gpt-image-1 fehlgeschlagen, fallback auf DALL-E:', err);
    }
  }

  // Schritt 3: Fallback auf DALL-E 3 mit Modern-Camera-Hint
  return generateImage(scenePrompt, { size: options.size, addModernCameraHint: true });
}

/**
 * Generiert ein Post-Bild via DALL-E 3 und speichert es in Supabase Storage.
 * Gibt die öffentliche URL zurück.
 */
export async function generateImage(
  prompt: string,
  options: { size?: '1024x1024' | '1792x1024' | '1024x1792'; style?: 'natural' | 'vivid'; skipPhotoBooster?: boolean; addModernCameraHint?: boolean } = {}
): Promise<string> {
  const { openai: apiKey } = await getApiKeys();
  if (!apiKey) {
    throw new Error('OpenAI API Key nicht konfiguriert (Blog → Einstellungen)');
  }

  const finalPrompt = options.skipPhotoBooster
    ? prompt
    : enhanceForPhotoRealism(prompt, { addModernCameraHint: options.addModernCameraHint });

  const client = new OpenAI({ apiKey });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: finalPrompt,
    n: 1,
    size: options.size ?? '1024x1024', // 1:1 für IG-Feed
    quality: 'hd',
    style: options.style ?? 'natural',
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error('Kein Bild generiert');

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error('Generiertes Bild konnte nicht heruntergeladen werden');
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  return uploadToSocialStorage(buffer);
}

/**
 * Komfort-Wrapper: Aus einem Template einen kompletten Post-Entwurf erstellen.
 * Falls das Template einen image_prompt hat, wird auch ein Bild generiert.
 */
export interface TemplateGenerationInput {
  caption_prompt: string;
  image_prompt?: string | null;
  default_hashtags?: string[];
  variables?: Record<string, string | number | undefined>;
  postDate?: Date;
}

export interface TemplateGenerationResult {
  caption: string;
  hashtags: string[];
  image_url?: string;
}

export async function generateFromTemplate(input: TemplateGenerationInput): Promise<TemplateGenerationResult> {
  const { caption, hashtags } = await generateCaption(input.caption_prompt, input.variables ?? {}, {
    defaultHashtags: input.default_hashtags,
    postDate: input.postDate,
  });

  let image_url: string | undefined;
  if (input.image_prompt && input.image_prompt.trim().length > 0) {
    let imagePrompt = input.image_prompt;
    for (const [key, value] of Object.entries(input.variables ?? {})) {
      imagePrompt = imagePrompt.replaceAll(`{${key}}`, String(value ?? ''));
    }
    // Source-Text fuer Produkt-Matching: Template-Variablen + Caption-Ergebnis
    const sourceText = [
      ...Object.values(input.variables ?? {}).map((v) => String(v ?? '')),
      caption,
    ].join(' ');
    try {
      image_url = await generateSocialImage(imagePrompt, sourceText);
    } catch (err) {
      // Bild ist optional — Fehler nicht hart durchreichen
      console.warn('[social] Bildgenerierung fehlgeschlagen:', err);
    }
  }

  return { caption, hashtags, image_url };
}
