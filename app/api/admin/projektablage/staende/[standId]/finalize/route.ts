/**
 * Projektablage — Upload abschliessen.
 *
 * Der Server verlaesst sich NICHT auf die Erfolgsmeldung des Browsers, sondern
 * listet den Storage-Ordner und behaelt nur die Dateien, die wirklich dort
 * liegen. Sonst haette ein abgebrochener Upload einen Stand hinterlassen, der
 * vollstaendig aussieht und beim Herunterladen Luecken hat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable, removeStorageObjects } from '@/lib/projektablage';
import { PROJEKTABLAGE_BUCKET } from '@/lib/projektablage-shared';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ standId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { standId } = await ctx.params;
  if (!UUID_RE.test(standId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: stand, error: standErr } = await supabase
    .from('projekt_ablage_staende')
    .select('id, projekt_id, version_nr, status')
    .eq('id', standId)
    .maybeSingle();

  if (standErr && isMissingTable(standErr)) {
    return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
  }
  if (!stand) return NextResponse.json({ error: 'Stand nicht gefunden.' }, { status: 404 });

  const { data: dateien, error: dateiErr } = await supabase
    .from('projekt_ablage_dateien')
    .select('id, rel_pfad, groesse, storage_pfad')
    .eq('stand_id', standId);

  if (dateiErr) {
    return NextResponse.json({ error: 'Dateiliste konnte nicht geladen werden.' }, { status: 500 });
  }

  // Was liegt wirklich im Storage? Der Ordner ist flach
  // (<projekt>/<stand>/<uuid>), ein paginiertes list() reicht also.
  const prefix = `${stand.projekt_id}/${standId}`;
  const vorhanden = new Set<string>();
  let listFehler = false;

  try {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(PROJEKTABLAGE_BUCKET)
        .list(prefix, { limit: 1000, offset });
      if (error) {
        listFehler = true;
        break;
      }
      if (!data || data.length === 0) break;
      for (const entry of data) vorhanden.add(`${prefix}/${entry.name}`);
      if (data.length < 1000) break;
      offset += data.length;
    }
  } catch {
    listFehler = true;
  }

  // Storage nicht erreichbar: lieber alles behalten als einen fertigen Stand
  // faelschlich leerraeumen. Der Admin sieht die Warnung.
  const alleDateien = dateien ?? [];
  const ok = listFehler ? alleDateien : alleDateien.filter((d) => vorhanden.has(d.storage_pfad));
  const fehlend = listFehler ? [] : alleDateien.filter((d) => !vorhanden.has(d.storage_pfad));

  if (ok.length === 0) {
    // Nichts angekommen — Stand samt Zeilen entfernen, damit keine Leiche bleibt.
    await removeStorageObjects(supabase, alleDateien.map((d) => d.storage_pfad));
    await supabase.from('projekt_ablage_staende').delete().eq('id', standId);
    return NextResponse.json(
      { error: 'Es ist keine einzige Datei angekommen. Der Stand wurde verworfen.' },
      { status: 400 }
    );
  }

  // Fehlende Zeilen entfernen (in Haeppchen — .in() landet in der URL).
  if (fehlend.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < fehlend.length; i += batchSize) {
      const batch = fehlend.slice(i, i + batchSize).map((d) => d.id);
      await supabase.from('projekt_ablage_dateien').delete().in('id', batch);
    }
  }

  // Vorhandene als hochgeladen markieren.
  const batchSize = 200;
  for (let i = 0; i < ok.length; i += batchSize) {
    const batch = ok.slice(i, i + batchSize).map((d) => d.id);
    await supabase.from('projekt_ablage_dateien').update({ hochgeladen: true }).in('id', batch);
  }

  const bytesGesamt = ok.reduce((sum, d) => sum + (d.groesse ?? 0), 0);

  const { error: updErr } = await supabase
    .from('projekt_ablage_staende')
    .update({
      status: 'fertig',
      datei_anzahl: ok.length,
      bytes_gesamt: bytesGesamt,
      finished_at: new Date().toISOString(),
    })
    .eq('id', standId);

  if (updErr) {
    return NextResponse.json({ error: 'Stand konnte nicht abgeschlossen werden.' }, { status: 500 });
  }

  // Projekt anstupsen, damit es in der Liste nach oben rutscht.
  await supabase
    .from('projekt_ablage_projekte')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', stand.projekt_id);

  await logAudit({
    action: 'projektablage.stand_upload',
    entityType: 'projektablage',
    entityId: standId,
    entityLabel: `v${stand.version_nr}`,
    changes: { dateien: ok.length, bytes: bytesGesamt, fehlend: fehlend.length },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    datei_anzahl: ok.length,
    bytes_gesamt: bytesGesamt,
    fehlend: fehlend.map((d) => d.rel_pfad),
    storage_nicht_geprueft: listFehler,
  });
}
