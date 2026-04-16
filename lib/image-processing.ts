let sharp: typeof import('sharp') | null = null;
try {
  sharp = require('sharp');
} catch {
  console.warn('Sharp nicht verfügbar — Bilder werden ohne Verarbeitung hochgeladen');
}

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900;

/**
 * Erstellt das cam2rent Logo als SVG-Buffer für Wasserzeichen.
 */
function createLogoWatermark(opacity: number = 0.12, size: number = 120): Buffer {
  const scale = size / 200;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(180 * scale)}" viewBox="0 0 200 180">
      <g opacity="${opacity}" fill="none" stroke="#000" stroke-width="6">
        <rect x="30" y="50" width="140" height="95" rx="14"/>
        <path d="M70 50 L70 35 Q70 28 77 28 L95 28 Q100 28 103 32 L112 50" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="100" cy="97" r="30"/>
        <circle cx="100" cy="97" r="18" stroke-width="5"/>
      </g>
      <text x="100" y="172" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="30" fill="rgba(0,0,0,${opacity})" transform="scale(${scale})" transform-origin="100 172">Cam2Rent</text>
    </svg>
  `);
}

/**
 * Erstellt ein Text-Wasserzeichen (für Set-Name unten mittig).
 */
function createTextWatermark(text: string, opacity: number = 0.55, fontSize: number = 32): Buffer {
  const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(`
    <svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}">
      <text x="${TARGET_WIDTH / 2}" y="${TARGET_HEIGHT - 24}" text-anchor="middle"
        font-family="sans-serif" font-weight="700" font-size="${fontSize}"
        fill="rgba(0,0,0,${opacity})" letter-spacing="0.5">${safeText}</text>
    </svg>
  `);
}

/**
 * Skaliert ein Bild auf 1200x900 und zentriert es auf weißem Hintergrund.
 */
async function resizeToTarget(inputBuffer: Buffer): Promise<Buffer> {
  if (!sharp) return inputBuffer;
  const metadata = await sharp(inputBuffer).metadata();
  const origWidth = metadata.width || TARGET_WIDTH;
  const origHeight = metadata.height || TARGET_HEIGHT;

  const scale = Math.min(TARGET_WIDTH / origWidth, TARGET_HEIGHT / origHeight);
  const resizedWidth = Math.round(origWidth * scale);
  const resizedHeight = Math.round(origHeight * scale);

  return sharp(inputBuffer)
    .resize(resizedWidth, resizedHeight, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();
}

/**
 * Verarbeitet ein Produktbild:
 * 1200x900, weißer Hintergrund, cam2rent Logo unten rechts.
 * Fallback: Gibt das Originalbild zurück wenn sharp nicht verfügbar.
 */
export async function processProductImage(inputBuffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  if (!sharp) {
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }

  const resized = await resizeToTarget(inputBuffer);
  const logoWatermark = createLogoWatermark(0.12, 120);

  const buffer = await sharp({
    create: {
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: resized, gravity: 'centre' },
      { input: logoWatermark, gravity: 'southeast', top: TARGET_HEIGHT - 108, left: TARGET_WIDTH - 140 },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}

/**
 * Verarbeitet ein Set-Bild:
 * 1200x900, weißer Hintergrund, Set-Name unten mittig.
 * Fallback: Gibt das Originalbild zurück wenn sharp nicht verfügbar.
 */
export async function processSetImage(inputBuffer: Buffer, setName: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!sharp) {
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }

  const resized = await resizeToTarget(inputBuffer);
  const textWatermark = createTextWatermark(setName);

  const buffer = await sharp({
    create: {
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: resized, gravity: 'centre' },
      { input: textWatermark, gravity: 'south' },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}
