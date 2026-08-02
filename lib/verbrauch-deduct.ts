import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminNotification } from '@/lib/admin-notifications';
import { resolveAccessoryItems } from '@/lib/booking-accessory-apply';

/** Phase des Auto-Abzugs: bei Versand/Abholung oder bei Rückgabe. */
export type DeductPhase = 'shipment' | 'return';

interface ConsumableRow {
  id: string;
  name: string;
  bestand: number;
  deduct_qty: number;
  warn_threshold: number | null;
  low_stock_notified: boolean;
  deduct_trigger?: string | null;
  linked_accessory_id?: string | null;
}

/**
 * Zählt, wie oft ein bestimmtes Zubehör (`accessory_id`) in einer Buchung
 * steckt — inklusive Set-Auflösung (`resolveAccessoryItems` expandiert Sets in
 * Einzelteile). Liest die Buchungs-Zubehördaten selbst (`accessory_items`,
 * Fallback Legacy `accessories`). Defensiv → 0 bei jedem Fehler.
 */
async function countLinkedAccessories(
  supabase: SupabaseClient,
  bookingId: string,
  wantedIds: Set<string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const { data: b, error } = await supabase
      .from('bookings')
      .select('accessory_items, accessories')
      .eq('id', bookingId)
      .maybeSingle();
    if (error || !b) return counts;

    const raw: { accessory_id: string; qty: number }[] = [];
    const items = (b as { accessory_items?: unknown }).accessory_items;
    if (Array.isArray(items) && items.length > 0) {
      for (const it of items as Array<{ accessory_id?: string; qty?: number }>) {
        if (it && typeof it.accessory_id === 'string') {
          raw.push({ accessory_id: it.accessory_id, qty: Math.max(1, Number(it.qty) || 1) });
        }
      }
    } else {
      const legacy = (b as { accessories?: unknown }).accessories;
      if (Array.isArray(legacy)) {
        for (const id of legacy as unknown[]) {
          if (typeof id === 'string') raw.push({ accessory_id: id, qty: 1 });
        }
      }
    }
    if (raw.length === 0) return counts;

    const resolved = await resolveAccessoryItems(supabase, raw);
    for (const r of resolved) {
      if (r.accessory_id && wantedIds.has(r.accessory_id)) {
        counts.set(r.accessory_id, (counts.get(r.accessory_id) || 0) + (Number(r.qty) || 0));
      }
    }
  } catch (err) {
    console.error('[verbrauch-deduct] Zubehör-Zählung fehlgeschlagen:', err);
  }
  return counts;
}

/**
 * Auto-Abzug des Verbrauchsmaterials für eine Buchung.
 *
 * `phase` steuert, WANN abgezogen wird:
 *  - `'shipment'` (Default): bei `shipped`/`picked_up` — aus allen Versand-/
 *    Abhol-Status-Schreibern.
 *  - `'return'`: bei Rückgabe (Buchung `completed`) — aus den Retouren-Pfaden.
 *
 * Exakt EINMAL pro Buchung und Phase: ein atomarer Claim auf einen eigenen
 * Marker (`consumables_deducted_at` bzw. `consumables_returned_deducted_at`)
 * verhindert Doppelabzug über mehrere/wiederholte Status-Schreiber. Test-
 * Buchungen (`is_test = true`) werden ausgenommen.
 *
 * Verknüpfte Artikel (`linked_accessory_id`) werden nur abgezogen, wenn die
 * Buchung dieses Zubehör enthält, und **skaliert nach Stückzahl** (Set-Auflösung
 * inklusive). Unverknüpfte Artikel werden einmal pro Buchung abgezogen.
 *
 * Der Zähler wird bei 0 gefloored (nie negativ). Unterschreitet ein Artikel
 * seine `warn_threshold`, feuert einmalig eine `verbrauch_low_stock`-Admin-
 * Benachrichtigung.
 *
 * Vollständig defensiv: fehlt die Migration, ist die Funktion ein No-Op. Wirft
 * nie — sicher ohne try/catch aufrufbar.
 */
export async function deductConsumablesForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  phase: DeductPhase = 'shipment',
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const marker = phase === 'return' ? 'consumables_returned_deducted_at' : 'consumables_deducted_at';

    // 1. Atomarer Claim auf den phasen-eigenen Marker. Nur der Gewinner
    //    (Marker war NULL) zieht ab, und nur für Nicht-Test-Buchungen.
    const claim = await supabase
      .from('bookings')
      .update({ [marker]: now })
      .eq('id', bookingId)
      .is(marker, null)
      .or('is_test.is.null,is_test.eq.false')
      .select('id')
      .maybeSingle();

    if (claim.error) {
      // Migration fehlt / Spalte unbekannt → No-Op (kein Abzug, kein Fehler).
      if (/consumables_(returned_)?deducted_at|column|schema cache|PGRST/i.test(claim.error.message || '')) {
        return;
      }
      console.error('[verbrauch-deduct] Claim-Fehler:', claim.error.message);
      return;
    }
    if (!claim.data) return; // schon abgezogen / Test-Buchung / Race verloren.

    // 2. Alle Artikel mit Auto-Abzug laden (select('*') → neue Spalten fehlen
    //    nicht hart, falls die Migration noch nicht durch ist).
    const { data: allItems, error: loadErr } = await supabase
      .from('verbrauchsartikel')
      .select('*')
      .eq('auto_deduct', true);

    if (loadErr) {
      if (/verbrauchsartikel|relation|does not exist|schema cache|PGRST/i.test(loadErr.message || '')) {
        return;
      }
      console.error('[verbrauch-deduct] Laden fehlgeschlagen:', loadErr.message);
      return;
    }
    if (!allItems || allItems.length === 0) return;

    // 3. Auf diese Phase filtern (fehlendes deduct_trigger → 'shipment').
    const items = (allItems as ConsumableRow[]).filter((it) => {
      const t = it.deduct_trigger === 'return' ? 'return' : 'shipment';
      return t === phase;
    });
    if (items.length === 0) return;

    // 4. Für verknüpfte Artikel einmalig die Zubehör-Stückzahlen der Buchung
    //    ermitteln (nur wenn überhaupt ein verknüpfter Artikel dabei ist).
    const linkedIds = new Set(
      items.map((it) => (it.linked_accessory_id || '').trim()).filter((id) => id.length > 0),
    );
    const linkedCounts =
      linkedIds.size > 0 ? await countLinkedAccessories(supabase, bookingId, linkedIds) : new Map<string, number>();

    // 5. Pro Artikel abziehen (Floor bei 0), optional Nachschub-Warnung.
    for (const it of items) {
      const linkedId = (it.linked_accessory_id || '').trim();
      let abzug: number;
      if (linkedId) {
        const count = linkedCounts.get(linkedId) || 0;
        if (count <= 0) continue; // Zubehör nicht in dieser Buchung → kein Abzug.
        abzug = Math.max(1, Number(it.deduct_qty) || 1) * count;
      } else {
        abzug = Math.max(1, Number(it.deduct_qty) || 1);
      }

      const bestand = Number(it.bestand) || 0;
      const neu = Math.max(0, bestand - abzug);
      if (neu === bestand) continue; // schon 0 → nichts zu tun.

      const threshold = typeof it.warn_threshold === 'number' ? it.warn_threshold : null;
      const shouldWarn = threshold !== null && neu <= threshold && !it.low_stock_notified;

      const upd: Record<string, unknown> = { bestand: neu, updated_at: now };
      if (shouldWarn) upd.low_stock_notified = true;

      const { error: updErr } = await supabase
        .from('verbrauchsartikel')
        .update(upd)
        .eq('id', it.id);
      if (updErr) {
        console.error('[verbrauch-deduct] Update-Fehler:', it.id, updErr.message);
        continue;
      }

      if (shouldWarn) {
        await createAdminNotification(supabase, {
          type: 'verbrauch_low_stock',
          title: `Verbrauchsmaterial fast leer: ${it.name}`,
          message: `Nur noch ${neu} übrig (Mindestbestand ${threshold}). Bitte nachbestellen.`,
          link: '/admin/verbrauch',
        });
      }
    }
  } catch (err) {
    // Auto-Abzug darf niemals einen Status-Wechsel beeinträchtigen.
    console.error('[verbrauch-deduct] Unerwarteter Fehler:', err);
  }
}
