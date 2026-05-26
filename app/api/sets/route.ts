import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
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
 * Saeubert basic_for_product_ids: erlaubt nur IDs, die auch in product_ids
 * stehen (Subset-Constraint). Verhindert dass Admin ein Basis-Set fuer eine
 * Kamera markiert, die das Set gar nicht enthaelt.
 */
function sanitizeBasicFor(basicFor: unknown, productIds: string[]): string[] {
  if (!Array.isArray(basicFor)) return [];
  const allowed = new Set(productIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of basicFor) {
    if (typeof id !== 'string') continue;
    if (!allowed.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * GET /api/sets — Alle Sets aus DB.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Defensiv: basic_for_product_ids ist eine neue Spalte (Migration
    // supabase-sets-basic-for-products.sql). Bei fehlender Migration liefert
    // PostgREST einen Spalten-Fehler; dann faellt der Code auf das Select ohne
    // die Spalte zurueck und behandelt basic_for_product_ids als leeres Array.
    let basicForSupported = true;
    type SetRow = {
      id: string; name: string | null; description: string | null;
      badge: string | null; badge_color: string | null;
      pricing_mode: string | null; price: number | null;
      available: boolean | null; sort_order: number | null;
      accessory_items: unknown; product_ids: unknown;
      basic_for_product_ids?: unknown; image_url: string | null;
    };
    let setsRes: { data: SetRow[] | null; error: { message: string } | null } = await supabase
      .from('sets')
      .select('id, name, description, badge, badge_color, pricing_mode, price, available, sort_order, accessory_items, product_ids, basic_for_product_ids, image_url')
      .order('sort_order', { ascending: true });
    if (setsRes.error && /basic_for_product_ids|column|schema cache|PGRST/i.test(setsRes.error.message)) {
      basicForSupported = false;
      setsRes = await supabase
        .from('sets')
        .select('id, name, description, badge, badge_color, pricing_mode, price, available, sort_order, accessory_items, product_ids, image_url')
        .order('sort_order', { ascending: true });
    }
    // upgrade_group / is_upgrade_base mit-laden, damit der Frontend-Filter
    // (getFilteredSetItems im Buchungsflow) den Default-Eintrag eines Sets
    // (z.B. "64 GB") zuverlaessig per Upgrade-Group ausblenden kann, wenn der
    // Kunde die Upgrade-Variante (z.B. "512 GB") aktiv waehlt. Defensiver
    // Fallback: wenn die Spalten fehlen, faellt der Code auf den minimalen
    // Select zurueck und liefert die Upgrade-Infos einfach nicht mit.
    type AccRow = {
      id: string;
      name: string;
      available: boolean;
      available_qty: number;
      upgrade_group?: string | null;
      is_upgrade_base?: boolean | null;
    };
    let accRes: { data: AccRow[] | null; error: { message: string } | null } = await supabase
      .from('accessories')
      .select('id, name, available, available_qty, upgrade_group, is_upgrade_base');
    if (accRes.error && /upgrade_group|is_upgrade_base|column|schema cache|PGRST/i.test(accRes.error.message)) {
      accRes = await supabase
        .from('accessories')
        .select('id, name, available, available_qty');
    }

    if (setsRes.error) throw setsRes.error;

    const accMap = new Map(
      (accRes.data ?? []).map((a) => [a.id, {
        name: a.name,
        available: a.available,
        available_qty: a.available_qty,
        upgrade_group: a.upgrade_group ?? null,
        is_upgrade_base: a.is_upgrade_base ?? false,
      }])
    );

    const allSets: (RentalSet & { accessory_items: AccessoryItem[]; product_ids: string[]; basic_for_product_ids: string[] })[] =
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

        const productIds = Array.isArray(r.product_ids) ? r.product_ids : [];
        const rawBasic = (r as { basic_for_product_ids?: unknown }).basic_for_product_ids;
        const basicFor = basicForSupported && Array.isArray(rawBasic)
          ? (rawBasic as string[]).filter((id) => productIds.includes(id))
          : [];

        // Angereicherte Variante der accessory_items mit Name + Upgrade-Infos
        // — fuer den Frontend-Filter, der bei aktiver Upgrade-Option den
        // Default-Eintrag (z.B. "64 GB") aus der Anzeige nimmt. Filter laeuft
        // ueber accessory_id + upgrade_group statt ueber Name-Vergleich; damit
        // funktioniert er auch wenn das Base-Accessory `internal=true` ist
        // und nicht in /api/accessories enthalten ist.
        const accessoryItemsDetailed = items.map((it) => {
          const acc = accMap.get(it.accessory_id);
          return {
            accessory_id: it.accessory_id,
            qty: it.qty,
            name: acc?.name ?? it.accessory_id,
            upgrade_group: acc?.upgrade_group ?? null,
            is_upgrade_base: acc?.is_upgrade_base ?? false,
          };
        });

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
          accessory_items_detailed: accessoryItemsDetailed,
          product_ids: productIds,
          basic_for_product_ids: basicFor,
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
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { name, description, badge, badge_color, pricing_mode, price, available, accessory_items, product_ids, basic_for_product_ids } = body as {
      name: string; description?: string; badge?: string; badge_color?: string;
      pricing_mode?: string; price?: number; available?: boolean;
      accessory_items?: AccessoryItem[]; product_ids?: string[];
      basic_for_product_ids?: string[];
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

    const cleanProductIds = product_ids ?? [];
    const cleanBasicFor = sanitizeBasicFor(basic_for_product_ids, cleanProductIds);
    const insertRow: Record<string, unknown> = {
      id, name: name.trim(), description: description ?? null, badge: badge ?? null,
      badge_color: badge_color ?? null, pricing_mode: pricing_mode ?? 'perDay',
      price: parseFloat(String(price)) || 0, available: computedAvailable,
      accessory_items: items, product_ids: cleanProductIds,
      basic_for_product_ids: cleanBasicFor,
      sort_order, updated_at: new Date().toISOString(),
    };

    let inserted = await supabase.from('sets').insert(insertRow).select().single();
    if (inserted.error && /basic_for_product_ids|column|schema cache|PGRST/i.test(inserted.error.message)) {
      // Migration noch nicht durch — Spalte droppen und nochmal versuchen.
      delete insertRow.basic_for_product_ids;
      inserted = await supabase.from('sets').insert(insertRow).select().single();
    }
    if (inserted.error) throw inserted.error;
    return NextResponse.json({ set: inserted.data });
  } catch (err) {
    console.error('POST /api/sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen des Sets.' }, { status: 500 });
  }
}

/**
 * PATCH /api/sets — Set aktualisieren
 */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { id, pricing_mode, price, available, name, description, badge, badge_color, accessory_items, product_ids, basic_for_product_ids } = body as {
      id: string; pricing_mode?: string; price?: number; available?: boolean;
      name?: string; description?: string; badge?: string; badge_color?: string;
      accessory_items?: AccessoryItem[]; product_ids?: string[];
      basic_for_product_ids?: string[];
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

    // basic_for_product_ids muss Teilmenge der effektiven product_ids sein.
    // Wenn product_ids im selben Save geaendert wird, nutzen wir den neuen
    // Wert; sonst Lookup auf die aktuelle DB-Zeile.
    if (basic_for_product_ids !== undefined) {
      let effectiveProductIds: string[] = [];
      if (product_ids !== undefined) {
        effectiveProductIds = product_ids;
      } else {
        const { data: row } = await supabase
          .from('sets')
          .select('product_ids')
          .eq('id', id)
          .maybeSingle();
        effectiveProductIds = Array.isArray(row?.product_ids) ? row!.product_ids : [];
      }
      updates.basic_for_product_ids = sanitizeBasicFor(basic_for_product_ids, effectiveProductIds);
    }

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

    let upd = await supabase.from('sets').update(updates).eq('id', id);
    if (upd.error && /basic_for_product_ids|column|schema cache|PGRST/i.test(upd.error.message)) {
      // Migration ausstehend — Update ohne die neue Spalte wiederholen.
      const fallback = { ...updates };
      delete fallback.basic_for_product_ids;
      upd = await supabase.from('sets').update(fallback).eq('id', id);
    }
    if (upd.error) throw upd.error;
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
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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
