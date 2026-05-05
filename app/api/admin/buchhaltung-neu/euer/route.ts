import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/buchhaltung-neu/euer?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * EUeR-Berechnung auf Basis der NEUEN Welt:
 *   Einnahmen: invoices (unveraendert)
 *   Ausgaben:  beleg_positionen WHERE klassifizierung='ausgabe' (Brutto)
 *   Sofort-AfA: afa_buchungen WHERE typ='sofort'
 *   Lineare AfA: afa_buchungen WHERE typ='monatlich'
 *
 * Test-Daten werden default ausgefiltert (ueber belege.is_test bzw. invoices.is_test).
 */

async function pickAssetsTable(supabase: ReturnType<typeof createServiceClient>): Promise<'assets_neu' | 'assets'> {
  const { error } = await supabase.from('assets_neu').select('id', { head: true }).limit(1);
  if (error && error.code === '42P01') return 'assets';
  return 'assets_neu';
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from und to Pflicht' }, { status: 400 });

  const supabase = createServiceClient();

  // Einnahmen aus invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount')
    .gte('issue_date', from).lte('issue_date', to)
    .eq('is_test', false)
    .neq('status', 'cancelled');
  const einnahmen = (invoices ?? []).reduce((s, r) => s + Number((r as { total_amount: number }).total_amount ?? 0), 0);

  // Ausgaben aus beleg_positionen
  const { data: positionen } = await supabase
    .from('beleg_positionen')
    .select('gesamt_brutto, kategorie, beleg:belege(beleg_datum, is_test)')
    .eq('klassifizierung', 'ausgabe');
  const filtered = (positionen ?? []).filter((p) => {
    const b = (p as { beleg: { beleg_datum: string; is_test: boolean } | null }).beleg;
    return b && !b.is_test && b.beleg_datum >= from && b.beleg_datum <= to;
  });
  const ausgabenTotal = filtered.reduce((s, p) => s + Number((p as { gesamt_brutto: number }).gesamt_brutto), 0);
  const ausgabenByKat: Record<string, number> = {};
  for (const p of filtered) {
    const k = (p as { kategorie: string | null }).kategorie ?? 'sonstiges';
    ausgabenByKat[k] = (ausgabenByKat[k] ?? 0) + Number((p as { gesamt_brutto: number }).gesamt_brutto);
  }

  // AfA aus afa_buchungen
  const tabelle = await pickAssetsTable(supabase);
  const { data: afaRows } = await supabase
    .from('afa_buchungen')
    .select(`afa_betrag, typ, asset:${tabelle}(is_test)`)
    .gte('buchungsdatum', from).lte('buchungsdatum', to);
  const sofortAfa = (afaRows ?? [])
    .filter((r) => (r as { typ: string }).typ === 'sofort' && !(r as { asset: { is_test: boolean } }).asset?.is_test)
    .reduce((s, r) => s + Number((r as { afa_betrag: number }).afa_betrag), 0);
  const monatlicheAfa = (afaRows ?? [])
    .filter((r) => (r as { typ: string }).typ === 'monatlich' && !(r as { asset: { is_test: boolean } }).asset?.is_test)
    .reduce((s, r) => s + Number((r as { afa_betrag: number }).afa_betrag), 0);
  const sonderAfa = (afaRows ?? [])
    .filter((r) => (r as { typ: string }).typ === 'sonderafa' && !(r as { asset: { is_test: boolean } }).asset?.is_test)
    .reduce((s, r) => s + Number((r as { afa_betrag: number }).afa_betrag), 0);

  const ausgabenGesamt = ausgabenTotal + sofortAfa + monatlicheAfa + sonderAfa;
  const gewinn = einnahmen - ausgabenGesamt;

  return NextResponse.json({
    period: { from, to },
    einnahmen: Math.round(einnahmen * 100) / 100,
    ausgaben_betriebs: Math.round(ausgabenTotal * 100) / 100,
    ausgaben_by_kategorie: Object.fromEntries(Object.entries(ausgabenByKat).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    afa_sofort_gwg: Math.round(sofortAfa * 100) / 100,
    afa_monatlich: Math.round(monatlicheAfa * 100) / 100,
    afa_sonder: Math.round(sonderAfa * 100) / 100,
    ausgaben_gesamt: Math.round(ausgabenGesamt * 100) / 100,
    gewinn: Math.round(gewinn * 100) / 100,
  });
}
