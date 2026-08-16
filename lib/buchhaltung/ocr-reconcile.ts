import { fmtEuro } from '@/lib/format-utils';

/**
 * Reconciliation-Helfer fuer OCR-Rechnungspositionen.
 *
 * Claude liefert pro Position sowohl `quantity` + `unit_price_net` als auch
 * einen unabhaengig abgelesenen `line_total_net` (die auf der Rechnung
 * tatsaechlich gedruckte "Amount"-Spalte). Bei Rechnungen mit Freitext-
 * Mengenangaben in Klammern (z.B. "Discount (-250 units)" oder
 * "across 18 prices") kann `quantity` versehentlich aus dem Beschreibungstext
 * statt der echten Mengen-Spalte stammen — `quantity * unit_price_net` weicht
 * dann stark von `line_total_net` ab, obwohl beide Felder fuer sich genommen
 * "valide" Zahlen sind.
 *
 * `line_total_net` ist die verlaesslichere Quelle, weil sie direkt dem
 * gedruckten Betrag entspricht statt einer selbst konstruierten Multiplikation.
 * Stimmen beide Werte ueberein, wird die Mengen-Angabe beibehalten (wichtig
 * fuer echte Staffel-/Mengenpreise). Weichen sie ab, wird auf menge=1 +
 * einzelpreis_netto=line_total_net zurueckgefallen.
 */

export interface OcrLineAmounts {
  quantity: number;
  unit_price_net: number;
  line_total_net: number;
}

export interface ReconciledLineAmount {
  menge: number;
  einzelpreis_netto: number;
}

export function reconcileOcrLineAmount(line: OcrLineAmounts): ReconciledLineAmount {
  const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
  const unitPrice = Number.isFinite(line.unit_price_net) ? line.unit_price_net : 0;
  const lineTotal = Number.isFinite(line.line_total_net) ? line.line_total_net : 0;

  const derivedFromQty = quantity * unitPrice;

  // line_total_net fehlt/ist 0 obwohl derivedFromQty etwas anderes ergibt ->
  // vermutlich hat Claude line_total_net schlicht nicht befuellt, nicht dass
  // die Position wirklich 0 wert ist. Dann Menge/Einzelpreis unangetastet lassen.
  const lineTotalLooksUnset = lineTotal === 0 && derivedFromQty !== 0;
  if (lineTotalLooksUnset) {
    return { menge: quantity, einzelpreis_netto: unitPrice };
  }

  const tolerance = Math.max(0.01, Math.abs(derivedFromQty) * 0.01);
  if (Math.abs(derivedFromQty - lineTotal) <= tolerance) {
    return { menge: quantity, einzelpreis_netto: unitPrice };
  }

  // Diskrepanz -> die gedruckte Zeilensumme gewinnt, Menge wird auf 1
  // zurueckgesetzt (die Aufteilung in Menge x Einzelpreis war offenbar nicht
  // vertrauenswuerdig).
  return { menge: 1, einzelpreis_netto: lineTotal };
}

/** Marker-Praefix fuer die automatische OCR-Abweichungs-Notiz in belege.notizen. */
export const OCR_MISMATCH_NOTE_MARKER = '⚠️ OCR-Abweichung:';

/**
 * Sicherheitsnetz: vergleicht die aus den gespeicherten Positionen
 * aufsummierte Brutto-Summe mit dem auf der Rechnung selbst ausgewiesenen
 * Gesamtbetrag (nach EUR-Umrechnung). Weicht sie merklich ab, ist trotz
 * Reconciliation + Prompt-Haertung vermutlich noch eine Position falsch
 * erkannt worden — liefert dann einen fuer den Admin sichtbaren Hinweistext,
 * sonst null (kein Hinweis noetig).
 *
 * Toleranz: 5 Cent oder 2% des erwarteten Betrags, je nachdem was groesser
 * ist (deckt normale Rundungsdifferenzen bei mehreren Positionen ab, ohne
 * echte Abweichungen zu uebersehen).
 */
export function describeOcrTotalMismatch(actualBrutto: number, expectedBrutto: number): string | null {
  if (!Number.isFinite(expectedBrutto) || expectedBrutto <= 0) return null;
  if (!Number.isFinite(actualBrutto)) return null;
  const tolerance = Math.max(0.05, Math.abs(expectedBrutto) * 0.02);
  if (Math.abs(actualBrutto - expectedBrutto) <= tolerance) return null;
  return `${OCR_MISMATCH_NOTE_MARKER} Summe der erkannten Positionen (${fmtEuro(actualBrutto)}) weicht von der auf der Rechnung ausgewiesenen Summe (${fmtEuro(expectedBrutto)}) ab — bitte Positionen prüfen.`;
}

/**
 * Entfernt eine zuvor gesetzte automatische Abweichungs-Notiz wieder aus dem
 * freien Notizen-Text (z.B. nach einem erneuten OCR-Lauf, der jetzt passt),
 * ohne handschriftliche Admin-Notizen anzutasten.
 */
export function stripOcrMismatchNote(notizen: string | null | undefined): string {
  if (!notizen) return '';
  return notizen
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(OCR_MISMATCH_NOTE_MARKER))
    .join('\n')
    .trim();
}
