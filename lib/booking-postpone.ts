/**
 * Buchung verlegen (Verlegung) — geteilte Kernlogik fuer Admin- und
 * Kunden-Endpoint.
 *
 * `applyPostponeDateMove` verschiebt eine Buchung auf einen neuen Termin
 * (reine Verschiebung: gleiche Mietdauer, gleicher Preis). Die
 * Ueberbuchungs-Pruefung ist identisch zur echten Buchung
 * (`findCameraOverbookingConflict` inkl. Puffer/Multi-Modell/Cart-Holds +
 * `applyAccessoryComposition` fuer Zubehoer/Sets). Der urspruengliche Termin
 * wird als `cancellation_anchor_date` eingefroren, damit die Verlegung das
 * kostenlose Storno-Fenster nicht neu oeffnet.
 *
 * Spiegelt bewusst den erprobten `booking_edit`-Zeitraum-Aenderungspfad aus
 * `app/api/admin/booking/[id]/route.ts` (Kamera-Skelett-Reset + Neuzuweisung,
 * delta-basierte Zubehoer-Anwendung).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { freezeAnchor, isoAddDays, computePostponeTo } from '@/lib/booking-postpone-utils';
import { findCameraOverbookingConflict } from '@/lib/camera-availability-check';
import { applyAccessoryComposition } from '@/lib/booking-accessory-apply';
import { assignCamerasToBooking } from '@/lib/camera-unit-assignment';
import {
  resolveBookingCameras,
  desiredFromBooking,
  buildCameraSkeleton,
  camerasToProductName,
} from '@/lib/booking-cameras';
import { snapshotInvoiceVersion } from '@/lib/invoice-versions';
import { createAdminNotification } from '@/lib/admin-notifications';

const PACK_RESET_FIELDS = {
  pack_status: null,
  pack_packed_by: null,
  pack_packed_by_user_id: null,
  pack_packed_at: null,
  pack_packed_signature: null,
  pack_packed_items: null,
  pack_packed_condition: null,
  pack_checked_by: null,
  pack_checked_by_user_id: null,
  pack_checked_at: null,
  pack_checked_signature: null,
  pack_checked_items: null,
  pack_checked_notes: null,
  pack_photo_url: null,
} as const;

// Reine Datums-/Anker-Helfer sind nach lib/booking-postpone-utils.ts
// ausgelagert (isoliert unit-testbar) und werden hier re-exportiert.
export { freezeAnchor, isoAddDays, computePostponeTo };

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

async function packResetFields(
  supabase: SupabaseClient,
  booking: { pack_status?: unknown; pack_photo_url?: unknown },
): Promise<Record<string, unknown>> {
  const ps = booking.pack_status;
  if (!ps || ps === 'checked') return {};
  if (booking.pack_photo_url) {
    await supabase.storage
      .from('packing-photos')
      .remove([booking.pack_photo_url as string])
      .catch(() => { /* best-effort */ });
  }
  return { ...PACK_RESET_FIELDS };
}

export type PostponeMoveResult =
  | { ok: true; newFrom: string; newTo: string; cameraMissing: number }
  | { ok: false; status: number; error: string };

/**
 * Verschiebt eine Buchung auf `newFrom` (Enddatum = newFrom + Mietdauer − 1),
 * prueft Verfuegbarkeit hart, weist Units fuer den neuen Zeitraum neu zu und
 * friert den Storno-Anker ein. Aendert Preis/Dauer/Komposition NICHT.
 *
 * Bei `booking.status === 'postponed'` wird der Status auf `confirmed`
 * zurueckgesetzt (Reaktivierung aus „auf unbestimmte Zeit"). Andere Status
 * bleiben unveraendert.
 */
export async function applyPostponeDateMove(
  supabase: SupabaseClient,
  opts: {
    booking: Record<string, unknown>;
    newFrom: string; // YYYY-MM-DD
    source: 'customer' | 'admin';
    excludeUserId?: string | null;
    request?: Request;
  },
): Promise<PostponeMoveResult> {
  const { booking } = opts;
  const id = booking.id as string;
  const days = Math.max(1, Math.floor(Number(booking.days) || 1));
  const oldFrom = String(booking.rental_from).slice(0, 10);
  const oldTo = String(booking.rental_to).slice(0, 10);
  const newFrom = opts.newFrom.slice(0, 10);
  const newTo = computePostponeTo(newFrom, days);
  const deliveryMode: 'versand' | 'abholung' =
    (booking.delivery_mode as string) === 'abholung' ? 'abholung' : 'versand';

  // 1. Kamera-Ueberbuchungs-Pruefung — identisch zur echten Buchung.
  const cams = resolveBookingCameras(booking);
  const wantByProduct = new Map<string, number>();
  for (const c of cams) {
    const pid = c.product_id ?? (booking.product_id as string | null);
    if (!pid) continue;
    wantByProduct.set(pid, (wantByProduct.get(pid) ?? 0) + 1);
  }
  for (const [pid, needed] of wantByProduct) {
    const conflict = await findCameraOverbookingConflict(supabase, {
      productId: pid,
      rentalFrom: newFrom,
      rentalTo: newTo,
      deliveryMode,
      excludeBookingId: id,
      excludeUserId: opts.excludeUserId ?? null,
      neededUnits: needed,
    });
    if (conflict) {
      return {
        ok: false,
        status: 409,
        error: `Im neuen Zeitraum nicht verfügbar (${conflict.productName}, ausgebucht am ${fmtDay(conflict.day)}). Bitte einen anderen Termin wählen.`,
      };
    }
  }

  // 2. Zubehoer/Set fuer den neuen Zeitraum anwenden (delta-basiert, exkl.
  //    dieser Buchung). Gleiche Komposition → delta 0, Units bleiben; die
  //    Verfuegbarkeit ist ueber die Kamera-Pruefung + das date-overlap-Modell
  //    abgedeckt (identisch zum booking_edit-Zeitraumwechsel).
  const rawItems: { accessory_id: string; qty: number }[] =
    Array.isArray(booking.accessory_items) && (booking.accessory_items as unknown[]).length > 0
      ? (booking.accessory_items as { accessory_id: string; qty: number }[])
      : Array.isArray(booking.accessories)
        ? (booking.accessories as string[]).map((a) => ({ accessory_id: a, qty: 1 }))
        : [];
  const applied = await applyAccessoryComposition({
    supabase,
    bookingId: id,
    rentalFrom: newFrom,
    rentalTo: newTo,
    productId: (booking.product_id as string) || null,
    deliveryMode,
    rawItems,
    currentItems: (booking.accessory_items as { accessory_id: string; qty: number }[] | null) ?? null,
    currentAccessories: (booking.accessories as string[] | null) ?? null,
    currentUnitIds: (booking.accessory_unit_ids as string[] | null) ?? null,
  });
  if (!applied.ok) {
    return { ok: false, status: applied.status, error: applied.error };
  }

  // 3. Storno-Anker — AGB § 15 Abs. 2 / Vertrag § 15 Abs. 2:
  //    Die Stornofristen richten sich nach dem URSPRÜNGLICH gebuchten
  //    Mietbeginn, AUCH nach einer Verlegung. Der Anker wird deshalb NIE auf
  //    den neuen Termin (newFrom) gesetzt, sondern bleibt der früheste je
  //    gesetzte Mietbeginn: MIN(bestehender Anker, alter rental_from). Eine
  //    Verlegung nach hinten öffnet das kostenlose Storno-Fenster damit nicht
  //    neu. rental_from/rental_to (unten in `upd`) ändern sich, der Anker nicht.
  const anchor = freezeAnchor(booking.cancellation_anchor_date as string | null, oldFrom);

  const upd: Record<string, unknown> = {
    rental_from: newFrom,
    rental_to: newTo,
    days,
    accessory_items: applied.newItems,
    accessories: applied.accessories,
    accessory_unit_ids: applied.accessory_unit_ids,
    cancellation_anchor_date: anchor,
    original_rental_from: (booking.original_rental_from as string | null) ?? oldFrom,
    original_rental_to: (booking.original_rental_to as string | null) ?? oldTo,
    postponed_at: new Date().toISOString(),
    // Indefinite-Marker leeren (Reaktivierung / echter Termin)
    postpone_reason: null,
    postpone_target_date: null,
    // Kamera-Skelett neu (unit_id=null erzwingt Neuzuweisung fuer neuen Zeitraum)
    product_name: camerasToProductName(cams) || (booking.product_name as string),
    unit_id: null,
    cameras: buildCameraSkeleton(desiredFromBooking(booking)),
  };
  // Reaktivierung aus „auf unbestimmte Zeit" → zurueck auf confirmed. Andere
  // Status bleiben unveraendert (kein versehentliches confirmed-Setzen).
  if (booking.status === 'postponed') upd.status = 'confirmed';
  // Kunden-Self-Verlegen zaehlt gegen das „einmal"-Limit; Admin nicht.
  if (opts.source === 'customer') {
    upd.postpone_count = (Number(booking.postpone_count) || 0) + 1;
  }
  Object.assign(upd, await packResetFields(supabase, booking));

  // Defensiver Strip fehlender Spalten (Migration ausstehend) — wie booking_edit.
  const updTry: Record<string, unknown> = { ...upd };
  let camerasColumnMissing = false;
  let upErr: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await supabase.from('bookings').update(updTry).eq('id', id);
    upErr = r.error;
    if (!upErr) break;
    const msg = upErr.message || '';
    const m = msg.match(/Could not find the '([^']+)' column/i);
    const col = m?.[1];
    if (col && col in updTry) {
      if (col === 'cameras') camerasColumnMissing = true;
      delete updTry[col];
      continue;
    }
    break;
  }
  if (upErr) {
    console.error('[postpone] update failed:', upErr);
    return {
      ok: false,
      status: 500,
      error: `Speichern fehlgeschlagen: ${upErr.message || upErr.code || 'unbekannter DB-Fehler'}`,
    };
  }

  // 4. Kamera-Units fuer den neuen Zeitraum neu zuweisen.
  let cameraMissing = 0;
  if (!camerasColumnMissing) {
    try {
      const camRes = await assignCamerasToBooking(id, desiredFromBooking(booking), newFrom, newTo);
      cameraMissing = camRes.missing.reduce((s, mm) => s + (mm.requested - mm.assigned), 0);
      if (cameraMissing > 0) {
        await createAdminNotification(supabase, {
          type: 'payment_failed',
          title: `Kamera-Zuweisung unvollständig (${id})`,
          message: `Nach Verlegung fehlen ${cameraMissing} Kamera-Einheit(en) — bitte manuell prüfen.`,
          link: `/admin/buchungen/${id}`,
        }).catch(() => { /* best-effort */ });
      }
    } catch (e) {
      console.error('[postpone] camera reassignment failed:', e);
    }
  }

  // 5. Rechnungsversion (Leistungszeitraum geaendert) — non-blocking.
  await snapshotInvoiceVersion(supabase, id, {
    reason: 'Verlegung — neuer Mietzeitraum',
    triggerSource: 'booking_edit',
    previousBooking: booking,
    request: opts.request,
  }).catch(() => { /* non-blocking */ });

  return { ok: true, newFrom, newTo, cameraMissing };
}

/**
 * Archiviert die aktuell signierte(n) Vertragsfassung(en) einer Buchung, bevor
 * fuer einen neuen Zeitraum neu unterschrieben wird — damit das Original als
 * Beweis erhalten bleibt. Kopiert das PDF im `contracts`-Bucket nach
 * `verlegt/{bookingId}/{signedAt}.pdf` und haengt Metadaten an
 * `bookings.contract_versions` an. Best-effort (wirft nie).
 */
export async function archiveContractVersion(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<void> {
  const id = booking.id as string;
  try {
    const { data: agreements } = await supabase
      .from('rental_agreements')
      .select('pdf_url, contract_hash, signed_at')
      .eq('booking_id', id);
    if (!agreements || agreements.length === 0) return;

    const existing = Array.isArray(booking.contract_versions)
      ? (booking.contract_versions as Record<string, unknown>[])
      : [];
    const added: Record<string, unknown>[] = [];

    for (const a of agreements) {
      const url = (a as { pdf_url?: string | null }).pdf_url;
      if (typeof url !== 'string' || !url.startsWith('contracts/')) continue;
      const srcPath = url.replace(/^contracts\//, '');
      const stamp = ((a as { signed_at?: string | null }).signed_at || new Date().toISOString())
        .replace(/[^0-9]/g, '')
        .slice(0, 14);
      const destPath = `verlegt/${id}/${stamp || 'v'}.pdf`;
      // Kopie best-effort (Storage.copy; faellt bei Fehler still aus).
      await supabase.storage.from('contracts').copy(srcPath, destPath).catch(() => {});
      added.push({
        path: `contracts/${destPath}`,
        period_from: (booking.rental_from as string | null) ?? null,
        period_to: (booking.rental_to as string | null) ?? null,
        signed_at: (a as { signed_at?: string | null }).signed_at ?? null,
        hash: (a as { contract_hash?: string | null }).contract_hash ?? null,
      });
    }

    if (added.length === 0) return;
    const next = [...existing, ...added];
    const r = await supabase.from('bookings').update({ contract_versions: next }).eq('id', id);
    if (r.error && /contract_versions|column/i.test(r.error.message || '')) {
      // Spalte fehlt (Migration ausstehend) → Archiv-Metadaten werden nicht
      // persistiert; die Storage-Kopie liegt trotzdem vor.
    }
  } catch (e) {
    console.error('[postpone] archiveContractVersion failed:', e);
  }
}
