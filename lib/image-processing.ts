import type SharpType from 'sharp';

let sharpModule: typeof SharpType | null = null;

async function getSharp(): Promise<typeof SharpType | null> {
  if (sharpModule) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
    return sharpModule;
  } catch {
    console.warn('Sharp nicht verfügbar — Bilder werden ohne Verarbeitung hochgeladen');
    return null;
  }
}

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900;

/**
 * Erstellt das cam2rent Logo als SVG-Buffer für Wasserzeichen.
 * Neues Markenzeichen (v4): Kamera-Icon mit Wortmarke "Cam2Rent".
 */
function createLogoWatermark(opacity: number = 0.12, size: number = 140): Buffer {
  const height = Math.round((200 / 320) * size);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 320 200">
      <g opacity="${opacity}">
        <g transform="translate(160,75)">
          <rect x="-50" y="-22" width="100" height="60" rx="8" fill="#0F172A"/>
          <rect x="-28" y="-32" width="24" height="12" rx="2" fill="#0F172A"/>
          <circle cx="0" cy="8" r="18" fill="#F8FAFC"/>
          <circle cx="0" cy="8" r="12" fill="none" stroke="#0F172A" stroke-width="1.5"/>
          <circle cx="32" cy="-12" r="2.5" fill="#F8FAFC"/>
        </g>
        <g font-family="Inter, Helvetica, Arial, sans-serif" text-anchor="middle">
          <text x="160" y="165" font-size="36" font-weight="800" letter-spacing="-1" fill="#0F172A">Cam2Rent</text>
        </g>
      </g>
    </svg>
  `);
}

/**
 * Erstellt ein Text-Wasserzeichen (für Set-Name unten mittig).
 */
function createTextWatermark(text: string, opacity: number = 0.55, fontSize: number = 32): Buffer {
  // Vollständiges XML-Escaping inkl. Quotes (Attribute-Injection-Schutz).
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  return Buffer.from(`
    <svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}">
      <text x="${TARGET_WIDTH / 2}" y="${TARGET_HEIGHT - 24}" text-anchor="middle"
        font-family="sans-serif" font-weight="700" font-size="${fontSize}"
        fill="rgba(0,0,0,${opacity})" letter-spacing="0.5">${safeText}</text>
    </svg>
  `);
}

/**
 * Verarbeitet ein Produktbild:
 * 1200x900, weißer Hintergrund, cam2rent Logo unten rechts.
 * Fallback: Gibt das Originalbild zurück wenn sharp nicht verfügbar.
 */
export async function processProductImage(inputBuffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  const sharp = await getSharp();
  if (!sharp) {
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const origW = metadata.width || TARGET_WIDTH;
    const origH = metadata.height || TARGET_HEIGHT;
    const scale = Math.min(TARGET_WIDTH / origW, TARGET_HEIGHT / origH);

    const resized = await sharp(inputBuffer)
      .resize(Math.round(origW * scale), Math.round(origH * scale), { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    const WM_WIDTH = 160;
    const WM_HEIGHT = Math.round((200 / 320) * WM_WIDTH); // 100
    const logoWatermark = createLogoWatermark(0.12, WM_WIDTH);

    const buffer = await sharp({
      create: { width: TARGET_WIDTH, height: TARGET_HEIGHT, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        { input: resized, gravity: 'centre' },
        { input: logoWatermark, gravity: 'southeast', top: TARGET_HEIGHT - WM_HEIGHT - 20, left: TARGET_WIDTH - WM_WIDTH - 20 },
      ])
      .webp({ quality: 85 })
      .toBuffer();

    return { buffer, contentType: 'image/webp' };
  } catch (err) {
    console.error('Bildverarbeitung fehlgeschlagen, lade Original hoch:', err);
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }
}

/**
 * Verarbeitet ein Set-Bild:
 * 1200x900, weißer Hintergrund, Set-Name unten mittig.
 * Fallback: Gibt das Originalbild zurück wenn sharp nicht verfügbar.
 */
export async function processSetImage(inputBuffer: Buffer, setName: string): Promise<{ buffer: Buffer; contentType: string }> {
  const sharp = await getSharp();
  if (!sharp) {
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const origW = metadata.width || TARGET_WIDTH;
    const origH = metadata.height || TARGET_HEIGHT;
    const scale = Math.min(TARGET_WIDTH / origW, TARGET_HEIGHT / origH);

    const resized = await sharp(inputBuffer)
      .resize(Math.round(origW * scale), Math.round(origH * scale), { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    const textWatermark = createTextWatermark(setName);

    const buffer = await sharp({
      create: { width: TARGET_WIDTH, height: TARGET_HEIGHT, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        { input: resized, gravity: 'centre' },
        { input: textWatermark, gravity: 'south' },
      ])
      .webp({ quality: 85 })
      .toBuffer();

    return { buffer, contentType: 'image/webp' };
  } catch (err) {
    console.error('Set-Bildverarbeitung fehlgeschlagen, lade Original hoch:', err);
    return { buffer: inputBuffer, contentType: 'image/jpeg' };
  }
}
