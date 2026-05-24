import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { checkOneProduct } from '@/lib/firmware/check-all';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/admin/firmware/check-one
 * Body: { product_id: string }
 *
 * Führt den Firmware-Check nur für ein einziges Produkt aus
 * (~1–3 s statt 30+ s wie der Full-Check). Wird vom „Jetzt für dieses
 * Modell prüfen"-Button auf den Stammdaten-Karten genutzt.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isTestMode()) {
    return NextResponse.json(
      { error: 'Im Test-Modus wird kein echter Firmware-Check ausgeführt.' },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as { product_id?: string } | null;
  const productId = body?.product_id?.trim();
  if (!productId) {
    return NextResponse.json({ error: 'product_id fehlt' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { row, update } = await checkOneProduct(productId, supabase);
    if (!row) {
      return NextResponse.json({ error: 'Produkt nicht gefunden' }, { status: 404 });
    }
    await logAudit({
      action: 'firmware.check_one',
      entityType: 'firmware_check',
      entityId: productId,
      changes: update ? { from: update.from, to: update.to } : { status: row.status },
      request: req,
    });
    return NextResponse.json({ ok: true, row, update });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    );
  }
}
