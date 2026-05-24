import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * GET /api/admin/firmware
 *
 * Liefert die Firmware-Check-Liste, sortiert: Updates verfügbar zuerst,
 * dann Fehler, dann OK, dann unsupported.
 *
 * Optional `?product_id=<id>` — gibt nur die eine Zeile zurück
 * (für die Inventar-Stammdaten- und Kamera-Edit-Karten).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const productId = req.nextUrl.searchParams.get('product_id');
  const supabase = createServiceClient();

  let query = supabase.from('firmware_checks').select('*');
  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (productId) {
    return NextResponse.json({ row: data?.[0] ?? null });
  }
  return NextResponse.json({ rows: data ?? [] });
}
