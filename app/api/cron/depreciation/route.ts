import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import {
  monthlyDepreciationRate,
  pendingDepreciationMonths,
  isFullyDepreciated,
  type DepreciableAsset,
} from '@/lib/depreciation';
import { isTestMode } from '@/lib/env-mode';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Monatlicher AfA-Cron.
 *
 * Laeuft am 1. jeden Monats um 03:00 Berlin-Zeit (Hetzner-Crontab):
 *   0 3 1 * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cam2rent.de/api/cron/depreciation
 *
 * Fuer jedes aktive Asset mit depreciation_method='linear':
 *   - berechnet Monatsrate
 *   - traegt Buchung in expenses (category='depreciation') ein
 *   - aktualisiert current_value, last_depreciation_at
 *   - stoppt bei Erreichen des Restwerts
 *
 * Idempotent: source_id enthaelt "{asset_id}_{YYYY-MM}" → doppelter
 * Aufruf im selben Monat erzeugt keinen zweiten Eintrag.
 *
 * Test-/Live-Mode: im Test-Modus werden NUR Test-Assets (is_test=true)
 * abgeschrieben, im Live-Modus NUR Live-Assets (is_test=false).
 */

interface AssetRow extends DepreciableAsset {
  id: string;
  name: string;
  is_test: boolean;
  residual_value: number;
  status: string;
}

export async function GET(req: NextRequest) {
  return runDepreciation(req);
}

export async function POST(req: NextRequest) {
  return runDepreciation(req);
}

async function runDepreciation(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const testMode = await isTestMode();

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, name, purchase_price, purchase_date, useful_life_months, depreciation_method, residual_value, current_value, last_depreciation_at, status, is_test')
    .eq('status', 'active')
    .eq('depreciation_method', 'linear')
    .eq('is_test', testMode)
    .returns<AssetRow[]>();

  if (error) {
    console.error('[cron/depreciation] load error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    asset_id: string;
    name: string;
    months_processed: number;
    total_depreciated: number;
    new_current_value: number;
    skipped?: string;
  }> = [];

  // Bulk-Load aller bereits gebuchten AfA-Source-IDs ueber alle Assets — ein Query
  // statt eines SELECT pro Asset×Monat (war N×M).
  const assetIds = (assets ?? []).map((a) => a.id);
  const { data: allDepExpenses } = assetIds.length
    ? await supabase
        .from('expenses')
        .select('source_id')
        .eq('source_type', 'depreciation')
        .in('asset_id', assetIds)
    : { data: [] as Array<{ source_id: string }> };
  const bookedSourceIds = new Set((allDepExpenses ?? []).map((e) => e.source_id));

  for (const asset of assets ?? []) {
    if (isFullyDepreciated(asset)) {
      results.push({
        asset_id: asset.id,
        name: asset.name,
        months_processed: 0,
        total_depreciated: 0,
        new_current_value: Number(asset.current_value),
        skipped: 'already_fully_depreciated',
      });
      continue;
    }

    const pendingMonths = pendingDepreciationMonths(asset);
    if (pendingMonths.length === 0) {
      results.push({
        asset_id: asset.id,
        name: asset.name,
        months_processed: 0,
        total_depreciated: 0,
        new_current_value: Number(asset.current_value),
        skipped: 'nothing_pending',
      });
      continue;
    }

    const rate = monthlyDepreciationRate(asset);
    let currentValue = Number(asset.current_value);
    const floor = Number(asset.residual_value ?? 0);
    let totalDepreciated = 0;
    let processed = 0;
    let lastMonth: string | null = null;

    for (const yyyyMm of pendingMonths) {
      if (currentValue <= floor + 0.01) break;

      const thisMonthRate = Math.min(rate, currentValue - floor);
      const expenseDate = lastDayOfMonthIso(yyyyMm);
      const sourceId = `${asset.id}_${yyyyMm}`;

      // Idempotenz: Memory-Lookup statt SELECT pro Monat
      if (bookedSourceIds.has(sourceId)) {
        lastMonth = yyyyMm;
        continue;
      }

      const { error: expErr } = await supabase.from('expenses').insert({
        expense_date: expenseDate,
        category: 'depreciation',
        description: `AfA ${asset.name} (${yyyyMm})`,
        vendor: null,
        net_amount: thisMonthRate,
        tax_amount: 0,
        gross_amount: thisMonthRate,
        receipt_url: null,
        payment_method: null,
        notes: null,
        asset_id: asset.id,
        source_type: 'depreciation',
        source_id: sourceId,
        is_test: asset.is_test,
      });

      if (expErr) {
        console.error(`[cron/depreciation] expense insert error for asset ${asset.id}`, expErr);
        continue;
      }

      currentValue = Math.round((currentValue - thisMonthRate) * 100) / 100;
      totalDepreciated = Math.round((totalDepreciated + thisMonthRate) * 100) / 100;
      processed += 1;
      lastMonth = yyyyMm;
    }

    if (processed > 0 || lastMonth) {
      await supabase
        .from('assets')
        .update({
          current_value: currentValue,
          last_depreciation_at: lastMonth ? lastDayOfMonthIso(lastMonth) : asset.last_depreciation_at,
        })
        .eq('id', asset.id);
    }

    results.push({
      asset_id: asset.id,
      name: asset.name,
      months_processed: processed,
      total_depreciated: totalDepreciated,
      new_current_value: currentValue,
    });
  }

  return NextResponse.json({
    ok: true,
    test_mode: testMode,
    total_assets: assets?.length ?? 0,
    results,
  });
}

function lastDayOfMonthIso(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Tag 0 des naechsten Monats = letzter Tag dieses Monats
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}
