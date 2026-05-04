import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

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

  const classification = body.classification as 'asset' | 'gwg' | 'expense' | 'ignored' | undefined;
  if (!classification || !['asset', 'gwg', 'expense', 'ignored'].includes(classification)) {
    return NextResponse.json({ error: 'classification muss asset|gwg|expense|ignored sein' }, { status: 400 });
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

    await logAudit({
      action: 'purchase_item.classify_ignored',
      entityType: 'purchase_item',
      entityId: itemId,
      request: req,
    });

    return NextResponse.json({ item: updated });
  }

  const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
  const quantity = Number(item.quantity ?? 1);
  const unitPriceNet = Number(item.unit_price ?? 0);
  const taxRate = Number(item.tax_rate ?? 19);
  const netTotal = Number(item.net_price ?? unitPriceNet * quantity);
  const grossTotal = Number(((item.ai_suggestion as { line_total_gross?: number } | null)?.line_total_gross)
    ?? netTotal * (1 + taxRate / 100));

  // STUFE 2+3: Verknuepfung mit existierender Anlage statt neuem Asset.
  // Wenn link_to_asset_id gesetzt ist UND classification 'asset' oder 'gwg':
  //   - Kein neues Asset anlegen
  //   - Existierendes Asset finden, purchase_items.asset_id verknuepfen
  //   - Wenn Asset noch keinen purchase_price hat, aus der Position uebernehmen
  //   - Bei classification='gwg': zusaetzlich Expense fuer EÜR anlegen
  //   - Bei classification='asset': KEIN Expense (lineare AfA-Buchungen laeuft ueber den Cron)
  const linkToAssetId = typeof body.link_to_asset_id === 'string' && body.link_to_asset_id.trim()
    ? body.link_to_asset_id.trim()
    : null;
  if (linkToAssetId && (classification === 'asset' || classification === 'gwg')) {
    const { data: existingAsset, error: assetFetchErr } = await supabase
      .from('assets')
      .select('id, name, kind, purchase_price, purchase_date, depreciation_method, status, supplier_id')
      .eq('id', linkToAssetId)
      .maybeSingle();
    if (assetFetchErr) return NextResponse.json({ error: assetFetchErr.message }, { status: 500 });
    if (!existingAsset) return NextResponse.json({ error: 'Verknuepfte Anlage nicht gefunden.' }, { status: 404 });
    if (existingAsset.status !== 'active') {
      return NextResponse.json({ error: 'Verknuepfte Anlage ist nicht aktiv (Status: ' + existingAsset.status + ').' }, { status: 409 });
    }

    // Preis aus Position uebernehmen, wenn Asset noch keinen Preis hat (=0 oder NULL)
    const assetPrice = Number(existingAsset.purchase_price ?? 0);
    if (assetPrice === 0 && netTotal > 0) {
      const updates: Record<string, unknown> = {
        purchase_price: netTotal,
      };
      // Bei lineare Methode: current_value mit-aktualisieren (sonst startet AfA bei 0)
      if (existingAsset.depreciation_method === 'linear') {
        updates.current_value = netTotal;
        updates.residual_value = Math.round(netTotal * 0.3 * 100) / 100;
      } else if (existingAsset.depreciation_method === 'immediate') {
        // GWG: replacement_value_estimate = neuer Preis (defensiv)
        const upd1 = await supabase
          .from('assets')
          .update({ ...updates, replacement_value_estimate: netTotal })
          .eq('id', linkToAssetId);
        if (upd1.error && /replacement_value_estimate/i.test(upd1.error.message)) {
          await supabase.from('assets').update(updates).eq('id', linkToAssetId);
        }
      }
      // Wenn nicht immediate, einfacher Update
      if (existingAsset.depreciation_method !== 'immediate') {
        await supabase.from('assets').update(updates).eq('id', linkToAssetId);
      }
    }

    // Optional: Expense fuer GWG anlegen, damit der Beleg in der EÜR landet
    let expenseId: string | null = null;
    if (classification === 'gwg' && netTotal > 0) {
      const expenseDate = body.expense_date || purchase?.order_date || new Date().toISOString().slice(0, 10);
      const { data: exp, error: expErr } = await supabase
        .from('expenses')
        .insert({
          expense_date: expenseDate,
          category: 'asset_purchase',
          description: `Beleg zu GWG: ${existingAsset.name}`.slice(0, 500),
          vendor: null,
          net_amount: netTotal,
          tax_amount: Math.round((grossTotal - netTotal) * 100) / 100,
          gross_amount: grossTotal,
          receipt_url: null,
          payment_method: body.payment_method ?? null,
          notes: `Aus Einkauf ${purchase?.invoice_number ?? item.purchase_id}, an existierende Anlage gehaengt.`,
          source_type: 'purchase_item',
          source_id: itemId,
          asset_id: linkToAssetId,
          is_test: testMode,
        })
        .select('id')
        .single();
      if (!expErr && exp) expenseId = exp.id;
    }

    // purchase_items aktualisieren
    const piUpdates: Record<string, unknown> = {
      classification,
      asset_id: linkToAssetId,
    };
    if (expenseId) piUpdates.expense_id = expenseId;

    const { data: updated, error: updErr } = await supabase
      .from('purchase_items')
      .update(piUpdates)
      .eq('id', itemId)
      .select()
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await logAudit({
      action: 'purchase_item.link_to_asset',
      entityType: 'purchase_item',
      entityId: itemId,
      changes: { asset_id: linkToAssetId, expense_id: expenseId, classification, price_taken_over: assetPrice === 0 && netTotal > 0 },
      request: req,
    });

    return NextResponse.json({ item: updated, asset_id: linkToAssetId, expense_id: expenseId, linked: true });
  }

  if (classification === 'gwg') {
    // GWG nach § 6 Abs. 2 EStG: Sofortabschreibung als Aufwand (EÜR) UND
    // Eintrag im Anlagenverzeichnis (Verzeichnis-Pflicht ab 250 EUR netto).
    // Daher legen wir BEIDES an: Expense (category=asset_purchase) + Asset
    // (depreciation_method=immediate, current_value=0, residual_value=0).
    const kind = body.kind as string | undefined;
    const allowedKinds = ['rental_camera', 'rental_accessory', 'office_equipment', 'tool', 'other'];
    if (!kind || !allowedKinds.includes(kind)) {
      return NextResponse.json({ error: 'kind muss einer der erlaubten Werte sein' }, { status: 400 });
    }
    const name = String(body.name || item.product_name).trim();
    if (!name) {
      return NextResponse.json({ error: 'name ist Pflicht' }, { status: 400 });
    }

    const purchasePrice = Number(body.purchase_price) > 0
      ? Number(body.purchase_price)
      : Math.round(netTotal * 100) / 100;
    const purchaseDate = body.purchase_date || purchase?.order_date || new Date().toISOString().slice(0, 10);

    // Expense fuer EÜR
    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        expense_date: purchaseDate,
        category: 'asset_purchase',
        description: name.slice(0, 500),
        vendor: body.vendor ?? null,
        net_amount: netTotal,
        tax_amount: Math.round((grossTotal - netTotal) * 100) / 100,
        gross_amount: grossTotal,
        receipt_url: null,
        payment_method: body.payment_method ?? null,
        notes: `GWG-Sofortabzug aus Einkauf ${purchase?.invoice_number ?? item.purchase_id}`,
        source_type: 'purchase_item',
        source_id: itemId,
        is_test: testMode,
      })
      .select()
      .single();
    if (expErr) {
      console.error('[purchase-items] gwg expense insert error', expErr);
      return NextResponse.json({ error: `GWG-Aufwand konnte nicht gebucht werden: ${expErr.message}` }, { status: 500 });
    }

    // Asset fuer Verzeichnis-Pflicht (sofort abgeschrieben, Buchwert 0).
    // ABER: replacement_value_estimate haelt den echten Marktwert (Kaufpreis),
    // damit Vertrag + Schadensmodul nicht 0 € als Wiederbeschaffung anbieten.
    // Defensiv: Spalte koennte ohne Migration noch nicht existieren — Retry
    // ohne sie, damit die GWG-Klassifizierung nicht haengt.
    const assetBase = {
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
      useful_life_months: 0,
      depreciation_method: 'immediate',
      residual_value: 0,
      current_value: 0,
      last_depreciation_at: purchaseDate,
      product_id: body.product_id ?? null,
      unit_id: body.unit_id ?? null,
      is_test: testMode,
    };
    let { data: asset, error: assetErr } = await supabase
      .from('assets')
      .insert({ ...assetBase, replacement_value_estimate: purchasePrice })
      .select()
      .single();
    if (assetErr && /replacement_value_estimate/i.test(assetErr.message)) {
      // Migration noch nicht durch -> ohne Spalte retryen
      ({ data: asset, error: assetErr } = await supabase
        .from('assets')
        .insert(assetBase)
        .select()
        .single());
    }
    if (assetErr || !asset) {
      // Expense wieder weg, sonst doppelte Buchung
      await supabase.from('expenses').delete().eq('id', expense.id);
      console.error('[purchase-items] gwg asset insert error', assetErr);
      return NextResponse.json({ error: `GWG-Anlage konnte nicht angelegt werden: ${assetErr?.message ?? 'unbekannt'}` }, { status: 500 });
    }

    // Asset <-> Expense gegenseitig verknuepfen
    await supabase.from('expenses').update({ asset_id: asset.id }).eq('id', expense.id);

    // Optional: neue product_units-Row anlegen (analog Asset-Pfad)
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
      .update({ classification: 'gwg', asset_id: asset.id, expense_id: expense.id })
      .eq('id', itemId)
      .select()
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await logAudit({
      action: 'purchase_item.classify_gwg',
      entityType: 'purchase_item',
      entityId: itemId,
      changes: { asset_id: asset.id, expense_id: expense.id, kind, name, purchase_price: purchasePrice },
      request: req,
    });

    return NextResponse.json({ item: updated, asset, expense, unit_id: newUnitId });
  }

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

    await logAudit({
      action: 'purchase_item.classify_asset',
      entityType: 'purchase_item',
      entityId: itemId,
      changes: { asset_id: asset.id, kind, name },
      request: req,
    });

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

  await logAudit({
    action: 'purchase_item.classify_expense',
    entityType: 'purchase_item',
    entityId: itemId,
    changes: { expense_id: expense.id, category, gross: grossTotal },
    request: req,
  });

  return NextResponse.json({ item: updated, expense });
}
