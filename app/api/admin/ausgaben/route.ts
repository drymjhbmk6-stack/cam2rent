import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/ausgaben
 *
 * Vereinheitlichte Ausgaben-Liste aus beleg_positionen WHERE klassifizierung='ausgabe'.
 * Filter: ?from=&to=&kategorie=&quelle=&lieferant_id=&include_test=1
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const supabase = createServiceClient();

  let q = supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, gesamt_brutto, gesamt_netto, kategorie, beleg:belege(id, beleg_nr, beleg_datum, quelle, is_test, lieferant:lieferanten(id, name))')
    .eq('klassifizierung', 'ausgabe')
    .order('created_at', { ascending: false });

  // Datumsfilter geht ueber nested beleg → client-seitig
  const { data, error } = await q.limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const includeTest = sp.get('include_test') === '1';
  const from = sp.get('from');
  const to = sp.get('to');
  const kategorie = sp.get('kategorie');
  const quelle = sp.get('quelle');
  const lieferantId = sp.get('lieferant_id');

  const filtered = (data ?? []).filter((p) => {
    const beleg = (p as { beleg: { beleg_datum: string; quelle: string; is_test: boolean; lieferant: { id: string } | null } | null }).beleg;
    if (!beleg) return false;
    if (!includeTest && beleg.is_test) return false;
    if (from && beleg.beleg_datum < from) return false;
    if (to && beleg.beleg_datum > to) return false;
    if (quelle && beleg.quelle !== quelle) return false;
    if (lieferantId && beleg.lieferant?.id !== lieferantId) return false;
    if (kategorie && (p as { kategorie: string | null }).kategorie !== kategorie) return false;
    return true;
  });

  // KPIs
  const totalBrutto = filtered.reduce((s, p) => s + Number((p as { gesamt_brutto: number }).gesamt_brutto), 0);
  const byKategorie: Record<string, number> = {};
  for (const p of filtered) {
    const cat = (p as { kategorie: string | null }).kategorie ?? 'sonstiges';
    byKategorie[cat] = (byKategorie[cat] ?? 0) + Number((p as { gesamt_brutto: number }).gesamt_brutto);
  }
  const top3 = Object.entries(byKategorie).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return NextResponse.json({
    ausgaben: filtered,
    kpi: {
      total: filtered.length,
      total_brutto: Math.round(totalBrutto * 100) / 100,
      top_kategorien: top3.map(([k, v]) => ({ kategorie: k, brutto: Math.round(v * 100) / 100 })),
    },
  });
}
