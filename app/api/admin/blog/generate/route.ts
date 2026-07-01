import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { sanitizePromptInput, sanitizePromptInputList } from '@/lib/prompt-sanitize';
import { buildBlogSystemPrompt, HUMANIZER_PASS, parseBlogJson } from '@/lib/blog/system-prompt';
import { wrapImagePromptForRealism } from '@/lib/blog/image-prompt';

// Anthropic-Calls kosten Geld (~3-6 Cent pro Generierung). Auch wenn der
// Endpoint admin-only ist (Middleware-Schutz), verhindert das hier einen
// versehentlichen Kosten-Ansturm bei UI-Bugs (z.B. Doppelklick auf Generate).
// 10 pro Stunde pro IP — reicht für legitime Admin-Nutzung.
const generateLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

const LENGTH_MAP: Record<string, string> = {
  kurz: 'ca. 500 Wörter',
  mittel: 'ca. 1000 Wörter',
  lang: 'ca. 1500 Wörter',
};

const TONE_MAP: Record<string, string> = {
  informativ: 'sachlich-informativ, gut recherchiert',
  locker: 'locker und unterhaltsam, mit persönlicher Note',
  professionell: 'professionell und vertrauenswürdig, Experten-Ton',
};

async function getBlogSettings(): Promise<Record<string, string> | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();
  if (!data?.value) return null;
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return null;
  }
}

async function getApiKey(): Promise<string | null> {
  const settings = await getBlogSettings();
  return settings?.anthropic_api_key || null;
}

/** POST /api/admin/blog/generate - Artikel mit KI generieren */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!generateLimiter.check(`bloggen:${ip}`).success) {
    return NextResponse.json(
      { error: 'Generierungs-Limit erreicht (10/Stunde). Bitte warte eine Stunde.' },
      { status: 429 }
    );
  }
  const body = await req.json();
  const {
    topic: rawTopic,
    keywords: rawKeywords,
    tone = 'informativ',
    targetLength = 'mittel',
    referenceProducts: rawReferenceProducts,
  } = body;

  if (!rawTopic) {
    return NextResponse.json({ error: 'Thema ist erforderlich.' }, { status: 400 });
  }

  // Prompt-Injection-Defense: User-Input neutralisieren, bevor er in Prompts landet
  const topic = sanitizePromptInput(rawTopic, 300);
  const keywords = sanitizePromptInputList(rawKeywords, 15, 80);
  const referenceProducts = sanitizePromptInputList(rawReferenceProducts, 10, 150);

  const supabase = createServiceClient();
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API Key nicht konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  const length = LENGTH_MAP[targetLength] ?? LENGTH_MAP.mittel;
  const toneDesc = TONE_MAP[tone] ?? TONE_MAP.informativ;

  // Echte Produkte aus dem Shop laden
  const { data: productConfig } = await supabase
    .from('admin_config').select('value').eq('key', 'products').single();

  let shopProducts: string[] = [];
  if (productConfig?.value && typeof productConfig.value === 'object') {
    const products = productConfig.value as Record<string, { name: string; brand: string; slug: string }>;
    shopProducts = Object.values(products).map((p) => `${p.brand} ${p.name} (Link: /kameras/${p.slug})`);
  }

  const currentYear = new Date().getFullYear();

  let productContext = '';
  if (referenceProducts.length) {
    productContext = `\n\nReferenz-Produkte aus dem Shop (erwähne diese natürlich im Artikel):\n${referenceProducts.map((p) => `- ${p}`).join('\n')}`;
  }

  const keywordHint = keywords.length
    ? `\nWichtige Keywords für SEO: ${keywords.join(', ')}`
    : '';

  const shopProductsInfo = shopProducts.length > 0
    ? `\n\nAKTUELLE PRODUKTE IM CAM2RENT SHOP (verlinke diese wenn relevant):\n${shopProducts.map((p) => `- ${p}`).join('\n')}\n\nVerwende NUR diese Produkte oder allgemeine Themen. KEINE veralteten Modelle erfinden.`
    : '';

  // Zusätzlicher Admin-Kontext aus Einstellungen
  const allSettings = await getBlogSettings();

  const systemPrompt = buildBlogSystemPrompt({
    currentYear,
    shopProductsInfo,
    kiContext: allSettings?.ki_context ?? '',
    length,
    toneDesc,
    keywordHint,
    productContext,
  });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      // 8192 statt 4096: der komplette Artikel steckt als JSON-String im
      // "content"-Feld — bei 4096 wird ein langer Artikel abgeschnitten.
      max_tokens: 8192,
      messages: [{ role: 'user', content: `Schreibe einen Blog-Artikel über: ${topic}` }],
      system: systemPrompt,
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // JSON aus der Antwort parsen (Codeblock, umschließende Prosa,
    // rohe Steuerzeichen im mehrzeiligen content-String)
    const parsed = parseBlogJson(text);
    if (!parsed) {
      const truncated = message.stop_reason === 'max_tokens';
      return NextResponse.json({
        error: truncated
          ? 'KI-Antwort war zu lang und wurde abgeschnitten — bitte eine kürzere Artikellänge wählen.'
          : 'KI-Antwort konnte nicht als JSON gelesen werden.',
        raw: text,
      }, { status: 500 });
    }

    // Humanisierungs-Pass — gleiche Pipeline wie im Cron
    try {
      const humanizeMsg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: `Du bist ${HUMANIZER_PASS.role} bei cam2rent.de. ${HUMANIZER_PASS.instruction}

Antworte NUR mit dem korrigierten Artikel-Text in Markdown. Keine Erklärungen, keine Kommentare — nur der fertige Text.`,
        messages: [{ role: 'user', content: parsed.content ?? '' }],
      });
      const humanized = humanizeMsg.content[0].type === 'text' ? humanizeMsg.content[0].text : '';
      if (humanized.trim().length > 100) {
        parsed.content = humanized;
      }
    } catch { /* Humanizer fehlgeschlagen — Original behalten */ }

    // Lesezeit berechnen (ca. 200 Wörter/Minute)
    const wordCount = (parsed.content || '').split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // imagePrompt mit Photorealismus-Wrapper versehen, bevor die UI es an DALL-E schickt
    if (parsed.imagePrompt) {
      parsed.imagePrompt = wrapImagePromptForRealism(parsed.imagePrompt);
    }

    return NextResponse.json({
      ...parsed,
      reading_time_min: readingTime,
      ai_model: 'claude-sonnet-4-6',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `KI-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
