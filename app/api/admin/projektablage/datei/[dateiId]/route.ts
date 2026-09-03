/**
 * Projektablage — einzelne Datei herunterladen.
 *
 * Antwortet mit einem 302 auf eine kurzlebige Signed URL. Die Datei geht
 * damit nie durch den Node-Prozess — bei 500-MB-Dateien der einzig
 * tragfaehige Weg.
 *
 * `download` erzwingt Content-Disposition: attachment. Das ist kein Komfort,
 * sondern Absicht — im Bucket liegen .html/.svg/.php im Klartext, die der
 * Supabase-Origin sonst rendern wuerde.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { guardOwner, isMissingTable } from '@/lib/projektablage';
import { PROJEKTABLAGE_BUCKET, baseName } from '@/lib/projektablage-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ dateiId: string }> }) {
  const guard = await guardOwner();
  if (!guard.ok) return guard.res;

  const { dateiId } = await ctx.params;
  if (!UUID_RE.test(dateiId)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: datei, error } = await supabase
    .from('projekt_ablage_dateien')
    .select('id, rel_pfad, storage_pfad')
    .eq('id', dateiId)
    .maybeSingle();

  if (error && isMissingTable(error)) {
    return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
  }
  if (!datei) return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 });

  // Anfuehrungszeichen und Zeilenumbrueche raus, sonst laesst sich der
  // Content-Disposition-Header manipulieren.
  const name = baseName(datei.rel_pfad).replace(/["\\\r\n]/g, '').slice(0, 200) || 'datei';

  const { data: signed, error: signErr } = await supabase.storage
    .from(PROJEKTABLAGE_BUCKET)
    .createSignedUrl(datei.storage_pfad, 300, { download: name });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Datei ist im Speicher nicht auffindbar.' }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
