import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import { sendShippingConfirmation } from '@/lib/email';
import { fetchParcelsByOrderNumber, type ParcelStatus } from '@/lib/sendcloud-tracking';
import { logAudit } from '@/lib/audit';
import { deductConsumablesForBooking } from '@/lib/verbrauch-deduct';
import { propagateShipmentStatus } from '@/lib/shipment-group';

/**
 * Automatische Versand-/Retoure-Statussteuerung via Sendcloud-Live-Status.
 *
 * Sendcloud trackt den Carrier-Lauf (DHL/DPD) der ueber uns gelabelten Pakete
 * ohnehin. Dieser Cron holt den Live-Status pro Buchung (`order_number =
 * booking.id`, deckt auch Panel-Retouren ab) und schaltet die Buchung selbst
 * weiter — statt dass der Admin "Als versendet markieren" / "Zugestellt" von
 * Hand klickt.
 *
 * HINVERSAND:
 *  - Buchung `confirmed`/`preparing_shipment` + Hinpaket erstmals in Bewegung
 *    (Sendcloud-Kategorie `transit` ODER `delivered` — also DHL hat es
 *    angenommen/gescannt, nicht nur `announced`/Label erstellt) → Status
 *    `shipped` + `shipped_at` + Versandbestaetigung an den Kunden (mit
 *    Trackinglink). Fehlende Tracking-Felder werden aus dem Parcel nachgetragen.
 *  - Buchung `shipped` + Hinpaket `delivered` → Status `delivered`
 *    (keine Kundenmail; interner Zwischenstatus vor der Retoure).
 *
 * RETOURE:
 *  - Retoure-Paket (Sendcloud `is_return`) `delivered` (= bei cam2rent
 *    eingetroffen) → EINE Admin-Notification "Retoure eingetroffen, bitte
 *    pruefen" (Link auf die Pruef-Seite). Der Status bleibt unveraendert und
 *    die Kaution reserviert — die physische Zustands-/Schadenspruefung laeuft
 *    bewusst weiter manuell ueber `/admin/retouren/[id]/pruefen`.
 *    Dedup ueber `bookings.return_arrived_at` (atomarer Claim).
 *
 * Idempotenz: Alle Statuswechsel laufen ueber einen atomaren Guard
 * (`.eq('status', vorher)` bzw. `.is('return_arrived_at', null)`) — mehrere
 * Cron-Laeufe/parallele Requests koennen nichts doppelt ausloesen.
 *
 * Setup in Hetzner-Crontab (alle 10 Min, --resolve umgeht Cloudflare — siehe
 * CLAUDE.md „Cloudflare-Vollintegration"):
 *   *\/10 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/sendcloud-status-sync
 *
 * Ohne die Migration `supabase-bookings-return-arrived.sql` laeuft die
 * Versand-Automatik trotzdem; nur der Retoure-Teil wird uebersprungen.
 */

export const maxDuration = 300;

// Wie viele Versand-Buchungen pro Lauf gegen Sendcloud abgeglichen werden.
const MAX_BOOKINGS = 80;

type BookingRow = {
  id: string;
  status: string;
  delivery_mode: string | null;
  customer_email: string | null;
  customer_name: string | null;
  product_name: string | null;
  rental_from: string | null;
  rental_to: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_carrier?: string | null;
  return_arrived_at?: string | null;
  actual_dispatch_at?: string | null;
  actual_delivery_at?: string | null;
  actual_return_at?: string | null;
};

function carrierFromCode(code: string | null | undefined): string | null {
  const c = (code || '').toLowerCase();
  if (c.includes('dhl')) return 'DHL';
  if (c.includes('dpd')) return 'DPD';
  return null;
}

/** Der aussagekraeftigste Outbound-Parcel: delivered > transit > erster. */
function pickBest(parcels: ParcelStatus[]): ParcelStatus | null {
  return (
    parcels.find((p) => p.category === 'delivered') ??
    parcels.find((p) => p.category === 'transit') ??
    parcels[0] ??
    null
  );
}

/**
 * Ist-Zeitpunkt der Abgabe. `date_updated` ist nur dann die Abgabezeit, wenn das
 * Paket noch unterwegs ist — bei einem bereits zugestellten Paket waere es die
 * Zustellzeit. Reihenfolge: transit-updated → announced → created → Erkennungszeit.
 */
function pickDispatchTs(
  outbound: ParcelStatus[],
  nowIso: string,
): { at: string; source: string } {
  const moving = outbound.find((p) => p.category === 'transit' && p.updatedAt);
  if (moving?.updatedAt) return { at: moving.updatedAt, source: 'sendcloud_updated' };

  const announced = outbound.find((p) => p.announcedAt)?.announcedAt;
  if (announced) return { at: announced, source: 'sendcloud_announced' };

  const created = outbound.find((p) => p.createdAt)?.createdAt;
  if (created) return { at: created, source: 'sendcloud_created' };

  return { at: nowIso, source: 'detected' };
}

/** Ist-Zeitpunkt der Zustellung (Hinversand beim Kunden bzw. Retoure bei uns). */
function pickDeliveredTs(
  parcels: ParcelStatus[],
  nowIso: string,
): { at: string; source: string } {
  const d = parcels.find((p) => p.category === 'delivered' && p.updatedAt);
  if (d?.updatedAt) return { at: d.updatedAt, source: 'sendcloud_updated' };
  return { at: nowIso, source: 'detected' };
}

const isMissingReturnCol = (msg?: string | null) =>
  /return_arrived_at/i.test(msg || '');
const isMissingActualsCol = (msg?: string | null) =>
  /actual_(dispatch|delivery|return)_(at|source)/i.test(msg || '');
const isMissingCarrierCol = (msg?: string | null) =>
  /tracking_carrier/i.test(msg || '');

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('sendcloud-status-sync');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const testMode = await isTestMode();
    const now = new Date().toISOString();

    // Versand-Buchungen, die noch "in Bewegung" sein koennen. completed/
    // returned/cancelled sind fertig und fallen raus.
    const activeStatuses = ['confirmed', 'preparing_shipment', 'shipped', 'delivered'];

    let hasReturnCol = true;
    let hasCarrierCol = true;
    let hasActualsCols = true;
    const buildCols = () =>
      [
        'id, status, delivery_mode, customer_email, customer_name, product_name, rental_from, rental_to, tracking_number, tracking_url',
        hasCarrierCol ? 'tracking_carrier' : null,
        hasReturnCol ? 'return_arrived_at' : null,
        hasActualsCols ? 'actual_dispatch_at, actual_delivery_at, actual_return_at' : null,
      ]
        .filter(Boolean)
        .join(', ');

    const loadBookings = (cols: string) =>
      supabase
        .from('bookings')
        .select(cols)
        .eq('is_test', testMode)
        .eq('delivery_mode', 'versand')
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(MAX_BOOKINGS);

    let { data: rows, error } = await loadBookings(buildCols());

    // Defensiv: eine der drei optionalen Migrationen fehlt. Pro Runde die
    // betroffene Spaltengruppe abschalten und erneut laden. Aus den Flags folgt
    // zugleich, welche Spalten die UPDATEs unten schreiben duerfen — Supabase
    // bricht auch bei UPDATE auf unbekannte Spalten hart ab.
    for (let attempt = 0; attempt < 3 && error; attempt++) {
      let changed = false;
      if (hasActualsCols && isMissingActualsCol(error.message)) {
        hasActualsCols = false;
        changed = true;
      }
      if (hasReturnCol && isMissingReturnCol(error.message)) {
        hasReturnCol = false;
        changed = true;
      }
      if (hasCarrierCol && isMissingCarrierCol(error.message)) {
        hasCarrierCol = false;
        changed = true;
      }
      if (!changed) break;
      ({ data: rows, error } = await loadBookings(buildCols()));
    }

    if (error) {
      return NextResponse.json({ error: 'DB-Fehler', detail: error.message }, { status: 500 });
    }

    const bookings = (rows ?? []) as unknown as BookingRow[];
    if (bookings.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, has_return_col: hasReturnCol });
    }

    const byOrder = await fetchParcelsByOrderNumber(bookings.map((b) => b.id));

    let shipped = 0;
    let delivered = 0;
    let returnArrived = 0;
    let dispatchSet = 0;
    let deliverySet = 0;
    let returnSet = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const b of bookings) {
      const parcels = byOrder.get(b.id) ?? [];
      if (parcels.length === 0) continue; // kein Sendcloud-Live-Status
      checked++;

      const outbound = parcels.filter((p) => !p.isReturn);
      const returns = parcels.filter((p) => p.isReturn);
      const outMoved = outbound.some((p) => p.category === 'transit' || p.category === 'delivered');
      const outDelivered = outbound.some((p) => p.category === 'delivered');
      const retDelivered = returns.some((p) => p.category === 'delivered');

      let curStatus = b.status;

      // ── Hinversand: confirmed/preparing_shipment → shipped ──────────
      if ((curStatus === 'confirmed' || curStatus === 'preparing_shipment') && outMoved) {
        const best = pickBest(outbound);
        const upd: Record<string, unknown> = { status: 'shipped', shipped_at: now };
        // Ist-Zeitpunkt der Abgabe reist im SELBEN atomaren Statement mit —
        // kein zusaetzlicher Roundtrip, kein neues Race.
        const dispatchTs =
          hasActualsCols && !b.actual_dispatch_at ? pickDispatchTs(outbound, now) : null;
        if (dispatchTs) {
          upd.actual_dispatch_at = dispatchTs.at;
          upd.actual_dispatch_source = dispatchTs.source;
        }
        // Tracking nachtragen, falls die Buchung noch keins hat (z.B. Etikett
        // direkt im Sendcloud-Panel erstellt) — damit die Mail den Link hat.
        if (!b.tracking_number && best?.trackingNumber) {
          upd.tracking_number = best.trackingNumber;
          upd.tracking_url = best.trackingUrl ?? null;
          if (hasCarrierCol && !b.tracking_carrier) {
            const c = carrierFromCode(best.carrier);
            if (c) upd.tracking_carrier = c;
          }
        }

        const claim = await supabase
          .from('bookings')
          .update(upd)
          .eq('id', b.id)
          .eq('status', curStatus)
          .select('id')
          .maybeSingle();

        if (!claim.error && claim.data) {
          const fromStatus = curStatus;
          curStatus = 'shipped';
          shipped++;

          // Verbrauchsmaterial-Auto-Abzug (fire-and-forget, idempotent).
          deductConsumablesForBooking(supabase, b.id).catch(() => {});

          if (dispatchTs) dispatchSet++;

          // Verknüpfte Bestellungen (gemeinsamer Versand) ziehen mit.
          // Bewusst ueber `propagateShipmentStatus` (hat Lieferart- + Rang-Guard)
          // statt `propagateShipmentFields` — letzteres wuerde einen eigenen,
          // frueheren Ist-Zeitstempel eines Geschwisters ueberschreiben.
          propagateShipmentStatus(supabase, b.id, 'shipped', {
            shipped_at: now,
            ...(dispatchTs
              ? {
                  actual_dispatch_at: dispatchTs.at,
                  actual_dispatch_source: dispatchTs.source,
                }
              : {}),
          }).catch(() => {});

          const trackingNumber = b.tracking_number || best?.trackingNumber || '';
          const trackingUrl = b.tracking_url || best?.trackingUrl || '';
          const carrier = b.tracking_carrier || carrierFromCode(best?.carrier) || '';
          if (b.customer_email) {
            sendShippingConfirmation({
              bookingId: b.id,
              customerName: b.customer_name ?? '',
              customerEmail: b.customer_email,
              productName: b.product_name ?? '',
              rentalFrom: b.rental_from ?? '',
              rentalTo: b.rental_to ?? '',
              trackingNumber,
              trackingUrl,
              carrier,
            }).catch((err) =>
              console.error('[sendcloud-status-sync] shipping email error:', err),
            );
          }
          await logAudit({
            action: 'booking.ship',
            entityType: 'booking',
            entityId: b.id,
            changes: { from: fromStatus, source: 'sendcloud_auto', tracking: !!trackingNumber },
            request: req,
          }).catch(() => {});
        }
      }

      // ── Hinversand: shipped → delivered ─────────────────────────────
      if (curStatus === 'shipped' && outDelivered) {
        const deliveryTs =
          hasActualsCols && !b.actual_delivery_at ? pickDeliveredTs(outbound, now) : null;
        const updDel: Record<string, unknown> = { status: 'delivered' };
        if (deliveryTs) {
          updDel.actual_delivery_at = deliveryTs.at;
          updDel.actual_delivery_source = deliveryTs.source;
        }

        const claim = await supabase
          .from('bookings')
          .update(updDel)
          .eq('id', b.id)
          .eq('status', 'shipped')
          .select('id')
          .maybeSingle();
        if (!claim.error && claim.data) {
          curStatus = 'delivered';
          delivered++;
          if (deliveryTs) deliverySet++;
          // Verknüpfte Bestellungen (gemeinsamer Versand) ziehen mit.
          propagateShipmentStatus(
            supabase,
            b.id,
            'delivered',
            deliveryTs
              ? {
                  actual_delivery_at: deliveryTs.at,
                  actual_delivery_source: deliveryTs.source,
                }
              : {},
          ).catch(() => {});
          await logAudit({
            action: 'booking.delivered',
            entityType: 'booking',
            entityId: b.id,
            changes: { source: 'sendcloud_auto' },
            request: req,
          }).catch(() => {});
        }
      }

      // ── Retoure: Rueckpaket bei cam2rent eingetroffen ───────────────
      if (hasReturnCol && retDelivered && !b.return_arrived_at) {
        const returnTs = pickDeliveredTs(returns, now);
        const updRet: Record<string, unknown> = { return_arrived_at: now };
        if (hasActualsCols) {
          updRet.actual_return_at = returnTs.at;
          updRet.actual_return_source = returnTs.source;
        }

        const claim = await supabase
          .from('bookings')
          .update(updRet)
          .eq('id', b.id)
          .is('return_arrived_at', null)
          .select('id')
          .maybeSingle();
        if (!claim.error && claim.data) {
          returnArrived++;
          if (hasActualsCols) returnSet++;
          try {
            await createAdminNotification(supabase, {
              type: 'return_arrived',
              title: '📦 Retoure eingetroffen',
              message: `Das Rückpaket zu ${(b.product_name as string) || 'der Kamera'} (${(b.customer_name as string) || 'Kunde'}) ist da — bitte Rückgabe prüfen.`,
              link: `/admin/retouren/${b.id}/pruefen`,
            });
          } catch (e) {
            errors.push(`return ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // ── Ist-Zeitstempel nachtragen ─────────────────────────────────────
      // Entkoppelt von den Statuswechseln, damit auch Buchungen erfasst werden,
      // die schon vor dem Deploy versendet oder manuell auf `shipped` gesetzt
      // wurden — dort greifen die Uebergaenge oben nicht mehr. Jeder Claim ist
      // ueber `.is(<spalte>, null)` idempotent: der erste erkannte Zeitpunkt
      // gewinnt, spaetere Laeufe ueberschreiben ihn nicht.
      if (hasActualsCols) {
        if (!b.actual_dispatch_at && outMoved && curStatus !== 'confirmed') {
          const ts = pickDispatchTs(outbound, now);
          const c = await supabase
            .from('bookings')
            .update({ actual_dispatch_at: ts.at, actual_dispatch_source: ts.source })
            .eq('id', b.id)
            .is('actual_dispatch_at', null)
            .select('id')
            .maybeSingle();
          if (!c.error && c.data) dispatchSet++;
        }

        if (!b.actual_delivery_at && outDelivered) {
          const ts = pickDeliveredTs(outbound, now);
          const c = await supabase
            .from('bookings')
            .update({ actual_delivery_at: ts.at, actual_delivery_source: ts.source })
            .eq('id', b.id)
            .is('actual_delivery_at', null)
            .select('id')
            .maybeSingle();
          if (!c.error && c.data) deliverySet++;
        }

        // Altbestand: `return_arrived_at` war die Erkennungszeit vor Einfuehrung
        // der Ist-Spalten. Uebernehmen, ohne die Notification erneut auszuloesen.
        if (hasReturnCol && b.return_arrived_at && !b.actual_return_at) {
          const c = await supabase
            .from('bookings')
            .update({
              actual_return_at: b.return_arrived_at,
              actual_return_source: 'legacy_detected',
            })
            .eq('id', b.id)
            .is('actual_return_at', null)
            .select('id')
            .maybeSingle();
          if (!c.error && c.data) returnSet++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checked,
      has_return_col: hasReturnCol,
      has_actuals_cols: hasActualsCols,
      summary: {
        shipped,
        delivered,
        return_arrived: returnArrived,
        dispatch_set: dispatchSet,
        delivery_set: deliverySet,
        return_set: returnSet,
        errors: errors.length,
      },
      errors: errors.slice(0, 20),
    });
  } finally {
    await releaseCronLock('sendcloud-status-sync');
  }
}

// Manche Cron-Setups schicken POST statt GET.
export const POST = GET;
