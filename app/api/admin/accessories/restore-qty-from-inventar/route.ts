import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  applyAccessoryQtyRecovery,
  computeAccessoryQtyRecovery,
} from '@/lib/accessory-qty-recovery';

/**
 * GET  /api/admin/accessories/restore-qty-from-inventar
 *   → Dry-Run: zeigt fuer alle Nicht-Bulk-Zubehoere die Drift zwischen
 *     `accessories.available_qty` und MAX(accessory_units, inventar_units).
 *     Wird vom UI fuer die "Bestand aus Inventar wiederherstellen"-Vorschau
 *     genutzt. Keine Mutationen.
 *
 * POST /api/admin/accessories/restore-qty-from-inventar
 * Body { ids: string[] }
 *   → Setzt `available_qty` auf den Recovery-Wert (MAX beider Welten).
 *
 * Recovery-Endpoint nach fehlerhaftem "Bestaende pruefen"-Lauf. Im Gegensatz
 * zu `/api/admin/accessories/resync-qty` liest dieser Endpoint AUCH die neue
 * Welt (`inventar_units`) — er kann also einen Bestand WIEDERHERSTELLEN,
 * wenn der Mirror in `accessory_units` leer war und der Resync das
 * `available_qty` faelschlich auf 0 gesetzt hat.
 */

export async function GET() {
  const supabase = createServiceClient();
  try {
    const drift = await computeAccessoryQtyRecovery(supabase);
    return NextResponse.json({
      total_drift: drift.length,
      would_increase: drift.filter((d) => d.diff > 0).length,
      would_decrease: drift.filter((d) => d.diff < 0).length,
      rows: drift,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = Array.isArray(body?.ids)
    ? body!.ids!.filter((x) => typeof x === 'string' && x.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Mindestens eine accessory_id muss uebergeben werden.' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  try {
    const result = await applyAccessoryQtyRecovery(supabase, ids);

    await logAudit({
      action: 'accessory.restore_qty_from_inventar',
      entityType: 'accessory',
      entityId: ids.length === 1 ? ids[0] : 'bulk',
      changes: {
        ids,
        applied: result.applied,
        results: result.results,
        errors: result.errors.length,
      },
      request: req,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
