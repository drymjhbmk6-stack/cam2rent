/**
 * Helper-Funktionen rund um Belege.
 *
 * - nextBelegNr() ruft die Postgres-RPC `naechste_beleg_nummer(jahr)` auf
 *   die in supabase/buchhaltung-konsolidierung.sql definiert ist und atomar
 *   eine luekenlose Belegnummer pro Jahr vergibt.
 * - recomputeSummen() summiert beleg_positionen.gesamt_netto/brutto auf den
 *   uebergeordneten Beleg.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export async function nextBelegNr(
  supabase: SupabaseClient,
  jahr: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('naechste_beleg_nummer', { p_jahr: jahr });
  if (error) throw new Error(`naechste_beleg_nummer: ${error.message}`);
  return data as string;
}

export async function recomputeBelegSummen(
  supabase: SupabaseClient,
  belegId: string,
): Promise<{ summe_netto: number; summe_brutto: number }> {
  const { data, error } = await supabase
    .from('beleg_positionen')
    .select('gesamt_netto, gesamt_brutto')
    .eq('beleg_id', belegId);
  if (error) throw error;

  const summe_netto = (data ?? []).reduce(
    (s, r) => s + Number((r as { gesamt_netto: number }).gesamt_netto ?? 0),
    0,
  );
  const summe_brutto = (data ?? []).reduce(
    (s, r) => s + Number((r as { gesamt_brutto: number }).gesamt_brutto ?? 0),
    0,
  );

  await supabase
    .from('belege')
    .update({
      summe_netto: Math.round(summe_netto * 100) / 100,
      summe_brutto: Math.round(summe_brutto * 100) / 100,
    })
    .eq('id', belegId);

  return {
    summe_netto: Math.round(summe_netto * 100) / 100,
    summe_brutto: Math.round(summe_brutto * 100) / 100,
  };
}

/**
 * Pruefen, ob alle Positionen eines Belegs klassifiziert sind.
 * Wird vor der Festschreibung aufgerufen.
 */
export async function isBelegFullyClassified(
  supabase: SupabaseClient,
  belegId: string,
): Promise<{ ok: boolean; pendingCount: number; totalCount: number }> {
  const { data, error } = await supabase
    .from('beleg_positionen')
    .select('klassifizierung')
    .eq('beleg_id', belegId);
  if (error) throw error;
  const total = (data ?? []).length;
  const pending = (data ?? []).filter(
    (r) => (r as { klassifizierung: string }).klassifizierung === 'pending',
  ).length;
  return { ok: pending === 0 && total > 0, pendingCount: pending, totalCount: total };
}

export type BelegPositionInput = {
  reihenfolge?: number;
  bezeichnung: string;
  menge: number;
  einzelpreis_netto: number;
  mwst_satz?: number;
  klassifizierung?: 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'ignoriert';
  kategorie?: string | null;
  notizen?: string | null;
  ki_vorschlag?: Record<string, unknown> | null;
};

/**
 * Sanity-Check fuer Position-Inputs (clamping, defaults).
 */
export function sanitizePosition(input: BelegPositionInput): BelegPositionInput {
  return {
    reihenfolge: Math.max(0, Math.floor(input.reihenfolge ?? 0)),
    bezeichnung: String(input.bezeichnung ?? '').trim().slice(0, 500),
    menge: Math.max(1, Math.floor(input.menge ?? 1)),
    einzelpreis_netto: Math.round(Number(input.einzelpreis_netto ?? 0) * 100) / 100,
    mwst_satz: typeof input.mwst_satz === 'number'
      ? Math.max(0, Math.min(100, Math.round(input.mwst_satz * 100) / 100))
      : 19.0,
    klassifizierung: input.klassifizierung ?? 'pending',
    kategorie: input.kategorie ?? null,
    notizen: input.notizen ? String(input.notizen).trim().slice(0, 2000) : null,
    ki_vorschlag: input.ki_vorschlag ?? null,
  };
}
