/**
 * Wiederbeschaffungswert (WBW) — pauschalierte Wertminderung pro Anlage.
 *
 * Hintergrund: Bei Verlust/Totalschaden einer gemieteten Sache schuldet der
 * Mieter Schadensersatz nach § 249 BGB — und zwar zum tatsaechlichen
 * Marktwert (= Gebrauchtwert), nicht zum Neupreis. Wir bilden diesen
 * Marktverlust mit einer linearen Wertminderung von 100 % auf einen
 * konfigurierbaren Floor (Default 40 %) ueber eine konfigurierbare
 * Nutzungsdauer (Default 36 Monate) ab. Danach bleibt der Wert konstant.
 *
 * Beispiel mit Defaults:
 *   - Heute gekauft: 100 % vom Kaufpreis
 *   - 12 Monate alt: 100 - (12/36) * (100 - 40) = 80 %
 *   - 24 Monate alt: 60 %
 *   - 36 Monate alt: 40 %
 *   - 48 Monate alt: 40 % (Floor)
 *
 * **Override**: assets.replacement_value_estimate hat Vorrang vor der
 * Berechnung — manuell gesetzte Werte gelten 1:1 (z.B. wenn der echte
 * Marktwert besonders abgestuerzt ist oder ein Nachfolgemodell den
 * Preis druecken sollte).
 *
 * **Rechtssicherheit**: 40 % Floor ist branchenuebliche Pauschale fuer
 * Action-Cams / Akkus / Speicher. Bei Streit kann der Mieter nachweisen,
 * dass der echte Marktwert geringer ist — dann gilt der echte Wert.
 * Im Vertrag muss die Berechnung transparent erklaert werden.
 */

export interface ReplacementValueConfig {
  /** Floor in Prozent (0-100). Default 40. */
  floor_percent: number;
  /** Linear-Wertverfall ueber so viele Monate. Default 36. */
  useful_life_months: number;
}

export const DEFAULT_REPLACEMENT_VALUE_CONFIG: ReplacementValueConfig = {
  floor_percent: 40,
  useful_life_months: 36,
};

export interface AssetForReplacementValue {
  purchase_price: number | string;
  purchase_date: string; // ISO YYYY-MM-DD
  /** Manuelles Override. Wenn != null, wird DIESER Wert genommen. */
  replacement_value_estimate?: number | string | null;
}

/**
 * Berechnet den aktuellen Wiederbeschaffungswert.
 * Reine Pure-Function — keine DB-Zugriffe.
 */
export function computeReplacementValue(
  asset: AssetForReplacementValue,
  config: ReplacementValueConfig = DEFAULT_REPLACEMENT_VALUE_CONFIG,
  asOf: Date = new Date(),
): number {
  // Override hat Vorrang
  if (asset.replacement_value_estimate != null && asset.replacement_value_estimate !== '') {
    const override = Number(asset.replacement_value_estimate);
    if (Number.isFinite(override) && override >= 0) return round2(override);
  }

  const price = Number(asset.purchase_price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  const months = monthsBetween(asset.purchase_date, asOf);
  const floorPct = clamp(Number(config.floor_percent ?? 40), 0, 100) / 100;
  const life = Math.max(1, Number(config.useful_life_months ?? 36));

  const remainingPctRange = 1 - floorPct; // z.B. 0.60 wenn floor 40 %
  const elapsedFraction = Math.min(months / life, 1);
  const factor = 1 - remainingPctRange * elapsedFraction;
  // factor liegt jetzt zwischen 1.0 (bei months=0) und floorPct (bei months>=life)

  return round2(Math.max(price * floorPct, price * factor));
}

/**
 * Liefert eine kurze Erklaerung des aktuellen Wertes — fuer Tooltips/UI.
 */
export function explainReplacementValue(
  asset: AssetForReplacementValue,
  config: ReplacementValueConfig = DEFAULT_REPLACEMENT_VALUE_CONFIG,
  asOf: Date = new Date(),
): { source: 'manual' | 'computed' | 'floor' | 'fresh'; ageMonths: number; pct: number } {
  if (asset.replacement_value_estimate != null && asset.replacement_value_estimate !== '') {
    const price = Number(asset.purchase_price ?? 0);
    const override = Number(asset.replacement_value_estimate);
    return { source: 'manual', ageMonths: monthsBetween(asset.purchase_date, asOf), pct: price > 0 ? round2((override / price) * 100) : 0 };
  }

  const months = monthsBetween(asset.purchase_date, asOf);
  const life = Math.max(1, Number(config.useful_life_months ?? 36));
  const floorPct = clamp(Number(config.floor_percent ?? 40), 0, 100);

  if (months >= life) {
    return { source: 'floor', ageMonths: months, pct: floorPct };
  }
  if (months <= 0) {
    return { source: 'fresh', ageMonths: 0, pct: 100 };
  }
  const remainingPctRange = 100 - floorPct;
  const elapsedFraction = months / life;
  const pct = round2(100 - remainingPctRange * elapsedFraction);
  return { source: 'computed', ageMonths: months, pct };
}

/**
 * Laedt die Konfiguration aus admin_settings.replacement_value_config.
 * Defensiv: bei fehlendem Setting/Fehler -> Defaults.
 *
 * Akzeptiert einen Supabase-Client (any-Type, weil das Generic schwer
 * zu typisieren ist und wir die Methodenkette ohnehin runtime-checken).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReplacementValueConfig(supabase: any): Promise<ReplacementValueConfig> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'replacement_value_config')
      .maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      const v = data.value as Partial<ReplacementValueConfig>;
      return {
        floor_percent: typeof v.floor_percent === 'number' && v.floor_percent >= 0 && v.floor_percent <= 100
          ? v.floor_percent : DEFAULT_REPLACEMENT_VALUE_CONFIG.floor_percent,
        useful_life_months: typeof v.useful_life_months === 'number' && v.useful_life_months > 0
          ? v.useful_life_months : DEFAULT_REPLACEMENT_VALUE_CONFIG.useful_life_months,
      };
    }
  } catch {
    // Fallback auf Defaults
  }
  return DEFAULT_REPLACEMENT_VALUE_CONFIG;
}

// ─── interne Helfer ───────────────────────────────────────────────────────

function monthsBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
