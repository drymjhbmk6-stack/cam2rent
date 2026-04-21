/**
 * Lineare Abschreibung (AfA) fuer Anlagegueter.
 *
 * Grundformel: Monatsrate = (Anschaffungswert - Restwert) / Nutzungsdauer_Monate
 *
 * Der aktuelle Zeitwert (current_value) wird monatlich vom AfA-Cron
 * fortgeschrieben. Diese Lib liefert reine Rechnungen, keine DB-Zugriffe.
 */

export interface DepreciableAsset {
  purchase_price: number;
  purchase_date: string;              // ISO YYYY-MM-DD
  useful_life_months: number;
  depreciation_method: 'linear' | 'none' | 'immediate';
  residual_value?: number | null;
  current_value: number;
  last_depreciation_at?: string | null;
}

/**
 * Lineare Monatsrate. Bei method=none oder immediate -> 0.
 */
export function monthlyDepreciationRate(asset: DepreciableAsset): number {
  if (asset.depreciation_method !== 'linear') return 0;
  if (asset.useful_life_months <= 0) return 0;
  const base = asset.purchase_price - (asset.residual_value ?? 0);
  if (base <= 0) return 0;
  return round2(base / asset.useful_life_months);
}

/**
 * Wie viele volle Monate sind zwischen from und to vergangen?
 * Tagesgenauer Cut: ein Monat zaehlt erst, wenn der Tag erreicht/ueberschritten wird.
 */
export function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Berechnet den Zeitwert zum Stichtag (ohne DB-Fortschreibung).
 * Wird fuer Anzeigen + Vertrags-PDF-Fallback genutzt.
 */
export function computeCurrentValue(asset: DepreciableAsset, asOf: Date = new Date()): number {
  if (asset.depreciation_method === 'immediate') {
    return asset.residual_value ?? 0;
  }
  if (asset.depreciation_method === 'none') {
    return asset.purchase_price;
  }
  const months = monthsBetween(asset.purchase_date, asOf.toISOString().slice(0, 10));
  const rate = monthlyDepreciationRate(asset);
  const depreciated = asset.purchase_price - rate * months;
  const floor = asset.residual_value ?? 0;
  return round2(Math.max(floor, depreciated));
}

/**
 * Prueft ob fuer den gegebenen Monat (YYYY-MM) bereits eine AfA-Buchung lief.
 * Das Kriterium: last_depreciation_at liegt im selben Monat.
 */
export function wasDepreciatedInMonth(asset: DepreciableAsset, yyyyMm: string): boolean {
  if (!asset.last_depreciation_at) return false;
  return asset.last_depreciation_at.slice(0, 7) === yyyyMm;
}

/**
 * Liefert die Liste der noch offenen Monate (YYYY-MM), fuer die AfA nachgetragen
 * werden muesste. Wird vom Catchup-Endpoint genutzt.
 */
export function pendingDepreciationMonths(asset: DepreciableAsset, asOf: Date = new Date()): string[] {
  if (asset.depreciation_method !== 'linear') return [];
  const start = asset.last_depreciation_at
    ? addMonths(asset.last_depreciation_at.slice(0, 10), 1)
    : asset.purchase_date;
  const endKey = monthKey(asOf);
  const months: string[] = [];
  let cursor = start.slice(0, 10);
  let guard = 0;
  while (cursor.slice(0, 7) <= endKey && guard < 240) {
    months.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return months;
}

/**
 * Restwert ist erreicht, wenn der Zeitwert nicht weiter unter den Restwert
 * gedrueckt werden darf.
 */
export function isFullyDepreciated(asset: DepreciableAsset): boolean {
  const floor = asset.residual_value ?? 0;
  return asset.current_value <= floor + 0.01;
}

// ────── interne Helfer ──────

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function addMonths(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
