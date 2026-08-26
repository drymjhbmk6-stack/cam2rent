import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { logAudit } from '@/lib/audit';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { dispatchCompletionEmail } from '@/lib/booking-completion-email';
import { deductConsumablesForBooking } from '@/lib/verbrauch-deduct';
import { resolveAccessoryItems } from '@/lib/booking-accessory-apply';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { createAdminNotification } from '@/lib/admin-notifications';
import { sendReturnFollowUpRequest } from '@/lib/email';
import { createSale } from '@/lib/verkauf';
import {
  sanitizeOpenItems,
  persistOpenItems,
  splitAccessoryUnitIds,
  totalReplacementValue,
  type OpenItemInput,
} from '@/lib/return-open-items';

/**
 * POST /api/admin/return-booking
 * Schließt eine Buchung nach Rückgabe ab:
 * 1. Status → 'completed', setzt returned_at + return_condition + return_notes
 * 2. Kamera-Lagerbestand in admin_config erhöhen (+1)
 * 3. Zubehör-Lagerbestand in accessories-Tabelle erhöhen (+qty)
 *
 * Nicht zurückgegebene Positionen (`openItems`) werden dabei ausgenommen:
 * ihr Bestand wird NICHT hochgezählt, ihre Exemplare NICHT freigegeben.
 *   'replace'   → Exemplar auf 'lost', optional Rechnung + Zahlungslink
 *                 (Wiederbeschaffungswert) per createSale()
 *   'follow_up' → Exemplar bleibt 'rented' (nicht neu vermietbar), Kunde
 *                 bekommt eine Nachsende-Erinnerung mit Frist
 * Die Buchung wird trotzdem abgeschlossen — nur so wird die Kamera im
 * Kalender wieder frei. Die offenen Positionen leben in
 * `booking_return_open_items`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      bookingId: string;
      condition: 'gut' | 'gebrauchsspuren' | 'beschaedigt';
      notes?: string;
      checklist?: {
        kameraVollstaendig: boolean;
        zubehoerVollstaendig: boolean;
        keineSichtbarenSchaeden: boolean;
        speicherkarteZurueckgesetzt: boolean;
        akkuGeladen: boolean;
      };
      // Liste der konkret abgehakten Item-Slot-Keys (Kamera + Zubehoer-
      // Stuecke). Wird zusammen mit der Checkliste in den Notizen archiviert,
      // damit der Stand der Vollstaendigkeitspruefung nachvollziehbar bleibt.
      checkedItems?: string[];
      createDamageReport?: boolean;
      damageDescription?: string;
      /** Nicht zurückgegebene Positionen inkl. Entscheidung des Admins. */
      openItems?: unknown;
      /** Rechnung + Stripe-Zahlungslink für die 'replace'-Positionen senden. */
      chargeReplacement?: boolean;
      /** Kunden an die 'follow_up'-Positionen erinnern. */
      notifyCustomer?: boolean;
    };

    const {
      bookingId, condition, notes, checklist, checkedItems, createDamageReport, damageDescription,
      chargeReplacement, notifyCustomer,
    } = body;
    if (!bookingId) return NextResponse.json({ error: 'bookingId fehlt.' }, { status: 400 });

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, product_id, product_name, cameras, accessories, accessory_items, accessory_unit_ids, unit_id, status, user_id, customer_name, customer_email')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    if (booking.status === 'completed') {
      return NextResponse.json({ error: 'Buchung bereits abgeschlossen.' }, { status: 400 });
    }

    // ── 0. Nicht zurückgegebene Positionen auswerten ────────────────────────
    // Mengen werden serverseitig gegen den echten Buchungsinhalt gedeckelt —
    // ein manipulierter Client kann keine Fantasie-Mengen als "fehlend" melden.
    const rawAccItems: { accessory_id: string; qty: number }[] =
      Array.isArray(booking.accessory_items)
        ? (booking.accessory_items as { accessory_id?: string; qty?: number }[])
            .filter((it) => it && typeof it.accessory_id === 'string')
            .map((it) => ({ accessory_id: it.accessory_id as string, qty: Math.max(1, Number(it.qty) || 1) }))
        : (Array.isArray(booking.accessories)
            ? (booking.accessories as string[]).filter(Boolean).map((id) => ({ accessory_id: id, qty: 1 }))
            : []);

    const openItemCaps = new Map<string, number>();
    try {
      const resolvedForCaps = await resolveAccessoryItems(supabase, rawAccItems);
      for (const it of resolvedForCaps) {
        // Set-Container haben keine eigene accessory_id-Menge — die Sub-Items
        // zählen. Mehrfach-Vorkommen derselben ID werden summiert.
        openItemCaps.set(`accessory:${it.id}`, (openItemCaps.get(`accessory:${it.id}`) ?? 0) + it.qty);
      }
    } catch {
      // Ohne Caps greift nur der harte Mengendeckel in sanitizeOpenItems.
    }
    for (const cam of resolveBookingCameras(booking)) {
      const key = `camera:${(cam.product_name ?? '').trim().toLowerCase()}`;
      openItemCaps.set(key, (openItemCaps.get(key) ?? 0) + 1);
    }

    const openItems: OpenItemInput[] = sanitizeOpenItems(body.openItems, openItemCaps);
    const hasOpenItems = openItems.length > 0;

    // Betroffene Exemplare den offenen Positionen zuordnen; der Rest wird
    // später regulär freigegeben.
    const bookingUnitIds: string[] = Array.isArray(booking.accessory_unit_ids)
      ? (booking.accessory_unit_ids as string[]).filter(Boolean)
      : [];
    const unitToAccessory = new Map<string, string>();
    if (hasOpenItems && bookingUnitIds.length > 0) {
      const { data: unitRows } = await supabase
        .from('accessory_units')
        .select('id, accessory_id')
        .in('id', bookingUnitIds);
      for (const u of unitRows ?? []) unitToAccessory.set(u.id as string, u.accessory_id as string);
    }
    const { perItem: unitIdsByItem, releasable: releasableUnitIds } = hasOpenItems
      ? splitAccessoryUnitIds(openItems, bookingUnitIds, unitToAccessory)
      : { perItem: [] as string[][], releasable: bookingUnitIds };

    // Offene Mengen pro Zubehör / Kamera-Modell — damit der Lagerbestand
    // unten NICHT um Stücke hochgezählt wird, die gar nicht da sind.
    const openAccQty = new Map<string, number>();
    const openCameraQty = new Map<string, number>();
    for (const it of openItems) {
      if (it.kind === 'accessory' && it.accessoryId) {
        openAccQty.set(it.accessoryId, (openAccQty.get(it.accessoryId) ?? 0) + it.qty);
      } else if (it.kind === 'camera') {
        const key = it.label.trim().toLowerCase();
        openCameraQty.set(key, (openCameraQty.get(key) ?? 0) + it.qty);
      }
    }

    // 1. Buchung abschließen
    const newStatus = condition === 'beschaedigt' ? 'damaged' : 'completed';
    // Notizen + Checkliste + abgehakte Items in einem strukturierten Block
    // archivieren — der Admin sieht in der Buchungsdetail-Seite spaeter
    // welche physischen Stuecke abgehakt wurden und welche Pauschalpunkte
    // erfuellt waren.
    const auditPayload: Record<string, unknown> = {};
    if (checklist) auditPayload.checklist = checklist;
    if (Array.isArray(checkedItems) && checkedItems.length > 0) auditPayload.checkedItems = checkedItems;
    const auditStr = Object.keys(auditPayload).length > 0 ? JSON.stringify(auditPayload) : null;
    const finalNotes = notes
      ? (auditStr ? `${notes}\n\nRückgabe-Prüfung: ${auditStr}` : notes)
      : (auditStr ? `Rückgabe-Prüfung: ${auditStr}` : null);

    const returnedAt = new Date().toISOString();
    const baseUpdate: Record<string, unknown> = {
      status: newStatus,
      returned_at: returnedAt,
      return_condition: condition,
      return_notes: finalNotes,
    };

    const { error: updateErr } = await supabase
      .from('bookings')
      .update(baseUpdate)
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    // Ist-Zeitpunkt der Rueckgabe fuer die Ist-Logistik im Kalender. Eigener,
    // idempotenter Claim: `.is(..., null)` sorgt dafuer, dass ein bereits vom
    // Sendcloud-Cron erfasster (frueherer, genauerer) Paket-Eingang NICHT
    // ueberschrieben wird. Bei Abholung ist das hier die einzige Quelle.
    // Best-effort — fehlt die Migration, schlaegt es still fehl.
    await supabase
      .from('bookings')
      .update({ actual_return_at: returnedAt, actual_return_source: 'return_check' })
      .eq('id', bookingId)
      .is('actual_return_at', null)
      .then(undefined, () => undefined);

    // 1a.1 Zubehoer-Exemplare nur bei "completed" zurueck auf 'available' setzen.
    // Bei 'damaged' bleibt der Status auf 'rented' -- der Admin muss einzeln im
    // Schadensmodul (Phase 3) entscheiden, welches Exemplar als 'damaged' bzw.
    // 'lost' markiert wird.
    if (newStatus === 'completed') {
      // Nur die tatsaechlich zurueckgekommenen Exemplare freigeben. Stuecke,
      // die als 'replace'/'follow_up' offen sind, bleiben blockiert — sonst
      // wuerden sie sofort wieder vermietbar, obwohl sie beim Kunden liegen.
      releaseAccessoryUnitsFromBooking(bookingId, releasableUnitIds)
        .catch((err) => console.error('[return-booking] accessory-unit release failed:', err));
      // Verbrauchsmaterial mit Rückgabe-Trigger abziehen (z.B. Klebepad je
      // zurückgegebener Halterung) — fire-and-forget, idempotent pro Buchung.
      deductConsumablesForBooking(supabase, bookingId, 'return').catch(() => {});
      // Abschluss-Bestätigung an den Kunden ("alles in Ordnung" + Kundenmaterial),
      // non-blocking. Dedup im Helper → keine Doppel-Mail bei mehreren Pfaden.
      // Bei offenen Positionen bewusst UNTERDRÜCKT — der Kunde bekaeme sonst
      // "alles in Ordnung" und "bitte nachsenden" gleichzeitig.
      if (!hasOpenItems) {
        dispatchCompletionEmail(supabase, bookingId)
          .catch((err) => console.error('[return-booking] completion email failed:', err));
      }
    }

    // 1b. Bei Beschädigung: automatisch Schadensmeldung erstellen
    if (condition === 'beschaedigt' && createDamageReport) {
      await supabase
        .from('damage_reports')
        .insert({
          booking_id: bookingId,
          reported_by: 'admin',
          description: damageDescription || 'Schaden bei Rückgabe-Prüfung festgestellt.',
          photos: [],
          status: 'open',
        });
    }

    // 2. Kamera-Lagerbestand erhöhen — pro Kamera-Modell so oft wie die
    // Buchung Kameras dieses Modells enthält (Multi-Kamera / gemischte
    // Modelle). Legacy/cameras=NULL → Resolver liefert eine Kamera = +1.
    // Nicht zurueckgegebene Kameras werden dabei uebersprungen (pro Modell so
    // oft, wie sie als offen gemeldet wurden) — sonst waere der Bestand zu hoch.
    const remainingOpenCameras = new Map(openCameraQty);
    const returnedByProduct = new Map<string, number>();
    for (const cam of resolveBookingCameras(booking)) {
      const key = (cam.product_name ?? '').trim().toLowerCase();
      const stillOpen = remainingOpenCameras.get(key) ?? 0;
      if (stillOpen > 0) {
        remainingOpenCameras.set(key, stillOpen - 1);
        continue;
      }
      const pid = cam.product_id ?? (booking.product_id as string | null);
      if (!pid) continue;
      returnedByProduct.set(pid, (returnedByProduct.get(pid) ?? 0) + 1);
    }
    if (returnedByProduct.size > 0) {
      const { data: configRow } = await supabase
        .from('admin_config')
        .select('value')
        .eq('key', 'products')
        .maybeSingle();

      if (configRow?.value && typeof configRow.value === 'object') {
        const products = configRow.value as Record<string, { stock: number }>;
        let touched = false;
        for (const [pid, n] of returnedByProduct) {
          if (products[pid]) {
            products[pid].stock = (products[pid].stock ?? 0) + n;
            touched = true;
          }
        }
        if (touched) {
          await supabase
            .from('admin_config')
            .update({ value: products, updated_at: new Date().toISOString() })
            .eq('key', 'products');
        }
      }
    }

    // 3. Zubehör-Lagerbestand erhöhen
    const accIds: string[] = Array.isArray(booking.accessories) ? booking.accessories : [];
    if (accIds.length > 0) {
      // Jedes Zubehör einzeln um 1 erhöhen (qty ist nicht in bookings gespeichert).
      // Als offen gemeldete Stuecke werden dabei uebersprungen — sie sind ja
      // nicht wieder da.
      const remainingOpenAcc = new Map(openAccQty);
      for (const accId of accIds) {
        const stillOpen = remainingOpenAcc.get(accId) ?? 0;
        if (stillOpen > 0) {
          remainingOpenAcc.set(accId, stillOpen - 1);
          continue;
        }
        const { data: acc } = await supabase
          .from('accessories')
          .select('available_qty')
          .eq('id', accId)
          .maybeSingle();

        if (acc) {
          await supabase
            .from('accessories')
            .update({ available_qty: (acc.available_qty ?? 0) + 1 })
            .eq('id', accId);
        }
      }
    }

    // ── 4. Offene Positionen persistieren + abwickeln ───────────────────────
    const warnings: string[] = [];
    let openItemsSaved = 0;
    let saleBookingId: string | null = null;

    if (hasOpenItems) {
      const { rows: openRows, migrationPending } = await persistOpenItems(
        supabase, bookingId, openItems, unitIdsByItem,
      );
      openItemsSaved = openRows.length;
      if (migrationPending) warnings.push('migration_pending');

      // 4a. 'replace' → Exemplare endgültig ausbuchen (nicht mehr vermietbar).
      const replaceUnitIds = openItems.flatMap((it, i) =>
        it.resolution === 'replace' ? (unitIdsByItem[i] ?? []) : []);
      if (replaceUnitIds.length > 0) {
        const { error: lostErr } = await supabase
          .from('accessory_units')
          .update({ status: 'lost' })
          .in('id', replaceUnitIds)
          .eq('status', 'rented');
        if (lostErr) console.error('[return-booking] accessory-unit lost failed:', lostErr);
        // Bestand nachziehen, damit available_qty die verlorenen Stücke nicht
        // mehr enthält.
        const touchedAccIds = new Set(replaceUnitIds.map((uid) => unitToAccessory.get(uid)).filter(Boolean) as string[]);
        for (const accId of touchedAccIds) {
          await syncAccessoryQty(supabase, accId).catch(() => {});
        }
      }

      // 4b. 'replace' + Kamera → das physische Exemplar verlässt die Flotte.
      //     Best-effort: `product_units` kennt kein 'lost', 'retired' ist die
      //     passende Endstufe.
      const cameraReplaced = openItems.some((it) => it.kind === 'camera' && it.resolution === 'replace');
      if (cameraReplaced && booking.unit_id) {
        // `product_units` kennt kein `retirement_reason` — der Grund steht in
        // den Buchungsnotizen und in `booking_return_open_items`.
        await supabase
          .from('product_units')
          .update({ status: 'retired' })
          .eq('id', booking.unit_id)
          .neq('status', 'retired')
          .then(undefined, () => undefined);
      }

      // 4c. Ersatzforderung: Rechnung + Stripe-Zahlungslink per E-Mail.
      const replaceItems = openItems.filter((it) => it.resolution === 'replace' && (it.unitValue ?? 0) > 0);
      const customerEmail = String(booking.customer_email ?? '').trim();
      if (chargeReplacement && replaceItems.length > 0) {
        if (!customerEmail) {
          warnings.push('no_customer_email');
        } else {
          try {
            const sale = await createSale({
              customerName: String(booking.customer_name ?? '').trim() || 'Kunde',
              customerEmail,
              userId: (booking.user_id as string | null) ?? null,
              sourceBookingId: bookingId,
              items: replaceItems.map((it) => ({
                name: `Ersatz: ${it.label}`,
                qty: it.qty,
                unit_price: it.unitValue ?? 0,
              })),
            });
            if (sale.success && sale.bookingId) {
              saleBookingId = sale.bookingId;
              await supabase
                .from('booking_return_open_items')
                .update({ sale_booking_id: sale.bookingId })
                .eq('booking_id', bookingId)
                .eq('resolution', 'replace')
                .eq('status', 'open')
                .then(undefined, () => undefined);
            } else {
              warnings.push('sale_failed');
              console.error('[return-booking] createSale failed:', sale.error);
            }
          } catch (e) {
            warnings.push('sale_failed');
            console.error('[return-booking] createSale threw:', e);
          }
        }
      }
      if (warnings.includes('sale_failed')) {
        // Der Admin muss die Forderung manuell stellen — sichtbar machen.
        createAdminNotification(supabase, {
          type: 'payment_failed',
          title: 'Ersatzforderung konnte nicht erstellt werden',
          message: `Buchung ${bookingId}: ${totalReplacementValue(openItems).toFixed(2)} € Ersatz — Rechnung bitte manuell über /admin/verkauf stellen.`,
          link: `/admin/buchungen/${bookingId}`,
        }).catch(() => {});
      }

      // 4d. Nachsende-Erinnerung an den Kunden.
      const followUps = openItems.filter((it) => it.resolution === 'follow_up');
      if (notifyCustomer && followUps.length > 0 && customerEmail) {
        const dueDates = followUps.map((it) => it.dueDate).filter(Boolean) as string[];
        sendReturnFollowUpRequest({
          bookingId,
          customerName: String(booking.customer_name ?? '').trim() || 'Kunde',
          customerEmail,
          items: followUps.map((it) => ({ label: it.label, qty: it.qty })),
          dueDate: dueDates.length > 0 ? dueDates.sort()[dueDates.length - 1] : null,
        }).catch((err) => console.error('[return-booking] follow-up email failed:', err));
      }

      // 4e. EINE gebündelte Admin-Notification (kein Spam pro Position).
      const summary = openItems
        .map((it) => `${it.qty}× ${it.label} (${it.resolution === 'replace' ? 'Ersatz' : 'kommt nach'})`)
        .join(', ');
      createAdminNotification(supabase, {
        type: 'return_open_items',
        title: `Nicht zurückgegeben: ${openItems.length} Position(en)`,
        message: `Buchung ${bookingId} · ${summary}`,
        link: '/admin/retouren?tab=offen',
      }).catch(() => {});
    }

    await logAudit({
      action: 'booking.return',
      entityType: 'booking',
      entityId: bookingId,
      changes: {
        condition,
        new_status: newStatus,
        damage_report_created: !!(condition === 'beschaedigt' && createDamageReport),
        open_items: hasOpenItems ? {
          count: openItems.length,
          replace: openItems.filter((it) => it.resolution === 'replace').length,
          follow_up: openItems.filter((it) => it.resolution === 'follow_up').length,
          replacement_total: totalReplacementValue(openItems),
          sale_booking_id: saleBookingId,
        } : undefined,
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      openItemsSaved,
      saleBookingId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error('POST /api/admin/return-booking error:', err);
    return NextResponse.json({ error: 'Fehler beim Abschließen der Buchung.' }, { status: 500 });
  }
}
