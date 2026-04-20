import { NextRequest, NextResponse } from 'next/server';
import { generateSocialImage } from '@/lib/meta/ai-content';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// KI-Image-Generation kostet Geld (~0,04 €/Bild DALL-E 3, ~0,04-0,19 €
// bei gpt-image-1). 20 pro Stunde pro IP — mehr als reichend, aber
// schützt gegen versehentlichen Doppelklick-Spam.
const imageGenLimiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

/**
 * POST /api/admin/social/generate-image
 *
 * Body:
 *   {
 *     caption?: string,    // wird als Source-Text verwendet (Produkt-Match)
 *     prompt?: string,     // optionaler Scene-Prompt; wenn leer aus caption abgeleitet
 *   }
 *
 * Antwort: { url: string }   // Öffentliche Storage-URL des generierten Bildes.
 *
 * Nutzt den Smart-Wrapper generateSocialImage → versucht erst gpt-image-1
 * mit Produkt-Referenz (echte Shop-Kamera), fällt bei Fehler auf DALL-E 3 zurück.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!imageGenLimiter.check(`social-img:${ip}`).success) {
    return NextResponse.json(
      { error: 'Bild-Generierungs-Limit erreicht (20/Stunde). Bitte warte.' },
      { status: 429 },
    );
  }

  let body: { caption?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 });
  }

  const caption = (body.caption ?? '').trim();
  const explicitPrompt = (body.prompt ?? '').trim();
  const sourceText = caption || explicitPrompt;

  if (!sourceText) {
    return NextResponse.json(
      { error: 'Bitte eine Caption oder einen Bild-Prompt angeben.' },
      { status: 400 },
    );
  }

  // Scene-Prompt: entweder explizit übergeben, oder aus Caption ableiten.
  // Wenn nur Caption da ist, bauen wir einen kurzen Szene-Hinweis draus.
  const scenePrompt = explicitPrompt
    || `Photorealistisches Social-Media-Header-Bild zum Thema: ${caption.slice(0, 300)}. National-Geographic-Stil, Goldene Stunde, 35mm, f/2.8, kein Text.`;

  try {
    const url = await generateSocialImage(scenePrompt, sourceText, { size: '1024x1024' });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('[social/generate-image] Fehler:', message);
    return NextResponse.json(
      { error: 'Bild-Generierung fehlgeschlagen: ' + message },
      { status: 500 },
    );
  }
}
