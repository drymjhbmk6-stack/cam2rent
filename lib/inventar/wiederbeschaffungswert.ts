/**
 * Wiederbeschaffungswert-Berechnung fuer inventar_units (neue Welt).
 *
 * Entscheidungsbaum (in dieser Reihenfolge):
 *   1. Wenn unit.wbw_manuell_gesetzt === true → unit.wiederbeschaffungswert
 *      (manueller Override hat IMMER Vorrang)
 *   2. Wenn unit.kaufpreis_netto IS NULL → null
 *      (Pfad-B-Stueck ohne Beleg → kein berechenbarer Wert, UI zeigt
 *      "Nicht gesetzt", Konsumenten muessen null sauber behandeln)
 *   3. Sonst: lineare Wertminderung von kaufpreis_netto auf
 *      floor_percent * kaufpreis_netto ueber useful_life_months,
 *      danach konstant.
 *
 * Config wird ueber loadWbwConfig() aus admin_settings geladen,
 * Cache mit 5-Min-TTL.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';

export interface WbwConfig {
  floor_percent: number;       // 0..100, Default 40
  useful_life_months: number;  // >= 1, Default 36
}

export interface InventarUnitForWbw {
  wbw_manuell_gesetzt: boolean;
  wiederbeschaffungswert: number | null;
  kaufpreis_netto: number | null;
  kaufdatum: string | null;
}

const DEFAULT_CONFIG: WbwConfig = { floor_percent: 40, useful_life_months: 36 };

let cachedConfig: { value: WbwConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadWbwConfig(supabase?: SupabaseClient): Promise<WbwConfig> {
  if (cachedConfig && Date.now() < cachedConfig.expiresAt) return cachedConfig.value;

  const sb = supabase ?? createServiceClient();
  const { data } = await sb
    .from('admin_settings').select('value').eq('key', 'replacement_value_config').maybeSingle();

  let cfg = DEFAULT_CONFIG;
  if (data?.value) {
    const v = data.value as Partial<WbwConfig>;
    cfg = {
      floor_percent: typeof v.floor_percent === 'number' && v.floor_percent >= 0 && v.floor_percent <= 100
        ? v.floor_percent : DEFAULT_CONFIG.floor_percent,
      useful_life_months: typeof v.useful_life_months === 'number' && v.useful_life_months >= 1
        ? Math.round(v.useful_life_months) : DEFAULT_CONFIG.useful_life_months,
    };
  }
  cachedConfig = { value: cfg, expiresAt: Date.now() + CACHE_TTL_MS };
  return cfg;
}

export function invalidateWbwConfigCache() {
  cachedConfig = null;
}

export async function saveWbwConfig(cfg: WbwConfig, supabase?: SupabaseClient): Promise<void> {
  const sb = supabase ?? createServiceClient();
  if (cfg.floor_percent < 0 || cfg.floor_percent > 100) throw new Error('floor_percent must be 0..100');
  if (cfg.useful_life_months < 1) throw new Error('useful_life_months must be >= 1');
  await sb.from('admin_settings').upsert({
    key: 'replacement_value_config',
    value: cfg,
  });
  invalidateWbwConfigCache();
}

/**
 * Berechnet den Wiederbeschaffungswert gemaess Entscheidungsbaum.
 * Liefert null wenn weder Override noch Kaufpreis vorhanden.
 */
export function computeWBW(
  unit: InventarUnitForWbw,
  config: WbwConfig,
  asOf: Date = new Date(),
): number | null {
  // 1) Manueller Override hat Vorrang
  if (unit.wbw_manuell_gesetzt && unit.wiederbeschaffungswert !== null) {
    return Math.round(unit.wiederbeschaffungswert * 100) / 100;
  }

  // 2) Kein Kaufpreis → kein berechenbarer Wert
  if (unit.kaufpreis_netto === null || unit.kaufpreis_netto === undefined) {
    return null;
  }

  const kaufpreis = Number(unit.kaufpreis_netto);
  const floor = (config.floor_percent / 100) * kaufpreis;

  if (!unit.kaufdatum) {
    // Ohne Datum konservativ: voller Kaufpreis
    return Math.round(kaufpreis * 100) / 100;
  }

  const kaufDate = new Date(unit.kaufdatum);
  const monthsElapsed = Math.max(
    0,
    (asOf.getFullYear() - kaufDate.getFullYear()) * 12 + (asOf.getMonth() - kaufDate.getMonth()),
  );

  if (monthsElapsed >= config.useful_life_months) {
    return Math.round(floor * 100) / 100;
  }

  // Linear: kaufpreis - (kaufpreis - floor) * (monthsElapsed / useful_life_months)
  const decline = (kaufpreis - floor) * (monthsElapsed / config.useful_life_months);
  return Math.round((kaufpreis - decline) * 100) / 100;
}

export interface WbwExplain {
  value: number | null;
  source: 'manual' | 'computed' | 'floor' | 'fresh' | 'no-price';
  monthsElapsed?: number;
}

export function explainWBW(
  unit: InventarUnitForWbw,
  config: WbwConfig,
  asOf: Date = new Date(),
): WbwExplain {
  if (unit.wbw_manuell_gesetzt && unit.wiederbeschaffungswert !== null) {
    return { value: Math.round(unit.wiederbeschaffungswert * 100) / 100, source: 'manual' };
  }
  if (unit.kaufpreis_netto === null || unit.kaufpreis_netto === undefined) {
    return { value: null, source: 'no-price' };
  }
  if (!unit.kaufdatum) {
    return { value: Math.round(Number(unit.kaufpreis_netto) * 100) / 100, source: 'fresh' };
  }
  const value = computeWBW(unit, config, asOf);
  const kaufDate = new Date(unit.kaufdatum);
  const monthsElapsed = Math.max(
    0,
    (asOf.getFullYear() - kaufDate.getFullYear()) * 12 + (asOf.getMonth() - kaufDate.getMonth()),
  );
  return {
    value,
    source: monthsElapsed >= config.useful_life_months ? 'floor' : 'computed',
    monthsElapsed,
  };
}
