/**
 * Client-seitige Bild-Verkleinerung fuer Beleg-Uploads.
 *
 * Claude Vision lehnt Bilder >5 MB (base64-Payload) ab. iPhone-Fotos liegen
 * regelmaessig bei 5-8 MB. Server-seitig versucht lib/ai/invoice-extract.ts
 * sharp als Fallback, aber sharp ist im Production-Image nicht garantiert
 * verfuegbar (siehe CLAUDE.md → "Sharp im Docker").
 *
 * Dieser Helper schrumpft Bilder schon im Browser via Canvas, bevor sie hoch-
 * geladen werden. PDFs und kleine Bilder bleiben unveraendert.
 */

const DEFAULT_MAX_BYTES = 3_500_000;
const SIZE_STEPS = [2400, 2000, 1600, 1200, 1000];
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht gelesen werden'));
    };
    img.src = url;
  });
}

function drawToBlob(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
): Promise<Blob | null> {
  const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

function renameToJpg(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name) + '.jpg';
}

/**
 * Wenn `file` ein Bild >maxBytes ist, wird es als JPEG verkleinert zurueck-
 * gegeben. Sonst kommt das Original durch. Bei Fehlern (z.B. HEIC, das der
 * Browser nicht decodieren kann) gibt's das Original zurueck — der Server
 * faengt dann den Rest ab.
 */
export async function shrinkImageFileIfNeeded(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  for (const maxDim of SIZE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await drawToBlob(img, maxDim, quality);
      if (!blob) continue;
      if (blob.size <= maxBytes) {
        return new File([blob], renameToJpg(file.name), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }
    }
  }

  // Last resort — sehr aggressiv, fuer den Fall dass alles andere zu gross blieb
  const lastBlob = await drawToBlob(img, 800, 0.4);
  if (lastBlob && lastBlob.size <= maxBytes) {
    return new File([lastBlob], renameToJpg(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }
  return file;
}
