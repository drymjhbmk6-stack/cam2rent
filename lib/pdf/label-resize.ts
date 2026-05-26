import { PDFDocument, degrees } from 'pdf-lib';

/**
 * PDF-Etiketten auf A5 Hochformat skalieren + zwei A5 nebeneinander auf
 * ein A4-Querformat-Blatt setzen.
 *
 * Hintergrund: Sendcloud liefert Etiketten typischerweise als "label_printer"
 * (10×15 cm Aufkleber-Format) oder "normal_printer" (A4 mit Etikett oben links).
 * Wir wollen sie konsistent als A5 Hochformat (148×210 mm) ausgeben — sowohl
 * fuer den einzelnen Anzeige-/Druck-Workflow als auch fuer das Kombi-Blatt
 * (A4 quer, beide A5 nebeneinander), das der Admin auf vorgestanzte
 * A4-Bogen mit zwei A5-Etiketten druckt.
 */

// Seitengroessen in PDF-Punkten (1mm = 2.83465pt).
const A5_PORTRAIT: [number, number] = [419.53, 595.28]; // 148 x 210 mm
const A4_LANDSCAPE: [number, number] = [841.89, 595.28]; // 297 x 210 mm

/**
 * Wo auf der Source-Seite das eigentliche Etikett sitzt. DHL-Retoure-PDFs
 * variieren in der Praxis: mal oben (Hochformat-Layout), mal links/rechts
 * (Querformat-Layout, im Hochformat-Papier gespeichert), seltener unten.
 */
export type LabelRegion = 'full' | 'top' | 'bottom' | 'left' | 'right';
export type LabelRotation = 0 | 90 | 180 | 270;

const ALLOWED_REGIONS: LabelRegion[] = ['full', 'top', 'bottom', 'left', 'right'];
const ALLOWED_ROTATIONS: LabelRotation[] = [0, 90, 180, 270];

/** Validiert/normalisiert User-Input fuer den Region-Switch. */
export function parseLabelRegion(raw: unknown): LabelRegion {
  if (typeof raw === 'string' && (ALLOWED_REGIONS as string[]).includes(raw)) {
    return raw as LabelRegion;
  }
  return 'full';
}

/** Validiert/normalisiert User-Input fuer die Rotation. */
export function parseLabelRotation(raw: unknown): LabelRotation {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if ((ALLOWED_ROTATIONS as number[]).includes(n)) return n as LabelRotation;
  return 0;
}

/**
 * Skaliert die erste Seite eines PDFs in einen A5-Hochformat-Bogen ein.
 * Behaelt das Seitenverhaeltnis bei und zentriert den Inhalt.
 *
 * Optionen:
 *  - `region`: schneidet die Source-Seite vor dem Skalieren auf eine
 *    Haelfte/Spalte zu. Default: `full`.
 *  - `rotate`: dreht die Source-Seite um 0/90/180/270 Grad **im
 *    Uhrzeigersinn**. Hilft bei Etiketten, die im Querformat-Layout
 *    auf Hochformat-Papier gespeichert sind.
 *
 * Implementierung als Multi-Pass: pdf-lib's `embedPdf` ignoriert
 * MediaBox-Aenderungen und `/Rotate`-Properties der Source-Page (es
 * embedded immer das urspruengliche Inhalts-Rechteck). Daher echtes
 * Re-Rendering in einem Zwischen-PDF:
 *   1. Crop: zeichne die Source mit negativem Offset in eine neue Page,
 *      deren Groesse exakt dem gewuenschten Bereich entspricht. Bereich
 *      ausserhalb der Page wird vom Viewer geclippt.
 *   2. Rotate: zweite Page mit getauschten Dimensionen (bei 90/270),
 *      Source mit `drawPage`-Rotation + passender Translation.
 *   3. A5-Fit: finale Page mit dem aufbereiteten Zwischen-PDF einpassen.
 */
export async function resizePdfToA5Portrait(
  srcBuffer: ArrayBuffer,
  opts: {
    region?: LabelRegion;
    rotate?: LabelRotation;
    /** @deprecated Verwende `region: 'top'`. */
    useTopHalfOnly?: boolean;
  } = {},
): Promise<Uint8Array> {
  const region: LabelRegion = opts.region ?? (opts.useTopHalfOnly ? 'top' : 'full');
  const rotate: LabelRotation = opts.rotate ?? 0;

  // Pass 1: Cropping (immer, region='full' = no-op).
  const cropped = await cropPdfPage(srcBuffer, region);

  // Pass 2: Rotation (nur wenn rotate != 0).
  const rotated = rotate !== 0 ? await rotatePdfPage(cropped, rotate) : cropped;

  // Pass 3: In A5-Hochformat einpassen.
  // Konvertierung zu ArrayBuffer fuer PDFDocument.load.
  const finalAb: ArrayBuffer = rotated.buffer.slice(
    rotated.byteOffset,
    rotated.byteOffset + rotated.byteLength,
  ) as ArrayBuffer;
  const reloaded = await PDFDocument.load(finalAb);
  const dst = await PDFDocument.create();
  const [embedded] = await dst.embedPdf(reloaded, [0]);
  const dstPage = dst.addPage(A5_PORTRAIT);
  drawEmbeddedFit(dstPage, embedded, A5_PORTRAIT);
  return dst.save();
}

/**
 * Erste Pass: schneidet die Source-Seite auf den gewuenschten Bereich zu.
 * Der Trick: wir erstellen eine neue Page mit der Groesse des Zielbereichs
 * und zeichnen die Source mit negativem Offset darauf. PDF-Viewer clippt
 * alles ausserhalb der Page-MediaBox.
 */
async function cropPdfPage(
  srcBuffer: ArrayBuffer,
  region: LabelRegion,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(srcBuffer);
  const srcPage = src.getPage(0);
  const { width: sw, height: sh } = srcPage.getSize();

  // Standard: ganze Seite (region='full' → 1:1-Kopie).
  let cropX = 0, cropY = 0, cropW = sw, cropH = sh;
  if (region === 'top')    { cropX = 0;     cropY = sh / 2; cropW = sw;     cropH = sh / 2; }
  else if (region === 'bottom') { cropX = 0;     cropY = 0;      cropW = sw;     cropH = sh / 2; }
  else if (region === 'left')   { cropX = 0;     cropY = 0;      cropW = sw / 2; cropH = sh;     }
  else if (region === 'right')  { cropX = sw / 2; cropY = 0;      cropW = sw / 2; cropH = sh;     }

  const dst = await PDFDocument.create();
  const dstPage = dst.addPage([cropW, cropH]);
  const [embSrc] = await dst.embedPdf(src, [0]);
  // Negative Offsets: Source-Origin (0,0) liegt links unten, wir wollen
  // Source-Bereich [cropX..cropX+cropW] × [cropY..cropY+cropH] sichtbar
  // → Source komplett zeichnen aber um (-cropX, -cropY) verschoben.
  dstPage.drawPage(embSrc, {
    x: -cropX,
    y: -cropY,
    width: sw,
    height: sh,
  });
  return dst.save();
}

/**
 * Zweiter Pass: dreht die Seite um 0/90/180/270 Grad im Uhrzeigersinn.
 * pdf-lib zeichnet via Matrix T(x,y) × R(θ_CCW) — wir mappen unsere
 * CW-Konvention auf passende (x, y, θ_CCW)-Tupel und tauschen bei
 * Viertel-Drehungen die Page-Dimensionen.
 */
async function rotatePdfPage(
  srcBuffer: Uint8Array,
  rotate: LabelRotation,
): Promise<Uint8Array> {
  const srcAb: ArrayBuffer = srcBuffer.buffer.slice(
    srcBuffer.byteOffset,
    srcBuffer.byteOffset + srcBuffer.byteLength,
  ) as ArrayBuffer;
  const src = await PDFDocument.load(srcAb);
  const srcPage = src.getPage(0);
  const { width: sw, height: sh } = srcPage.getSize();

  // Page-Dimensionen + drawPage-Parameter je nach Drehung (alles
  // hergeleitet aus T(X,Y) × R(θ_CCW) auf die vier Source-Ecken).
  let newW = sw, newH = sh;
  let drawX = 0, drawY = 0, drawRotateDeg = 0;
  if (rotate === 90) {
    // 90° CW = pdf-lib θ_CCW = -90; Source-(0,0) → (0, sw)
    newW = sh; newH = sw;
    drawX = 0; drawY = sw; drawRotateDeg = -90;
  } else if (rotate === 180) {
    // 180°; Source-(0,0) → (sw, sh)
    newW = sw; newH = sh;
    drawX = sw; drawY = sh; drawRotateDeg = 180;
  } else if (rotate === 270) {
    // 270° CW = 90° CCW = pdf-lib θ_CCW = +90; Source-(0,0) → (sh, 0)
    newW = sh; newH = sw;
    drawX = sh; drawY = 0; drawRotateDeg = 90;
  }

  const dst = await PDFDocument.create();
  const dstPage = dst.addPage([newW, newH]);
  const [embSrc] = await dst.embedPdf(src, [0]);
  dstPage.drawPage(embSrc, {
    x: drawX,
    y: drawY,
    width: sw,
    height: sh,
    rotate: degrees(drawRotateDeg),
  });
  return dst.save();
}

/**
 * Bettet ein Bild (JPG oder PNG) in einen A5-Hochformat-PDF-Bogen ein —
 * fuers vom Admin hochgeladene Retoure-Etikett, falls es als Foto/Scan
 * vorliegt. Seitenverhaeltnis bleibt erhalten, Bild wird zentriert.
 */
export async function imageToA5PortraitPdf(
  imageBuffer: ArrayBuffer,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<Uint8Array> {
  const dst = await PDFDocument.create();
  const page = dst.addPage(A5_PORTRAIT);

  const img = mimeType === 'image/jpeg'
    ? await dst.embedJpg(imageBuffer)
    : await dst.embedPng(imageBuffer);

  const [pageW, pageH] = A5_PORTRAIT;
  const scale = Math.min(pageW / img.width, pageH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  page.drawImage(img, {
    x: (pageW - drawW) / 2,
    y: (pageH - drawH) / 2,
    width: drawW,
    height: drawH,
  });

  return dst.save();
}

/**
 * Erzeugt eine A4-Querformat-Seite mit zwei A5-Hochformat-Slots nebeneinander
 * (links = Hin-Etikett, rechts = Retour-Etikett). Beide Eingabe-PDFs werden
 * unabhaengig voneinander in ihren A5-Slot eingepasst.
 */
export async function combineLabelsOnA4Landscape(
  outboundBuffer: ArrayBuffer,
  returnBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  const dst = await PDFDocument.create();
  const page = dst.addPage(A4_LANDSCAPE);

  const outboundSrc = await PDFDocument.load(outboundBuffer);
  const returnSrc = await PDFDocument.load(returnBuffer);
  const [outboundEmbed] = await dst.embedPdf(outboundSrc, [0]);
  const [returnEmbed] = await dst.embedPdf(returnSrc, [0]);

  // Linke Haelfte (0..A5_W) = Hin-Etikett, rechte Haelfte (A5_W..2*A5_W) = Retour.
  const [a5W, a5H] = A5_PORTRAIT;
  drawEmbeddedFitInRect(page, outboundEmbed, { x: 0, y: 0, w: a5W, h: a5H });
  drawEmbeddedFitInRect(page, returnEmbed, { x: a5W, y: 0, w: a5W, h: a5H });

  return dst.save();
}

// ─────────────────────────────────────────────────────────────────────────────

type EmbeddedPage = Awaited<ReturnType<PDFDocument['embedPdf']>>[number];
type PageType = ReturnType<PDFDocument['addPage']>;

function drawEmbeddedFit(page: PageType, embedded: EmbeddedPage, [pageW, pageH]: [number, number]) {
  drawEmbeddedFitInRect(page, embedded, { x: 0, y: 0, w: pageW, h: pageH });
}

function drawEmbeddedFitInRect(
  page: PageType,
  embedded: EmbeddedPage,
  rect: { x: number; y: number; w: number; h: number },
) {
  const srcW = embedded.width;
  const srcH = embedded.height;
  const scale = Math.min(rect.w / srcW, rect.h / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  page.drawPage(embedded, {
    x: rect.x + (rect.w - drawW) / 2,
    y: rect.y + (rect.h - drawH) / 2,
    xScale: scale,
    yScale: scale,
  });
}
