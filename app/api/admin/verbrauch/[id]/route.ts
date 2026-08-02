import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * PATCH  /api/admin/verbrauch/[id]  → Felder aktualisieren ODER Bestand anpassen
 * DELETE /api/admin/verbrauch/[id]  → Verbrauchsartikel löschen
 *
 * PATCH kennt zwei Modi (kombinierbar in einem Body):
 *  - Feld-Edit:  name / auto_deduct / deduct_qty / warn_threshold / bestand (direkt setzen)
 *  - Delta:      { adjust: ±N }  → bestand = max(0, bestand + adjust)
 * Bei jeder Bestandsänderung wird `low_stock_notified` zurückgesetzt, sobald
 * der neue Bestand wieder ÜBER der Warnschwelle liegt (bzw. keine Schwelle gilt),
 * damit die Nachschub-Warnung erneut feuern kann.
 *
 * Auth/Permission (`katalog`) läuft rein über middleware.ts.
 */

function isMissingTable(msg: string | undefined): boolean {
  return /verbrauchsartikel|relation|does not exist|schema cache|PGRST/i.test(msg || '');
}

function toInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: current, error: loadErr } = await supabase
    .from('verbrauchsartikel')
    .select('id, bestand, warn_threshold, low_stock_notified')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    if (isMissingTable(loadErr.message)) {
      return NextResponse.json(
        { error: 'Migration `supabase-verbrauchsartikel.sql` fehlt in der Datenbank.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if ('name' in body) {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Name darf nicht leer sein.' }, { status: 400 });
    updates.name = name.slice(0, 200);
  }
  if ('auto_deduct' in body) updates.auto_deduct = !!body.auto_deduct;
  if ('deduct_qty' in body) updates.deduct_qty = Math.max(1, toInt(body.deduct_qty, 1));
  if ('warn_threshold' in body) {
    const w = body.warn_threshold;
    updates.warn_threshold =
      w === null || w === '' || w === undefined ? null : Math.max(0, toInt(w, 0));
  }
  if ('deduct_trigger' in body) updates.deduct_trigger = body.deduct_trigger === 'return' ? 'return' : 'shipment';
  if ('linked_accessory_id' in body) {
    const v = body.linked_accessory_id;
    updates.linked_accessory_id = typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
  }
  if ('image_url' in body) {
    const v = body.image_url;
    updates.image_url = typeof v === 'string' && v.trim() ? v.trim() : null;
  }

  // Bestand: entweder direkt setzen oder per Delta anpassen (Floor bei 0).
  let bestandChanged = false;
  if ('bestand' in body) {
    updates.bestand = Math.max(0, toInt(body.bestand, current.bestand));
    bestandChanged = true;
  }
  if ('adjust' in body) {
    const delta = toInt(body.adjust, 0);
    const base = 'bestand' in updates ? Number(updates.bestand) : Number(current.bestand) || 0;
    updates.bestand = Math.max(0, base + delta);
    bestandChanged = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine änderbaren Felder im Body.' }, { status: 400 });
  }

  // Nachschub-Warnung reaktivieren: wenn der (neue) Bestand über der (neuen)
  // Schwelle liegt bzw. keine Schwelle gilt, `low_stock_notified` zurücksetzen.
  const effBestand = 'bestand' in updates ? Number(updates.bestand) : Number(current.bestand) || 0;
  const effThreshold =
    'warn_threshold' in updates
      ? (updates.warn_threshold as number | null)
      : (typeof current.warn_threshold === 'number' ? current.warn_threshold : null);
  if (current.low_stock_notified && (effThreshold === null || effBestand > effThreshold)) {
    updates.low_stock_notified = false;
  }

  updates.updated_at = new Date().toISOString();

  let { data, error } = await supabase
    .from('verbrauchsartikel')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  // Defensiv: neue Spalten fehlen (Migration nicht erneut ausgeführt) → droppen + Retry.
  if (error && /deduct_trigger|linked_accessory_id|image_url|column|schema cache|PGRST/i.test(error.message || '')) {
    delete updates.deduct_trigger;
    delete updates.linked_accessory_id;
    delete updates.image_url;
    ({ data, error } = await supabase.from('verbrauchsartikel').update(updates).eq('id', id).select().single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: bestandChanged ? 'verbrauch.adjust' : 'verbrauch.update',
    entityType: 'verbrauchsartikel',
    entityId: id,
    entityLabel: data?.name,
    changes: { fields: Object.keys(updates), bestand: data?.bestand },
    request: req,
  });

  return NextResponse.json({ item: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('verbrauchsartikel').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'verbrauch.delete',
    entityType: 'verbrauchsartikel',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
