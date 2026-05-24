import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { getAdapterForBrand } from './adapters';
import { claudeAdapter } from './adapters/claude';
import type { FirmwareCheckRow, FirmwareInfo } from './types';

export interface FirmwareUpdate {
  product_id: string;
  brand: string;
  model: string;
  from: string | null;
  to: string;
}

export interface FirmwareCheckSummary {
  checked: number;
  errors: number;
  unsupported: number;
  updates: FirmwareUpdate[];
  /** Wieviele Lookups via Claude-Web-Search-Fallback gelaufen sind. */
  claude_fallbacks: number;
}

interface ResolveResult {
  info: FirmwareInfo;
  usedFallback: boolean;
  fallbackReason: string | null;
}

/**
 * Versucht erst den marken-spezifischen Adapter; bei `error` oder
 * `unsupported` fällt das System auf Claude-Web-Search zurück.
 * Wirft nur, wenn ALLE Pfade scheitern.
 */
async function resolveLatest(brand: string, model: string): Promise<ResolveResult> {
  const adapter = getAdapterForBrand(brand);

  // Wenn der Marken-Adapter das Modell trägt → erst dort versuchen.
  if (adapter && adapter.supports(model)) {
    try {
      const info = await adapter.fetchLatest(model);
      return { info, usedFallback: false, fallbackReason: null };
    } catch (adapterErr) {
      const reason = adapterErr instanceof Error ? adapterErr.message : String(adapterErr);
      // Fallback auf Claude
      try {
        const info = await claudeAdapter.fetchLatest(model);
        return { info, usedFallback: true, fallbackReason: `Marken-Adapter: ${reason}` };
      } catch (claudeErr) {
        const cMsg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
        throw new Error(
          `Marken-Adapter fehlgeschlagen (${reason}) — Claude-Fallback ebenfalls fehlgeschlagen (${cMsg})`,
        );
      }
    }
  }

  // Kein Adapter / Modell nicht im Registry → direkt Claude.
  const reason = adapter
    ? `Modell "${model}" im ${brand}-Adapter nicht hinterlegt`
    : `Marke "${brand || '—'}" hat keinen spezifischen Adapter`;
  const info = await claudeAdapter.fetchLatest(model);
  return { info, usedFallback: true, fallbackReason: reason };
}

/**
 * Iteriert alle Kameras aus `admin_config.products` und ruft pro Marke
 * den passenden Adapter. Persistiert pro `product_id` einen Upsert in
 * `firmware_checks` und sammelt erkannte Versions-Wechsel in `updates[]`.
 *
 * Bewusst **sequenziell** (mit kurzer Pause pro Aufruf), damit wir
 * Hersteller-APIs/Webseiten nicht hämmern.
 */
export async function checkAllFirmware(
  supabase: SupabaseClient = createServiceClient(),
): Promise<FirmwareCheckSummary> {
  const products = await getProducts();
  const cameras = products.filter((p) => (p.category ?? 'action-cam') !== 'zubehoer');

  // Bestehende Zeilen vorab laden, um Versions-Wechsel zu erkennen.
  const { data: existingRows } = await supabase
    .from('firmware_checks')
    .select('*');
  const byProduct = new Map<string, FirmwareCheckRow>();
  for (const r of (existingRows as FirmwareCheckRow[] | null) ?? []) {
    byProduct.set(r.product_id, r);
  }

  const summary: FirmwareCheckSummary = {
    checked: 0, errors: 0, unsupported: 0, updates: [], claude_fallbacks: 0,
  };

  for (const p of cameras) {
    summary.checked += 1;
    const brand = (p.brand ?? '').trim();
    const model = (p.model ?? p.name ?? '').trim();
    const previous = byProduct.get(p.id) ?? null;

    try {
      const { info, usedFallback, fallbackReason } = await resolveLatest(brand, model);
      if (usedFallback) summary.claude_fallbacks += 1;
      const versionChanged = previous?.latest_version !== info.version;
      const nowIso = new Date().toISOString();
      await upsertRow(supabase, {
        product_id: p.id,
        brand,
        model,
        status: 'ok',
        latest_version: info.version,
        source_url: info.sourceUrl,
        release_date: info.releaseDate ?? null,
        error_message: usedFallback ? `Quelle via Claude-Web-Search (${fallbackReason})` : null,
        last_changed_at: versionChanged ? nowIso : previous?.last_changed_at ?? nowIso,
        seen_version: previous?.seen_version ?? null,
      });
      if (versionChanged) {
        summary.updates.push({
          product_id: p.id,
          brand,
          model,
          from: previous?.latest_version ?? null,
          to: info.version,
        });
      }
    } catch (err) {
      summary.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await upsertRow(supabase, {
        product_id: p.id,
        brand,
        model,
        status: 'error',
        latest_version: previous?.latest_version ?? null,
        source_url: previous?.source_url ?? null,
        release_date: previous?.release_date ?? null,
        error_message: msg.slice(0, 500),
        last_changed_at: previous?.last_changed_at ?? null,
        seen_version: previous?.seen_version ?? null,
      });
    }

    // Kleine Pause zwischen Hersteller-/Claude-Calls — kein Hämmern.
    await sleep(1000);
  }

  return summary;
}

/**
 * Einzel-Check für ein bestimmtes Produkt — wird von der „Jetzt prüfen"-
 * Aktion auf der Kamera-Stammdaten-Card aufgerufen.
 */
export async function checkOneProduct(
  productId: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<{ row: FirmwareCheckRow | null; update: FirmwareUpdate | null }> {
  const products = await getProducts();
  const p = products.find((x) => x.id === productId);
  if (!p) {
    return { row: null, update: null };
  }
  const brand = (p.brand ?? '').trim();
  const model = (p.model ?? p.name ?? '').trim();

  const { data: existing } = await supabase
    .from('firmware_checks')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  const previous = (existing as FirmwareCheckRow | null) ?? null;

  try {
    const { info, usedFallback, fallbackReason } = await resolveLatest(brand, model);
    const versionChanged = previous?.latest_version !== info.version;
    const nowIso = new Date().toISOString();
    const row = await upsertRow(supabase, {
      product_id: productId,
      brand,
      model,
      status: 'ok',
      latest_version: info.version,
      source_url: info.sourceUrl,
      release_date: info.releaseDate ?? null,
      error_message: usedFallback ? `Quelle via Claude-Web-Search (${fallbackReason})` : null,
      last_changed_at: versionChanged ? nowIso : previous?.last_changed_at ?? nowIso,
      seen_version: previous?.seen_version ?? null,
    });
    const update: FirmwareUpdate | null = versionChanged
      ? { product_id: productId, brand, model, from: previous?.latest_version ?? null, to: info.version }
      : null;
    return { row, update };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const row = await upsertRow(supabase, {
      product_id: productId,
      brand,
      model,
      status: 'error',
      latest_version: previous?.latest_version ?? null,
      source_url: previous?.source_url ?? null,
      release_date: previous?.release_date ?? null,
      error_message: msg.slice(0, 500),
      last_changed_at: previous?.last_changed_at ?? null,
      seen_version: previous?.seen_version ?? null,
    });
    return { row, update: null };
  }
}

type UpsertInput = Omit<FirmwareCheckRow, 'id' | 'last_checked_at' | 'created_at'>;

async function upsertRow(
  supabase: SupabaseClient,
  input: UpsertInput,
): Promise<FirmwareCheckRow | null> {
  const { data, error } = await supabase
    .from('firmware_checks')
    .upsert(
      { ...input, last_checked_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    )
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[firmware] upsert failed:', error.message);
    return null;
  }
  return (data as FirmwareCheckRow | null) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
