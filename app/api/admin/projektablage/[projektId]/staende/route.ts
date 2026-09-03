/**
 * Projektablage — Staende eines Projekts auflisten / neuen Stand anlegen.
 *
 * POST legt NUR die Metadaten an (Stand + eine Zeile je Datei). Die Dateien
 * selbst laedt der Browser anschliessend direkt zu Supabase hoch
 * (siehe .../staende/[standId]/upload-urls). Der Server sieht die Inhalte nie
 * — anders waere ein 500-MB-Upload nicht machbar, weil jeder bestehende
 * Upload-Pfad im Repo die ganze Datei in den RAM zieht.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable, ensureBucket } from '@/lib/projektablage';
import {
  sanitizeRelPath,
  MAX_FILE_BYTES,
  MAX_STAND_BYTES,
  MAX_STAND_FILES,
  fmtBytes,
} from '@/lib/projektablage-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTIZ_MAX = 2000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ projektId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { projektId } = await ctx.params;
  if (!UUID_RE.test(projektId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: projekt } = await supabase
    .from('projekt_ablage_projekte')
    .select('id, name, beschreibung')
    .eq('id', projektId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('projekt_ablage_staende')
    .select('id, version_nr, notiz, status, datei_anzahl, bytes_gesamt, created_at, finished_at')
    .eq('projekt_id', projektId)
    .order('version_nr', { ascending: false });

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ staende: [], migration_pending: true });
    return NextResponse.json({ error: 'Stände konnten nicht geladen werden.' }, { status: 500 });
  }

  return NextResponse.json({ projekt: projekt ?? null, staende: data ?? [] });
}

interface EingehendeDatei {
  relPfad: unknown;
  groesse: unknown;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ projektId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { projektId } = await ctx.params;
  if (!UUID_RE.test(projektId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: { notiz?: unknown; dateien?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const roh = Array.isArray(body.dateien) ? (body.dateien as EingehendeDatei[]) : [];
  if (roh.length === 0) {
    return NextResponse.json({ error: 'Keine Dateien übergeben.' }, { status: 400 });
  }
  if (roh.length > MAX_STAND_FILES) {
    return NextResponse.json(
      { error: `Zu viele Dateien (${roh.length}). Erlaubt sind ${MAX_STAND_FILES} pro Stand.` },
      { status: 400 }
    );
  }

  // Pfade saeubern + Duplikate entfernen (die DB hat ein UNIQUE auf
  // (stand_id, rel_pfad) — ein doppelter Pfad wuerde den ganzen Insert kippen).
  const gesehen = new Set<string>();
  const dateien: { relPfad: string; groesse: number }[] = [];
  let bytesGesamt = 0;

  for (const eintrag of roh) {
    const relPfad = sanitizeRelPath(eintrag?.relPfad);
    if (!relPfad || gesehen.has(relPfad)) continue;

    const groesseRoh = Number(eintrag?.groesse);
    const groesse = Number.isFinite(groesseRoh) && groesseRoh > 0 ? Math.floor(groesseRoh) : 0;
    if (groesse > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `„${relPfad}" ist mit ${fmtBytes(groesse)} zu groß (max. ${fmtBytes(MAX_FILE_BYTES)} pro Datei).` },
        { status: 400 }
      );
    }

    gesehen.add(relPfad);
    dateien.push({ relPfad, groesse });
    bytesGesamt += groesse;
  }

  if (dateien.length === 0) {
    return NextResponse.json({ error: 'Keine gültigen Dateipfade übergeben.' }, { status: 400 });
  }
  if (bytesGesamt > MAX_STAND_BYTES) {
    return NextResponse.json(
      { error: `Der Stand ist mit ${fmtBytes(bytesGesamt)} zu groß (max. ${fmtBytes(MAX_STAND_BYTES)}).` },
      { status: 400 }
    );
  }

  const notiz =
    typeof body.notiz === 'string' && body.notiz.trim() ? body.notiz.trim().slice(0, NOTIZ_MAX) : null;

  const supabase = createServiceClient();

  const { data: projekt, error: projektErr } = await supabase
    .from('projekt_ablage_projekte')
    .select('id, name')
    .eq('id', projektId)
    .maybeSingle();

  if (projektErr && isMissingTable(projektErr)) {
    return NextResponse.json(
      { error: 'Migration ausstehend: supabase/supabase-projektablage.sql ausführen.' },
      { status: 503 }
    );
  }
  if (!projekt) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 });

  const bucketFehler = await ensureBucket(supabase);
  if (bucketFehler) {
    return NextResponse.json(
      { error: `Speicher nicht verfügbar: ${bucketFehler}` },
      { status: 503 }
    );
  }

  // Naechste Versionsnummer. Bei einer Kollision (zwei Tabs gleichzeitig)
  // einmal mit der naechsthoeheren Nummer erneut versuchen.
  const { data: letzter } = await supabase
    .from('projekt_ablage_staende')
    .select('version_nr')
    .eq('projekt_id', projektId)
    .order('version_nr', { ascending: false })
    .limit(1)
    .maybeSingle();

  let versionNr = (letzter?.version_nr ?? 0) + 1;
  let stand: { id: string; version_nr: number } | null = null;

  for (let versuch = 0; versuch < 3 && !stand; versuch++) {
    const { data, error } = await supabase
      .from('projekt_ablage_staende')
      .insert({
        projekt_id: projektId,
        version_nr: versionNr,
        notiz,
        status: 'uploading',
        datei_anzahl: dateien.length,
        bytes_gesamt: bytesGesamt,
      })
      .select('id, version_nr')
      .single();

    if (data) {
      stand = data;
      break;
    }
    if (error?.code === '23505') {
      versionNr += 1;
      continue;
    }
    return NextResponse.json({ error: 'Stand konnte nicht angelegt werden.' }, { status: 500 });
  }

  if (!stand) {
    return NextResponse.json({ error: 'Stand konnte nicht angelegt werden.' }, { status: 500 });
  }

  // Storage-Pfad ist bewusst eine reine UUID — der echte relative Pfad lebt
  // nur in der DB. Damit kann kein praeparierter Dateiname den Storage
  // verlassen, und Umlaute/Leerzeichen/Laenge sind kein Thema.
  const zeilen = dateien.map((d) => ({
    stand_id: stand.id,
    rel_pfad: d.relPfad,
    groesse: d.groesse,
    storage_pfad: `${projektId}/${stand.id}/${randomUUID()}`,
    hochgeladen: false,
  }));

  const angelegt: { id: string; rel_pfad: string; groesse: number; storage_pfad: string }[] = [];
  const batchSize = 500;
  for (let i = 0; i < zeilen.length; i += batchSize) {
    const { data, error } = await supabase
      .from('projekt_ablage_dateien')
      .insert(zeilen.slice(i, i + batchSize))
      .select('id, rel_pfad, groesse, storage_pfad');
    if (error) {
      // Halb angelegter Stand ist wertlos — komplett zuruecknehmen.
      await supabase.from('projekt_ablage_staende').delete().eq('id', stand.id);
      return NextResponse.json({ error: 'Dateiliste konnte nicht angelegt werden.' }, { status: 500 });
    }
    angelegt.push(...(data ?? []));
  }

  return NextResponse.json(
    {
      stand: { id: stand.id, version_nr: stand.version_nr, notiz, status: 'uploading' },
      dateien: angelegt.map((d) => ({ id: d.id, relPfad: d.rel_pfad, groesse: d.groesse })),
      uebersprungen: roh.length - dateien.length,
    },
    { status: 201 }
  );
}
