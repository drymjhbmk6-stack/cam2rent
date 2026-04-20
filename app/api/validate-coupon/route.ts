import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { validateCouponBodySchema, firstZodError } from '@/lib/api-schemas';

// Gutschein-Validation ist Brute-Force-anfällig (kurze Codes).
// 5 Versuche/Minute pro IP — verhindert Code-Enumeration durch Bots.
const limiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * POST /api/validate-coupon
 *
 * Body: { code: string, cartTotal?: number }
 * Returns: { coupon: CouponRow } or { error: string }
 */
export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req);
  const { success } = limiter.check(`coupon:${ip}`);
  if (!success) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte warte einen Moment.' },
      { status: 429 }
    );
  }

  // Zod-Validierung: Code-Charset + Cart-Total-Range geprüft
  const parsed = validateCouponBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }
  const code = parsed.data.code.trim();
  const cartTotal = parsed.data.cartTotal ?? 0;
  const userEmail = (parsed.data.userEmail ?? '').trim();

  const supabase = createServiceClient();

  // Look up coupon (case-insensitive)
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .ilike('code', code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Datenbankfehler.' }, { status: 500 });
  }

  if (!coupon) {
    return NextResponse.json({ error: 'Ungültiger Gutschein-Code.' }, { status: 404 });
  }

  // Check active
  if (!coupon.active) {
    return NextResponse.json({ error: 'Dieser Gutschein ist nicht mehr aktiv.' }, { status: 400 });
  }

  // Check validity period
  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return NextResponse.json({ error: 'Dieser Gutschein ist noch nicht gültig.' }, { status: 400 });
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return NextResponse.json({ error: 'Dieser Gutschein ist abgelaufen.' }, { status: 400 });
  }

  // Check max uses
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ error: 'Dieser Gutschein wurde bereits vollständig eingelöst.' }, { status: 400 });
  }

  // Check user-bound coupon
  if (coupon.target_user_email) {
    if (!userEmail || userEmail.toLowerCase() !== coupon.target_user_email.toLowerCase()) {
      return NextResponse.json({ error: 'Dieser Gutschein ist für ein anderes Konto bestimmt.' }, { status: 400 });
    }
  }

  // Check once per customer
  if (coupon.once_per_customer && userEmail) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .ilike('coupon_code', coupon.code)
      .ilike('customer_email', userEmail)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Du hast diesen Gutschein bereits eingelöst.' }, { status: 400 });
    }
  }

  // Check min order value
  if (coupon.min_order_value != null && cartTotal < coupon.min_order_value) {
    return NextResponse.json(
      { error: `Mindestbestellwert: ${coupon.min_order_value.toFixed(2)} €` },
      { status: 400 }
    );
  }

  return NextResponse.json({ coupon });
}
