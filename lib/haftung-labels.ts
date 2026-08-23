/**
 * Anzeige-Labels für den Haftungsschutz.
 *
 * Verbindliche Terminologie (siehe CLAUDE.md, Rechtstexte-Compliance-Sweep):
 * „Ohne Haftungsschutz" / „Basis-Haftungsschutz" / „Premium-Haftungsschutz".
 * Die dort verbotenen Alt-Begriffe duerfen hier NICHT auftauchen — der
 * Regressionstest lib/__tests__/widerruf-consistency.test.ts haelt sie aus dem
 * Produktivcode heraus.
 *
 * Die DB-WERTE bleiben unveraendert 'none' | 'standard' | 'premium' — hier
 * werden ausschliesslich die Anzeige-Labels aufgeloest.
 */

export type HaftungValue = 'none' | 'standard' | 'premium';

/**
 * Volles Label, u. a. fuer den Mietvertrag.
 *
 * Wichtig: Die Option wird aus dem DB-Wert aufgeloest, NICHT aus dem Preis
 * geraten — Basis kostet ab 15 Tagen >= 25 EUR und wurde von der alten
 * Preis-Heuristik faelschlich als „Premium" ausgewiesen.
 *
 * Unbekannter Wert -> undefined, damit Aufrufer ihren eigenen Fallback nutzen.
 */
export function haftungOptionLabel(h: string | null | undefined): string | undefined {
  if (h === 'premium') return 'Premium-Haftungsschutz';
  if (h === 'none') return 'Ohne Haftungsschutz';
  if (h === 'standard') return 'Basis-Haftungsschutz';
  return undefined;
}

/** Kurzform fuer enge UI-Stellen (Gruppen-Header im Warenkorb/Checkout). */
export function haftungShortLabel(h: string | null | undefined): string {
  if (h === 'premium') return 'Premium-Haftungsschutz';
  if (h === 'standard') return 'Basis-Haftungsschutz';
  return 'ohne Haftungsschutz';
}
