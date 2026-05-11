/**
 * Photorealism-Wrapper fuer DALL-E 3 Blog-Header-Bilder.
 *
 * Problem: Claude generiert imagePrompts mit KI-typischen Adjektiven
 * ("stunning", "breathtaking", "perfect") — die signalisieren DALL-E 3,
 * einen idealisierten, digital wirkenden Look zu produzieren.
 *
 * Dieser Wrapper:
 * 1. Entfernt hyperbole Adjektive aus Claudes Prompt
 * 2. Fuegt erprobte Photorealismus-Anker vorne + hinten an
 * 3. Verwendet keine "photorealistic"-Keywords (wirken kontraproduktiv)
 *    sondern konkrete Film-/Kamera-Referenzen
 */

/** Wörter/Phrasen die DALL-E in Richtung KI-Look treiben — raus. */
const AI_AESTHETIC_WORDS = [
  /\bstunning\b/gi,
  /\bbreathtaking\b/gi,
  /\bspectacular\b/gi,
  /\bamazing\b/gi,
  /\bincredible\b/gi,
  /\bepic\b/gi,
  /\bperfect\b/gi,
  /\bhighly detailed\b/gi,
  /\bhyper.?detailed\b/gi,
  /\bhyper.?realistic\b/gi,
  /\b8k\b/gi,
  /\b4k\b/gi,
  /\bultra.?hd\b/gi,
  /\bmasterpiece\b/gi,
  /\bcinematic\b/gi,  // makes it look like a movie poster, not a photo
  /\bphotorealistic\b/gi,  // paradoxically signals AI
  /\bdigital art\b/gi,
  /\brender\b/gi,
];

function stripAiAdjectives(prompt: string): string {
  let cleaned = prompt;
  for (const pattern of AI_AESTHETIC_WORDS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Doppelte Leerzeichen/Kommas aufräumen
  return cleaned.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
}

/**
 * Nimmt Claudes Szenen-Beschreibung und ummantelt sie mit
 * fotorealistischen Pflicht-Ankern.
 *
 * Erprobte Techniken:
 * - Konkrete Kamera-/Objektivangabe (signalisiert echtes Foto)
 * - Fuji/Kodak Filmsimulation (neutralisiert KI-Farbpalette)
 * - "Candid moment" + "slightly imperfect" (echte Fotos sind nicht perfekt)
 * - Explizites "not CGI, not illustration" (DALL-E liest das!)
 * - Kein "photorealistic" — das Wort ist mittlerweile ein AI-Signal
 */
export function wrapImagePromptForRealism(claudePrompt: string): string {
  const cleanedScene = stripAiAdjectives(claudePrompt);

  const prefix = [
    'Editorial documentary sports photography.',
    'Canon EOS R5, 35mm prime lens, f/2.8, 1/1000s, ISO 640, natural available light only.',
    'Real photograph — not CGI, not illustration, not digital painting.',
  ].join(' ');

  const suffix = [
    'Authentic candid moment, slightly imperfect composition, subject not posed.',
    'Fujifilm color science: Classic Chrome — muted shadows, slightly desaturated, natural greens.',
    'Fine film grain visible at 100%. No visible AI artifacts.',
    'Taken by a professional adventure photographer on assignment for an outdoor magazine.',
    'No text overlays, no watermarks, no logos, no lens flares.',
  ].join(' ');

  return `${prefix} ${cleanedScene} ${suffix}`;
}
