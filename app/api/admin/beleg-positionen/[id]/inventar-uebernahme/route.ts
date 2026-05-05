import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/beleg-positionen/[id]/inventar-uebernahme
 *
 * Pfad A: Aus einer Belegposition werden N Inventar-Stuecke erzeugt.
 * Body:
 *   {
 *     mode: 'individual' | 'bulk_existing' | 'bulk_new',
 *     // bei individual:
 *     stuecke?: [{ bezeichnung, typ, seriennummer?, inventar_code, produkt_id? }],
 *     // bei bulk_existing:
 *     existing_unit_id?: string, qty?: number,
 *     // bei bulk_new:
 *     new_unit?: { bezeichnung, typ, inventar_code, qty },
 *   }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    mode?: 'individual' | 'bulk_existing' | 'bulk_new';
    stuecke?: Array<{
      bezeichnung: string;
      typ?: 'kamera' | 'zubehoer' | 'verbrauch';
      seriennummer?: string;
      inventar_code: string;
      produkt_id?: string | null;
    }>;
    existing_unit_id?: string;
    qty?: number;
    new_unit?: {
      bezeichnung: string;
      typ?: 'kamera' | 'zubehoer' | 'verbrauch';
      inventar_code: string;
      qty: number;
      produkt_id?: string | null;
    };
  } | null;
  if (!body?.mode) return NextResponse.json({ error: 'mode Pflicht' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: position, error: pErr } = await supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, einzelpreis_netto, menge, beleg_id, locked, beleg:belege(beleg_datum)')
    .eq('id', id).single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });

  const pos = position as unknown as {
    id: string; bezeichnung: string; einzelpreis_netto: number; menge: number;
    beleg_id: string; locked: boolean;
    beleg: { beleg_datum: string };
  };
  const kaufpreis = Number(pos.einzelpreis_netto);
  const kaufdatum = pos.beleg.beleg_datum;

  const createdUnitIds: string[] = [];
  const verknuepfungen: Array<{ beleg_position_id: string; inventar_unit_id: string; stueck_anteil: number }> = [];

  if (body.mode === 'individual') {
    if (!body.stuecke || body.stuecke.length === 0) {
      return NextResponse.json({ error: 'stuecke[] Pflicht bei mode=individual' }, { status: 400 });
    }
    for (const s of body.stuecke) {
      if (!s.inventar_code || !s.bezeichnung) continue;
      const { data: unit, error: insErr } = await supabase.from('inventar_units').insert({
        bezeichnung: s.bezeichnung,
        typ: s.typ ?? 'zubehoer',
        tracking_mode: 'individual',
        produkt_id: s.produkt_id ?? null,
        seriennummer: s.seriennummer ?? null,
        inventar_code: s.inventar_code.slice(0, 60),
        kaufpreis_netto: kaufpreis,
        kaufdatum,
        wiederbeschaffungswert: kaufpreis,  // Initial = Kaufpreis
        wbw_manuell_gesetzt: false,
        status: 'verfuegbar',
        beleg_status: 'verknuepft',
      }).select('id').single();
      if (insErr) {
        return NextResponse.json({ error: `inventar-insert: ${insErr.message}` }, { status: 500 });
      }
      createdUnitIds.push(unit.id);
      verknuepfungen.push({ beleg_position_id: id, inventar_unit_id: unit.id, stueck_anteil: 1 });
    }
  } else if (body.mode === 'bulk_existing') {
    if (!body.existing_unit_id || !body.qty) {
      return NextResponse.json({ error: 'existing_unit_id + qty Pflicht' }, { status: 400 });
    }
    const { data: existing } = await supabase
      .from('inventar_units').select('id, bestand, tracking_mode').eq('id', body.existing_unit_id).single();
    if (!existing || (existing as { tracking_mode: string }).tracking_mode !== 'bulk') {
      return NextResponse.json({ error: 'Bestehende Unit ist kein Bulk-Inventar' }, { status: 400 });
    }
    const newBestand = ((existing as { bestand: number }).bestand ?? 0) + body.qty;
    await supabase.from('inventar_units').update({ bestand: newBestand }).eq('id', body.existing_unit_id);
    verknuepfungen.push({ beleg_position_id: id, inventar_unit_id: body.existing_unit_id, stueck_anteil: body.qty });
  } else if (body.mode === 'bulk_new') {
    if (!body.new_unit) return NextResponse.json({ error: 'new_unit Pflicht' }, { status: 400 });
    const { data: unit, error: insErr } = await supabase.from('inventar_units').insert({
      bezeichnung: body.new_unit.bezeichnung,
      typ: body.new_unit.typ ?? 'verbrauch',
      tracking_mode: 'bulk',
      produkt_id: body.new_unit.produkt_id ?? null,
      inventar_code: body.new_unit.inventar_code.slice(0, 60),
      bestand: body.new_unit.qty,
      kaufpreis_netto: kaufpreis,
      kaufdatum,
      wiederbeschaffungswert: kaufpreis,
      wbw_manuell_gesetzt: false,
      status: 'verfuegbar',
      beleg_status: 'verknuepft',
    }).select('id').single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    createdUnitIds.push(unit.id);
    verknuepfungen.push({ beleg_position_id: id, inventar_unit_id: unit.id, stueck_anteil: body.new_unit.qty });
  } else {
    return NextResponse.json({ error: 'Unbekannter mode' }, { status: 400 });
  }

  if (verknuepfungen.length > 0) {
    await supabase.from('inventar_verknuepfung').insert(verknuepfungen);
  }

  await logAudit({
    action: 'inventar.uebernahme',
    entityType: 'beleg_position',
    entityId: id,
    changes: { mode: body.mode, units_created: createdUnitIds.length, links: verknuepfungen.length },
    request: req,
  });

  return NextResponse.json({ ok: true, units_created: createdUnitIds.length, links_created: verknuepfungen.length });
}
