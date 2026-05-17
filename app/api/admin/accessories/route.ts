import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizeSpecs } from '@/lib/accessory-specs';
import { resolveProdukteId } from '@/lib/legacy-bridge';

// Bestandteile-Liste auf saubere String-Eintraege normalisieren.
// Whitespace trimmen, Leereintraege raus, max 30 Zeilen, max 120 Zeichen pro
// Eintrag — verhindert Pasten von ganzen Datenblaettern. Falls die Migration
// `supabase-accessories-included-parts.sql` noch nicht durch ist, schluckt der
// Insert-Retry-Pfad das Feld (siehe unten).
function sanitizeIncludedParts(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().slice(0, 120);
    if (trimmed) cleaned.push(trimmed);
    if (cleaned.length >= 30) break;
  }
  return cleaned;
}

// Bilder per Index zu included_parts. Erwartet ein bereits ausgerichtetes
// Array (Client filtert leere Bestandteil-Zeilen paarweise raus). Jede
// Position: gueltige http(s)-URL oder '' (kein Bild). Auf parts-Laenge
// geklemmt, damit kein Index-Versatz entsteht.
function sanitizeIncludedPartsImages(input: unknown, partsCount: number): string[] {
  if (!Array.isArray(input) || partsCount <= 0) return [];
  const out: string[] = [];
  for (const raw of input) {
    let v = '';
    if (typeof raw === 'string') {
      const t = raw.trim().slice(0, 500);
      if (/^https?:\/\//i.test(t)) v = t;
    }
    out.push(v);
    if (out.length >= 30) break;
  }
  const aligned = out.slice(0, partsCount);
  while (aligned.length < partsCount) aligned.push('');
  return aligned;
}

/**
 * GET  /api/admin/accessories     → alle Zubehörteile
 * POST /api/admin/accessories     → neues Zubehörteil anlegen
 */

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('accessories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accessories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category, description, pricing_mode, price, available_qty, available, image_url, compatible_product_ids, internal, upgrade_group, is_upgrade_base, allow_multi_qty, max_qty_per_booking, replacement_value, is_bulk, inventar_code, specs, included_parts, included_parts_images } = body;

  if (!name || !category) {
    return NextResponse.json({ error: 'name und category erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ID aus Name generieren (slug-artig). Erst ohne Timestamp probieren —
  // schoenere URLs (`schraube` statt `schraube-mnz3t4va`). Bei Konflikt
  // numerische Suffix `-2`, `-3`, ... bis frei.
  const baseSlug = name.toLowerCase()
    .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let id = baseSlug || ('zubehoer-' + Date.now().toString(36));
  // Bis zu 20 Konflikt-Versuche, sonst Fallback auf Timestamp
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: existing } = await supabase
      .from('accessories')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) break;
    id = `${baseSlug}-${attempt + 2}`;
  }
  // Wenn nach 20 Versuchen immer noch kollidiert, Timestamp anhaengen
  {
    const { data: stillCollides } = await supabase
      .from('accessories')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (stillCollides) id = `${baseSlug}-${Date.now().toString(36)}`;
  }

  // Höchste sort_order ermitteln
  const { data: last } = await supabase
    .from('accessories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const maxQty = typeof max_qty_per_booking === 'number' && max_qty_per_booking > 0
    ? Math.floor(max_qty_per_booking) : null;
  const replacementValue = (() => {
    const n = parseFloat(String(replacement_value ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const insertPayload: Record<string, unknown> = { id, name, category, description: description ?? null, pricing_mode: pricing_mode ?? 'perDay', price: parseFloat(price) || 0, available_qty: parseInt(available_qty) || 1, available: available ?? true, image_url: image_url ?? null, sort_order, compatible_product_ids: compatible_product_ids ?? [], internal: internal ?? false, upgrade_group: upgrade_group || null, is_upgrade_base: is_upgrade_base ?? false, allow_multi_qty: allow_multi_qty ?? false, max_qty_per_booking: maxQty, replacement_value: replacementValue, is_bulk: is_bulk ?? false };
  if (specs !== undefined) insertPayload.specs = sanitizeSpecs(specs);
  if (included_parts !== undefined) insertPayload.included_parts = sanitizeIncludedParts(included_parts);
  if (included_parts_images !== undefined) {
    insertPayload.included_parts_images = sanitizeIncludedPartsImages(
      included_parts_images,
      ((insertPayload.included_parts as string[] | undefined) ?? sanitizeIncludedParts(included_parts)).length,
    );
  }

  let { data, error } = await supabase
    .from('accessories')
    .insert(insertPayload)
    .select()
    .single();

  // Defensiv: wenn die Migration noch nicht durch ist, retry ohne die fehlende
  // Spalte — ABER mit Warnung im Response, sonst merkt der User nicht, dass
  // Gewicht/mAh/etc. silent verloren gehen.
  const warnings: string[] = [];
  if (error && /column .*specs/i.test(error.message) && 'specs' in insertPayload) {
    delete insertPayload.specs;
    warnings.push('Spezifikationen (Gewicht, mAh, etc.) konnten nicht gespeichert werden — Migration `supabase-accessory-specs.sql` fehlt in der Datenbank.');
    const retry = await supabase.from('accessories').insert(insertPayload).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error && /column .*included_parts_images/i.test(error.message) && 'included_parts_images' in insertPayload) {
    delete insertPayload.included_parts_images;
    warnings.push('Bestandteil-Bilder konnten nicht gespeichert werden — Migration `supabase-accessories-included-parts-images.sql` fehlt in der Datenbank.');
    const retry = await supabase.from('accessories').insert(insertPayload).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error && /column .*included_parts/i.test(error.message) && 'included_parts' in insertPayload) {
    delete insertPayload.included_parts;
    delete insertPayload.included_parts_images;
    warnings.push('Bestandteile konnten nicht gespeichert werden — Migration `supabase-accessories-included-parts.sql` fehlt in der Datenbank.');
    const retry = await supabase.from('accessories').insert(insertPayload).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sammel-Zubehoer: automatisch eine Bulk-Einheit im Inventar anlegen, damit
  // das Stueck unter /admin/inventar sichtbar ist und einen Bestand fuehrt.
  // Defensiv — schlaegt die Inventar-Anlage fehl (Migration fehlt / Code
  // doppelt), bleibt das Zubehoer trotzdem erhalten, der User bekommt eine
  // Warnung.
  if ((is_bulk ?? false) && typeof inventar_code === 'string' && inventar_code.trim() && data?.id) {
    const code = inventar_code.trim().slice(0, 60);
    try {
      const produkteId = await resolveProdukteId(supabase, 'accessories', data.id, { autoCreate: true });
      if (!produkteId) {
        warnings.push('Inventar-Einheit konnte nicht angelegt werden — die Produkt-Brücke (migration_audit/produkte) fehlt. Bitte die Einheit manuell unter /admin/inventar/neu anlegen.');
      } else {
        const bestand = Math.max(0, parseInt(String(available_qty ?? 0), 10) || 0);
        const { error: invErr } = await supabase.from('inventar_units').insert({
          bezeichnung: data.name,
          typ: 'zubehoer',
          tracking_mode: 'bulk',
          produkt_id: produkteId,
          inventar_code: code,
          bestand,
          status: 'verfuegbar',
          beleg_status: 'beleg_fehlt',
        });
        if (invErr) {
          if (invErr.code === '23505') {
            warnings.push(`Inventar-Code „${code}" ist bereits vergeben — die Inventar-Einheit wurde nicht angelegt. Bitte unter /admin/inventar einen anderen Code verwenden.`);
          } else {
            warnings.push('Inventar-Einheit konnte nicht angelegt werden: ' + invErr.message);
          }
        }
      }
    } catch (e) {
      warnings.push('Inventar-Einheit konnte nicht angelegt werden: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  await logAudit({
    action: 'accessory.create',
    entityType: 'accessory',
    entityId: data?.id,
    entityLabel: data?.name,
    request: req,
  });

  return NextResponse.json({ accessory: data, warnings: warnings.length > 0 ? warnings : undefined });
}
