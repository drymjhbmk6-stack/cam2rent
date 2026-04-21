import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/purchase-items/:id
 *
 * Klassifiziert eine Rechnungs-Position entweder als
 *   - Anlagegut (asset): erzeugt neue Row in `assets`, verlinkt sie
 *   - Betriebsausgabe (expense): erzeugt neue Row in `expenses`, verlinkt sie
 *   - Ignoriert: classification='ignored' (keine Buchung)
 *
 * Body-Varianten:
 *
 * { "classification": "asset",
 *   "kind": "rental_camera",
 *   "name": "GoPro Hero13 Black",
 *   "manufacturer": "GoPro", "model": "Hero13 Black",
 *   "serial_number": "C3321...",
 *   "useful_life_months": 36,
 *   "residual_value": 0,
 *   "product_id": "gopro-hero13-black",   // optional, wenn Kamera bekanntem Produkt zugeordnet
 *   "unit_id": "<uuid>" }                 // optional, wenn Einheit bereits existiert
 *
 * { "classification": "expense",
 *   "category": "hardware",
 *   "description": "Verbrauchsmaterial",
 *   "expense_date": "2026-04-21" }
 *
 * { "classification": "ignored" }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: itemId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const classification = body.classification as 'asset' | 'expense' | 'ignored' | undefined;
  if (!classification || !['asset', 'expense', 'ignored'].includes(classification)) {
    return NextResponse.json({ error: 'classification muss asset|expense|ignored sein' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const testMode = await isTestMode();

  // Item laden, um zu wissen, zu welcher purchase es gehoert
  const { data: item, error: itemErr } = await supabase
    .from('purchase_items')
    .select('id, purchase_id, product_name, quantity, unit_price, tax_rate, net_price, ai_suggestion, classification, asset_id, expense_id, purchases:purchase_id(supplier_id, invoice_number, order_date)')
    .eq('id', itemId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Position nicht gefunden' }, { status: 404 });
  }

  // Wenn bereits klassifiziert, vorher aufraeumen (Idempotenz / Umklassifizierung)
  if (item.asset_id) {
    // Verknuepften Asset-Eintrag nicht zwingend loeschen (AfA-Buchungen haengen dran),
    // nur Verknuepfung trennen. Admin muss Asset separat verwalten.
    await supabase.from('purchase_items').update({ asset_id: null }).eq('id', itemId);
  }
  if (item.expense_id) {
    await supabase.from('expenses').delete().eq('id', item.expense_id);
    await supabase.from('purchase_items').update({ expense_id: null }).eq('id', itemId);
  }

  if (classification === 'ignored') {
    const { data: updated, error: updErr } = await supabase
      .from('purchase_items')
      .update({ classification: 'ignored' })
      .eq('id', itemId)
      .select()
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
  const quantity = Number(item.quantity ?? 1);
  const unitPriceNet = Number(item.unit_price ?? 0);
  const taxRate = Number(item.tax_rate ?? 19);
  const netTotal = Number(item.net_price ?? unitPriceNet * quantity);
  const grossTotal = Number(((item.ai_suggestion as { line_total_gross?: number } | null)?.line_total_gross)
    ?? netTotal * (1 + taxRate / 100));

  if (classification === 'asset') {
    const kind = body.kind as string | undefined;
    const allowedKinds = ['rental_camera', 'rental_accessory', 'office_equipment', 'tool', 'other'];
    if (!kind || !allowedKinds.includes(kind)) {
      return NextResponse.json({ error: 'kind muss einer der erlaubten Werte sein' }, { status: 400 });
    }

    const name = String(body.name || item.product_name).trim();
    if (!name) {
      return NextResponse.json({ error: 'name ist Pflicht' }, { status: 400 });
    }

    const usefulLifeMonths = Number(body.useful_life_months) > 0 ? Number(body.useful_life_months) : 36;
    const depreciationMethod = body.depreciation_method === 'immediate'
      ? 'immediate'
      : body.depreciation_method === 'none'
        ? 'none'
        : 'linear';

    // Asset-Preis: netTotal / quantity wenn mehrere Einheiten auf einer Zeile,
    // ansonsten netto des Einzelstuecks. Vorgabe: ein Asset pro Position —
    // bei quantity>1 wird der Gesamtbetrag aufs Asset gerechnet (Admin kann ueberschreiben).
    const purchasePrice = Number(body.purchase_price) > 0
      ? Number(body.purchase_price)
      : Math.round(netTotal * 100) / 100;

    // Restwert: default 30 % vom Kaufpreis (realistischer Gebrauchtwert fuer
    // Vermietgeraete). Kann manuell ueberschrieben werden.
    const residualValue = body.residual_value != null && Number(body.residual_value) >= 0
      ? Number(body.residual_value)
      : Math.round(purchasePrice * 0.3 * 100) / 100;

    // Kaufdatum: aus Body, sonst aus Bestellung
    const purchaseDate = body.purchase_date || purchase?.order_date || new Date().toISOString().slice(0, 10);

    const { data: asset, error: assetErr } = await supabase
      .from('assets')
      .insert({
        kind,
        name,
        description: body.description ?? null,
        serial_number: body.serial_number ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        purchase_price: purchasePrice,
        purchase_date: purchaseDate,
        supplier_id: purchase?.supplier_id ?? null,
        purchase_id: item.purchase_id,
        useful_life_months: usefulLifeMonths,
        depreciation_method: depreciationMethod,
        residual_value: residualValue,
        current_value: purchasePrice,
        product_id: body.product_id ?? null,
        unit_id: body.unit_id ?? null,
        is_test: testMode,
      })
      .select()
      .single();

    if (assetErr) {
      console.error('[purchase-items] asset insert error', assetErr);
      return NextResponse.json({ error: `Asset konnte nicht angelegt werden: ${assetErr.message}` }, { status: 500 });
    }

    // Optional: neue product_units-Row anlegen, wenn Admin das moechte
    let newUnitId: string | null = body.unit_id ?? null;
    if (!newUnitId && body.create_unit && body.product_id && body.serial_number) {
      const { data: unit } = await supabase
        .from('product_units')
        .insert({
          product_id: body.product_id,
          serial_number: body.serial_number,
          label: name,
          status: 'available',
          purchased_at: purchaseDate,
        })
        .select('id')
        .single();
      if (unit) {
        newUnitId = unit.id;
        await supabase.from('assets').update({ unit_id: unit.id }).eq('id', asset.id);
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from('purchase_items')
      .update({ classification: 'asset', asset_id: asset.id })
      .eq('id', itemId)
      .select()
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ item: updated, asset, unit_id: newUnitId });
  }

  // classification === 'expense'
  const category = body.category as string | undefined;
  const allowedCategories = [
    'stripe_fees', 'shipping', 'software', 'hardware', 'marketing',
    'office', 'travel', 'insurance', 'legal', 'asset_purchase', 'other',
  ];
  if (!category || !allowedCategories.includes(category)) {
    return NextResponse.json({ error: 'category ungueltig' }, { status: 400 });
  }

  const description = String(body.description || item.product_name).trim();
  const expenseDate = body.expense_date || purchase?.order_date || new Date().toISOString().slice(0, 10);

  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      expense_date: expenseDate,
      category,
      description: description.slice(0, 500),
      vendor: body.vendor ?? null,
      net_amount: netTotal,
      tax_amount: Math.round((grossTotal - netTotal) * 100) / 100,
      gross_amount: grossTotal,
      receipt_url: null, // liegt ueber purchases.invoice_storage_path
      payment_method: body.payment_method ?? null,
      notes: `Aus Einkauf ${purchase?.invoice_number ?? item.purchase_id}`,
      source_type: 'purchase_item',
      source_id: itemId,
      is_test: testMode,
    })
    .select()
    .single();

  if (expErr) {
    console.error('[purchase-items] expense insert error', expErr);
    return NextResponse.json({ error: `Ausgabe konnte nicht gebucht werden: ${expErr.message}` }, { status: 500 });
  }

  const { data: updated, error: updErr } = await supabase
    .from('purchase_items')
    .update({ classification: 'expense', expense_id: expense.id })
    .eq('id', itemId)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ item: updated, expense });
}
