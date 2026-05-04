import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/assets/[id]/convert-to-gwg
 *
 * Stellt ein bestehendes Asset (typisch: linear AfA ueber 36 Monate)
 * auf GWG-Sofortabschreibung um. Sinnvoll fuer Sachen die unter 800 EUR
 * netto liegen, aber faelschlicherweise als regulaeres Anlagegut gebucht
 * wurden.
 *
 * Logik:
 *   1) Asset laden, Restbuchwert ausrechnen (current_value)
 *   2) depreciation_method='immediate', residual_value=0, current_value=0
 *      setzen — der Buchwert verschwindet sofort
 *   3) Falls noch Restbuchwert > 0 € da war: Expense-Eintrag mit
 *      category='asset_purchase' anlegen (Sofortabzug Restwert)
 *   4) replacement_value_estimate = purchase_price setzen, damit Vertrag
 *      und Schadensmodul den realen Marktwert kennen
 *   5) Audit-Log
 *
 * Body: { confirm_old_year?: boolean }
 *   Wenn das Anschaffungsjahr nicht das aktuelle ist (= Bilanzberichtigung),
 *   muss confirm_old_year=true gesetzt sein. Sonst 409.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const confirmOldYear = body?.confirm_old_year === true;

  const supabase = createServiceClient();

  const { data: asset, error: fetchErr } = await supabase
    .from('assets')
    .select('id, name, purchase_price, purchase_date, current_value, depreciation_method, status, supplier_id, purchase_id')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'Asset nicht gefunden.' }, { status: 404 });

  if (asset.depreciation_method === 'immediate') {
    return NextResponse.json({ error: 'Asset ist bereits als GWG (sofort) gebucht.' }, { status: 409 });
  }
  if (asset.status !== 'active') {
    return NextResponse.json({ error: 'Nur aktive Assets können auf GWG umgestellt werden.' }, { status: 409 });
  }

  // Anschaffungsjahr-Check (Berlin-Zeit)
  const purchaseYear = new Date(asset.purchase_date).getFullYear();
  const currentYear = parseInt(
    new Date().toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Europe/Berlin' }),
    10,
  );
  const isOldYear = purchaseYear !== currentYear;
  if (isOldYear && !confirmOldYear) {
    return NextResponse.json({
      error: 'Anschaffungsjahr ist nicht das aktuelle. Steuerlich kann das eine Bilanzberichtigung erfordern. Bitte mit Steuerberater abklären und mit confirm_old_year=true bestätigen.',
      code: 'CONFIRM_OLD_YEAR_REQUIRED',
      purchase_year: purchaseYear,
      current_year: currentYear,
    }, { status: 409 });
  }

  const purchasePrice = Number(asset.purchase_price ?? 0);
  const remainingBookValue = Number(asset.current_value ?? 0);
  const testMode = await isTestMode();

  // Asset auf GWG umstellen — Buchwert auf 0, Methode immediate.
  // last_depreciation_at auf heute setzen, damit der monatliche AfA-Cron
  // diese Row ueberspringt (er filtert ja eh auf depreciation_method='linear').
  const todayIso = new Date().toISOString().slice(0, 10);
  const updates: Record<string, unknown> = {
    depreciation_method: 'immediate',
    residual_value: 0,
    current_value: 0,
    useful_life_months: 0,
    last_depreciation_at: todayIso,
  };

  // replacement_value_estimate auf Kaufpreis (defensiv: Spalte koennte fehlen)
  let { error: updErr } = await supabase
    .from('assets')
    .update({ ...updates, replacement_value_estimate: purchasePrice })
    .eq('id', id);
  if (updErr && /replacement_value_estimate/i.test(updErr.message)) {
    ({ error: updErr } = await supabase.from('assets').update(updates).eq('id', id));
  }
  if (updErr) {
    return NextResponse.json({ error: `Asset-Update fehlgeschlagen: ${updErr.message}` }, { status: 500 });
  }

  // Restbuchwert als Expense buchen (Sofortabzug). Wenn schon 0, kein Eintrag.
  let expenseId: string | null = null;
  if (remainingBookValue > 0.005) {
    // Lieferanten-Name holen
    let vendor: string | null = null;
    if (asset.supplier_id) {
      const { data: sup } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', asset.supplier_id)
        .maybeSingle();
      vendor = sup?.name ?? null;
    }
    // Steuerlich: Restbuchwert = Aufwand (kein USt-Anteil mehr, weil USt schon
    // bei Anschaffung gezogen wurde). Wir buchen brutto = netto = Restbuchwert.
    const { data: exp, error: expErr } = await supabase
      .from('expenses')
      .insert({
        expense_date: todayIso,
        category: 'asset_purchase',
        description: `GWG-Umstellung: Restbuchwert ${asset.name}`.slice(0, 500),
        vendor,
        net_amount: remainingBookValue,
        tax_amount: 0,
        gross_amount: remainingBookValue,
        receipt_url: null,
        payment_method: null,
        notes: `Umstellung lineare AfA -> GWG-Sofortabzug. Asset-ID ${id}, urspruenglicher Kaufpreis ${purchasePrice.toFixed(2)} EUR, Anschaffung ${asset.purchase_date}.`,
        source_type: 'asset_gwg_conversion',
        source_id: id,
        asset_id: id,
        is_test: testMode,
      })
      .select('id')
      .single();
    if (expErr) {
      console.error('[convert-to-gwg] expense insert failed', expErr);
      // Update wurde schon geschrieben — wir geben einen partial-success zurueck,
      // der Admin kann den Expense manuell nachtragen.
      return NextResponse.json({
        warning: `Asset auf GWG umgestellt, aber Expense-Buchung fehlgeschlagen: ${expErr.message}. Bitte manuell nachtragen.`,
        partial: true,
      }, { status: 200 });
    }
    expenseId = exp?.id ?? null;
  }

  await logAudit({
    action: 'asset.convert_to_gwg',
    entityType: 'asset',
    entityId: id,
    entityLabel: asset.name,
    changes: {
      old_method: asset.depreciation_method,
      old_book_value: remainingBookValue,
      expense_id: expenseId,
      purchase_year: purchaseYear,
      old_year_confirmed: isOldYear,
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    asset_id: id,
    expense_id: expenseId,
    booked_amount: remainingBookValue,
  });
}
