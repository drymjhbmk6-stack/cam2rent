/**
 * Projektablage — signierte Upload-URLs ausgeben.
 *
 * Der Browser laedt damit DIREKT zu Supabase hoch. Der Server sieht die
 * Dateiinhalte nie; das ist der einzige Weg, auf dem 500-MB-Dateien
 * durchgehen, ohne dass der Container am RAM erstickt.
 *
 * Ein Token gilt nur fuer genau einen Objektpfad — es kann damit nichts
 * ueberschrieben werden, was nicht ohnehin zu diesem Stand gehoert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable, ensureBucket } from '@/lib/projektablage';
import { PROJEKTABLAGE_BUCKET, UPLOAD_URL_BATCH } from '@/lib/projektablage-shared';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grosszuegig — ein Projekt mit 5000 Dateien braucht 50 Anfragen.
const limiter = rateLimit({ maxAttempts: 400, windowMs: 60 * 60 * 1000 });

export async function POST(req: NextRequest, ctx: { params: Promise<{ standId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { success } = limiter.check(`projektablage-upload:${getClientIp(req)}`);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte kurz warten.' }, { status: 429 });
  }

  const { standId } = await ctx.params;
  if (!UUID_RE.test(standId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: { dateiIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const ids = Array.isArray(body.dateiIds)
    ? (body.dateiIds as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    : [];

  if (ids.length === 0) return NextResponse.json({ error: 'Keine Dateien angefragt.' }, { status: 400 });
  if (ids.length > UPLOAD_URL_BATCH) {
    return NextResponse.json(
      { error: `Höchstens ${UPLOAD_URL_BATCH} Dateien pro Anfrage.` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: stand, error: standErr } = await supabase
    .from('projekt_ablage_staende')
    .select('id, status')
    .eq('id', standId)
    .maybeSingle();

  if (standErr && isMissingTable(standErr)) {
    return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
  }
  if (!stand) return NextResponse.json({ error: 'Stand nicht gefunden.' }, { status: 404 });

  const bucketFehler = await ensureBucket(supabase);
  if (bucketFehler) {
    return NextResponse.json({ error: `Speicher nicht verfügbar: ${bucketFehler}` }, { status: 503 });
  }

  // Nur Dateien, die tatsaechlich zu DIESEM Stand gehoeren.
  const { data: dateien, error } = await supabase
    .from('projekt_ablage_dateien')
    .select('id, rel_pfad, storage_pfad')
    .eq('stand_id', standId)
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: 'Dateien konnten nicht geladen werden.' }, { status: 500 });
  }

  const urls: { dateiId: string; relPfad: string; storagePfad: string; token: string }[] = [];
  const fehler: { dateiId: string; relPfad: string; grund: string }[] = [];

  for (const datei of dateien ?? []) {
    const { data, error: signErr } = await supabase.storage
      .from(PROJEKTABLAGE_BUCKET)
      .createSignedUploadUrl(datei.storage_pfad, { upsert: true });

    if (signErr || !data) {
      fehler.push({
        dateiId: datei.id,
        relPfad: datei.rel_pfad,
        grund: signErr?.message || 'Upload-Adresse konnte nicht erzeugt werden.',
      });
      continue;
    }

    urls.push({
      dateiId: datei.id,
      relPfad: datei.rel_pfad,
      storagePfad: datei.storage_pfad,
      token: data.token,
    });
  }

  return NextResponse.json({ bucket: PROJEKTABLAGE_BUCKET, urls, fehler });
}
