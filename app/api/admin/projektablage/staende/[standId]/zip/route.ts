/**
 * Projektablage — kompletten Stand als ZIP herunterladen.
 *
 * Ohne Sammel-Download waere "wieder herunterladen" bei ein paar hundert
 * Dateien unbrauchbar. Das Archiv wird gestreamt (siehe lib/projektablage-zip),
 * der Speicherbedarf bleibt daher bei einer Datei gleichzeitig.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable } from '@/lib/projektablage';
import { PROJEKTABLAGE_BUCKET } from '@/lib/projektablage-shared';
import { createZipStream, safeZipFilename, type ZipEintrag } from '@/lib/projektablage-zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const SIGN_BATCH = 100;
/** Grosszuegig: ein 5-GB-Download darf laufen, ohne dass Links ablaufen. */
const SIGN_TTL_SEKUNDEN = 6 * 60 * 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ standId: string }> }) {
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

  const { data: projekt } = await supabase
    .from('projekt_ablage_projekte')
    .select('name')
    .eq('id', stand.projekt_id)
    .maybeSingle();

  const dateien: { rel_pfad: string; storage_pfad: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('projekt_ablage_dateien')
      .select('rel_pfad, storage_pfad')
      .eq('stand_id', standId)
      .eq('hochgeladen', true)
      .order('rel_pfad', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: 'Dateien konnten nicht geladen werden.' }, { status: 500 });
    }
    dateien.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  if (dateien.length === 0) {
    return NextResponse.json({ error: 'Dieser Stand enthält keine Dateien.' }, { status: 404 });
  }

  // Signierte Leselinks in Haeppchen holen — 5000 einzelne Aufrufe waeren
  // zu langsam, alles auf einmal zu gross fuer eine Anfrage.
  const urlByPath = new Map<string, string>();
  for (let i = 0; i < dateien.length; i += SIGN_BATCH) {
    const batch = dateien.slice(i, i + SIGN_BATCH).map((d) => d.storage_pfad);
    const { data, error } = await supabase.storage
      .from(PROJEKTABLAGE_BUCKET)
      .createSignedUrls(batch, SIGN_TTL_SEKUNDEN);
    if (error) {
      return NextResponse.json({ error: 'Download-Links konnten nicht erzeugt werden.' }, { status: 500 });
    }
    for (const eintrag of data ?? []) {
      if (eintrag.path && eintrag.signedUrl && !eintrag.error) {
        urlByPath.set(eintrag.path, eintrag.signedUrl);
      }
    }
  }

  const eintraege: ZipEintrag[] = dateien
    .map((d) => ({ relPfad: d.rel_pfad, url: urlByPath.get(d.storage_pfad) ?? '' }))
    .filter((e) => e.url !== '');

  if (eintraege.length === 0) {
    return NextResponse.json({ error: 'Keine der Dateien ist im Speicher auffindbar.' }, { status: 404 });
  }

  const dateiname = safeZipFilename(`${projekt?.name ?? 'projektstand'}-v${stand.version_nr}`);
  const stream = createZipStream(eintraege);

  // Kein Content-Length: die Groesse steht erst nach dem Komprimieren fest.
  // Der Browser zeigt deshalb keinen Fortschrittsbalken — bewusster Preis
  // dafuer, dass nichts zwischengespeichert werden muss.
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${dateiname}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
