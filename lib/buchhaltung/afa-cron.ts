/**
 * AfA-Monats-Cron-Logik (Session D).
 *
 * Fuer jedes aktive lineare Asset wird einmal pro Monat eine afa_buchung
 * angelegt. Idempotenz ueber (asset_id, year-month) — ein zweiter Lauf
 * im gleichen Monat fuer das gleiche Asset wird ignoriert.
 *
 * Stoppt bei aktueller_buchwert <= restwert.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface Asset {
  id: string;
  anschaffungskosten_netto: number;
  nutzungsdauer_monate: number | null;
  aktueller_buchwert: number;
  restwert: number;
  is_test: boolean;
}

export interface AfaCronResult {
  processed: number;
  bookingsCreated: number;
  skippedFullyDepreciated: number;
  errors: string[];
}

async function pickAssetsTable(supabase: SupabaseClient): Promise<'assets_neu' | 'assets'> {
  const { error } = await supabase.from('assets_neu').select('id', { head: true }).limit(1);
  if (error && error.code === '42P01') return 'assets';
  return 'assets_neu';
}

export async function runAfaCron(
  supabase: SupabaseClient,
  options: { isTestMode: boolean; asOf?: Date } = { isTestMode: false },
): Promise<AfaCronResult> {
  const result: AfaCronResult = { processed: 0, bookingsCreated: 0, skippedFullyDepreciated: 0, errors: [] };
  const asOf = options.asOf ?? new Date();
  const period = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}`;

  const tabelle = await pickAssetsTable(supabase);

  const { data: assets, error } = await supabase
    .from(tabelle)
    .select('id, anschaffungskosten_netto, nutzungsdauer_monate, aktueller_buchwert, restwert, is_test')
    .eq('afa_methode', 'linear')
    .eq('status', 'aktiv')
    .eq('is_test', options.isTestMode);
  if (error) {
    result.errors.push(`Asset-Lookup: ${error.message}`);
    return result;
  }

  for (const a of (assets ?? []) as Asset[]) {
    result.processed++;
    if (Number(a.aktueller_buchwert) <= Number(a.restwert)) {
      result.skippedFullyDepreciated++;
      continue;
    }
    if (!a.nutzungsdauer_monate || a.nutzungsdauer_monate <= 0) continue;

    // Idempotenz: existiert schon eine Buchung fuer diesen Monat?
    const monthStart = `${period}-01`;
    const nextMonthDate = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
    const monthEnd = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: existing } = await supabase
      .from('afa_buchungen')
      .select('id', { head: false })
      .eq('asset_id', a.id)
      .gte('buchungsdatum', monthStart)
      .lt('buchungsdatum', monthEnd)
      .limit(1);
    if (existing && existing.length > 0) continue;

    // Monatliche AfA = (anschaffung - restwert) / nutzungsdauer
    const monthly = (Number(a.anschaffungskosten_netto) - Number(a.restwert)) / a.nutzungsdauer_monate;
    let buchwertNach = Number(a.aktueller_buchwert) - monthly;
    let afaBetrag = monthly;
    if (buchwertNach < Number(a.restwert)) {
      // Nicht unter Restwert
      afaBetrag = Number(a.aktueller_buchwert) - Number(a.restwert);
      buchwertNach = Number(a.restwert);
    }
    afaBetrag = Math.round(afaBetrag * 100) / 100;
    buchwertNach = Math.round(buchwertNach * 100) / 100;

    const { error: insErr } = await supabase.from('afa_buchungen').insert({
      asset_id: a.id,
      buchungsdatum: `${period}-15`,  // Monatsmitte
      afa_betrag: afaBetrag,
      buchwert_nach: buchwertNach,
      typ: 'monatlich',
      notizen: `Monats-AfA ${period}`,
    });
    if (insErr) {
      result.errors.push(`Asset ${a.id}: ${insErr.message}`);
      continue;
    }

    await supabase
      .from(tabelle)
      .update({ aktueller_buchwert: buchwertNach })
      .eq('id', a.id);

    result.bookingsCreated++;
  }

  return result;
}
