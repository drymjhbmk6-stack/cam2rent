/**
 * Zentraler Konten-Mapper.
 *
 * Loest semantische Kategorien wie 'stripe_fees' oder 'rental_camera' auf
 * SKR03-Konten auf. Quelle der Wahrheit: admin_settings.kontenrahmen_mapping.
 *
 * Stand heute (Kleinunternehmer): die Mapping-Werte werden NUR fuer den
 * DATEV-Export genutzt, der die Konten direkt schreibt. Sobald die App auf
 * Regelbesteuerung wechselt oder ein Belegjournal aktiviert wird, hat man
 * die Konto-Zuordnung fuer JEDEN neuen Datensatz vorbereitet — kein Refactor
 * von 50 API-Routen noetig, sondern nur diese eine Lib aufrufen.
 *
 * Cache: 60s In-Memory. Bei Aenderung des Mappings entweder warten oder
 * `invalidateKontenrahmenCache()` aufrufen.
 */

import { createServiceClient } from '@/lib/supabase';

export type ErloeseKey =
  | 'mietumsatz'
  | 'mietumsatz_kleinunternehmer'
  | 'versand_an_kunden'
  | 'haftungsschutz';

export type AufwandKey =
  | 'wareneingang'
  | 'reparaturen'
  | 'porto_versand'
  | 'stripe_fees'
  | 'software'
  | 'marketing'
  | 'office'
  | 'travel'
  | 'insurance'
  | 'legal'
  | 'depreciation'
  | 'asset_purchase'
  | 'other';

export type BestandKey =
  | 'rental_camera'
  | 'rental_accessory'
  | 'office_equipment'
  | 'vehicle'
  | 'software_asset';

export interface KontenrahmenMapping {
  erloese: Record<ErloeseKey, string>;
  aufwand: Record<AufwandKey, string>;
  bestand: Record<BestandKey, string>;
  forderungen: string;
  verbindlichkeiten: string;
  stripe_konto: string;
  kasse: string;
  bank_giro: string;
  ust_19: string;
  vorsteuer_19: string;
}

const DEFAULT_MAPPING: KontenrahmenMapping = {
  erloese: {
    mietumsatz: '8400',
    mietumsatz_kleinunternehmer: '8200',
    versand_an_kunden: '8400',
    haftungsschutz: '8400',
  },
  aufwand: {
    wareneingang: '3400',
    reparaturen: '4805',
    porto_versand: '4910',
    stripe_fees: '4970',
    software: '4860',
    marketing: '4980',
    office: '4950',
    travel: '4673',
    insurance: '4360',
    legal: '4950',
    depreciation: '4830',
    asset_purchase: '4855',
    other: '4900',
  },
  bestand: {
    rental_camera: '0420',
    rental_accessory: '0490',
    office_equipment: '0410',
    vehicle: '0320',
    software_asset: '0125',
  },
  forderungen: '1400',
  verbindlichkeiten: '3300',
  stripe_konto: '1361',
  kasse: '1000',
  bank_giro: '1200',
  ust_19: '1776',
  vorsteuer_19: '1576',
};

const CACHE_TTL_MS = 60_000;
let cache: { value: KontenrahmenMapping; expiresAt: number } | null = null;

export function invalidateKontenrahmenCache(): void {
  cache = null;
}

export async function loadKontenrahmen(): Promise<KontenrahmenMapping> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'kontenrahmen_mapping')
      .maybeSingle();

    const stored = (data?.value as Partial<KontenrahmenMapping> | null) || {};
    // Defensive merge: fehlende Keys aus DEFAULT_MAPPING
    const merged: KontenrahmenMapping = {
      ...DEFAULT_MAPPING,
      ...stored,
      erloese: { ...DEFAULT_MAPPING.erloese, ...(stored.erloese || {}) },
      aufwand: { ...DEFAULT_MAPPING.aufwand, ...(stored.aufwand || {}) },
      bestand: { ...DEFAULT_MAPPING.bestand, ...(stored.bestand || {}) },
    };
    cache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
    return merged;
  } catch {
    return DEFAULT_MAPPING;
  }
}

/**
 * Konto fuer einen Erloes-Beleg (Kunden-Rechnung).
 * Im Klein-Modus wird automatisch das Konto fuer Kleinunternehmer genutzt.
 */
export async function accountForErloes(
  category: ErloeseKey,
  taxMode: 'kleinunternehmer' | 'regelbesteuerung' = 'regelbesteuerung'
): Promise<string> {
  const map = await loadKontenrahmen();
  if (taxMode === 'kleinunternehmer' && category === 'mietumsatz') {
    return map.erloese.mietumsatz_kleinunternehmer;
  }
  return map.erloese[category];
}

export async function accountForAufwand(category: AufwandKey): Promise<string> {
  const map = await loadKontenrahmen();
  return map.aufwand[category] ?? map.aufwand.other;
}

export async function accountForBestand(kind: BestandKey): Promise<string> {
  const map = await loadKontenrahmen();
  return map.bestand[kind] ?? map.bestand.office_equipment;
}

/**
 * Auflistung der bekannten Konten fuer UI-Auto-Suggest.
 */
export async function listAllAccounts(): Promise<Array<{ code: string; label: string; group: string }>> {
  const map = await loadKontenrahmen();
  const out: Array<{ code: string; label: string; group: string }> = [];

  (Object.entries(map.erloese) as Array<[ErloeseKey, string]>).forEach(([k, v]) =>
    out.push({ code: v, label: erloeseLabel(k), group: 'Erloese' })
  );
  (Object.entries(map.aufwand) as Array<[AufwandKey, string]>).forEach(([k, v]) =>
    out.push({ code: v, label: aufwandLabel(k), group: 'Aufwendungen' })
  );
  (Object.entries(map.bestand) as Array<[BestandKey, string]>).forEach(([k, v]) =>
    out.push({ code: v, label: bestandLabel(k), group: 'Anlagen' })
  );
  out.push(
    { code: map.forderungen, label: 'Forderungen aus L+L', group: 'Bilanz' },
    { code: map.verbindlichkeiten, label: 'Verbindlichkeiten aus L+L', group: 'Bilanz' },
    { code: map.stripe_konto, label: 'Stripe-Verrechnungskonto', group: 'Bank' },
    { code: map.kasse, label: 'Kasse', group: 'Bank' },
    { code: map.bank_giro, label: 'Bank Giro', group: 'Bank' },
    { code: map.ust_19, label: 'Umsatzsteuer 19%', group: 'Steuer' },
    { code: map.vorsteuer_19, label: 'Vorsteuer 19%', group: 'Steuer' }
  );

  return out;
}

function erloeseLabel(k: ErloeseKey): string {
  return {
    mietumsatz: 'Mietumsatz',
    mietumsatz_kleinunternehmer: 'Mietumsatz (Kleinunternehmer)',
    versand_an_kunden: 'Versandkosten an Kunden',
    haftungsschutz: 'Haftungsschutz-Praemie',
  }[k];
}

function aufwandLabel(k: AufwandKey): string {
  return {
    wareneingang: 'Wareneingang',
    reparaturen: 'Reparaturen / Wartung',
    porto_versand: 'Porto / Versand',
    stripe_fees: 'Stripe-Gebuehren',
    software: 'Software / Abos',
    marketing: 'Marketing',
    office: 'Buerobedarf',
    travel: 'Reisekosten',
    insurance: 'Versicherungen',
    legal: 'Beratung / Recht',
    depreciation: 'Abschreibungen (AfA)',
    asset_purchase: 'GWG-Sofortabzug',
    other: 'Sonstige Aufwendungen',
  }[k];
}

function bestandLabel(k: BestandKey): string {
  return {
    rental_camera: 'Vermietkameras',
    rental_accessory: 'Vermietzubehoer',
    office_equipment: 'Buero-Ausstattung',
    vehicle: 'Fahrzeug',
    software_asset: 'Software (aktiviert)',
  }[k];
}

/**
 * Ableitung Konto aus Expense-Kategorie. Fallback: 'other'.
 */
export async function accountForExpenseCategory(category: string | null | undefined): Promise<string> {
  const map: Record<string, AufwandKey> = {
    fees: 'stripe_fees',
    stripe_fees: 'stripe_fees',
    shipping: 'porto_versand',
    software: 'software',
    hardware: 'wareneingang',
    marketing: 'marketing',
    office: 'office',
    travel: 'travel',
    insurance: 'insurance',
    legal: 'legal',
    depreciation: 'depreciation',
    asset_purchase: 'asset_purchase',
    other: 'other',
  };
  const key = (category && map[category]) || 'other';
  return accountForAufwand(key);
}
