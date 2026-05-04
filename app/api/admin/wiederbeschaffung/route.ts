import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/wiederbeschaffung
 *
 * Aggregierte Wiederbeschaffungs-Sicht: alle physischen Inventar-Items
 * (Kamera-Exemplare + Zubehoer-Exemplare + Sammel-Zubehoer) mit dem
 * pro Item geltenden Wiederbeschaffungswert.
 *
 * Quelle pro Zeile (in Reihenfolge):
 *   1. assets.replacement_value_estimate (wenn Asset existiert)
 *   2. assets.current_value (Fallback wenn Asset existiert aber estimate NULL)
 *   3. accessories.replacement_value (Sammel-Default fuer Zubehoer ohne Asset)
 *   4. products (admin_config) keine eigene Wiederbeschaffung — Asset zwingend
 *
 * Editierbar:
 *   - editable_target = { type:'asset', id } -> PATCH /api/admin/assets/[id] { replacement_value_estimate }
 *   - editable_target = { type:'accessory', id } -> PUT /api/admin/accessories/[id] { ..., replacement_value }
 *
 * Response:
 *   { items: WiederbeschaffungItem[] }
 */

export type WiederbeschaffungItem = {
  row_key: string;
  kind: 'camera_unit' | 'accessory_unit' | 'accessory_bulk';
  label: string;
  sublabel: string;
  replacement_value: number;
  replacement_source: 'asset_estimate' | 'asset_current' | 'accessory_default' | 'product_deposit' | 'missing';
  asset_id: string | null;
  editable_target: { type: 'asset' | 'accessory'; id: string } | null;
  qty: number;
  status: string | null;
  searchable: string;
};

interface AssetRow {
  id: string;
  unit_id: string | null;
  accessory_unit_id: string | null;
  current_value: number | null;
  replacement_value_estimate: number | null;
}

interface DbAccessoryRow {
  id: string;
  name: string;
  category: string;
  is_bulk: boolean | null;
  replacement_value: number | null;
  available_qty: number | null;
}

export async function GET() {
  const supabase = createServiceClient();

  // Produkte aus admin_config laden
  const { data: configRow } = await supabase
    .from('admin_config')
    .select('products')
    .single();
  const products: Array<{ id: string; name: string; brand: string; deposit?: number }> =
    (configRow?.products as Array<{ id: string; name: string; brand: string; deposit?: number }>) ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));

  // Parallel: alle Inventar-Tabellen
  const [accRes, productUnitsRes, accessoryUnitsRes, assetsRes] = await Promise.all([
    supabase
      .from('accessories')
      .select('id, name, category, is_bulk, replacement_value, available_qty')
      .order('name', { ascending: true }),
    supabase
      .from('product_units')
      .select('id, product_id, serial_number, label, status')
      .neq('status', 'retired'),
    supabase
      .from('accessory_units')
      .select('id, accessory_id, exemplar_code, status')
      .neq('status', 'retired'),
    supabase
      .from('assets')
      .select('id, unit_id, accessory_unit_id, current_value, replacement_value_estimate, status')
      .eq('status', 'active'),
  ]);

  const accessories: DbAccessoryRow[] = accRes.data ?? [];
  const productUnits = productUnitsRes.data ?? [];
  const accessoryUnits = accessoryUnitsRes.data ?? [];
  const assets: AssetRow[] = (assetsRes.data ?? []) as AssetRow[];

  const accessoryById = new Map(accessories.map((a) => [a.id, a]));
  const assetByUnitId = new Map<string, AssetRow>();
  const assetByAccUnitId = new Map<string, AssetRow>();
  for (const a of assets) {
    if (a.unit_id) assetByUnitId.set(a.unit_id, a);
    if (a.accessory_unit_id) assetByAccUnitId.set(a.accessory_unit_id, a);
  }

  function valueFromAsset(a: AssetRow): { value: number; source: WiederbeschaffungItem['replacement_source'] } {
    if (a.replacement_value_estimate != null && Number(a.replacement_value_estimate) > 0) {
      return { value: Number(a.replacement_value_estimate), source: 'asset_estimate' };
    }
    if (a.current_value != null) {
      return { value: Number(a.current_value), source: 'asset_current' };
    }
    return { value: 0, source: 'missing' };
  }

  const items: WiederbeschaffungItem[] = [];

  // ── Kamera-Exemplare ────────────────────────────────────────────
  for (const unit of productUnits) {
    const product = productById.get(unit.product_id as string);
    const productLabel = product ? `${product.brand} ${product.name}` : (unit.product_id as string);
    const asset = assetByUnitId.get(unit.id as string);

    let replacementValue = 0;
    let source: WiederbeschaffungItem['replacement_source'] = 'missing';
    let assetId: string | null = null;
    let editable: WiederbeschaffungItem['editable_target'] = null;

    if (asset) {
      assetId = asset.id;
      const v = valueFromAsset(asset);
      replacementValue = v.value;
      source = v.source;
      editable = { type: 'asset', id: asset.id };
    } else if (product?.deposit) {
      replacementValue = Number(product.deposit);
      source = 'product_deposit';
      // products.deposit ist Kaution — nicht ueber Wiederbeschaffungsliste editieren
    }

    items.push({
      row_key: `cam-unit-${unit.id}`,
      kind: 'camera_unit',
      label: productLabel,
      sublabel: `SN: ${unit.serial_number ?? '—'}`,
      replacement_value: replacementValue,
      replacement_source: source,
      asset_id: assetId,
      editable_target: editable,
      qty: 1,
      status: (unit.status as string) ?? null,
      searchable: `${productLabel} ${unit.serial_number ?? ''} ${unit.label ?? ''}`.toLowerCase(),
    });
  }

  // ── Zubehoer-Exemplare (mit Exemplar-Tracking) ─────────────────
  for (const unit of accessoryUnits) {
    const accessory = accessoryById.get(unit.accessory_id as string);
    if (accessory?.is_bulk) continue; // Sammel-Zubehoer separat
    const accLabel = accessory?.name ?? (unit.accessory_id as string);
    const asset = assetByAccUnitId.get(unit.id as string);

    let replacementValue = 0;
    let source: WiederbeschaffungItem['replacement_source'] = 'missing';
    let assetId: string | null = null;
    let editable: WiederbeschaffungItem['editable_target'] = null;

    if (asset) {
      assetId = asset.id;
      const v = valueFromAsset(asset);
      replacementValue = v.value;
      source = v.source;
      editable = { type: 'asset', id: asset.id };
    } else if (accessory?.replacement_value != null && Number(accessory.replacement_value) > 0) {
      replacementValue = Number(accessory.replacement_value);
      source = 'accessory_default';
      editable = { type: 'accessory', id: unit.accessory_id as string };
    }

    items.push({
      row_key: `acc-unit-${unit.id}`,
      kind: 'accessory_unit',
      label: accLabel,
      sublabel: `${accessory?.category ?? ''} · ${unit.exemplar_code}`,
      replacement_value: replacementValue,
      replacement_source: source,
      asset_id: assetId,
      editable_target: editable,
      qty: 1,
      status: (unit.status as string) ?? null,
      searchable: `${accLabel} ${unit.exemplar_code ?? ''}`.toLowerCase(),
    });
  }

  // ── Sammel-Zubehoer (ohne Exemplare) ────────────────────────────
  for (const accessory of accessories) {
    if (!accessory.is_bulk) continue;
    const replacementValue = accessory.replacement_value ?? 0;
    items.push({
      row_key: `acc-bulk-${accessory.id}`,
      kind: 'accessory_bulk',
      label: accessory.name,
      sublabel: `${accessory.category} · Sammel-Bestand`,
      replacement_value: Number(replacementValue),
      replacement_source: replacementValue > 0 ? 'accessory_default' : 'missing',
      asset_id: null,
      editable_target: { type: 'accessory', id: accessory.id },
      qty: accessory.available_qty ?? 0,
      status: null,
      searchable: `${accessory.name} ${accessory.category}`.toLowerCase(),
    });
  }

  // Sortierung: Kameras zuerst, dann Zubehoer, alphabetisch nach Label
  const order = { camera_unit: 0, accessory_unit: 1, accessory_bulk: 2 } as const;
  items.sort((a, b) => {
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return a.label.localeCompare(b.label, 'de');
  });

  return NextResponse.json({ items });
}
