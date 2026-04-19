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
import OpenAI from 'openai';

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
  options: { maxLength?: number; defaultHashtags?: string[] } = {}
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

  const systemPrompt = `Du bist ein Social-Media-Redakteur für cam2rent.de, einen deutschen Action-Cam-Verleih (GoPro, DJI, Insta360).
Schreibe Instagram-/Facebook-Posts auf Deutsch. Ziele:
- ${toneInstruction}
- Maximal ${maxLength} Zeichen im Haupttext
- KEINE Hashtags im Text selbst — die kommen separat
- NIEMALS "Versicherung" oder "versichert" — immer "Haftungsschutz" oder "abgesichert"
- Umlaute korrekt: ä ö ü (nicht ae oe ue)
- Am Ende ein klarer CTA (z.B. "Jetzt auf cam2rent.de mieten", "Link in der Bio")${extraContext}${productContext}

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
function enhanceForPhotoRealism(prompt: string): string {
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

  return `${prompt.trim()}. ${photoBooster}. High resolution 35mm photography, sharp focus, realistic depth of field.`;
}

/**
 * Generiert ein Post-Bild via DALL-E 3 und speichert es in Supabase Storage.
 * Gibt die öffentliche URL zurück.
 */
export async function generateImage(prompt: string, options: { size?: '1024x1024' | '1792x1024' | '1024x1792'; style?: 'natural' | 'vivid'; skipPhotoBooster?: boolean } = {}): Promise<string> {
  const { openai: apiKey } = await getApiKeys();
  if (!apiKey) {
    throw new Error('OpenAI API Key nicht konfiguriert (Blog → Einstellungen)');
  }

  const finalPrompt = options.skipPhotoBooster ? prompt : enhanceForPhotoRealism(prompt);

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

  const filename = `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images') // dasselbe Bucket wie Blog (vereinfacht Setup)
    .upload(filename, buffer, { contentType: 'image/png', upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(filename);
  return urlData.publicUrl;
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
}

export interface TemplateGenerationResult {
  caption: string;
  hashtags: string[];
  image_url?: string;
}

export async function generateFromTemplate(input: TemplateGenerationInput): Promise<TemplateGenerationResult> {
  const { caption, hashtags } = await generateCaption(input.caption_prompt, input.variables ?? {}, {
    defaultHashtags: input.default_hashtags,
  });

  let image_url: string | undefined;
  if (input.image_prompt && input.image_prompt.trim().length > 0) {
    let imagePrompt = input.image_prompt;
    for (const [key, value] of Object.entries(input.variables ?? {})) {
      imagePrompt = imagePrompt.replaceAll(`{${key}}`, String(value ?? ''));
    }
    try {
      image_url = await generateImage(imagePrompt);
    } catch (err) {
      // Bild ist optional — Fehler nicht hart durchreichen
      console.warn('[social] Bildgenerierung fehlgeschlagen:', err);
    }
  }

  return { caption, hashtags, image_url };
}
