import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { createSale } from '@/lib/verkauf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/admin/verkauf
 *   - ohne Parameter: Liste aller Verkäufe (booking_type='kauf')
 *   - ?customer_id=<userId>: Buchungen dieses Kunden mit aufgelösten
 *     Artikel-Namen — als Vorlage für die Artikelauswahl im Verkaufsformular.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const supabase = createServiceClient();
  // Untypisierter Handle für Selects mit der neuen Spalte booking_type /
  // sale_items (noch nicht im generierten Schema-Typ).
  const sb = supabase as unknown as SupabaseClient;
  const customerId = req.nextUrl.searchParams.get('customer_id');

  // ── Kunden-Buchungen für die Artikelauswahl ─────────────────────────────
  if (customerId) {
    interface BkRow {
      id: string;
      product_name: string | null;
      created_at: string;
      accessory_items: unknown;
      accessories: unknown;
      booking_type?: string;
    }
    type QResult = { data: BkRow[] | null; error: { message: string } | null };

    let res = (await sb
      .from('bookings')
      .select('id, product_name, created_at, accessory_items, accessories, booking_type')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30)) as unknown as QResult;
    if (res.error && /booking_type/i.test(res.error.message || '')) {
      res = (await sb
        .from('bookings')
        .select('id, product_name, created_at, accessory_items, accessories')
        .eq('user_id', customerId)
        .order('created_at', { ascending: false })
        .limit(30)) as unknown as QResult;
    }
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    const rows = (res.data ?? []).filter((b) => b.booking_type !== 'kauf');

    // Namen für accessory_ids / set_ids auflösen
    const [accRes, setRes] = await Promise.all([
      supabase.from('accessories').select('id, name'),
      supabase.from('sets').select('id, name'),
    ]);
    const nameMap = new Map<string, string>();
    for (const a of accRes.data ?? []) nameMap.set(String(a.id), String(a.name));
    for (const sName of setRes.data ?? []) nameMap.set(String(sName.id), String(sName.name));

    const bookings = rows.map((b) => {
      const rawItems: { accessory_id: string; qty: number }[] =
        Array.isArray(b.accessory_items) && b.accessory_items.length > 0
          ? (b.accessory_items as { accessory_id: string; qty: number }[])
          : (Array.isArray(b.accessories) ? (b.accessories as string[]) : []).map((id) => ({
              accessory_id: id,
              qty: 1,
            }));
      const items = rawItems.map((it) => ({
        name: nameMap.get(it.accessory_id) ?? it.accessory_id,
        qty: typeof it.qty === 'number' && it.qty > 0 ? Math.floor(it.qty) : 1,
      }));
      // Die Kamera(s) selbst ebenfalls als wählbare Position anbieten.
      if (b.product_name) {
        items.unshift({ name: String(b.product_name), qty: 1 });
      }
      return {
        id: b.id,
        product_name: b.product_name,
        created_at: b.created_at,
        items,
      };
    });
    return NextResponse.json({ bookings });
  }

  // ── Verkaufs-Liste ──────────────────────────────────────────────────────
  const res = await sb
    .from('bookings')
    .select('id, customer_name, customer_email, price_total, status, created_at, sale_items, stripe_payment_link_id, notes')
    .eq('booking_type', 'kauf')
    .order('created_at', { ascending: false })
    .limit(200);
  if (res.error && /booking_type/i.test(res.error.message || '')) {
    // Migration noch nicht ausgeführt → es gibt schlicht keine Verkäufe.
    return NextResponse.json({ sales: [], migration_pending: true });
  }
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ sales: res.data ?? [] });
}

/**
 * POST /api/admin/verkauf — legt einen Verkauf an und verschickt
 * Rechnung + Stripe-Zahlungslink an den Kunden.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }

  const result = await createSale({
    customerName: String(body.customerName ?? ''),
    customerEmail: String(body.customerEmail ?? ''),
    userId: body.userId ? String(body.userId) : null,
    items: Array.isArray(body.items) ? (body.items as { name: string; qty: number; unit_price: number }[]) : [],
    sourceBookingId: body.sourceBookingId ? String(body.sourceBookingId) : null,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await logAudit({
    action: 'verkauf.create',
    entityType: 'booking',
    entityId: result.bookingId ?? '',
    entityLabel: String(body.customerEmail ?? ''),
    changes: { paymentUrl: result.paymentUrl, emailSent: result.emailSent },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    bookingId: result.bookingId,
    paymentUrl: result.paymentUrl,
    emailSent: result.emailSent,
    emailError: result.error ?? null,
  });
}
