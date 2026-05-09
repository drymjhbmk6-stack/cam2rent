import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { erzeugeAssetsFuerBeleg } from '@/lib/buchhaltung/asset-auto-generator';

/**
 * POST /api/admin/belege/[id]/regenerate-assets
 *
 * Recovery-Endpoint: Wenn ein Beleg festgeschrieben ist, aber die Asset-
 * Auto-Generierung beim Festschreiben fehlgeschlagen oder still gescheitert
 * ist (z.B. CHECK-Constraint auf assets_neu.art durch Halluzination im
 * ki_vorschlag), kann der Admin die Asset-Generierung hier nochmal
 * triggern. Idempotent: existierende Assets pro beleg_position_id werden
 * nicht doppelt angelegt.
 *
 * Voraussetzung: Beleg muss festgeschrieben sein (Positionen sind dann
 * locked, koennen also nicht waehrend der Re-Generierung mutiert werden).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg, error: loadErr } = await supabase
    .from('belege').select('id, beleg_nr, status').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (beleg.status !== 'festgeschrieben') {
    return NextResponse.json(
      { error: 'Re-Generate nur fuer festgeschriebene Belege — sonst normal "Festschreiben" klicken' },
      { status: 409 },
    );
  }

  let assetsCreated = 0;
  let afaBuchungenCreated = 0;
  let warnings: string[] = [];
  try {
    const result = await erzeugeAssetsFuerBeleg(supabase, id);
    assetsCreated = result.assetsCreated;
    afaBuchungenCreated = result.afaBuchungenCreated;
    warnings = result.warnings;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  await logAudit({
    action: 'beleg.regenerate_assets',
    entityType: 'beleg',
    entityId: id,
    entityLabel: beleg.beleg_nr,
    changes: { assets_created: assetsCreated, afa_buchungen: afaBuchungenCreated, warnings },
    request: req,
  });

  return NextResponse.json({ ok: true, assets_created: assetsCreated, afa_buchungen_created: afaBuchungenCreated, warnings });
}
