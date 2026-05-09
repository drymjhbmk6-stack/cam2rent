import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/buchhaltung/asset-debug?beleg_id=...
 *
 * Diagnostik-Endpoint: zeigt was in `assets` und `assets_neu` tatsaechlich
 * an Datensaetzen liegt. Service-Role-Read, defensiv bei nicht-existenter
 * Tabelle, kein Fehler nach aussen — gibt einfach pro Tabelle exists/count/rows.
 *
 * Optional: `?beleg_id=<uuid>` filtert ueber den Join auf beleg_positionen.beleg_id.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const belegId = sp.get('beleg_id');
  const supabase = createServiceClient();

  async function probeTable(table: 'assets' | 'assets_neu') {
    let q = supabase.from(table).select('id, beleg_position_id, bezeichnung, art, afa_methode, anschaffungskosten_netto, aktueller_buchwert, status, is_test, created_at, beleg_position:beleg_positionen(id, beleg_id, bezeichnung)');
    if (belegId) q = q.eq('beleg_position.beleg_id', belegId);
    const { data, error } = await q;
    if (error) {
      return {
        table,
        exists: false,
        error_code: error.code ?? null,
        error_message: error.message,
        rows: [],
        row_count: 0,
      };
    }
    return {
      table,
      exists: true,
      error_code: null,
      error_message: null,
      rows: data ?? [],
      row_count: (data ?? []).length,
    };
  }

  const [assetsResult, assetsNeuResult] = await Promise.all([
    probeTable('assets'),
    probeTable('assets_neu'),
  ]);

  // Auch alle beleg_positionen des Belegs zeigen (afa/gwg only) damit man
  // sieht was eigentlich Asset werden sollte.
  let positionen: Array<{ id: string; bezeichnung: string; klassifizierung: string; einzelpreis_netto: number; gesamt_netto: number; ki_vorschlag: unknown }> = [];
  if (belegId) {
    const { data } = await supabase
      .from('beleg_positionen')
      .select('id, bezeichnung, klassifizierung, einzelpreis_netto, gesamt_netto, ki_vorschlag')
      .eq('beleg_id', belegId)
      .in('klassifizierung', ['afa', 'gwg']);
    positionen = (data ?? []) as typeof positionen;
  }

  return NextResponse.json({
    beleg_id: belegId,
    expected_assets_from_positions: positionen.length,
    assets: assetsResult,
    assets_neu: assetsNeuResult,
    positionen,
  });
}
