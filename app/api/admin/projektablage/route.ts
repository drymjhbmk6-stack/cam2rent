/**
 * Projektablage — Projektliste + Projekt anlegen.
 *
 * Owner-only (siehe lib/projektablage.ts:guardOwner). Zusaetzlich in
 * middleware.ts als `system` gemappt, damit ein vergessenes Gate nicht
 * gleich die ganze Ablage oeffnet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable } from '@/lib/projektablage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NAME_MAX = 120;
const BESCHREIBUNG_MAX = 2000;

interface StandRow {
  projekt_id: string;
  status: string;
  bytes_gesamt: number | null;
  datei_anzahl: number | null;
  created_at: string;
}

export async function GET() {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const supabase = createServiceClient();

  const { data: projekte, error } = await supabase
    .from('projekt_ablage_projekte')
    .select('id, name, beschreibung, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ projekte: [], migration_pending: true });
    }
    return NextResponse.json({ error: 'Projekte konnten nicht geladen werden.' }, { status: 500 });
  }

  const ids = (projekte ?? []).map((p) => p.id);
  const summary = new Map<string, { staende: number; bytes: number; dateien: number; letzter: string | null }>();

  if (ids.length > 0) {
    const { data: staende } = await supabase
      .from('projekt_ablage_staende')
      .select('projekt_id, status, bytes_gesamt, datei_anzahl, created_at')
      .in('projekt_id', ids);

    for (const s of (staende ?? []) as StandRow[]) {
      const entry = summary.get(s.projekt_id) ?? { staende: 0, bytes: 0, dateien: 0, letzter: null };
      // Unvollstaendige Staende zaehlen nicht als "Stand", belegen aber Platz.
      if (s.status === 'fertig') {
        entry.staende += 1;
        entry.dateien += s.datei_anzahl ?? 0;
        if (!entry.letzter || s.created_at > entry.letzter) entry.letzter = s.created_at;
      }
      entry.bytes += s.bytes_gesamt ?? 0;
      summary.set(s.projekt_id, entry);
    }
  }

  return NextResponse.json({
    projekte: (projekte ?? []).map((p) => {
      const s = summary.get(p.id) ?? { staende: 0, bytes: 0, dateien: 0, letzter: null };
      return { ...p, stand_anzahl: s.staende, bytes_gesamt: s.bytes, datei_anzahl: s.dateien, letzter_stand_at: s.letzter };
    }),
  });
}

export async function POST(req: NextRequest) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  let body: { name?: unknown; beschreibung?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
  if (!name) return NextResponse.json({ error: 'Bitte einen Projektnamen angeben.' }, { status: 400 });

  const beschreibung =
    typeof body.beschreibung === 'string' && body.beschreibung.trim()
      ? body.beschreibung.trim().slice(0, BESCHREIBUNG_MAX)
      : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('projekt_ablage_projekte')
    .insert({ name, beschreibung })
    .select('id, name, beschreibung, created_at, updated_at')
    .single();

  if (error || !data) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Migration ausstehend: supabase/supabase-projektablage.sql ausführen.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Projekt konnte nicht angelegt werden.' }, { status: 500 });
  }

  await logAudit({
    action: 'projektablage.projekt_create',
    entityType: 'projektablage',
    entityId: data.id,
    entityLabel: name,
    request: req,
  });

  return NextResponse.json(
    { projekt: { ...data, stand_anzahl: 0, bytes_gesamt: 0, datei_anzahl: 0, letzter_stand_at: null } },
    { status: 201 }
  );
}
