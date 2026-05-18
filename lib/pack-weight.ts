/**
 * Paketgewicht-Schaetzung fuer den Versand-Workflow.
 *
 * Quellen der Einzelgewichte:
 *  - Kamera: Produkt-Spec `weight` als Freitext-String ("154g", "0,2 kg").
 *  - Zubehoer: `accessories.specs.weight_g` als Zahl in Gramm.
 *
 * Reine Funktionen, keine DB-Zugriffe.
 */

/**
 * Parst eine Gewichtsangabe in Gramm. Akzeptiert Zahlen (= Gramm, wie
 * `weight_g`) und Strings wie "154g", "203 g", "0.2kg", "1,2 kg".
 * Liefert 0 bei nicht interpretierbaren Werten.
 */
export function parseWeightToGrams(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : 0;
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return 0;
  const m = s.match(/([0-9]*\.?[0-9]+)\s*(kg|g)?/);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return m[2] === 'kg' ? val * 1000 : val;
}

/** Verpackungs-Zuschlag (Karton + Polster) in Gramm. */
export const PACK_BOX_BUFFER_G = 300;

export interface PackWeightParts {
  /** Kamera-Gewichte (eine Zahl Gramm pro physischer Kamera). */
  cameraGrams: number[];
  /** Zubehoer: Gewicht pro Stueck in Gramm + Menge. */
  accessories: { grams: number; qty: number }[];
}

/**
 * Summiert Kamera- + Zubehoer-Gewichte + Verpackungs-Zuschlag und liefert
 * das Paketgewicht in kg, auf 2 Nachkommastellen gerundet, min. 0,1 kg.
 * Liefert `null`, wenn KEIN einziges Einzelgewicht hinterlegt ist (dann soll
 * die UI den manuellen Default zeigen statt einer Schein-Genauigkeit).
 */
export function computePackWeightKg(parts: PackWeightParts): number | null {
  let total = 0;
  let anyKnown = false;
  for (const g of parts.cameraGrams) {
    if (g > 0) { total += g; anyKnown = true; }
  }
  for (const a of parts.accessories) {
    if (a.grams > 0 && a.qty > 0) { total += a.grams * a.qty; anyKnown = true; }
  }
  if (!anyKnown) return null;
  total += PACK_BOX_BUFFER_G;
  const kg = Math.max(0.1, Math.round((total / 1000) * 100) / 100);
  return kg;
}
