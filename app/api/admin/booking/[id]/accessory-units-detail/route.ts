import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { computeReplacementValue, loadReplacementValueConfig } from '@/lib/replacement-value';

/**
 * GET /api/admin/booking/[id]/accessory-units-detail
 *
 * Liefert pro `bookings.accessory_unit_ids`-Eintrag die zugehoerigen Daten:
 *   - exemplar_code + Status (aus accessory_units)
 *   - accessory_name + replacement_value (aus accessories)
 *   - current_value (aus assets, falls verknuepft)
 *   - suggested_wbw = MAX(asset.current_value, accessories.replacement_value, 0)
 *
 * Wird vom AccessoryDamageModal beim Oeffnen aufgerufen.
 *
 * Permission: 'tagesgeschaeft' — siehe API_PATH_PERMISSIONS in middleware.ts
 * (greift automatisch fuer alles unter /api/admin/booking/...)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = createServiceClient();

  // 1. Buchung mit accessory_unit_ids
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, accessory_unit_ids, deposit, deposit_intent_id, deposit_status')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const unitIds = (booking.accessory_unit_ids as string[] | null) ?? [];
  if (unitIds.length === 0) {
    return NextResponse.json({
      booking: {
        id: booking.id,
        deposit: booking.deposit ?? 0,
        deposit_intent_id: booking.deposit_intent_id ?? null,
        deposit_status: booking.deposit_status ?? null,
      },
      units: [],
    });
  }

  // 2. accessory_units laden
  const { data: units } = await supabase
    .from('accessory_units')
    .select('id, accessory_id, exemplar_code, status')
    .in('id', unitIds);

  if (!units || units.length === 0) {
    return NextResponse.json({
      booking: { id: booking.id, deposit: booking.deposit ?? 0, deposit_intent_id: booking.deposit_intent_id ?? null, deposit_status: booking.deposit_status ?? null },
      units: [],
    });
  }

  // 3. accessories (name + replacement_value)
  const accessoryIds = [...new Set(units.map((u) => u.accessory_id as string))];
  const { data: accessories } = await supabase
    .from('accessories')
    .select('id, name, replacement_value')
    .in('id', accessoryIds);

  const accMap = new Map<string, { name: string; replacement_value: number }>();
  for (const a of accessories ?? []) {
    accMap.set(a.id as string, {
      name: (a.name as string) ?? '',
      replacement_value: Number(a.replacement_value) || 0,
    });
  }

  // 4. assets (current_value + replacement_value_estimate pro accessory_unit_id)
  // Defensiv: replacement_value_estimate koennte ohne Migration noch nicht
  // existieren — Retry ohne die Spalte.
  const primary = await supabase
    .from('assets')
    .select('id, accessory_unit_id, current_value, replacement_value_estimate, purchase_price, purchase_date')
    .in('accessory_unit_id', unitIds)
    .eq('status', 'active');
  let assetsRows: Array<Record<string, unknown>> | null = primary.data;
  if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
    const fallback = await supabase
      .from('assets')
      .select('id, accessory_unit_id, current_value, purchase_price, purchase_date')
      .in('accessory_unit_id', unitIds)
      .eq('status', 'active');
    assetsRows = fallback.data;
  }

  const assetMap = new Map<string, { id: string; current_value: number; replacement_value_estimate: number | null; purchase_price: number; purchase_date: string }>();
  for (const a of assetsRows ?? []) {
    if (a.accessory_unit_id) {
      const wbw = (a as { replacement_value_estimate?: number | null }).replacement_value_estimate;
      assetMap.set(a.accessory_unit_id as string, {
        id: a.id as string,
        current_value: Number(a.current_value) || 0,
        replacement_value_estimate: wbw != null ? Number(wbw) : null,
        purchase_price: Number(a.purchase_price) || 0,
        purchase_date: a.purchase_date as string,
      });
    }
  }

  // 5. Result — Asset-Wert mit pauschaler Wertminderung (linear -> Floor)
  const config = await loadReplacementValueConfig(supabase);
  const result = units.map((u) => {
    const acc = accMap.get(u.accessory_id as string);
    const asset = assetMap.get(u.id as string);
    // Asset-WBW: berechnet mit pauschaler Wertminderung (40 % Floor nach 36 Mon)
    // oder Override aus replacement_value_estimate.
    const assetWbw = asset && asset.purchase_date
      ? computeReplacementValue({
          purchase_price: asset.purchase_price,
          purchase_date: asset.purchase_date,
          replacement_value_estimate: asset.replacement_value_estimate,
        }, config)
      : 0;
    const replacementValue = acc?.replacement_value ?? 0;
    const suggested = Math.max(assetWbw, replacementValue, 0);

    return {
      id: u.id as string,
      accessory_id: u.accessory_id as string,
      accessory_name: acc?.name ?? u.accessory_id,
      exemplar_code: u.exemplar_code as string,
      status: u.status as string,
      current_value: asset?.current_value ?? 0,
      replacement_value: replacementValue,
      suggested_wbw: suggested,
      asset_id: asset?.id ?? null,
    };
  });

  return NextResponse.json({
    booking: {
      id: booking.id,
      deposit: booking.deposit ?? 0,
      deposit_intent_id: booking.deposit_intent_id ?? null,
      deposit_status: booking.deposit_status ?? null,
    },
    units: result,
  });
}
