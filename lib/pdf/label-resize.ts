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
 *  - `region`: schneidet die Source-Seite vor dem Skalieren auf eine Haelfte
 *    bzw. Spalte zu (per `setMediaBox`/`setCropBox`). Default: `full`.
 *  - `rotate`: dreht die Source-Seite um 0/90/180/270 Grad. Hilft bei
 *    Etiketten, die intern im Querformat gespeichert sind, aber auf einem
 *    Hochformat-Papier liegen — nach dem Drehen liegt das Etikett dann
 *    richtig orientiert auf dem A5-Bogen.
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

  const src = await PDFDocument.load(srcBuffer);
  const srcPage = src.getPage(0);

  if (region !== 'full') {
    const { width, height } = srcPage.getSize();
    let box: [number, number, number, number] = [0, 0, width, height];
    if (region === 'top') box = [0, height / 2, width, height / 2];
    else if (region === 'bottom') box = [0, 0, width, height / 2];
    else if (region === 'left') box = [0, 0, width / 2, height];
    else if (region === 'right') box = [width / 2, 0, width / 2, height];
    srcPage.setMediaBox(box[0], box[1], box[2], box[3]);
    srcPage.setCropBox(box[0], box[1], box[2], box[3]);
  }

  if (rotate !== 0) {
    srcPage.setRotation(degrees(rotate));
  }

  const dst = await PDFDocument.create();
  const [embedded] = await dst.embedPdf(src, [0]);

  const dstPage = dst.addPage(A5_PORTRAIT);
  drawEmbeddedFit(dstPage, embedded, A5_PORTRAIT);

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
