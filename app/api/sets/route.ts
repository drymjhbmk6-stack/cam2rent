import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { RENTAL_SETS_STATIC, type RentalSet } from '@/data/sets';

type AccessoryItem = { accessory_id: string; qty: number };

/** Berechnet Verfügbarkeit eines Sets aus den verlinkten Zubehör-Items */
function computeAvailability(
  items: AccessoryItem[],
  accMap: Map<string, { available: boolean; available_qty: number }>
): boolean {
  if (!items || items.length === 0) return true; // kein Zubehör → manuell
  return items.every((item) => {
    const acc = accMap.get(item.accessory_id);
    return acc && acc.available && acc.available_qty >= item.qty;
  });
}

/**
 * GET /api/sets
 * Gibt alle Sets zurück. Verfügbarkeit wird automatisch aus Zubehör-Lagerbestand berechnet.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();

    const [setsRes, accRes, hiddenRes] = await Promise.all([
      supabase
        .from('sets')
        .select('id, name, description, badge, badge_color, pricing_mode, price, available, sort_order, accessory_items, product_ids')
        .order('sort_order', { ascending: true }),
      supabase
        .from('accessories')
        .select('id, available, available_qty'),
      supabase
        .from('admin_config')
        .select('value')
        .eq('key', 'hidden_sets')
        .maybeSingle(),
    ]);

    const hiddenIds = new Set<string>(
      Array.isArray(hiddenRes.data?.value) ? hiddenRes.data.value : []
    );

    if (setsRes.error) throw setsRes.error;

    const rowMap = new Map(setsRes.data?.map((r) => [r.id, r]) ?? []);
    const accMap = new Map(
      (accRes.data ?? []).map((a) => [a.id, { available: a.available, available_qty: a.available_qty }])
    );
    const staticIds = new Set(RENTAL_SETS_STATIC.map((s) => s.id));

    // Static sets merged with DB overrides — versteckte überspringen
    const staticSets: RentalSet[] = RENTAL_SETS_STATIC.filter((s) => !hiddenIds.has(s.id)).map((s) => {
      const row = rowMap.get(s.id);
      const items: AccessoryItem[] = Array.isArray(row?.accessory_items) ? row.accessory_items : [];
      const hasItems = items.length > 0;
      const available = hasItems
        ? computeAvailability(items, accMap)
        : (row?.available ?? true);

      return {
        ...s,
        pricingMode: (row?.pricing_mode as 'perDay' | 'flat') ?? 'perDay',
        price: Number(row?.price ?? 0),
        available,
      };
    });

    // DB-only sets
    const dbOnlySets: RentalSet[] = (setsRes.data ?? [])
      .filter((r) => !staticIds.has(r.id) && r.name)
      .map((r) => {
        const items: AccessoryItem[] = Array.isArray(r.accessory_items) ? r.accessory_items : [];
        const hasItems = items.length > 0;
        const available = hasItems
          ? computeAvailability(items, accMap)
          : (r.available ?? true);
        return {
          id: r.id,
          name: r.name ?? r.id,
          description: r.description ?? '',
          includedItems: [],
          badge: r.badge ?? undefined,
          badgeColor: r.badge_color ?? undefined,
          sortOrder: r.sort_order ?? 999,
          pricingMode: (r.pricing_mode as 'perDay' | 'flat') ?? 'perDay',
          price: Number(r.price ?? 0),
          available,
        };
      });

    const allSets = [...staticSets, ...dbOnlySets].sort((a, b) => a.sortOrder - b.sortOrder);

    // Admin-Erweiterungsfelder zurückgeben (für /admin/sets)
    const setsWithMeta = allSets.map((s) => {
      const row = rowMap.get(s.id);
      return {
        ...s,
        accessory_items: Array.isArray(row?.accessory_items) ? row.accessory_items : [],
        product_ids: Array.isArray(row?.product_ids) ? row.product_ids : [],
      };
    });

    const onlyAvailable = req.nextUrl.searchParams.get('available') === 'true';
    const result = onlyAvailable ? setsWithMeta.filter((s) => s.available) : setsWithMeta;

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

    // Verfügbarkeit berechnen
    let computedAvailable = available ?? true;
    const items: AccessoryItem[] = accessory_items ?? [];
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
 * PATCH /api/sets — Set aktualisieren (alle Felder + auto-Verfügbarkeit)
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
      updates.accessory_items = accessory_items;
      if (accessory_items.length > 0) {
        const accIds = accessory_items.map((i) => i.accessory_id);
        const { data: accs } = await supabase.from('accessories').select('id, available, available_qty').in('id', accIds);
        const accMap = new Map(accs?.map((a) => [a.id, a]) ?? []);
        updates.available = computeAvailability(accessory_items, accMap);
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
 * DB-only Sets: Zeile löschen.
 * Statische Sets: zur hidden_sets-Liste in admin_config hinzufügen.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });

    const supabase = createServiceClient();
    const staticIds = new Set(RENTAL_SETS_STATIC.map((s) => s.id));

    if (staticIds.has(id)) {
      // Statisches Set: in hidden_sets-Liste eintragen
      const { data: existing } = await supabase
        .from('admin_config').select('value').eq('key', 'hidden_sets').maybeSingle();
      const current: string[] = Array.isArray(existing?.value) ? existing.value : [];
      if (!current.includes(id)) {
        await supabase.from('admin_config').upsert({
          key: 'hidden_sets',
          value: [...current, id],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      }
    } else {
      const { error } = await supabase.from('sets').delete().eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Löschen des Sets.' }, { status: 500 });
  }
}
