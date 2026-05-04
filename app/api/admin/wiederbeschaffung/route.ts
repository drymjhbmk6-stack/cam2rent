import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  computeReplacementValue,
  explainReplacementValue,
  loadReplacementValueConfig,
  type ReplacementValueConfig,
} from '@/lib/replacement-value';

/**
 * GET /api/admin/wiederbeschaffung
 *
 * Aggregierte Wiederbeschaffungs-Sicht: alle physischen Inventar-Items
 * (Kamera-Exemplare + Zubehoer-Exemplare + Sammel-Zubehoer) mit dem
 * pro Item geltenden Wiederbeschaffungswert.
 *
 * Berechnung pro Asset (gleicher Helper wie Anlagenverzeichnis und
 * Mietvertrag — Konsistenz quer durch alle Ansichten):
 *   - Manueller Override (assets.replacement_value_estimate) hat Vorrang.
 *   - Sonst lineare Wertminderung von 100 % auf Floor (Default 40 %)
 *     ueber Nutzungsdauer (Default 36 Monate). Konfig in
 *     admin_settings.replacement_value_config.
 *
 * Fallback fuer Items OHNE Asset:
 *   - Sammel-Zubehoer: accessories.replacement_value (Stamm-Wert)
 *   - Kamera ohne Asset: products.deposit (Kaution als Floor)
 *
 * Response:
 *   { items: WiederbeschaffungItem[], replacement_value_config: ReplacementValueConfig }
 */

export type WiederbeschaffungItem = {
  row_key: string;
  kind: 'camera_unit' | 'accessory_unit' | 'accessory_bulk';
  label: string;
  sublabel: string;
  /** Aktueller Wert pro Stueck (Override oder berechnet) */
  replacement_value: number;
  /**
   * Quelle des Werts:
   *  - 'manual' = assets.replacement_value_estimate gesetzt
   *  - 'computed' = lineare Berechnung, noch ueber Floor
   *  - 'floor' = Floor erreicht (Default 40 %)
   *  - 'fresh' = vor < 1 Monat gekauft, noch 100 %
   *  - 'accessory_default' = kein Asset, Sammel-Wert aus accessories.replacement_value
   *  - 'product_deposit' = kein Asset, Fallback auf products.deposit
   *  - 'missing' = nichts gesetzt
   */
  replacement_source: 'manual' | 'computed' | 'floor' | 'fresh' | 'accessory_default' | 'product_deposit' | 'missing';
  /** Aktuelles Prozent vom Kaufpreis (nur bei Asset-basiert verfuegbar) */
  replacement_pct: number | null;
  /** Alter in Monaten (nur bei Asset-basiert) */
  age_months: number | null;
  /** Anschaffungspreis (fuer Anzeige im Tooltip) */
  purchase_price: number | null;
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
  purchase_price: number | string;
  purchase_date: string;
  status: string;
}

interface DbAccessoryRow {
  id: string;
  name: string;
  category: string;
  is_bulk: boolean | null;
  replacement_value: number | null;
  available_qty: number | null;
}

function valueFromAsset(
  asset: AssetRow,
  config: ReplacementValueConfig,
): { value: number; source: WiederbeschaffungItem['replacement_source']; pct: number; ageMonths: number } {
  const value = computeReplacementValue(asset, config);
  const explain = explainReplacementValue(asset, config);
  return { value, source: explain.source, pct: explain.pct, ageMonths: explain.ageMonths };
}

export async function GET() {
  const supabase = createServiceClient();
  const config = await loadReplacementValueConfig(supabase);

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
      .select('id, unit_id, accessory_unit_id, current_value, replacement_value_estimate, purchase_price, purchase_date, status')
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
    let pct: number | null = null;
    let ageMonths: number | null = null;
    let purchasePrice: number | null = null;

    if (asset) {
      assetId = asset.id;
      const v = valueFromAsset(asset, config);
      replacementValue = v.value;
      source = v.source;
      pct = v.pct;
      ageMonths = v.ageMonths;
      purchasePrice = Number(asset.purchase_price);
      editable = { type: 'asset', id: asset.id };
    } else if (product?.deposit) {
      replacementValue = Number(product.deposit);
      source = 'product_deposit';
    }

    items.push({
      row_key: `cam-unit-${unit.id}`,
      kind: 'camera_unit',
      label: productLabel,
      sublabel: `SN: ${unit.serial_number ?? '—'}`,
      replacement_value: replacementValue,
      replacement_source: source,
      replacement_pct: pct,
      age_months: ageMonths,
      purchase_price: purchasePrice,
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
    if (accessory?.is_bulk) continue;
    const accLabel = accessory?.name ?? (unit.accessory_id as string);
    const asset = assetByAccUnitId.get(unit.id as string);

    let replacementValue = 0;
    let source: WiederbeschaffungItem['replacement_source'] = 'missing';
    let assetId: string | null = null;
    let editable: WiederbeschaffungItem['editable_target'] = null;
    let pct: number | null = null;
    let ageMonths: number | null = null;
    let purchasePrice: number | null = null;

    if (asset) {
      assetId = asset.id;
      const v = valueFromAsset(asset, config);
      replacementValue = v.value;
      source = v.source;
      pct = v.pct;
      ageMonths = v.ageMonths;
      purchasePrice = Number(asset.purchase_price);
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
      replacement_pct: pct,
      age_months: ageMonths,
      purchase_price: purchasePrice,
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
      replacement_pct: null,
      age_months: null,
      purchase_price: null,
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

  return NextResponse.json({ items, replacement_value_config: config });
}
