import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  monthlyDepreciationRate,
  pendingDepreciationMonths,
  type DepreciableAsset,
} from '@/lib/depreciation';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/assets/:id/depreciation-catchup
 *
 * Traegt rueckwirkend alle fehlenden AfA-Monate fuer ein Asset nach.
 * Wird nach Nachtragung eines Bestands-Assets aufgerufen, damit
 * current_value dem tatsaechlichen Zeitwert entspricht.
 */

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, name, purchase_price, purchase_date, useful_life_months, depreciation_method, residual_value, current_value, last_depreciation_at, is_test, status')
    .eq('id', id)
    .single<DepreciableAsset & { id: string; name: string; is_test: boolean; residual_value: number; status: string }>();

  if (error || !asset) return NextResponse.json({ error: 'Asset nicht gefunden' }, { status: 404 });
  if (asset.status !== 'active') return NextResponse.json({ error: 'Nur aktive Assets koennen nachgebucht werden' }, { status: 400 });

  const pendingMonths = pendingDepreciationMonths(asset);
  if (pendingMonths.length === 0) {
    return NextResponse.json({ ok: true, months_processed: 0, new_current_value: Number(asset.current_value) });
  }

  const rate = monthlyDepreciationRate(asset);
  const floor = Number(asset.residual_value ?? 0);
  let currentValue = Number(asset.current_value);
  let totalDepreciated = 0;
  let processed = 0;
  let lastMonth = asset.last_depreciation_at?.slice(0, 7) ?? null;

  for (const yyyyMm of pendingMonths) {
    if (currentValue <= floor + 0.01) break;
    const thisMonthRate = Math.min(rate, currentValue - floor);
    const sourceId = `${asset.id}_${yyyyMm}`;

    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('source_type', 'depreciation')
      .eq('source_id', sourceId)
      .maybeSingle();
    if (existing) {
      lastMonth = yyyyMm;
      continue;
    }

    const expenseDate = lastDayOfMonthIso(yyyyMm);
    const { error: expErr } = await supabase.from('expenses').insert({
      expense_date: expenseDate,
      category: 'depreciation',
      description: `AfA ${asset.name} (${yyyyMm}, nachgetragen)`,
      net_amount: thisMonthRate,
      tax_amount: 0,
      gross_amount: thisMonthRate,
      asset_id: asset.id,
      source_type: 'depreciation',
      source_id: sourceId,
      is_test: asset.is_test,
    });
    if (expErr) {
      console.error(`[catchup] expense insert error for ${asset.id}`, expErr);
      continue;
    }

    currentValue = Math.round((currentValue - thisMonthRate) * 100) / 100;
    totalDepreciated = Math.round((totalDepreciated + thisMonthRate) * 100) / 100;
    processed += 1;
    lastMonth = yyyyMm;
  }

  if (processed > 0 && lastMonth) {
    await supabase
      .from('assets')
      .update({ current_value: currentValue, last_depreciation_at: lastDayOfMonthIso(lastMonth) })
      .eq('id', asset.id);
  }

  return NextResponse.json({
    ok: true,
    months_processed: processed,
    total_depreciated: totalDepreciated,
    new_current_value: currentValue,
  });
}

function lastDayOfMonthIso(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
