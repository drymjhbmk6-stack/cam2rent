import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { computeQuote, type QuoteInput } from '@/lib/quote';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/admin/preis-check — Preis- + Verfügbarkeitsrechner (read-only).
 * Body: { rentalFrom, rentalTo, deliveryMode, shippingMethod, lines[],
 *         customerUserId?, discount:{mode,value} }
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  let body: Partial<QuoteInput>;
  try {
    body = (await req.json()) as Partial<QuoteInput>;
  } catch {
    return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 });
  }

  const rentalFrom = (body.rentalFrom ?? '').trim();
  const rentalTo = (body.rentalTo ?? '').trim();
  if (!DATE_RE.test(rentalFrom) || !DATE_RE.test(rentalTo)) {
    return NextResponse.json({ error: 'Mietzeitraum (rentalFrom/rentalTo) im Format YYYY-MM-DD erforderlich.' }, { status: 400 });
  }
  if (rentalTo < rentalFrom) {
    return NextResponse.json({ error: 'Enddatum liegt vor dem Startdatum.' }, { status: 400 });
  }

  // Zeilen defensiv normalisieren.
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const cleanLines = lines
    .map((l) => ({
      productId: typeof l?.productId === 'string' ? l.productId : '',
      qty: typeof l?.qty === 'number' && l.qty > 0 ? Math.floor(l.qty) : 1,
      haftung: (l?.haftung === 'standard' || l?.haftung === 'premium' ? l.haftung : 'none') as 'none' | 'standard' | 'premium',
      accessories: Array.isArray(l?.accessories)
        ? l.accessories
            .map((a) => ({
              accessory_id: typeof a?.accessory_id === 'string' ? a.accessory_id : '',
              qty: typeof a?.qty === 'number' && a.qty > 0 ? Math.floor(a.qty) : 1,
            }))
            .filter((a) => a.accessory_id)
        : [],
    }))
    .filter((l) => l.productId);

  if (cleanLines.length === 0) {
    return NextResponse.json({ error: 'Mindestens eine Kamera erforderlich.' }, { status: 400 });
  }

  const discountRaw = body.discount as { mode?: string; value?: number } | undefined;
  const discount = {
    mode: (discountRaw?.mode === 'percent' || discountRaw?.mode === 'amount' ? discountRaw.mode : 'none') as 'none' | 'percent' | 'amount',
    value: typeof discountRaw?.value === 'number' && discountRaw.value > 0 ? discountRaw.value : 0,
  };

  const supabase = createServiceClient();
  try {
    const result = await computeQuote(supabase, {
      rentalFrom,
      rentalTo,
      deliveryMode: body.deliveryMode === 'abholung' ? 'abholung' : 'versand',
      shippingMethod: body.shippingMethod === 'express' ? 'express' : 'standard',
      lines: cleanLines,
      customerUserId: typeof body.customerUserId === 'string' ? body.customerUserId : null,
      discount,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('[preis-check] compute error:', err);
    return NextResponse.json({ error: 'Berechnung fehlgeschlagen.' }, { status: 500 });
  }
}
