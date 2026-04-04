import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendAbandonedCartReminder } from '@/lib/email';

/**
 * GET /api/cron/abandoned-cart
 * Cron-Job: Sendet Erinnerungen für Warenkörbe die seit X Stunden nicht abgeschlossen wurden.
 * Auth: CRON_SECRET Header.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  if (secret && secret === process.env.CRON_SECRET) return true;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Einstellungen laden
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', [
      'abandoned_cart_enabled',
      'abandoned_cart_delay_hours',
      'abandoned_cart_discount_enabled',
      'abandoned_cart_discount_percent',
    ]);

  const cfg: Record<string, string> = {};
  for (const s of settings ?? []) cfg[s.key] = s.value;

  if (cfg['abandoned_cart_enabled'] !== 'true') {
    return NextResponse.json({ message: 'Abandoned Cart deaktiviert.', sent: 0 });
  }

  const delayHours = parseInt(cfg['abandoned_cart_delay_hours'] || '24', 10);
  const discountEnabled = cfg['abandoned_cart_discount_enabled'] === 'true';
  const discountPercent = parseInt(cfg['abandoned_cart_discount_percent'] || '5', 10);

  // Carts finden die alt genug sind und noch keine Erinnerung bekommen haben
  const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();

  const { data: carts, error } = await supabase
    .from('abandoned_carts')
    .select('*')
    .is('reminder_sent_at', null)
    .eq('recovered', false)
    .lt('updated_at', cutoff)
    .limit(50);

  if (error) {
    console.error('Abandoned cart query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!carts || carts.length === 0) {
    return NextResponse.json({ message: 'Keine ausstehenden Warenkörbe.', sent: 0 });
  }

  // Gutschein-Code generieren falls Rabatt aktiviert
  let couponCode: string | undefined;
  if (discountEnabled && discountPercent > 0) {
    couponCode = `COMEBACK${discountPercent}`;

    // Gutschein in Supabase anlegen falls nicht vorhanden
    const { data: existingCoupon } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', couponCode)
      .maybeSingle();

    if (!existingCoupon) {
      await supabase.from('coupons').insert({
        code: couponCode,
        type: 'percent',
        value: discountPercent,
        target_type: 'order',
        active: true,
        once_per_customer: true,
        not_combinable: false,
      });
    }
  }

  let sent = 0;
  const errors: string[] = [];

  for (const cart of carts) {
    try {
      // Kundennamen aus Profil holen
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', cart.user_id)
        .maybeSingle();

      const items = (cart.items as Array<{ productName: string; days: number; subtotal: number }>)
        .map((item) => ({
          productName: item.productName || 'Kamera',
          days: item.days || 1,
          subtotal: item.subtotal || 0,
        }));

      await sendAbandonedCartReminder({
        customerName: profile?.full_name || 'Kunde',
        customerEmail: cart.email,
        items,
        cartTotal: cart.cart_total || 0,
        couponCode: discountEnabled ? couponCode : undefined,
        discountPercent: discountEnabled ? discountPercent : undefined,
      });

      // Erinnerung als gesendet markieren
      await supabase
        .from('abandoned_carts')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', cart.id);

      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${cart.id}: ${msg}`);
    }
  }

  return NextResponse.json({ sent, total: carts.length, errors });
}
