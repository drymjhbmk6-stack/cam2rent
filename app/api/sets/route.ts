import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import type { RentalSet } from '@/data/sets';

type AccessoryItem = { accessory_id: string; qty: number };

/**
 * Fasst doppelte accessory_items (gleiche accessory_id) zu einem Eintrag mit
 * summierter qty zusammen. Schuetzt vor Admin-Konfigurationsfehlern (z.B.
 * "3x Extra Akku" + "1x Extra Akku" statt "4x Extra Akku") und sorgt dafuer,
 * dass die Verfuegbarkeits-Rechnung im Frontend die reale Gesamtmenge sieht.
 */
function aggregateItems(items: AccessoryItem[]): AccessoryItem[] {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item?.accessory_id) continue;
    const qty = typeof item.qty === 'number' && item.qty > 0 ? item.qty : 0;
    if (qty === 0) continue;
    map.set(item.accessory_id, (map.get(item.accessory_id) ?? 0) + qty);
  }
  return [...map.entries()].map(([accessory_id, qty]) => ({ accessory_id, qty }));
}

function computeAvailability(
  items: AccessoryItem[],
  accMap: Map<string, { available: boolean; available_qty: number }>
): boolean {
  if (!items || items.length === 0) return true;
  return items.every((item) => {
    const acc = accMap.get(item.accessory_id);
    return acc && acc.available && acc.available_qty >= item.qty;
  });
}

/**
 * GET /api/sets — Alle Sets aus DB.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();

    const [setsRes, accRes] = await Promise.all([
      supabase
        .from('sets')
        .select('id, name, description, badge, badge_color, pricing_mode, price, available, sort_order, accessory_items, product_ids, image_url')
        .order('sort_order', { ascending: true }),
      supabase
        .from('accessories')
        .select('id, name, available, available_qty'),
    ]);

    if (setsRes.error) throw setsRes.error;

    const accMap = new Map(
      (accRes.data ?? []).map((a) => [a.id, { name: a.name, available: a.available, available_qty: a.available_qty }])
    );

    const allSets: (RentalSet & { accessory_items: AccessoryItem[]; product_ids: string[] })[] =
      (setsRes.data ?? []).map((r) => {
        const rawItems: AccessoryItem[] = Array.isArray(r.accessory_items) ? r.accessory_items : [];
        const items = aggregateItems(rawItems);
        const available = items.length > 0
          ? computeAvailability(items, accMap)
          : (r.available ?? true);

        // Display-Liste zusaetzlich nach Name aggregieren: zwei unterschiedliche
        // accessory_ids mit identischem Namen werden als eine Zeile gezeigt
        // (verhindert "2x Extra Akku" + "Extra Akku" bei Daten-Duplikaten).
        // Die items-Struktur selbst bleibt id-genau, damit die Verfuegbarkeits-
        // Rechnung pro Bestand korrekt bleibt.
        const nameQty = new Map<string, number>();
        for (const item of items) {
          const name = accMap.get(item.accessory_id)?.name ?? item.accessory_id;
          nameQty.set(name, (nameQty.get(name) ?? 0) + item.qty);
        }
        const includedItems = [...nameQty.entries()].map(
          ([name, qty]) => (qty > 1 ? `${qty}x ${name}` : name),
        );

        return {
          id: r.id,
          name: r.name ?? r.id,
          description: r.description ?? '',
          includedItems,
          badge: r.badge ?? undefined,
          badgeColor: r.badge_color ?? undefined,
          sortOrder: r.sort_order ?? 999,
          pricingMode: (r.pricing_mode as 'perDay' | 'flat') ?? 'perDay',
          price: Number(r.price ?? 0),
          available,
          accessory_items: items,
          product_ids: Array.isArray(r.product_ids) ? r.product_ids : [],
          image_url: r.image_url ?? null,
        };
      });

    const onlyAvailable = req.nextUrl.searchParams.get('available') === 'true';
    const result = onlyAvailable ? allSets.filter((s) => s.available) : allSets;

    return NextResponse.json({ sets: result });
  } catch (err) {
    console.error('GET /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden der Sets.' }, { status: 500 });
  }
}

/**
 * POST /api/sets — Neues Set anlegen
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, badge, badge_color, pricing_mode, price, available, accessory_items, product_ids } = body as {
      name: string; description?: string; badge?: string; badge_color?: string;
      pricing_mode?: string; price?: number; available?: boolean;
      accessory_items?: AccessoryItem[]; product_ids?: string[];
    };

    if (!name?.trim()) return NextResponse.json({ error: 'name erforderlich.' }, { status: 400 });

    const id = name.toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      + '-' + Date.now().toString(36);

    const supabase = createServiceClient();
    const { data: last } = await supabase.from('sets').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const sort_order = (last?.sort_order ?? 0) + 1;

    let computedAvailable = available ?? true;
    const items: AccessoryItem[] = aggregateItems(accessory_items ?? []);
    if (items.length > 0) {
      const accIds = items.map((i) => i.accessory_id);
      const { data: accs } = await supabase.from('accessories').select('id, available, available_qty').in('id', accIds);
      const accMap = new Map(accs?.map((a) => [a.id, a]) ?? []);
      computedAvailable = computeAvailability(items, accMap);
    }

    const { data, error } = await supabase.from('sets').insert({
      id, name: name.trim(), description: description ?? null, badge: badge ?? null,
      badge_color: badge_color ?? null, pricing_mode: pricing_mode ?? 'perDay',
      price: parseFloat(String(price)) || 0, available: computedAvailable,
      accessory_items: items, product_ids: product_ids ?? [],
      sort_order, updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ set: data });
  } catch (err) {
    console.error('POST /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen des Sets.' }, { status: 500 });
  }
}

/**
 * PATCH /api/sets — Set aktualisieren
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, pricing_mode, price, available, name, description, badge, badge_color, accessory_items, product_ids } = body as {
      id: string; pricing_mode?: string; price?: number; available?: boolean;
      name?: string; description?: string; badge?: string; badge_color?: string;
      accessory_items?: AccessoryItem[]; product_ids?: string[];
    };

    if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });

    const supabase = createServiceClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (pricing_mode !== undefined) updates.pricing_mode = pricing_mode;
    if (price !== undefined) updates.price = price;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (badge !== undefined) updates.badge = badge || null;
    if (badge_color !== undefined) updates.badge_color = badge_color || null;
    if (product_ids !== undefined) updates.product_ids = product_ids;

    if (accessory_items !== undefined) {
      const aggregated = aggregateItems(accessory_items);
      updates.accessory_items = aggregated;
      if (aggregated.length > 0) {
        const accIds = aggregated.map((i) => i.accessory_id);
        const { data: accs } = await supabase.from('accessories').select('id, available, available_qty').in('id', accIds);
        const accMap = new Map(accs?.map((a) => [a.id, a]) ?? []);
        updates.available = computeAvailability(aggregated, accMap);
      } else {
        if (available !== undefined) updates.available = available;
      }
    } else {
      if (available !== undefined) updates.available = available;
    }

    const { error } = await supabase.from('sets').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, available: updates.available });
  } catch (err) {
    console.error('PATCH /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Aktualisieren des Sets.' }, { status: 500 });
  }
}

/**
 * DELETE /api/sets — Set löschen
 */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });

    const supabase = createServiceClient();
    const { error } = await supabase.from('sets').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Löschen des Sets.' }, { status: 500 });
  }
}
