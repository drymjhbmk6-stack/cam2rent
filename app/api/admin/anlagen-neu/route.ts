import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/anlagen-neu
 *
 * Anlagen-Liste fuer den NEUEN Welt-Tab (Buchhaltung). Liest aus assets_neu
 * (oder bereits umbenannte assets nach Drop-Migration). Reine Steuersicht
 * — KEIN Wiederbeschaffungswert (der lebt im Inventar).
 *
 * Filter: ?art=&afa_methode=&status=&include_test=1&q=
 */

async function pickTable(supabase: ReturnType<typeof createServiceClient>): Promise<'assets_neu' | 'assets'> {
  const { error } = await supabase.from('assets_neu').select('id', { head: true }).limit(1);
  if (error && error.code === '42P01') return 'assets';
  return 'assets_neu';
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const supabase = createServiceClient();
  const tabelle = await pickTable(supabase);

  let q = supabase
    .from(tabelle)
    .select('*, beleg_position:beleg_positionen(id, bezeichnung, beleg:belege(id, beleg_nr, beleg_datum, lieferant:lieferanten(name)))')
    .order('anschaffungsdatum', { ascending: false });

  if (sp.get('art')) q = q.eq('art', sp.get('art'));
  if (sp.get('afa_methode')) q = q.eq('afa_methode', sp.get('afa_methode'));
  if (sp.get('status')) q = q.eq('status', sp.get('status'));
  if (sp.get('include_test') !== '1') q = q.eq('is_test', false);
  const search = sp.get('q')?.trim();
  if (search) q = q.ilike('bezeichnung', `%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-Asset Zugriff auf inventar_units uber inventar_verknuepfung > beleg_position
  // (clientseitig — fuer den optionalen Inventar-Link in der Tabelle)
  const beleg_position_ids = (data ?? [])
    .map((a) => (a as { beleg_position_id: string }).beleg_position_id)
    .filter(Boolean);
  let inventarMap = new Map<string, { id: string; bezeichnung: string }>();
  if (beleg_position_ids.length > 0) {
    const { data: links } = await supabase
      .from('inventar_verknuepfung')
      .select('beleg_position_id, inventar_unit:inventar_units(id, bezeichnung)')
      .in('beleg_position_id', beleg_position_ids);
    for (const l of links ?? []) {
      const lr = l as { beleg_position_id: string; inventar_unit: { id: string; bezeichnung: string } | null };
      if (lr.inventar_unit) inventarMap.set(lr.beleg_position_id, lr.inventar_unit);
    }
  }

  const enriched = (data ?? []).map((a) => {
    const aRow = a as { beleg_position_id: string };
    return { ...a, inventar_unit: inventarMap.get(aRow.beleg_position_id) ?? null };
  });

  // KPIs
  const totalAnschaffung = enriched.reduce((s, a) => s + Number((a as { anschaffungskosten_netto: number }).anschaffungskosten_netto ?? 0), 0);
  const totalBuchwert = enriched.reduce((s, a) => s + Number((a as { aktueller_buchwert: number }).aktueller_buchwert ?? 0), 0);
  const gwgCount = enriched.filter((a) => (a as { afa_methode: string }).afa_methode === 'sofort_gwg').length;
  const gwgSum = enriched
    .filter((a) => (a as { afa_methode: string }).afa_methode === 'sofort_gwg')
    .reduce((s, a) => s + Number((a as { anschaffungskosten_netto: number }).anschaffungskosten_netto), 0);

  return NextResponse.json({
    assets: enriched,
    kpi: {
      total: enriched.length,
      total_anschaffung: Math.round(totalAnschaffung * 100) / 100,
      total_buchwert: Math.round(totalBuchwert * 100) / 100,
      gwg_count: gwgCount,
      gwg_sum: Math.round(gwgSum * 100) / 100,
    },
  });
}
