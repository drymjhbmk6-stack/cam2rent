import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { resolveAccessoryItems, type ResolvedItem } from '@/lib/booking-accessory-apply';
import { normalizeAccessoryItems } from '@/lib/booking-accessories';

export const dynamic = 'force-dynamic';

/**
 * GET /api/booking/[id]/details
 *
 * Liefert die Bestell-Details einer eigenen Buchung fuer die Kundenkonto-
 * Ansicht: aufgeloestes Zubehoer/Set (Namen + Menge, Sets expandiert) +
 * Preisaufstellung (Miete, Zubehoer, Haftungsschutz, Versand, Rabatt, Gesamt,
 * Kaution). Rein lesend, keine Mutation.
 *
 * Auth: eingeloggter Kunde, Buchung muss ihm gehoeren (user_id-Match).
 * Kein E-Mail-Fallback (analog /api/meine-buchungen + /pay — Sweep 6 Vuln 14).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  // select('*') statt fester Spaltenliste — robust gegen fehlende Migrationen
  // (early_bird_discount / special_discount / sale_items / booking_type koennen
  // fehlen). Wir geben nur abgeleitete Felder zurueck, keine Rohzeile.
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const b = booking as Record<string, unknown>;

  // ── Verkauf (booking_type='kauf') ──────────────────────────────────────────
  const bookingType = (b.booking_type as string) === 'kauf' ? 'kauf' : 'miete';
  if (bookingType === 'kauf') {
    const saleItems = Array.isArray(b.sale_items)
      ? (b.sale_items as Record<string, unknown>[]).map((it) => ({
          name: String(it?.name ?? ''),
          qty: Number(it?.qty ?? 1) || 1,
          unit_price: Number(it?.unit_price ?? 0) || 0,
        }))
      : [];
    return NextResponse.json({
      bookingType,
      items: [],
      saleItems,
      price: {
        rental: 0,
        accessories: 0,
        haftung: 0,
        shipping: 0,
        discount: 0,
        total: (b.price_total as number) ?? 0,
        deposit: 0,
      },
    });
  }

  // ── Miete: Zubehoer/Set aufloesen ──────────────────────────────────────────
  const rawItems = normalizeAccessoryItems(b.accessory_items, b.accessories);

  // Set-Default in Upgrade-Gruppe ausblenden, wenn der Kunde in derselben Gruppe
  // eine Upgrade-Variante direkt gewaehlt hat — gleiche Logik wie Packliste/
  // Uebergabe (app/api/admin/booking/[id]), damit die Anzeige dem entspricht,
  // was der Kunde tatsaechlich bekommt.
  const skipUpgradeGroups = new Set<string>();
  if (rawItems.length > 0) {
    const rawIds = [...new Set(rawItems.map((r) => r.accessory_id))];
    try {
      const { data: setRows } = await supabase.from('sets').select('id').in('id', rawIds);
      const setIds = new Set((setRows ?? []).map((s) => s.id as string));
      const directAccIds = rawIds.filter((id) => !setIds.has(id));
      if (directAccIds.length > 0 && setIds.size > 0) {
        const { data: directAccs } = await supabase
          .from('accessories')
          .select('id, upgrade_group')
          .in('id', directAccIds);
        for (const a of directAccs ?? []) {
          const g = (a.upgrade_group as string | null) ?? null;
          if (g) skipUpgradeGroups.add(g);
        }
      }
    } catch {
      // upgrade_group-Spalte fehlt → kein Skip, Default-Verhalten.
    }
  }

  let items: ResolvedItem[] = [];
  try {
    items = await resolveAccessoryItems(
      supabase,
      rawItems,
      skipUpgradeGroups.size > 0 ? { skipUpgradeGroups } : undefined,
    );
  } catch {
    items = [];
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const discount =
    num(b.discount_amount) +
    num(b.duration_discount) +
    num(b.loyalty_discount) +
    num(b.early_bird_discount) +
    num(b.special_discount);

  return NextResponse.json({
    bookingType,
    // included_parts/-images fuer die Kundenanzeige nicht noetig — nur Name+Menge.
    items: items.map((it) => ({
      name: it.name,
      qty: it.qty,
      isFromSet: it.isFromSet ?? false,
      setName: it.setName ?? null,
    })),
    saleItems: [],
    price: {
      rental: num(b.price_rental),
      accessories: num(b.price_accessories),
      haftung: num(b.price_haftung),
      shipping: num(b.shipping_price),
      discount,
      total: num(b.price_total),
      deposit: num(b.deposit),
    },
    couponCode: (b.coupon_code as string) || null,
  });
}
