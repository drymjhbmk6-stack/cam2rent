import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET  /api/admin/coupons  → alle Gutscheine
 * POST /api/admin/coupons  → neuen Gutschein anlegen
 */

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const coupons = data ?? [];

  // `used_count` wird beim Einlösen über mehrere Pfade hochgezählt (confirm-cart
  // RPC, Stripe-Webhook) — schlägt einer davon fehl (Webhook-Race, Metadata
  // fehlt, Fallback-Pfad nicht erreicht), bleibt der Zähler auf 0, obwohl eine
  // Buchung den Code verwendet hat. Wahre Quelle ist `bookings.coupon_code`.
  // Daher: tatsächliche Einlösungen aus den Buchungen ableiten und den höheren
  // der beiden Werte anzeigen (nie unter den echten Stand fallen).
  try {
    const { data: bk } = await supabase
      .from('bookings')
      .select('coupon_code')
      .not('coupon_code', 'is', null);
    const counts = new Map<string, number>();
    for (const row of bk ?? []) {
      const cc = String((row as { coupon_code?: string }).coupon_code ?? '').trim().toLowerCase();
      if (cc) counts.set(cc, (counts.get(cc) ?? 0) + 1);
    }
    for (const c of coupons as { code?: string; used_count?: number }[]) {
      const derived = counts.get(String(c.code ?? '').trim().toLowerCase()) ?? 0;
      c.used_count = Math.max(Number(c.used_count) || 0, derived);
    }
  } catch (e) {
    // Ableitung ist best-effort — bei Fehler bleibt der gespeicherte used_count.
    console.error('[coupons] Nutzungs-Ableitung aus bookings fehlgeschlagen:', e);
  }

  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    code, type, value, description, target_type,
    target_id, target_group_id, target_name, target_user_email,
    valid_from, valid_until, max_uses, min_order_value,
    once_per_customer, not_combinable, active,
  } = body;

  if (!code || !type || value == null) {
    return NextResponse.json({ error: 'Code, Typ und Wert sind erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check for duplicate code (case-insensitive)
  const { data: existing } = await supabase
    .from('coupons')
    .select('id')
    .ilike('code', code.trim())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Ein Gutschein mit diesem Code existiert bereits.' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code: code.trim().toUpperCase(),
      type,
      value: parseFloat(value) || 0,
      description: description ?? '',
      target_type: target_type ?? 'all',
      target_id: target_id || null,
      target_group_id: target_group_id || null,
      target_name: target_name || null,
      target_user_email: target_user_email || null,
      once_per_customer: once_per_customer ?? false,
      not_combinable: not_combinable ?? false,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
      max_uses: max_uses ? parseInt(max_uses) : null,
      min_order_value: min_order_value ? parseFloat(min_order_value) : null,
      active: active ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'coupon.create',
    entityType: 'coupon',
    entityId: data?.id,
    entityLabel: data?.code,
    changes: { type, value: parseFloat(value) || 0, target_type: target_type ?? 'all' },
    request: req,
  });

  return NextResponse.json({ coupon: data });
}
