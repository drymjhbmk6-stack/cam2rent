import { PDFDocument } from 'pdf-lib';

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
 * Skaliert die erste Seite eines PDFs in einen A5-Hochformat-Bogen ein.
 * Behaelt das Seitenverhaeltnis bei und zentriert den Inhalt.
 */
export async function resizePdfToA5Portrait(srcBuffer: ArrayBuffer): Promise<Uint8Array> {
  const src = await PDFDocument.load(srcBuffer);
  const dst = await PDFDocument.create();
  const [embedded] = await dst.embedPdf(src, [0]);

  const dstPage = dst.addPage(A5_PORTRAIT);
  drawEmbeddedFit(dstPage, embedded, A5_PORTRAIT);

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
