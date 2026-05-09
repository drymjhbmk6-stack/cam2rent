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

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  if (error.code === 'PGRST205') return true;
  if (error.code === 'PGRST202') return true;
  // Achtung: NICHT auf "schema cache" allein matchen — das matched auch
  // PGRST200 (FK-Beziehung fehlt im Cache), das wir NICHT ignorieren wollen.
  // Nur die Tabellen-spezifische Meldung.
  if (typeof error.message === 'string' && /could not find the table .* in the schema cache/i.test(error.message)) return true;
  return false;
}

function buildAssetsQuery(supabase: ReturnType<typeof createServiceClient>, table: 'assets_neu' | 'assets', sp: URLSearchParams) {
  // Kein FK-Join (beleg_position:beleg_positionen(...)) hier! PostgREST
  // resolvt den Join ueber den Schema-Cache, der nach der Drop-Migration
  // (assets_neu -> assets) inkonsistent sein kann ("Could not find a
  // relationship in the schema cache" → wir wuerden's faelschlicherweise
  // als missing-table klassifizieren). Stattdessen laden wir die Positionen
  // separat per id.
  let q = supabase
    .from(table)
    .select('*')
    .order('anschaffungsdatum', { ascending: false });
  if (sp.get('art')) q = q.eq('art', sp.get('art'));
  if (sp.get('afa_methode')) q = q.eq('afa_methode', sp.get('afa_methode'));
  if (sp.get('status')) q = q.eq('status', sp.get('status'));
  if (sp.get('include_test') !== '1') q = q.eq('is_test', false);
  const search = sp.get('q')?.trim();
  if (search) q = q.ilike('bezeichnung', `%${search}%`);
  return q;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const supabase = createServiceClient();

  // Beide Tabellen abfragen + mergen statt Fallback. PostgREST kann pro
  // Replica einen anderen Schema-Cache-Stand haben (Probe sagt OK, INSERT
  // failed mit Schema-Cache-Miss — dadurch landen Assets je nach Request
  // mal in assets, mal in assets_neu). Errors fuer nicht-existente Tabellen
  // werden ignoriert, ueber id wird dedupliziert.
  const [r1, r2] = await Promise.all([
    buildAssetsQuery(supabase, 'assets', sp),
    buildAssetsQuery(supabase, 'assets_neu', sp),
  ]);
  const realError = [r1, r2].find((r) => r.error && !isMissingTableError(r.error));
  if (realError) return NextResponse.json({ error: realError.error!.message }, { status: 500 });
  const merged = [
    ...((r1.error ? [] : r1.data) ?? []),
    ...((r2.error ? [] : r2.data) ?? []),
  ];
  // Dedup #1: gleiche id (Tabellen-Rename-Fall — Query auf assets_neu und
  // assets resolvt physisch auf die selbe Row).
  const byId = Array.from(
    new Map(merged.map((a) => [(a as { id: string }).id, a])).values(),
  ) as typeof merged;
  // Dedup #2: gleiche beleg_position_id mit unterschiedlichen ids
  // (Schema-Cache-Bug: Asset wurde zweimal angelegt waehrend der Cache
  // inkonsistent war). Aelteren Eintrag behalten — der hat die laengere
  // Historie an afa_buchungen-FKs. NULL beleg_position_id → eigenes Bucket
  // pro id, damit manuell angelegte Assets ohne Beleg nicht zusammenfallen.
  const byBelegPos = new Map<string, typeof byId[number]>();
  for (const a of byId) {
    const aRow = a as { id: string; beleg_position_id: string | null; created_at?: string };
    const key = aRow.beleg_position_id ? `bp:${aRow.beleg_position_id}` : `id:${aRow.id}`;
    const existing = byBelegPos.get(key) as { created_at?: string } | undefined;
    if (!existing) {
      byBelegPos.set(key, a);
      continue;
    }
    const aTs = aRow.created_at ?? '';
    const eTs = existing.created_at ?? '';
    if (aTs && (!eTs || aTs < eTs)) byBelegPos.set(key, a);
  }
  const data = Array.from(byBelegPos.values());

  // Beleg-Positionen + Inventar-Units separat laden — kein FK-Join mehr,
  // robuster gegen stale PostgREST-Schema-Cache nach Drop-Migration.
  const beleg_position_ids = (data ?? [])
    .map((a) => (a as { beleg_position_id: string }).beleg_position_id)
    .filter(Boolean);
  const positionMap = new Map<string, { id: string; bezeichnung: string; beleg_id: string }>();
  const belegMap = new Map<string, { id: string; beleg_nr: string; beleg_datum: string; lieferant_id: string | null }>();
  const inventarMap = new Map<string, { id: string; bezeichnung: string }>();
  const lieferantMap = new Map<string, { id: string; name: string }>();

  if (beleg_position_ids.length > 0) {
    const { data: positions } = await supabase
      .from('beleg_positionen')
      .select('id, bezeichnung, beleg_id')
      .in('id', beleg_position_ids);
    for (const p of positions ?? []) {
      const pr = p as { id: string; bezeichnung: string; beleg_id: string };
      positionMap.set(pr.id, pr);
    }

    const belegIds = Array.from(new Set(Array.from(positionMap.values()).map((p) => p.beleg_id)));
    if (belegIds.length > 0) {
      const { data: belege } = await supabase
        .from('belege')
        .select('id, beleg_nr, beleg_datum, lieferant_id')
        .in('id', belegIds);
      for (const b of belege ?? []) {
        const br = b as { id: string; beleg_nr: string; beleg_datum: string; lieferant_id: string | null };
        belegMap.set(br.id, br);
      }
      const lieferantIds = Array.from(new Set(Array.from(belegMap.values()).map((b) => b.lieferant_id).filter(Boolean) as string[]));
      if (lieferantIds.length > 0) {
        const { data: lieferanten } = await supabase
          .from('lieferanten')
          .select('id, name')
          .in('id', lieferantIds);
        for (const l of lieferanten ?? []) {
          const lr = l as { id: string; name: string };
          lieferantMap.set(lr.id, lr);
        }
      }
    }

    const { data: links } = await supabase
      .from('inventar_verknuepfung')
      .select('beleg_position_id, inventar_unit_id')
      .in('beleg_position_id', beleg_position_ids);
    const inventarUnitIds = Array.from(new Set((links ?? []).map((l) => (l as { inventar_unit_id: string }).inventar_unit_id).filter(Boolean)));
    const unitMap = new Map<string, { id: string; bezeichnung: string }>();
    if (inventarUnitIds.length > 0) {
      const { data: units } = await supabase
        .from('inventar_units')
        .select('id, bezeichnung')
        .in('id', inventarUnitIds);
      for (const u of units ?? []) {
        const ur = u as { id: string; bezeichnung: string };
        unitMap.set(ur.id, ur);
      }
    }
    for (const l of links ?? []) {
      const lr = l as { beleg_position_id: string; inventar_unit_id: string };
      const u = unitMap.get(lr.inventar_unit_id);
      if (u) inventarMap.set(lr.beleg_position_id, u);
    }
  }

  const enriched = (data ?? []).map((a) => {
    const aRow = a as { beleg_position_id: string };
    const pos = positionMap.get(aRow.beleg_position_id);
    const beleg = pos ? belegMap.get(pos.beleg_id) : null;
    const lieferant = beleg?.lieferant_id ? lieferantMap.get(beleg.lieferant_id) : null;
    return {
      ...a,
      inventar_unit: inventarMap.get(aRow.beleg_position_id) ?? null,
      beleg_position: pos
        ? {
            id: pos.id,
            bezeichnung: pos.bezeichnung,
            beleg: beleg
              ? {
                  id: beleg.id,
                  beleg_nr: beleg.beleg_nr,
                  beleg_datum: beleg.beleg_datum,
                  lieferant: lieferant ? { name: lieferant.name } : null,
                }
              : null,
          }
        : null,
    };
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
