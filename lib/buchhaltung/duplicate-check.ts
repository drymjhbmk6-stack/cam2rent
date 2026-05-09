import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inhaltsbasierte Duplikat-Erkennung fuer Belege.
 *
 * Ergaenzt den File-Hash-Check (siehe app/api/admin/belege/[id]/anhaenge/route.ts).
 * Der Hash-Check schlaegt nur bei byte-identischen Dateien an. Der inhalts-
 * basierte Check hier matcht auf Lieferant + Rg-Nr (strict) oder Lieferant
 * + Datum + Brutto (soft).
 *
 * Wird nach OCR-Abschluss + nach manueller Beleg-Anlage gerufen.
 *
 * Defensive Behandlung fehlender Migration: Bei Errors auf der neuen
 * Verdacht-Spalte fallen wir lautlos zurueck (kein Block, keine Warnung) —
 * das System soll nie haengen bleiben, nur weil die Migration noch nicht
 * durch ist.
 */

export interface DuplicateCheckInput {
  belegId: string;            // Self-Exclude
  lieferantId: string | null;
  belegDatum: string | null;  // 'YYYY-MM-DD'
  rechnungsnummerLieferant: string | null;
  summeBrutto: number | null; // Decimal als JS-Number
  isTest: boolean;
}

export interface DuplicateMatch {
  kind: 'strict' | 'soft';
  reason: string;
  existing: { id: string; beleg_nr: string };
}

/**
 * Liefert null wenn kein Verdacht, sonst Match-Objekt.
 *
 * Strict-Match (sehr hohe Sicherheit) — gleicher Lieferant + gleiche
 * Rechnungsnummer-Lieferant. Jeder Lieferant vergibt jede Rechnungsnummer
 * nur einmal, daher de-facto-Beweis fuer Duplikat.
 *
 * Soft-Match (Verdacht) — gleicher Lieferant + gleiches Datum + gleicher
 * Brutto-Betrag (cents-genau). Falsch-Positive moeglich, wenn jemand am
 * gleichen Tag zufaellig zwei gleichteure Sachen beim gleichen Haendler
 * kauft — daher nur als Warn-Flag, nicht als Hard-Block beim Anlegen.
 */
export async function findContentDuplicate(
  supabase: SupabaseClient,
  input: DuplicateCheckInput,
): Promise<DuplicateMatch | null> {
  const rgNr = (input.rechnungsnummerLieferant ?? '').trim();

  // 1. Strict: lieferant_id + rechnungsnummer_lieferant
  if (input.lieferantId && rgNr) {
    const { data, error } = await supabase
      .from('belege')
      .select('id, beleg_nr')
      .eq('lieferant_id', input.lieferantId)
      .eq('rechnungsnummer_lieferant', rgNr)
      .eq('is_test', input.isTest)
      .neq('id', input.belegId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return {
        kind: 'strict',
        reason: `Gleicher Lieferant + gleiche Rechnungsnummer "${rgNr}" wie ${(data as { beleg_nr: string }).beleg_nr}`,
        existing: data as { id: string; beleg_nr: string },
      };
    }
  }

  // 2. Soft: lieferant_id + beleg_datum + summe_brutto
  if (input.lieferantId && input.belegDatum && typeof input.summeBrutto === 'number' && input.summeBrutto > 0) {
    // Cents-genaue Brutto-Pruefung. Decimal aus DB kommt als Number zurueck —
    // float-Rundungsfehler durch Range-Filter neutralisieren (±0.005).
    const lo = Number((input.summeBrutto - 0.005).toFixed(2));
    const hi = Number((input.summeBrutto + 0.005).toFixed(2));
    const { data, error } = await supabase
      .from('belege')
      .select('id, beleg_nr')
      .eq('lieferant_id', input.lieferantId)
      .eq('beleg_datum', input.belegDatum)
      .gte('summe_brutto', lo)
      .lte('summe_brutto', hi)
      .eq('is_test', input.isTest)
      .neq('id', input.belegId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return {
        kind: 'soft',
        reason: `Gleicher Lieferant + gleiches Datum + gleicher Brutto-Betrag wie ${(data as { beleg_nr: string }).beleg_nr}`,
        existing: data as { id: string; beleg_nr: string },
      };
    }
  }

  return null;
}

/**
 * Schreibt das Verdacht-Flag in den Beleg. Bei fehlender Migration laeuft
 * der UPDATE silent durch — der OCR-/Anlege-Pfad soll nicht brechen, weil die
 * neue Spalte noch nicht existiert.
 */
export async function persistDuplicateWarning(
  supabase: SupabaseClient,
  belegId: string,
  match: DuplicateMatch | null,
): Promise<void> {
  const patch = match
    ? {
        verdacht_duplikat_beleg_id: match.existing.id,
        verdacht_duplikat_grund: match.reason.slice(0, 500),
        verdacht_duplikat_dismissed_at: null,
      }
    : {
        verdacht_duplikat_beleg_id: null,
        verdacht_duplikat_grund: null,
        verdacht_duplikat_dismissed_at: null,
      };

  const { error } = await supabase.from('belege').update(patch).eq('id', belegId);
  if (error && /verdacht_duplikat/i.test(error.message)) {
    // Migration noch nicht durch — defensiv ignorieren.
    return;
  }
  if (error) {
    console.error('[duplicate-check] persistDuplicateWarning:', error.message);
  }
}
