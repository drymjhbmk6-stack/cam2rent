import { createServiceClient } from '@/lib/supabase';
import { ensureCameraMirrorsForProduct } from '@/lib/inventar-mirror';
import {
  buildCameraSkeleton,
  resolveBookingCameras,
  camerasToProductName,
  type BookingCamera,
  type DesiredCamera,
} from '@/lib/booking-cameras';

/**
 * Weist einer Buchung pro gewuenschter Kamera eine freie physische Einheit
 * zu — beliebig viele, auch gemischte Modelle.
 *
 * Pattern analog `lib/accessory-unit-assignment.ts`. Schreibt zuerst das
 * Kamera-Skelett in `bookings.cameras` (falls noch nicht vorhanden — bei
 * idempotenten Re-Sync-Aufrufen z.B. aus dem Stripe-Webhook bleibt ein
 * bereits gefuelltes Array erhalten), ruft dann pro product_id die race-
 * sichere RPC `assign_free_camera_units` auf (siehe
 * supabase/supabase-camera-unit-assignment.sql) und haelt zum Schluss die
 * Legacy-Spalten `unit_id` (= erste Kamera) + `product_name` synchron.
 *
 * Wirft NICHT bei einzelnen RPC-Fehlern — loggt und meldet `missing`.
 * Aufrufer rufen die Funktion non-blocking auf (wie bisher
 * assignUnitToBooking), damit der Buchungsflow auch bei Engpaessen
 * durchlaeuft (Fallback-Verhalten wie zuvor).
 */

export interface AssignCameraUnitsResult {
  /** product_id → zugewiesene unit-UUIDs */
  assigned: Record<string, string[]>;
  /** Produkte fuer die nicht genug freie Einheiten da waren */
  missing: { product_id: string; requested: number; assigned: number }[];
}

export async function assignCamerasToBooking(
  bookingId: string,
  desired: DesiredCamera[],
  rentalFrom: string,
  rentalTo: string,
): Promise<AssignCameraUnitsResult> {
  const result: AssignCameraUnitsResult = { assigned: {}, missing: [] };

  const cleaned = (desired || []).filter(
    (d) => (d.product_name && d.product_name.trim()) || d.product_id,
  );
  if (cleaned.length === 0) return result;

  const supabase = createServiceClient();

  // Bestehendes cameras-Array respektieren (idempotenter Re-Sync), sonst
  // Skelett aus der Wunschliste schreiben.
  const { data: existing } = await supabase
    .from('bookings')
    .select('cameras')
    .eq('id', bookingId)
    .single();

  let skeleton: BookingCamera[];
  const existingArr = existing?.cameras;
  if (Array.isArray(existingArr) && existingArr.length > 0) {
    skeleton = resolveBookingCameras({ cameras: existingArr });
  } else {
    skeleton = buildCameraSkeleton(cleaned);
    const { error: skelErr } = await supabase
      .from('bookings')
      .update({
        cameras: skeleton,
        product_name: camerasToProductName(skeleton),
      })
      .eq('id', bookingId);
    if (skelErr) {
      // Spalte fehlt (Migration noch nicht durch) → defensiv abbrechen,
      // Legacy-Einzelpfad uebernimmt beim Aufrufer.
      console.error(
        '[camera-unit-assignment] cameras-Skelett-Write fehlgeschlagen:',
        skelErr.message,
      );
      return result;
    }
  }

  // Pro distinct product_id wieviele Slots gewuenscht sind
  const wantByProduct = new Map<string, number>();
  for (const c of skeleton) {
    if (!c.product_id) continue;
    wantByProduct.set(c.product_id, (wantByProduct.get(c.product_id) ?? 0) + 1);
  }

  for (const productId of wantByProduct.keys()) {
    const { data, error } = await supabase.rpc('assign_free_camera_units', {
      p_product_id: productId,
      p_rental_from: rentalFrom,
      p_rental_to: rentalTo,
      p_booking_id: bookingId,
    });

    if (error) {
      console.error(
        `[camera-unit-assignment] RPC fehlgeschlagen fuer ${productId}:`,
        error.message,
      );
      // Kein missing.push hier — die finale cameras-Auswertung unten
      // erkennt unbefuellte Slots ohnehin (RPC-Fehler => Slot bleibt leer).
      continue;
    }

    const ids = Array.isArray(data) ? (data as string[]) : [];
    if (ids.length > 0) result.assigned[productId] = ids;
    // KEIN `ids.length < want`-Vergleich: `ids` zaehlt nur NEU vergebene
    // Einheiten. Slots mit bereits gesetzter unit_id (vorab via body.unit_id
    // bei manuellen Buchungen oder durch einen vorherigen idempotenten
    // Re-Sync-Aufruf, z.B. Stripe-Webhook) liefern korrekt `[]` zurueck —
    // das ist KEIN Fehlschlag. `missing` wird unten aus dem echten
    // Endzustand von `bookings.cameras` ermittelt.
  }

  // `missing` aus dem tatsaechlichen Endzustand: ein Slot gilt nur dann als
  // nicht zugewiesen, wenn er nach dem RPC-Lauf KEINE unit_id hat. Damit
  // verschwinden Fehlalarme bei vorab gesetzter Seriennummer / idempotentem
  // Re-Sync (Slot war schon gefuellt, RPC hatte nichts Neues zu tun).
  async function evaluateMissing(): Promise<{ product_id: string; requested: number; assigned: number }[]> {
    const { data: after } = await supabase
      .from('bookings')
      .select('cameras')
      .eq('id', bookingId)
      .single();
    const finalCams = resolveBookingCameras({ cameras: after?.cameras });

    // Legacy `unit_id` deterministisch = erste Kamera (cameras[0].unit_id)
    const firstUnit = finalCams[0]?.unit_id ?? null;
    if (firstUnit) {
      await supabase
        .from('bookings')
        .update({ unit_id: firstUnit })
        .eq('id', bookingId);
    }

    const wantFinal = new Map<string, number>();
    const filledFinal = new Map<string, number>();
    for (const c of finalCams) {
      if (!c.product_id) continue;
      wantFinal.set(c.product_id, (wantFinal.get(c.product_id) ?? 0) + 1);
      if (c.unit_id) filledFinal.set(c.product_id, (filledFinal.get(c.product_id) ?? 0) + 1);
    }
    const out: { product_id: string; requested: number; assigned: number }[] = [];
    for (const [pid, req] of wantFinal) {
      const got = filledFinal.get(pid) ?? 0;
      if (got < req) out.push({ product_id: pid, requested: req, assigned: got });
    }
    return out;
  }

  result.missing = await evaluateMissing();

  // Selbstheilung: blieb ein Slot leer, kann das daran liegen, dass die Kamera
  // NUR in der neuen Inventar-Welt (`inventar_units`) existiert und keinen
  // `product_units`-Spiegel hat — die RPC liest ausschliesslich die alte
  // Tabelle (siehe Kopfkommentar in lib/inventar-mirror.ts). Spiegel lazy
  // nachziehen und die RPC EINMAL wiederholen. Laeuft nur auf dem
  // Fehlschlag-Pfad; der Happy Path bleibt unveraendert.
  if (result.missing.length > 0) {
    let mirroredAny = false;
    for (const m of result.missing) {
      const n = await ensureCameraMirrorsForProduct(supabase, m.product_id);
      if (n > 0) mirroredAny = true;
    }

    if (mirroredAny) {
      for (const m of result.missing) {
        const { data, error } = await supabase.rpc('assign_free_camera_units', {
          p_product_id: m.product_id,
          p_rental_from: rentalFrom,
          p_rental_to: rentalTo,
          p_booking_id: bookingId,
        });
        if (error) {
          console.error(
            `[camera-unit-assignment] Retry-RPC fehlgeschlagen fuer ${m.product_id}:`,
            error.message,
          );
          continue;
        }
        const ids = Array.isArray(data) ? (data as string[]) : [];
        if (ids.length > 0) {
          result.assigned[m.product_id] = [
            ...(result.assigned[m.product_id] ?? []),
            ...ids,
          ];
        }
      }
      // Endzustand nach dem Retry neu bewerten (setzt auch unit_id nach).
      result.missing = await evaluateMissing();
    }
  }

  return result;
}
