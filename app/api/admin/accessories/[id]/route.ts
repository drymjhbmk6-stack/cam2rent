import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizeSpecs } from '@/lib/accessory-specs';

// Bestandteile-Liste auf saubere String-Eintraege normalisieren — gleiche
// Regeln wie im POST-Pfad (siehe ../route.ts).
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

/**
 * PUT    /api/admin/accessories/[id]  → Zubehörteil aktualisieren
 * DELETE /api/admin/accessories/[id]  → Zubehörteil löschen
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const maxQty = typeof body.max_qty_per_booking === 'number' && body.max_qty_per_booking > 0
    ? Math.floor(body.max_qty_per_booking) : null;
  const replacementValue = (() => {
    const n = parseFloat(String(body.replacement_value ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  // ID-Rename: nur fuer Sammel-Zubehoer + nur wenn keine Buchungen/Sets
  // diese accessory_id referenzieren. accessory_units werden ueber die FK
  // ON UPDATE CASCADE automatisch mit-aktualisiert (siehe
  // supabase/supabase-accessories-id-rename.sql). JSONB-Felder werden NICHT
  // automatisch aktualisiert, deshalb hartes Verbot bei Verwendung.
  const newIdRaw = typeof body.new_id === 'string' ? body.new_id.trim() : '';
  const newId = newIdRaw && newIdRaw !== id ? newIdRaw : null;

  if (newId) {
    // 1. Format-Validierung (URL-safe)
    if (!/^[A-Za-z0-9_-]+$/.test(newId)) {
      return NextResponse.json(
        { error: 'Bezeichnung darf nur Buchstaben, Zahlen, "-" und "_" enthalten.' },
        { status: 400 }
      );
    }

    // 2. nur fuer Sammel-Zubehoer erlauben
    if (body.is_bulk !== true) {
      return NextResponse.json(
        { error: 'Bezeichnung kann nur bei Sammel-Zubehoer geaendert werden.' },
        { status: 400 }
      );
    }

    // 3. neue ID muss frei sein
    const { data: existing } = await supabase
      .from('accessories')
      .select('id')
      .eq('id', newId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'Diese Bezeichnung ist bereits vergeben. Waehle eine andere.' },
        { status: 409 }
      );
    }

    // 4. Buchungen pruefen (alle Status, weil wir GoBD-Audit nicht kaputt machen)
    const { data: bookingsArr } = await supabase
      .from('bookings')
      .select('id')
      .contains('accessories', [id])
      .limit(1);

    const { data: bookingsItems } = await supabase
      .from('bookings')
      .select('id')
      .contains('accessory_items', [{ accessory_id: id }])
      .limit(1);

    if ((bookingsArr && bookingsArr.length > 0) || (bookingsItems && bookingsItems.length > 0)) {
      return NextResponse.json(
        { error: 'Dieses Zubehoer wurde bereits in Buchungen verwendet. ID-Aenderung nicht moeglich (Audit-Trail). Lege ein neues Sammel-Zubehoer an und mustere dieses aus.' },
        { status: 409 }
      );
    }

    // 5. Sets pruefen
    const { data: setsRows } = await supabase
      .from('sets')
      .select('id')
      .contains('accessory_items', [{ accessory_id: id }])
      .limit(1);

    if (setsRows && setsRows.length > 0) {
      return NextResponse.json(
        { error: 'Dieses Zubehoer wird in einem Set verwendet. Bitte erst aus dem Set entfernen, dann ID aendern.' },
        { status: 409 }
      );
    }

    // 6. ID umbenennen — FK Cascade greift fuer accessory_units
    const { error: renameErr } = await supabase
      .from('accessories')
      .update({ id: newId })
      .eq('id', id);

    if (renameErr) {
      return NextResponse.json({ error: `ID-Aenderung fehlgeschlagen: ${renameErr.message}` }, { status: 500 });
    }
  }

  // Ab hier wird mit der neuen ID weitergearbeitet (falls geaendert)
  const effectiveId = newId ?? id;

  const updatePayload: Record<string, unknown> = {
    name: body.name,
    category: body.category,
    description: body.description ?? null,
    pricing_mode: body.pricing_mode,
    price: parseFloat(body.price) || 0,
    available_qty: parseInt(body.available_qty) || 1,
    available: body.available,
    image_url: body.image_url ?? null,
    compatible_product_ids: body.compatible_product_ids ?? [],
    internal: body.internal ?? false,
    upgrade_group: body.upgrade_group || null,
    is_upgrade_base: body.is_upgrade_base ?? false,
    allow_multi_qty: body.allow_multi_qty ?? false,
    max_qty_per_booking: maxQty,
    replacement_value: replacementValue,
    is_bulk: body.is_bulk ?? false,
  };
  if (body.specs !== undefined) updatePayload.specs = sanitizeSpecs(body.specs);
  if (body.included_parts !== undefined) updatePayload.included_parts = sanitizeIncludedParts(body.included_parts);

  let { error } = await supabase
    .from('accessories')
    .update(updatePayload)
    .eq('id', effectiveId);

  // Defensiv: Migration noch nicht durch — specs-Spalte fehlt. Retry ohne.
  if (error && /column .*specs/i.test(error.message) && 'specs' in updatePayload) {
    delete updatePayload.specs;
    const retry = await supabase.from('accessories').update(updatePayload).eq('id', effectiveId);
    error = retry.error;
  }

  // Gleiches Defensiv-Muster fuer included_parts (Migration
  // `supabase-accessories-included-parts.sql`).
  if (error && /column .*included_parts/i.test(error.message) && 'included_parts' in updatePayload) {
    delete updatePayload.included_parts;
    const retry = await supabase.from('accessories').update(updatePayload).eq('id', effectiveId);
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: newId ? 'accessory.rename' : 'accessory.update',
    entityType: 'accessory',
    entityId: effectiveId,
    entityLabel: body?.name,
    changes: newId ? { old_id: id, new_id: newId } : undefined,
    request: req,
  });

  return NextResponse.json({ success: true, id: effectiveId });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('accessories').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'accessory.delete',
    entityType: 'accessory',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
