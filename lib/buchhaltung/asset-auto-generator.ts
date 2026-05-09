/**
 * Auto-Asset-Generierung beim Festschreiben eines Belegs.
 *
 * Pro afa/gwg-Position wird genau 1 Asset in der NEUEN Tabelle (assets_neu
 * waehrend Sessions B-D, danach assets) angelegt.
 *
 * - afa  → afa_methode='linear', nutzungsdauer aus ki_vorschlag oder Default,
 *          aktueller_buchwert = anschaffungskosten_netto
 * - gwg  → afa_methode='sofort_gwg', sofortige afa_buchung mit voller Hoehe,
 *          aktueller_buchwert = 0
 *
 * Heuristik fuer art:
 *   1. Wenn ki_vorschlag.art gesetzt → diese
 *   2. Sonst: 'sonstiges'
 *
 * Default-Nutzungsdauer (Monate):
 *   - kamera: 84 (7 Jahre AfA-Tabelle)
 *   - zubehoer: 60
 *   - werkzeug: 96
 *   - buero: 96
 *   - sonstiges: 60
 */

import { SupabaseClient } from '@supabase/supabase-js';

type AssetArt = 'kamera' | 'zubehoer' | 'buero' | 'werkzeug' | 'sonstiges';

const ALLOWED_ART: ReadonlySet<AssetArt> = new Set([
  'kamera', 'zubehoer', 'buero', 'werkzeug', 'sonstiges',
]);

const DEFAULT_NUTZUNGSDAUER: Record<AssetArt, number> = {
  kamera: 84,
  zubehoer: 60,
  werkzeug: 96,
  buero: 96,
  sonstiges: 60,
};

/**
 * Coerce einen ki_vorschlag.art-Wert auf das CHECK-Constraint-Enum.
 * Claude haelt sich nicht immer an das Schema (z.B. "action_camera",
 * "kamera-drohne", leerer String) — ohne diesen Filter fliegt der
 * INSERT auf assets_neu mit Constraint-Violation und das Asset wird
 * nicht angelegt, ohne dass der User es merkt.
 */
function coerceArt(raw: unknown): AssetArt {
  if (typeof raw !== 'string') return 'sonstiges';
  const lower = raw.trim().toLowerCase();
  if (ALLOWED_ART.has(lower as AssetArt)) return lower as AssetArt;
  // Tolerante Heuristik fuer haeufige Halluzinationen
  if (lower.includes('kamera') || lower.includes('cam') || lower.includes('drohne') || lower.includes('drone')) return 'kamera';
  if (lower.includes('zubeh') || lower.includes('akku') || lower.includes('karte') || lower.includes('objektiv') || lower.includes('mikro')) return 'zubehoer';
  if (lower.includes('werkzeug') || lower.includes('tool')) return 'werkzeug';
  if (lower.includes('buero') || lower.includes('büro') || lower.includes('office') || lower.includes('moebel') || lower.includes('möbel')) return 'buero';
  return 'sonstiges';
}

/**
 * Liefert die Tabellen-Namen abhaengig vom Stand des Refactors.
 * Solange die Drop-Migration NOCH NICHT gelaufen ist, existiert
 * `assets_neu` parallel zur alten `assets`. Nach dem Drop ist `assets`
 * die neue Tabelle. Wir versuchen `assets_neu` zuerst, fallen auf
 * `assets` zurueck wenn nicht vorhanden.
 *
 * Achtung: PostgREST/Supabase liefert bei "Tabelle nicht im Schema-
 * Cache" code='PGRST205' mit Meldung "Could not find the table ...
 * in the schema cache", NICHT den PG-Errorcode 42P01. Wir muessen
 * also auf BEIDE Faelle und zusaetzlich auf die Meldung pruefen,
 * sonst landet ein INSERT auf der nicht mehr existierenden Tabelle
 * und das Asset wird nie angelegt.
 */
function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;        // PostgreSQL: undefined_table
  if (error.code === 'PGRST205') return true;     // PostgREST: schema cache miss
  if (error.code === 'PGRST202') return true;     // PostgREST: function/relation not found
  if (typeof error.message === 'string' && /could not find the table|schema cache/i.test(error.message)) return true;
  return false;
}

/**
 * PostgREST cached die Schema-Info nach dem Erst-Hit und bleibt damit
 * inkonsistent, wenn die DB zwischendrin Tabellen umbenennt. Eine
 * Probe-Query (HEAD/SELECT) kann "OK" liefern, der nachgelagerte
 * INSERT scheitert dann aber mit Schema-Cache-Miss. Deshalb verlassen
 * wir uns auf Insert-Time-Detection: wenn der INSERT auf `assets_neu`
 * mit Missing-Table fehlschlaegt, wird hart auf `assets` umgeschaltet
 * (gilt dann auch fuer alle nachfolgenden Positionen).
 */

export interface AutoGenResult {
  assetsCreated: number;
  afaBuchungenCreated: number;
  warnings: string[];
}

export async function erzeugeAssetsFuerBeleg(
  supabase: SupabaseClient,
  belegId: string,
): Promise<AutoGenResult> {
  const result: AutoGenResult = { assetsCreated: 0, afaBuchungenCreated: 0, warnings: [] };

  const { data: beleg } = await supabase
    .from('belege').select('id, beleg_datum, is_test').eq('id', belegId).single();
  if (!beleg) throw new Error(`Beleg ${belegId} nicht gefunden`);

  const { data: positionen, error: posErr } = await supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, einzelpreis_netto, gesamt_netto, klassifizierung, ki_vorschlag, folgekosten_asset_id')
    .eq('beleg_id', belegId)
    .in('klassifizierung', ['afa', 'gwg']);
  if (posErr) throw posErr;

  // Start mit assets_neu (pre-Drop-Migration Default), Insert-Time-Fallback
  // schaltet auf assets um, sobald die Tabelle weg ist.
  let assetsTable: 'assets_neu' | 'assets' = 'assets_neu';

  for (const p of positionen ?? []) {
    const pos = p as {
      id: string;
      bezeichnung: string;
      einzelpreis_netto: number;
      gesamt_netto: number;
      klassifizierung: 'afa' | 'gwg';
      ki_vorschlag: { art?: string; nutzungsdauer_monate?: number } | null;
      folgekosten_asset_id: string | null;
    };

    if (pos.folgekosten_asset_id) continue; // Position ist Folgekosten-Anhang, kein eigenes Asset

    // Existiert ggf. schon ein Asset (idempotenz: Re-Festschreibung sollte nicht doppelt anlegen).
    // Bei Schema-Cache-Miss auf assets_neu hart auf assets umschalten.
    let probeRes = await supabase
      .from(assetsTable).select('*', { count: 'exact', head: true }).eq('beleg_position_id', pos.id);
    if (isMissingTableError(probeRes.error) && assetsTable === 'assets_neu') {
      assetsTable = 'assets';
      probeRes = await supabase
        .from(assetsTable).select('*', { count: 'exact', head: true }).eq('beleg_position_id', pos.id);
    }
    if ((probeRes.count ?? 0) > 0) continue;

    const art: AssetArt = coerceArt(pos.ki_vorschlag?.art);
    const nutzungsdauer = pos.ki_vorschlag?.nutzungsdauer_monate ?? DEFAULT_NUTZUNGSDAUER[art];
    const anschaffung = Number(pos.gesamt_netto ?? pos.einzelpreis_netto);

    let afaMethode: 'linear' | 'sofort_gwg' | 'keine' = 'linear';
    let aktuellerBuchwert = anschaffung;
    let nutzungsdauerMonate: number | null = nutzungsdauer;

    if (pos.klassifizierung === 'gwg') {
      afaMethode = 'sofort_gwg';
      aktuellerBuchwert = 0;
      nutzungsdauerMonate = null;
    }

    const insertPayload = {
      beleg_position_id: pos.id,
      bezeichnung: pos.bezeichnung,
      art,
      anschaffungsdatum: beleg.beleg_datum,
      anschaffungskosten_netto: anschaffung,
      afa_methode: afaMethode,
      nutzungsdauer_monate: nutzungsdauerMonate,
      aktueller_buchwert: aktuellerBuchwert,
      restwert: 0,
      status: 'aktiv',
      is_test: !!beleg.is_test,
    };

    let insertRes = await supabase
      .from(assetsTable).insert(insertPayload).select('id').single();
    // Insert-Time-Fallback: wenn assets_neu im PostgREST-Cache existiert,
    // aber nicht mehr in der DB, kommt der Schema-Cache-Miss erst hier raus.
    if (isMissingTableError(insertRes.error) && assetsTable === 'assets_neu') {
      assetsTable = 'assets';
      insertRes = await supabase
        .from(assetsTable).insert(insertPayload).select('id').single();
    }
    if (insertRes.error) {
      result.warnings.push(`Position ${pos.id}: ${insertRes.error.message}`);
      continue;
    }
    const asset = insertRes.data;
    if (!asset) {
      result.warnings.push(`Position ${pos.id}: Asset wurde nicht zurueckgegeben`);
      continue;
    }
    result.assetsCreated++;

    // Bei GWG sofort eine afa_buchung anlegen
    if (pos.klassifizierung === 'gwg') {
      const { error: afaErr } = await supabase.from('afa_buchungen').insert({
        asset_id: asset.id,
        buchungsdatum: beleg.beleg_datum,
        afa_betrag: anschaffung,
        buchwert_nach: 0,
        typ: 'sofort',
        notizen: 'GWG-Sofortabschreibung (auto)',
      });
      if (afaErr) {
        result.warnings.push(`afa_buchungen[${pos.id}]: ${afaErr.message}`);
      } else {
        result.afaBuchungenCreated++;
      }
    }
  }

  return result;
}
