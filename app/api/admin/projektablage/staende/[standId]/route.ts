/**
 * Projektablage — Dateiliste eines Standes / Stand loeschen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable, purgeStandStorage } from '@/lib/projektablage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ standId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { standId } = await ctx.params;
  if (!UUID_RE.test(standId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: stand, error: standErr } = await supabase
    .from('projekt_ablage_staende')
    .select('id, projekt_id, version_nr, notiz, status, datei_anzahl, bytes_gesamt, created_at, finished_at')
    .eq('id', standId)
    .maybeSingle();

  if (standErr && isMissingTable(standErr)) {
    return NextResponse.json({ dateien: [], migration_pending: true });
  }
  if (!stand) return NextResponse.json({ error: 'Stand nicht gefunden.' }, { status: 404 });

  const { data: projekt } = await supabase
    .from('projekt_ablage_projekte')
    .select('id, name')
    .eq('id', stand.projekt_id)
    .maybeSingle();

  // PostgREST liefert per Default hoechstens 1000 Zeilen — ohne Paginierung
  // waeren bei einem grossen Projekt Dateien im Baum einfach unsichtbar.
  const dateien: { id: string; rel_pfad: string; groesse: number; hochgeladen: boolean }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('projekt_ablage_dateien')
      .select('id, rel_pfad, groesse, hochgeladen')
      .eq('stand_id', standId)
      .order('rel_pfad', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: 'Dateien konnten nicht geladen werden.' }, { status: 500 });
    }
    dateien.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json({
    stand,
    projekt: projekt ?? null,
    dateien: dateien.map((d) => ({
      id: d.id,
      relPfad: d.rel_pfad,
      groesse: d.groesse ?? 0,
      hochgeladen: d.hochgeladen,
    })),
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ standId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { standId } = await ctx.params;
  if (!UUID_RE.test(standId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: stand, error: standErr } = await supabase
    .from('projekt_ablage_staende')
    .select('id, projekt_id, version_nr')
    .eq('id', standId)
    .maybeSingle();

  if (standErr && isMissingTable(standErr)) {
    return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
  }
  if (!stand) return NextResponse.json({ error: 'Stand nicht gefunden.' }, { status: 404 });

  const pfade: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('projekt_ablage_dateien')
      .select('storage_pfad')
      .eq('stand_id', standId)
      .range(offset, offset + PAGE - 1);
    pfade.push(...(data ?? []).map((d) => d.storage_pfad));
    if (!data || data.length < PAGE) break;
  }

  // Erst Storage, dann DB — sonst waeren die Pfade weg und die Objekte
  // lebten unauffindbar weiter.
  await purgeStandStorage(supabase, stand.projekt_id, standId, pfade);

  const { error: delErr } = await supabase.from('projekt_ablage_staende').delete().eq('id', standId);
  if (delErr) {
    return NextResponse.json({ error: 'Stand konnte nicht gelöscht werden.' }, { status: 500 });
  }

  await logAudit({
    action: 'projektablage.stand_delete',
    entityType: 'projektablage',
    entityId: standId,
    entityLabel: `v${stand.version_nr}`,
    changes: { dateien: pfade.length },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
