import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { resolveAccessoryItems, type ResolvedItem } from '@/lib/booking-accessory-apply';
import { normalizeAccessoryItems } from '@/lib/booking-accessories';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { getProducts } from '@/lib/get-products';

export const dynamic = 'force-dynamic';

/**
 * GET /api/booking/[id]/details
 *
 * Liefert die Bestell-Details einer eigenen Buchung fuer die Kundenkonto-
 * Ansicht: aufgeloestes Zubehoer/Set (Namen + Menge, Sets als eigene Gruppe
 * MIT zugeordneter Kamera) + Preisaufstellung. Rein lesend, keine Mutation.
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
  // (early_bird_discount / special_discount / sale_items / booking_type / cameras
  // koennen fehlen). Wir geben nur abgeleitete Felder zurueck, keine Rohzeile.
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
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const price = {
    rental: num(b.price_rental),
    accessories: num(b.price_accessories),
    haftung: num(b.price_haftung),
    shipping: num(b.shipping_price),
    discount:
      num(b.discount_amount) +
      num(b.duration_discount) +
      num(b.loyalty_discount) +
      num(b.early_bird_discount) +
      num(b.special_discount),
    total: num(b.price_total),
    deposit: num(b.deposit),
  };

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
      cameras: [],
      sets: [],
      accessories: [],
      saleItems,
      price: { ...price, rental: 0, accessories: 0, haftung: 0, shipping: 0, discount: 0, deposit: 0 },
      couponCode: null,
    });
  }

  // ── Miete: Zubehoer/Set aufloesen ──────────────────────────────────────────
  const rawItems = normalizeAccessoryItems(b.accessory_items, b.accessories);

  // Set-Default in Upgrade-Gruppe ausblenden, wenn der Kunde in derselben Gruppe
  // eine Upgrade-Variante direkt gewaehlt hat — gleiche Logik wie Packliste/
  // Uebergabe, damit die Anzeige dem entspricht, was der Kunde bekommt.
  const skipUpgradeGroups = new Set<string>();
  const rawIds = [...new Set(rawItems.map((r) => r.accessory_id))];
  const setIds = new Set<string>();
  if (rawItems.length > 0) {
    try {
      const { data: setRows } = await supabase.from('sets').select('id').in('id', rawIds);
      for (const s of setRows ?? []) setIds.add(s.id as string);
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

  let resolved: ResolvedItem[] = [];
  try {
    resolved = await resolveAccessoryItems(
      supabase,
      rawItems,
      skipUpgradeGroups.size > 0 ? { skipUpgradeGroups } : undefined,
    );
  } catch {
    resolved = [];
  }

  // ── Set → Kamera zuordnen ───────────────────────────────────────────────────
  // Kameras der Buchung (Name + product_id), plus Katalog-Namen fuer die
  // product_ids der Sets, damit "Basic Set (GoPro)" vs. "Basic Set (OSMO)"
  // unterscheidbar wird.
  const cameras = resolveBookingCameras(b as Parameters<typeof resolveBookingCameras>[0]);
  const cameraNames = cameras.map((c) => c.product_name).filter(Boolean);

  // set-id → product_ids
  const setProductIds: Record<string, string[]> = {};
  if (setIds.size > 0) {
    try {
      const { data: setMeta } = await supabase
        .from('sets')
        .select('id, product_ids')
        .in('id', [...setIds]);
      for (const s of setMeta ?? []) {
        setProductIds[s.id as string] = Array.isArray(s.product_ids) ? (s.product_ids as string[]) : [];
      }
    } catch {
      /* product_ids-Spalte fehlt → keine Zuordnung */
    }
  }

  // Katalog-Namen fuer product_ids (Fallback-Matching ueber den Namen, falls die
  // Buchungs-Kameras keine product_id tragen — Legacy).
  let productNameById = new Map<string, string>();
  const anySetHasProdIds = Object.values(setProductIds).some((ids) => ids.length > 0);
  if (anySetHasProdIds) {
    try {
      const products = await getProducts();
      productNameById = new Map(products.map((p) => [p.id, p.name]));
    } catch {
      productNameById = new Map();
    }
  }

  function cameraForSet(setId: string): string | null {
    const prodIds = setProductIds[setId] ?? [];
    if (prodIds.length === 0) return null;
    const matched: string[] = [];
    // 1) direkte product_id-Uebereinstimmung mit einer Buchungs-Kamera
    for (const c of cameras) {
      if (c.product_id && prodIds.includes(c.product_id)) matched.push(c.product_name);
    }
    // 2) Fallback ueber den Namen (Legacy: Kamera hat keine product_id)
    if (matched.length === 0) {
      const setCamNames = prodIds
        .map((id) => productNameById.get(id))
        .filter((n): n is string => Boolean(n));
      for (const cn of cameraNames) {
        if (setCamNames.some((n) => n.toLowerCase() === cn.toLowerCase())) matched.push(cn);
      }
    }
    const uniq = [...new Set(matched.filter(Boolean))];
    return uniq.length > 0 ? uniq.join(', ') : null;
  }

  // ── Flache resolved-Liste in Gruppen umbauen ────────────────────────────────
  // Set-Container = !isFromSet && kein accessory_id. Danach folgen die
  // isFromSet-Sub-Items bis zum naechsten Container. Direkte Accessories haben
  // accessory_id gesetzt und !isFromSet.
  type SetGroup = { name: string; cameraName: string | null; items: { name: string; qty: number }[] };
  const sets: SetGroup[] = [];
  const accessories: { name: string; qty: number }[] = [];
  let current: SetGroup | null = null;

  for (const it of resolved) {
    const isSetContainer = !it.isFromSet && !it.accessory_id;
    if (isSetContainer) {
      current = { name: it.name, cameraName: cameraForSet(it.id), items: [] };
      sets.push(current);
    } else if (it.isFromSet && current) {
      current.items.push({ name: it.name, qty: it.qty });
    } else {
      // direkt gewaehltes Zubehoer
      accessories.push({ name: it.name, qty: it.qty });
      current = null;
    }
  }

  return NextResponse.json({
    bookingType,
    cameras: cameraNames,
    sets,
    accessories,
    saleItems: [],
    price,
    couponCode: (b.coupon_code as string) || null,
  });
}
