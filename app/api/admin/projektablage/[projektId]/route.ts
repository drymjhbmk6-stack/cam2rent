/**
 * Projektablage — einzelnes Projekt umbenennen / loeschen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable, purgeStandStorage } from '@/lib/projektablage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 120;
const BESCHREIBUNG_MAX = 2000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ projektId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { projektId } = await ctx.params;
  if (!UUID_RE.test(projektId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: { name?: unknown; beschreibung?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, NAME_MAX);
    if (!name) return NextResponse.json({ error: 'Der Projektname darf nicht leer sein.' }, { status: 400 });
    patch.name = name;
  }
  if (body.beschreibung === null || typeof body.beschreibung === 'string') {
    const b = typeof body.beschreibung === 'string' ? body.beschreibung.trim().slice(0, BESCHREIBUNG_MAX) : '';
    patch.beschreibung = b || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('projekt_ablage_projekte')
    .update(patch)
    .eq('id', projektId)
    .select('id, name, beschreibung, created_at, updated_at')
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Projekt konnte nicht geändert werden.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 });

  await logAudit({
    action: 'projektablage.projekt_update',
    entityType: 'projektablage',
    entityId: projektId,
    entityLabel: data.name,
    changes: patch,
    request: req,
  });

  return NextResponse.json({ projekt: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ projektId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { projektId } = await ctx.params;
  if (!UUID_RE.test(projektId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: projekt, error: loadErr } = await supabase
    .from('projekt_ablage_projekte')
    .select('id, name')
    .eq('id', projektId)
    .maybeSingle();

  if (loadErr && isMissingTable(loadErr)) {
    return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
  }
  if (!projekt) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 });

  // Storage zuerst leeren, danach die DB-Zeilen (Cascade raeumt Staende +
  // Dateien mit weg). Andersherum waeren die Storage-Pfade verloren und die
  // Objekte lebten fuer immer weiter.
  const { data: staende } = await supabase
    .from('projekt_ablage_staende')
    .select('id')
    .eq('projekt_id', projektId);

  for (const stand of staende ?? []) {
    const { data: dateien } = await supabase
      .from('projekt_ablage_dateien')
      .select('storage_pfad')
      .eq('stand_id', stand.id);
    await purgeStandStorage(
      supabase,
      projektId,
      stand.id,
      (dateien ?? []).map((d) => d.storage_pfad)
    );
  }

  const { error: delErr } = await supabase.from('projekt_ablage_projekte').delete().eq('id', projektId);
  if (delErr) {
    return NextResponse.json({ error: 'Projekt konnte nicht gelöscht werden.' }, { status: 500 });
  }

  await logAudit({
    action: 'projektablage.projekt_delete',
    entityType: 'projektablage',
    entityId: projektId,
    entityLabel: projekt.name,
    changes: { staende: (staende ?? []).length },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
