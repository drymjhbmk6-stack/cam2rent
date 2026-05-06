import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/inventar/backfill-codes
 *
 * Reparatur fuer Kameras: Hebt das Migrations-Artefakt
 * `inventar_code = CAM-${db_id}-${serial_number}` auf — der db_id-Praefix
 * (numerisch) macht den Code unleserlich. Stattdessen wird das alte Label
 * (das aktuell im `bezeichnung`-Feld liegt, z.B. "CAM-DJI-OA5-01") als
 * sauberer inventar_code uebernommen, und die Bezeichnung wird auf den
 * Modellnamen aus `produkte` umgestellt (z.B. "DJI Action 5 Pro").
 *
 * Wirkt nur auf typ='kamera' mit verknuepftem produkt. Idempotent: bei
 * einem zweiten Lauf passiert nichts mehr (Bezeichnung == Zielwert).
 *
 * Body: { dry_run?: boolean }
 * Response: { updated, skipped, conflicts, dry_run, samples }
 */

interface InventarRow {
  id: string;
  bezeichnung: string;
  inventar_code: string | null;
  seriennummer: string | null;
  produkt: { id: string; name: string | null; marke: string | null; modell: string | null } | null;
}

function targetBezeichnung(p: InventarRow['produkt']): string | null {
  if (!p) return null;
  const combined = [p.marke, p.modell].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return p.name?.trim() || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body?.dry_run === true;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('inventar_units')
    .select('id, bezeichnung, inventar_code, seriennummer, produkt:produkte(id, name, marke, modell)')
    .eq('typ', 'kamera')
    .not('produkt_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Vorab alle existierenden inventar_codes laden — fuer Konflikt-Pruefung,
  // damit der UNIQUE-Constraint nicht erst beim Update zuschlaegt.
  const { data: allCodesRaw } = await supabase
    .from('inventar_units')
    .select('id, inventar_code')
    .not('inventar_code', 'is', null);
  const codeOwners = new Map<string, string>(); // code -> unit-id
  for (const r of (allCodesRaw ?? []) as { id: string; inventar_code: string | null }[]) {
    if (r.inventar_code) codeOwners.set(r.inventar_code, r.id);
  }

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;
  const samples: Array<{ id: string; from_bezeichnung: string; to_bezeichnung: string; from_code: string | null; to_code: string }> = [];

  // Supabase typisiert nested-selects defensiv als Array — wir behandeln das mit einem
  // optionalen Cast je nach Schema-Lieferung.
  for (const raw of (data ?? []) as unknown as InventarRow[]) {
    // produkt kommt teils als Objekt, teils als Einzel-Element-Array, je nach Supabase-Version
    const produkt = Array.isArray((raw as unknown as { produkt: unknown }).produkt)
      ? ((raw as unknown as { produkt: InventarRow['produkt'][] }).produkt[0] ?? null)
      : raw.produkt;

    const target = targetBezeichnung(produkt);
    if (!target) {
      skipped++;
      continue;
    }

    const currentBez = raw.bezeichnung ?? '';
    const currentCode = raw.inventar_code ?? '';

    // Idempotenz: schon gemacht?
    if (currentBez === target) {
      skipped++;
      continue;
    }

    // Neuer Code = altes Label (= aktueller bezeichnung-Wert),
    // sofern es nicht leer ist und nicht zufaellig schon dem Zielnamen
    // entspricht.
    const newCode = (currentBez && currentBez !== target) ? currentBez : currentCode;
    if (!newCode) {
      skipped++;
      continue;
    }

    // Konflikt: gehoert dieser Code schon einer anderen Zeile?
    const owner = codeOwners.get(newCode);
    if (owner && owner !== raw.id) {
      conflicts++;
      continue;
    }

    samples.push({
      id: raw.id,
      from_bezeichnung: currentBez,
      to_bezeichnung: target,
      from_code: raw.inventar_code,
      to_code: newCode,
    });

    if (dryRun) {
      updated++;
      continue;
    }

    const { error: updErr } = await supabase
      .from('inventar_units')
      .update({ bezeichnung: target, inventar_code: newCode })
      .eq('id', raw.id);

    if (updErr) {
      conflicts++;
      console.error('[backfill-codes] update fehlgeschlagen:', raw.id, updErr.message);
      continue;
    }

    // Mapping aktuell halten, falls in derselben Schleife noch eine andere
    // Zeile auf newCode kollidieren wuerde
    if (raw.inventar_code) codeOwners.delete(raw.inventar_code);
    codeOwners.set(newCode, raw.id);

    updated++;
  }

  if (!dryRun && updated > 0) {
    await logAudit({
      action: 'inventar.backfill_codes',
      entityType: 'inventar_unit',
      changes: { updated, skipped, conflicts },
      request: req,
    });
  }

  return NextResponse.json({
    updated,
    skipped,
    conflicts,
    dry_run: dryRun,
    samples: samples.slice(0, 5),
  });
}
