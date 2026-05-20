import type { createServiceClient } from '@/lib/supabase';
import { assignAccessoryUnitsToBooking, releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { computeAccessoryAvailability } from '@/lib/accessory-availability';

type SB = ReturnType<typeof createServiceClient>;

export type ResolvedItem = {
  id: string;
  name: string;
  qty: number;
  accessory_id?: string;
  isFromSet?: boolean;
  setName?: string;
  included_parts?: string[];
};

/**
 * Loest eine Liste { accessory_id, qty } in benannte Positionen auf.
 * Sets werden expandiert (Container-Zeile + Sub-Items mit isFromSet).
 * Wird sowohl fuer die echte Buchung (Packliste/Vertrag) als auch fuer
 * die manuell ueberschriebene interne Haftungs-Box genutzt.
 *
 * Optional: `skipUpgradeGroups` → ein Set von upgrade_group-Werten. Set-
 * Sub-Items deren Accessory in einer dieser Gruppen liegt werden beim
 * Expandieren uebersprungen. Beispiel: Set enthaelt "128 GB" (upgrade_group
 * "Speicher"), Buchung hat zusaetzlich "256 GB" (gleiche Gruppe) direkt
 * gewaehlt → die 128 GB aus dem Set wird weggelassen, damit nur die
 * Upgrade-Variante in der Stueckliste/Packliste/Rechnung steht.
 *
 * (Aus app/api/admin/booking/[id]/route.ts extrahiert, damit GET-Handler,
 *  accessory_edit und booking_edit dieselbe Aufloesung nutzen.)
 */
export async function resolveAccessoryItems(
  supabase: SB,
  rawItems: { accessory_id: string; qty: number }[],
  options?: { skipUpgradeGroups?: Set<string> },
): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  if (rawItems.length === 0) return resolved;

  const allIds = [...new Set(rawItems.map((r) => r.accessory_id))];
  type AccLookup = { name: string; included_parts: string[]; upgrade_group: string | null };
  const accLookup: Record<string, AccLookup> = {};
  let accs: Array<{ id: string; name: string; included_parts?: string[] | null; upgrade_group?: string | null }> | null = null;

  const accFull = await supabase.from('accessories').select('id, name, included_parts, upgrade_group').in('id', allIds);
  if (accFull.error && /column .*(included_parts|upgrade_group)/i.test(accFull.error.message)) {
    // Defensive: fehlende Spalte → Fallback auf id+name
    const accFallback = await supabase.from('accessories').select('id, name').in('id', allIds);
    accs = accFallback.data ?? [];
  } else {
    accs = accFull.data ?? [];
  }
  const { data: sets } = await supabase.from('sets').select('id, name, accessory_items').in('id', allIds);

  for (const a of accs ?? []) {
    accLookup[a.id] = {
      name: a.name as string,
      included_parts: Array.isArray(a.included_parts) ? (a.included_parts as string[]) : [],
      upgrade_group: (a.upgrade_group as string | null) ?? null,
    };
  }
  const setMap: Record<string, { name: string; items: { accessory_id: string; qty: number }[] }> = {};
  for (const s of sets ?? []) {
    setMap[s.id] = {
      name: s.name as string,
      items: Array.isArray(s.accessory_items) ? (s.accessory_items as { accessory_id: string; qty: number }[]) : [],
    };
  }

  const setSubIds = new Set<string>();
  for (const setInfo of Object.values(setMap)) {
    for (const it of setInfo.items) {
      if (!accLookup[it.accessory_id]) setSubIds.add(it.accessory_id);
    }
  }
  if (setSubIds.size > 0) {
    const subFull = await supabase
      .from('accessories')
      .select('id, name, included_parts, upgrade_group')
      .in('id', [...setSubIds]);
    let subRows: Array<{ id: string; name: string; included_parts?: string[] | null; upgrade_group?: string | null }> = subFull.data ?? [];
    if (subFull.error && /column .*(included_parts|upgrade_group)/i.test(subFull.error.message)) {
      const subFallback = await supabase.from('accessories').select('id, name').in('id', [...setSubIds]);
      subRows = subFallback.data ?? [];
    }
    for (const a of subRows) {
      accLookup[a.id] = {
        name: a.name as string,
        included_parts: Array.isArray(a.included_parts) ? (a.included_parts as string[]) : [],
        upgrade_group: (a.upgrade_group as string | null) ?? null,
      };
    }
  }

  const skipGroups = options?.skipUpgradeGroups;
  for (const item of rawItems) {
    const setInfo = setMap[item.accessory_id];
    if (setInfo) {
      resolved.push({ id: item.accessory_id, name: setInfo.name, qty: item.qty });
      for (const sub of setInfo.items) {
        const subAcc = accLookup[sub.accessory_id];
        // Konflikt-Skip: Sub-Item liegt in einer Upgrade-Gruppe, die der
        // Aufrufer als bereits "anders besetzt" markiert hat (z.B. der Kunde
        // hat 256 GB direkt gewaehlt → die 128 GB aus dem Set wird weggelassen).
        if (skipGroups && subAcc?.upgrade_group && skipGroups.has(subAcc.upgrade_group)) {
          continue;
        }
        resolved.push({
          id: sub.accessory_id,
          accessory_id: sub.accessory_id,
          name: subAcc?.name ?? sub.accessory_id,
          qty: (sub.qty || 1) * item.qty,
          isFromSet: true,
          setName: setInfo.name,
          included_parts: subAcc?.included_parts && subAcc.included_parts.length > 0 ? subAcc.included_parts : undefined,
        });
      }
    } else {
      const acc = accLookup[item.accessory_id];
      resolved.push({
        id: item.accessory_id,
        accessory_id: item.accessory_id,
        name: acc?.name ?? item.accessory_id,
        qty: item.qty,
        included_parts: acc?.included_parts && acc.included_parts.length > 0 ? acc.included_parts : undefined,
      });
    }
  }
  return resolved;
}

export interface ApplyAccessoryInput {
  supabase: SB;
  bookingId: string;
  rentalFrom: string;
  rentalTo: string;
  productId: string | null;
  deliveryMode: string;
  /** Roh-Auswahl aus der UI (kann Accessory- ODER Set-IDs enthalten). */
  rawItems: { accessory_id?: string; qty?: number }[];
  /** Bestehende Buchungs-Komposition (fuer Delta + Audit). */
  currentItems: { accessory_id: string; qty: number }[] | null;
  currentAccessories: string[] | null;
  currentUnitIds: string[] | null;
}

export type ApplyAccessoryResult =
  | {
      ok: true;
      /** Flache Einzelteil-Liste (Sets aufgeloest) — fuer accessory_items. */
      newItems: { accessory_id: string; qty: number }[];
      accessories: string[];
      accessory_unit_ids: string[];
      /** Roh-Ist-Stand fuer Audit (kann Set-IDs enthalten). */
      oldItems: { accessory_id: string; qty: number }[];
    }
  | { ok: false; status: number; error: string };

/**
 * Wendet eine neue Zubehoer-/Set-Auswahl auf eine Buchung an:
 * Verfuegbarkeit hart pruefen (nur DIREKT gewaehlte Einzel-Accessories;
 * Set-Teile weich wie im Shop-Buchungsflow), Units near-atomar neu zuweisen,
 * Ueberzaehliges freigeben. Gibt die zu schreibenden Spaltenwerte zurueck —
 * der Aufrufer haengt Notizen/Preis/Pack-Reset an und schreibt das Update.
 *
 * 1:1 die in accessory_edit erprobte Logik, geteilt von accessory_edit und
 * booking_edit.
 */
export async function applyAccessoryComposition(
  input: ApplyAccessoryInput,
): Promise<ApplyAccessoryResult> {
  const { supabase, bookingId, rentalFrom, rentalTo, productId, deliveryMode } = input;

  const cleaned = (input.rawItems || [])
    .filter((x) => x && typeof x.accessory_id === 'string' && (x.accessory_id as string).trim())
    .map((x) => ({
      accessory_id: (x.accessory_id as string).trim().slice(0, 100),
      qty: Math.min(99, Math.max(1, Math.round(Number(x.qty) || 1))),
    }))
    .slice(0, 50);
  const mergedMap = new Map<string, number>();
  for (const it of cleaned) {
    mergedMap.set(it.accessory_id, Math.min(99, (mergedMap.get(it.accessory_id) ?? 0) + it.qty));
  }
  const rawSelection = [...mergedMap.entries()].map(([accessory_id, qty]) => ({ accessory_id, qty }));

  // IDs muessen existierende Accessories ODER Sets sein.
  const rawIds = rawSelection.map((i) => i.accessory_id);
  const selectedSetIds = new Set<string>();
  if (rawIds.length > 0) {
    const [accChk, setChk] = await Promise.all([
      supabase.from('accessories').select('id').in('id', rawIds),
      supabase.from('sets').select('id').in('id', rawIds),
    ]);
    for (const s of setChk.data ?? []) selectedSetIds.add(s.id as string);
    const known = new Set<string>([
      ...((accChk.data ?? []).map((a) => a.id as string)),
      ...selectedSetIds,
    ]);
    const unknown = rawIds.filter((i) => !known.has(i));
    if (unknown.length > 0) {
      return { ok: false, status: 422, error: `Unbekanntes Zubehör/Set: ${unknown.join(', ')}` };
    }
  }

  // Direkt gewaehlte Einzel-Accessories (KEINE Sets) — nur diese hart pruefen.
  const directRaw = rawSelection.filter((r) => !selectedSetIds.has(r.accessory_id));
  const directExpanded = new Map<string, number>();
  if (directRaw.length > 0) {
    try {
      const dResolved = await resolveAccessoryItems(supabase, directRaw);
      for (const r of dResolved) {
        if (!r.accessory_id) continue;
        directExpanded.set(r.accessory_id, (directExpanded.get(r.accessory_id) ?? 0) + (r.qty || 0));
      }
    } catch (e) {
      console.error('[booking-accessory-apply] resolve direct selection failed:', e);
    }
  }

  // Konflikt-Erkennung Upgrade-Gruppen: Wenn der Admin ein Set hinzufuegt
  // UND parallel ein Einzel-Accessory in derselben Upgrade-Gruppe (z.B.
  // "Speicher": Set enthaelt 128 GB, Buchung hat 256 GB direkt gewaehlt),
  // wird das Set-Sub-Item beim Expandieren uebersprungen. So bekommt der
  // Admin den 2-Schritt-Workflow (Set rein → speichern → 128 GB raus)
  // automatisch erspart.
  const skipUpgradeGroups = new Set<string>();
  const directAccIds = directRaw.map((r) => r.accessory_id);
  if (directAccIds.length > 0 && selectedSetIds.size > 0) {
    try {
      const { data: directAccs } = await supabase
        .from('accessories')
        .select('id, upgrade_group')
        .in('id', directAccIds);
      for (const a of directAccs ?? []) {
        const g = (a.upgrade_group as string | null) ?? null;
        if (g) skipUpgradeGroups.add(g);
      }
    } catch {
      // upgrade_group-Spalte fehlt → kein Skip, kein Abbruch (Default-Verhalten).
    }
  }

  // Sets -> Einzelteile aufloesen (mit Upgrade-Gruppen-Konflikt-Filter).
  let newItems = rawSelection;
  if (rawSelection.length > 0) {
    const expandedResolved = await resolveAccessoryItems(
      supabase,
      rawSelection,
      skipUpgradeGroups.size > 0 ? { skipUpgradeGroups } : undefined,
    );
    const expMap = new Map<string, number>();
    for (const r of expandedResolved) {
      if (!r.accessory_id) continue;
      expMap.set(r.accessory_id, Math.min(99, (expMap.get(r.accessory_id) ?? 0) + (r.qty || 0)));
    }
    newItems = [...expMap.entries()].map(([accessory_id, qty]) => ({ accessory_id, qty })).slice(0, 50);
  }

  const oldItemsArr: { accessory_id: string; qty: number }[] =
    Array.isArray(input.currentItems) && input.currentItems.length > 0
      ? input.currentItems
      : (Array.isArray(input.currentAccessories) ? input.currentAccessories : []).map((a) => ({ accessory_id: a, qty: 1 }));

  const oldUnitIds: string[] = Array.isArray(input.currentUnitIds)
    ? input.currentUnitIds.filter(Boolean)
    : [];

  let unitAcc: { id: string; accessory_id: string }[] = [];
  if (oldUnitIds.length > 0) {
    const { data: ua } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', oldUnitIds);
    unitAcc = (ua ?? []) as { id: string; accessory_id: string }[];
  }
  const unitsByAcc = new Map<string, string[]>();
  for (const u of unitAcc) {
    const arr = unitsByAcc.get(u.accessory_id) ?? [];
    arr.push(u.id);
    unitsByAcc.set(u.accessory_id, arr);
  }
  const resolvableOld = new Set(unitAcc.map((u) => u.id));

  const oldExpanded = new Map<string, number>();
  try {
    const resolvedOld = await resolveAccessoryItems(supabase, oldItemsArr);
    for (const r of resolvedOld) {
      if (!r.accessory_id) continue;
      oldExpanded.set(r.accessory_id, (oldExpanded.get(r.accessory_id) ?? 0) + (r.qty || 0));
    }
  } catch (e) {
    console.error('[booking-accessory-apply] resolve old composition failed:', e);
  }

  // Verfuegbarkeit HART pruefen — nur fuer den ECHTEN Zuwachs gegenueber der
  // bereits gebuchten (expandierten) Komposition. Diese Buchung wird aus der
  // Zaehlung ausgeschlossen. In-process (kein HTTP-Self-Fetch).
  if (newItems.length > 0) {
    const dm = deliveryMode || 'versand';
    const availMap = new Map<string, { name: string; remaining: number }>();
    try {
      const avail = await computeAccessoryAvailability({
        from: String(rentalFrom),
        to: String(rentalTo),
        productId: productId ? String(productId) : null,
        deliveryMode: dm,
        excludeBookingId: bookingId,
      });
      for (const a of avail.accessories) {
        availMap.set(a.id, { name: a.name, remaining: a.available_qty_remaining });
      }
    } catch (e) {
      console.error('[booking-accessory-apply] availability check failed:', e);
      return { ok: false, status: 503, error: 'Verfügbarkeit konnte nicht geprüft werden. Bitte erneut versuchen.' };
    }
    const blocked: string[] = [];
    for (const [accId, wantQty] of directExpanded) {
      const requiredDelta = wantQty - (oldExpanded.get(accId) ?? 0);
      if (requiredDelta <= 0) continue;
      const av = availMap.get(accId);
      if (av && av.remaining < requiredDelta) {
        blocked.push(`${av.name} (benötigt ${requiredDelta}, frei ${av.remaining})`);
      }
    }
    if (blocked.length > 0) {
      return {
        ok: false,
        status: 409,
        error: `Im Mietzeitraum nicht genug freie Exemplare: ${blocked.join(', ')}. Änderung wurde NICHT gespeichert.`,
      };
    }
  }

  // Mutation der Unit-Zuordnung — Units behalten bis neue Menge, echten
  // Fehlbestand neu zuweisen, Ueberzaehliges freigeben.
  const newQtyMap = new Map(newItems.map((i) => [i.accessory_id, i.qty]));
  const allAccIds = new Set<string>([...unitsByAcc.keys(), ...newItems.map((i) => i.accessory_id)]);

  const keptUnitIds: string[] = [];
  const releaseUnitIds: string[] = [];
  const deltaItems: { accessory_id: string; qty: number }[] = [];
  for (const accId of allAccIds) {
    const existing = unitsByAcc.get(accId) ?? [];
    const want = newQtyMap.get(accId) ?? 0;
    const keep = existing.slice(0, want);
    keptUnitIds.push(...keep);
    releaseUnitIds.push(...existing.slice(keep.length));
    const baseline = Math.max(keep.length, oldExpanded.get(accId) ?? 0);
    const assignQty = Math.max(0, want - baseline);
    if (assignQty > 0) deltaItems.push({ accessory_id: accId, qty: assignQty });
  }
  for (const uid of oldUnitIds) {
    if (!resolvableOld.has(uid)) releaseUnitIds.push(uid);
  }

  const assignRes = deltaItems.length > 0
    ? await assignAccessoryUnitsToBooking(bookingId, deltaItems, String(rentalFrom), String(rentalTo))
    : { assigned: {} as Record<string, string[]>, missing: [] as string[] };

  const missingDirect = assignRes.missing.filter((mid) => directExpanded.has(mid));
  if (missingDirect.length > 0) {
    const fresh = Object.values(assignRes.assigned).flat();
    if (fresh.length > 0) {
      try { await releaseAccessoryUnitsFromBooking(bookingId, fresh); } catch { /* best-effort */ }
    }
    await supabase.from('bookings').update({ accessory_unit_ids: oldUnitIds }).eq('id', bookingId);
    const { data: missAcc } = await supabase
      .from('accessories')
      .select('id, name')
      .in('id', missingDirect);
    const nameMap = new Map((missAcc ?? []).map((a) => [a.id as string, a.name as string]));
    const missNames = missingDirect.map((mid) => nameMap.get(mid) ?? mid);
    return {
      ok: false,
      status: 409,
      error: `Im Mietzeitraum nicht genug freie Exemplare: ${missNames.join(', ')}. Änderung wurde NICHT gespeichert.`,
    };
  }
  const freshUnitIds = Object.values(assignRes.assigned).flat();
  const finalUnitIds = [...keptUnitIds, ...freshUnitIds];

  if (releaseUnitIds.length > 0) {
    try {
      await releaseAccessoryUnitsFromBooking(bookingId, releaseUnitIds);
    } catch (e) {
      console.error('[booking-accessory-apply] release surplus units failed:', e);
    }
  }

  return {
    ok: true,
    newItems,
    accessories: [...new Set(newItems.map((i) => i.accessory_id))],
    accessory_unit_ids: finalUnitIds,
    oldItems: oldItemsArr,
  };
}
