/**
 * Kategorie-spezifische Spezifikationen für Zubehör.
 *
 * Speicherort: accessories.specs JSONB. Welche Felder eingeblendet werden,
 * haengt von der Kategorie ab. Gewicht (weight_g) wird ueberall gezeigt,
 * weil wir es fuer die Versand-Schaetzung brauchen.
 *
 * Migration: supabase/supabase-accessory-specs.sql
 */

export interface AccessorySpecs {
  /** Gewicht in Gramm — fuer Paket-/Versand-Berechnung. Gilt fuer alle Kategorien. */
  weight_g?: number;
  /** Akku-Kapazitaet in mAh. Nur "Akku". */
  mah?: number;
  /** Speicherkapazitaet in GB. Nur "Speicher". */
  storage_gb?: number;
  /** ND-Filter-Werte (z.B. ['ND8', 'ND16', 'ND32']). Nur Filter-Kategorien. */
  nd_values?: string[];
  /** Minimale Laenge in cm — Stative + Selfi-Sticks. */
  length_min_cm?: number;
  /** Maximale Laenge in cm — Stative + Selfi-Sticks. */
  length_max_cm?: number;
}

export type SpecFieldKind =
  | 'weight_g'
  | 'mah'
  | 'storage_gb'
  | 'nd_values'
  | 'length_min_cm'
  | 'length_max_cm';

/**
 * Kategoriebasiert: welche Felder werden angezeigt? Kategorien sind dynamisch
 * (admin_settings.accessory_categories), wir matchen ueber Aliasse statt
 * exakter Strings — damit "Selfie-Stick", "Selfi-Stick", "selfie stick" etc.
 * alle dasselbe Feld-Set bekommen.
 */
export function getSpecFieldsForCategory(category: string | null | undefined): SpecFieldKind[] {
  const cat = (category ?? '').trim().toLowerCase();
  const specific: SpecFieldKind[] = [];

  if (cat) {
    // Akku
    if (/^akku|battery|akkus?$/.test(cat)) {
      specific.push('mah');
    } else if (/speicher|sd-?karte|sd ?card|micro ?sd|memory/.test(cat)) {
      // Speicher / Speicherkarte
      specific.push('storage_gb');
    } else if (/^nd-?filter|filter$|filters?$/.test(cat)) {
      // ND-Filter / Filter
      specific.push('nd_values');
    } else if (/stativ|tripod|selfi|selfie|stick|gimbal/.test(cat)) {
      // Stativ + Selfie-Stick
      specific.push('length_min_cm', 'length_max_cm');
    }
    // Sonstige (Halterung, Schutz, Audio, Mikrofon, …) → keine Spezialfelder.
  }

  // Gewicht ist IMMER dabei — fuer alle Kategorien, weil wir es fuer die
  // Paket-/Versand-Berechnung aufaddieren.
  return [...specific, 'weight_g'];
}

interface SpecFieldDefinition {
  kind: SpecFieldKind;
  label: string;
  unit: string;
  type: 'number' | 'array_string';
  step?: number;
  placeholder?: string;
  helpText?: string;
}

export const SPEC_FIELD_DEFINITIONS: Record<SpecFieldKind, SpecFieldDefinition> = {
  weight_g: {
    kind: 'weight_g',
    label: 'Gewicht',
    unit: 'g',
    type: 'number',
    step: 1,
    placeholder: 'z.B. 50',
    helpText: 'Wird für Paket-/Versandgewicht aufaddiert.',
  },
  mah: {
    kind: 'mah',
    label: 'Kapazität',
    unit: 'mAh',
    type: 'number',
    step: 50,
    placeholder: 'z.B. 1750',
  },
  storage_gb: {
    kind: 'storage_gb',
    label: 'Speichergröße',
    unit: 'GB',
    type: 'number',
    step: 1,
    placeholder: 'z.B. 128',
  },
  nd_values: {
    kind: 'nd_values',
    label: 'ND-Werte',
    unit: '',
    type: 'array_string',
    placeholder: 'z.B. ND8, ND16, ND32',
    helpText: 'Mehrere Werte mit Komma trennen.',
  },
  length_min_cm: {
    kind: 'length_min_cm',
    label: 'Min. Länge',
    unit: 'cm',
    type: 'number',
    step: 1,
    placeholder: 'z.B. 22',
  },
  length_max_cm: {
    kind: 'length_max_cm',
    label: 'Max. Länge',
    unit: 'cm',
    type: 'number',
    step: 1,
    placeholder: 'z.B. 80',
  },
};

/**
 * Sanitize fuer Server-Persistierung. Verwirft alles was kein gueltiger
 * Spec-Wert ist (kategoriefremde Felder, NaN, leere Arrays, Strings statt
 * Number etc.). Gibt das Resultat als plain Object zurueck — kein JSONB-
 * Cast noetig, Supabase-JS macht das automatisch.
 */
export function sanitizeSpecs(input: unknown): AccessorySpecs {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: AccessorySpecs = {};

  const num = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const w = num(raw.weight_g); if (w !== undefined) out.weight_g = w;
  const m = num(raw.mah); if (m !== undefined) out.mah = m;
  const s = num(raw.storage_gb); if (s !== undefined) out.storage_gb = s;
  const lmin = num(raw.length_min_cm); if (lmin !== undefined) out.length_min_cm = lmin;
  const lmax = num(raw.length_max_cm); if (lmax !== undefined) out.length_max_cm = lmax;

  if (Array.isArray(raw.nd_values)) {
    const arr = raw.nd_values
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0 && v.length < 30)
      .slice(0, 12);
    if (arr.length > 0) out.nd_values = arr;
  }

  return out;
}

/**
 * Format-Helper fuer Display in DataGrid-Zellen.
 */
export function formatSpecValue(kind: SpecFieldKind, value: unknown): string {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  const def = SPEC_FIELD_DEFINITIONS[kind];
  if (def.type === 'array_string' && Array.isArray(value)) {
    return value.join(', ');
  }
  if (def.type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n)) return '—';
    const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
    return def.unit ? `${formatted} ${def.unit}` : formatted;
  }
  return String(value);
}

/**
 * Liefert die DataGrid-Items fuer eine Scan-Karte. Bereits formatiert,
 * nur Felder die zur Kategorie passen UND einen Wert haben.
 */
export function buildSpecDataGridItems(
  category: string | null | undefined,
  specs: AccessorySpecs | null | undefined,
): Array<{ label: string; value: string }> {
  if (!specs) return [];
  const fields = getSpecFieldsForCategory(category);
  const out: Array<{ label: string; value: string }> = [];
  for (const kind of fields) {
    const value = specs[kind];
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    const def = SPEC_FIELD_DEFINITIONS[kind];
    out.push({ label: def.label, value: formatSpecValue(kind, value) });
  }
  return out;
}
