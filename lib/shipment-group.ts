import type { createServiceClient } from '@/lib/supabase';
import { deductConsumablesForBooking } from '@/lib/verbrauch-deduct';

type SB = ReturnType<typeof createServiceClient>;

/**
 * Verknüpfte Bestellungen — mehrere Buchungen desselben Kunden, die in EINEM
 * Paket verschickt werden ("Versand-Verbund", `bookings.shipment_group_id`).
 * Siehe supabase/supabase-bookings-shipment-group.sql.
 *
 * Wird eine Trackingnummer oder ein logistischer Status (preparing_shipment /
 * awaiting_pickup / shipped / delivered / picked_up) bei EINEM Mitglied
 * gesetzt, überträgt sich das automatisch auf die anderen Mitglieder — sie
 * "wandern" im Dashboard-Aufgaben-Widget gemeinsam weiter.
 *
 * Bewusst NICHT propagiert: cancelled/completed/damaged (eigene, pro Buchung
 * unterschiedliche Rechts-/Geld-Nebenwirkungen — Storno/Rückgabe-Prüfung
 * bleibt eine bewusste Einzel-Entscheidung pro Buchung) sowie
 * Versandbestätigungs-Mails (nur die direkt bearbeitete Buchung verschickt
 * ihre eigene Mail — sonst bekäme derselbe Kunde zwei E-Mails für ein Paket).
 */

// Rang der logistischen Zwischenschritte — Propagation geht nur "vorwärts"
// (kein Downgrade eines bereits weiter fortgeschrittenen Mitglieds). Nur hier
// gelistete Status gelten als Teil der Pipeline; ein Mitglied ohne Rang
// (pending_verification/awaiting_payment/cancelled/completed/damaged/…) wird
// NIE mitgezogen (siehe Guard in propagateShipmentStatus).
const STATUS_RANK: Record<string, number> = {
  confirmed: 0,
  preparing_shipment: 1,
  awaiting_pickup: 1,
  shipped: 2,
  picked_up: 2,
  delivered: 3,
};

const VERSAND_STATUSES = new Set(['preparing_shipment', 'shipped', 'delivered']);
const ABHOLUNG_STATUSES = new Set(['awaiting_pickup', 'picked_up']);
const SYNCABLE_STATUSES = new Set([...VERSAND_STATUSES, ...ABHOLUNG_STATUSES]);

export interface ShipmentGroupMember {
  id: string;
  status: string;
  customer_name: string | null;
  product_name: string | null;
  delivery_mode: string | null;
  rental_from: string | null;
  rental_to: string | null;
}

/**
 * Alle Buchungs-IDs im selben Versand-Verbund WIE `bookingId` (ohne sich
 * selbst). Leeres Array wenn nicht verknüpft oder Migration fehlt.
 */
export async function resolveShipmentGroupSiblingIds(
  supabase: SB,
  bookingId: string,
): Promise<string[]> {
  try {
    const { data: self } = await supabase
      .from('bookings')
      .select('shipment_group_id')
      .eq('id', bookingId)
      .maybeSingle();
    const gid = (self as { shipment_group_id?: string | null } | null)?.shipment_group_id;
    if (!gid) return [];
    const { data: rows } = await supabase
      .from('bookings')
      .select('id')
      .eq('shipment_group_id', gid)
      .neq('id', bookingId);
    return (rows ?? []).map((r) => (r as { id: string }).id);
  } catch {
    return [];
  }
}

/**
 * Volle Mitgliederliste (inkl. Anzeige-Feldern) des Versand-Verbunds von
 * `bookingId`, ohne sich selbst. Für die "Verknüpfte Bestellungen"-UI.
 */
export async function loadShipmentGroupSiblings(
  supabase: SB,
  bookingId: string,
): Promise<ShipmentGroupMember[]> {
  const ids = await resolveShipmentGroupSiblingIds(supabase, bookingId);
  if (ids.length === 0) return [];
  try {
    const { data } = await supabase
      .from('bookings')
      .select('id, status, customer_name, product_name, delivery_mode, rental_from, rental_to')
      .in('id', ids);
    return (data ?? []) as ShipmentGroupMember[];
  } catch {
    return [];
  }
}

/**
 * Überträgt Versandfelder (Trackingnummer/-URL/-Carrier, Retoure-Tracking,
 * Etikett-URLs) auf die restlichen Mitglieder des Versand-Verbunds. Nur
 * definierte (nicht-undefined) Felder werden geschrieben. Best-effort —
 * wirft nie, schlägt bei fehlender Migration/Spalte still fehl.
 */
export async function propagateShipmentFields(
  supabase: SB,
  bookingId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) clean[k] = v;
    }
    if (Object.keys(clean).length === 0) return;
    const siblingIds = await resolveShipmentGroupSiblingIds(supabase, bookingId);
    if (siblingIds.length === 0) return;
    await supabase.from('bookings').update(clean).in('id', siblingIds);
  } catch {
    // best-effort — Versandfelder sind kein kritischer Pfad.
  }
}

/**
 * Überträgt einen logistischen Statuswechsel (preparing_shipment /
 * awaiting_pickup / shipped / delivered / picked_up) auf die restlichen
 * Mitglieder des Versand-Verbunds — nur vorwärts, nur auf Mitglieder
 * derselben Lieferart (Versand↔Versand, Abholung↔Abholung), nie auf
 * Buchungen in einem terminalen Zustand (cancelled/completed/damaged/
 * returned). Zieht bei shipped/picked_up zusätzlich den
 * Verbrauchsmaterial-Auto-Abzug pro betroffener Buchung nach. Best-effort.
 */
export async function propagateShipmentStatus(
  supabase: SB,
  bookingId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!SYNCABLE_STATUSES.has(status)) return;
  const rank = STATUS_RANK[status];
  try {
    const siblingIds = await resolveShipmentGroupSiblingIds(supabase, bookingId);
    if (siblingIds.length === 0) return;
    const { data: siblings } = await supabase
      .from('bookings')
      .select('id, status, delivery_mode')
      .in('id', siblingIds);
    const isVersandStatus = VERSAND_STATUSES.has(status);
    for (const row of (siblings ?? []) as { id: string; status: string; delivery_mode: string | null }[]) {
      const sibIsVersand = (row.delivery_mode ?? 'versand') === 'versand';
      if (sibIsVersand !== isVersandStatus) continue; // Lieferart passt nicht
      // Nur Mitglieder, die selbst schon in der Versand-/Abhol-Pipeline
      // stehen (mind. 'confirmed'). Unbezahlte/unverifizierte Buchungen
      // (pending_verification/awaiting_payment) haben KEINEN Rang und werden
      // hier bewusst NICHT mitgezogen — sonst würde eine offene Zahlung
      // übersprungen.
      const curRank = STATUS_RANK[row.status];
      if (curRank === undefined) continue;
      if (curRank >= rank) continue; // kein Downgrade, keine Doppelbewegung
      const { data: updated } = await supabase
        .from('bookings')
        .update({ status, ...extra })
        .eq('id', row.id)
        .eq('status', row.status)
        .select('id')
        .maybeSingle();
      if (updated && (status === 'shipped' || status === 'picked_up')) {
        deductConsumablesForBooking(supabase, row.id).catch(() => {});
      }
    }
  } catch {
    // best-effort — Statuspropagierung darf den auslösenden Vorgang nie kippen.
  }
}
