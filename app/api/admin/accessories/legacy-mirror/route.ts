import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { resolveProdukteId } from '@/lib/legacy-bridge';

/**
 * GET /api/admin/accessories/legacy-mirror?accessory_id=xxx
 *
 * Diagnose-Endpoint fuer Welten-Drift: zeigt alle `accessory_units`-Zeilen
 * eines Zubehoers (alte Welt, fuettert Buchungs-RPC + scan-lookup) neben
 * den aktiven `inventar_units` (neue Welt, Single Source of Truth) UND
 * dem aktuellen `accessories.available_qty` (Gantt-Total).
 *
 * Pro accessory_units-Zeile wird markiert, ob ihr `exemplar_code` einem
 * aktiven Inventar-Code entspricht (normalisierter Vergleich gegen
 * inventar_code / label / seriennummer). Zeilen ohne Treffer sind
 * Drift-Kandidaten — der Admin kann sie mit dem bestehenden PUT-Endpoint
 * auf status='retired' setzen. Dadurch bleibt der Code scanbar
 * (Etikett auf alter Karte), wird aber nicht mehr als verfuegbar
 * gezaehlt (syncAccessoryQty filtert auf available/rented).
 *
 * KEIN Loeschen. Keine destruktiven Operationen.
 */

interface AccessoryUnitRow {
  id: string;
  exemplar_code: string;
  status: string;
  notes: string | null;
  created_at: string | null;
  inventar_match: boolean;
}

interface InventarCode {
  id: string;
  code: string;
  status: string;
  bezeichnung: string | null;
}

function normalizeCode(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const accessoryId = req.nextUrl.searchParams.get('accessory_id');
  if (!accessoryId) {
    return NextResponse.json({ error: 'accessory_id fehlt' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // accessories-Stammdaten
  const { data: acc, error: accErr } = await supabase
    .from('accessories')
    .select('id, name, available_qty, is_bulk')
    .eq('id', accessoryId)
    .maybeSingle();
  if (accErr) {
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }
  if (!acc) {
    return NextResponse.json({ error: 'Zubehoer nicht gefunden.' }, { status: 404 });
  }
  if ((acc as { is_bulk?: boolean }).is_bulk === true) {
    // Bulk hat kein Mirror-Drift-Problem (manuell gepflegte Menge).
    return NextResponse.json({
      accessory: { id: acc.id, name: acc.name, available_qty: acc.available_qty, is_bulk: true },
      accessory_units: [],
      inventar_codes: [],
      counts: { mirror_active: 0, inventar_active: 0, available_qty: acc.available_qty },
      drift: false,
    });
  }

  // accessory_units (alte Welt) — ALLE Status, damit der Admin auch die
  // bereits ausgemusterten Zeilen sieht (zwecks Nachvollziehbarkeit).
  const { data: unitsRaw } = await supabase
    .from('accessory_units')
    .select('id, exemplar_code, status, notes, created_at')
    .eq('accessory_id', accessoryId)
    .order('exemplar_code', { ascending: true });

  // inventar_units (neue Welt) ueber migration_audit-Bruecke laden.
  const produkteId = await resolveProdukteId(supabase, 'accessories', accessoryId, { autoCreate: false });
  const inventarCodes: InventarCode[] = [];
  let inventarActive = 0;
  if (produkteId) {
    const { data: invRaw } = await supabase
      .from('inventar_units')
      .select('id, inventar_code, seriennummer, label, bezeichnung, status')
      .eq('produkt_id', produkteId)
      .eq('tracking_mode', 'individual')
      .neq('status', 'ausgemustert');
    type InvRow = {
      id: string;
      inventar_code: string | null;
      seriennummer: string | null;
      label: string | null;
      bezeichnung: string | null;
      status: string;
    };
    for (const u of (invRaw ?? []) as InvRow[]) {
      const code = (u.inventar_code || u.label || u.seriennummer || '').trim();
      if (!code) continue;
      inventarCodes.push({
        id: u.id,
        code,
        status: u.status,
        bezeichnung: u.bezeichnung,
      });
      inventarActive++;
    }
  }

  const inventarCodeSet = new Set(inventarCodes.map((u) => normalizeCode(u.code)));

  let mirrorActive = 0;
  const accessoryUnits: AccessoryUnitRow[] = ((unitsRaw ?? []) as Array<{
    id: string;
    exemplar_code: string;
    status: string;
    notes: string | null;
    created_at: string | null;
  }>).map((u) => {
    const isActive = u.status === 'available' || u.status === 'rented';
    if (isActive) mirrorActive++;
    return {
      id: u.id,
      exemplar_code: u.exemplar_code,
      status: u.status,
      notes: u.notes,
      created_at: u.created_at,
      inventar_match: inventarCodeSet.has(normalizeCode(u.exemplar_code)),
    };
  });

  // Drift = available_qty != echter Bestand (inventar_active).
  // Vorranging Treiber sind aktive accessory_units ohne Inventar-Pendant.
  const availableQty = (acc as { available_qty?: number }).available_qty ?? 0;
  const drift = availableQty !== inventarActive || mirrorActive !== inventarActive;

  return NextResponse.json({
    accessory: {
      id: acc.id,
      name: acc.name,
      available_qty: availableQty,
      is_bulk: false,
    },
    accessory_units: accessoryUnits,
    inventar_codes: inventarCodes,
    counts: {
      mirror_active: mirrorActive,
      inventar_active: inventarActive,
      available_qty: availableQty,
    },
    drift,
  });
}
