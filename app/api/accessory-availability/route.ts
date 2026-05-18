import { NextRequest, NextResponse } from 'next/server';
import { computeAccessoryAvailability } from '@/lib/accessory-availability';

/**
 * GET /api/accessory-availability?from=2026-04-10&to=2026-04-15&product_id=1&delivery_mode=versand
 *
 * Duenner Wrapper um `computeAccessoryAvailability()` (Logik liegt in
 * `lib/accessory-availability.ts`, damit sie auch serverseitig ohne
 * HTTP-Self-Fetch genutzt werden kann).
 *
 * Returns: { accessories: [{ id, available_qty_remaining, ... }], buffer }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const productId = searchParams.get('product_id');
  const deliveryMode = searchParams.get('delivery_mode') ?? 'versand';

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to Parameter erforderlich.' }, { status: 400 });
  }

  const result = await computeAccessoryAvailability({ from, to, productId, deliveryMode });
  return NextResponse.json(result);
}
