import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import { sendShippingConfirmation } from '@/lib/email';
import { fetchParcelsByOrderNumber, type ParcelStatus } from '@/lib/sendcloud-tracking';
import { logAudit } from '@/lib/audit';

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

const isMissingReturnCol = (msg?: string | null) =>
  /return_arrived_at/i.test(msg || '');
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

    const baseCols =
      'id, status, delivery_mode, customer_email, customer_name, product_name, rental_from, rental_to, tracking_number, tracking_url, tracking_carrier, return_arrived_at';

    // Versand-Buchungen, die noch "in Bewegung" sein koennen. completed/
    // returned/cancelled sind fertig und fallen raus.
    const activeStatuses = ['confirmed', 'preparing_shipment', 'shipped', 'delivered'];

    let hasReturnCol = true;
    let hasCarrierCol = true;
    const loadBookings = (cols: string) =>
      supabase
        .from('bookings')
        .select(cols)
        .eq('is_test', testMode)
        .eq('delivery_mode', 'versand')
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(MAX_BOOKINGS);

    let { data: rows, error } = await loadBookings(baseCols);

    // Defensiv: return_arrived_at- und/oder tracking_carrier-Migration fehlt.
    if (error && (isMissingReturnCol(error.message) || isMissingCarrierCol(error.message))) {
      hasReturnCol = !isMissingReturnCol(error.message);
      hasCarrierCol = !isMissingCarrierCol(error.message);
      const cols = [
        'id, status, delivery_mode, customer_email, customer_name, product_name, rental_from, rental_to, tracking_number, tracking_url',
        hasCarrierCol ? 'tracking_carrier' : null,
        hasReturnCol ? 'return_arrived_at' : null,
      ]
        .filter(Boolean)
        .join(', ');
      ({ data: rows, error } = await loadBookings(cols));
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
        const claim = await supabase
          .from('bookings')
          .update({ status: 'delivered' })
          .eq('id', b.id)
          .eq('status', 'shipped')
          .select('id')
          .maybeSingle();
        if (!claim.error && claim.data) {
          curStatus = 'delivered';
          delivered++;
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
        const claim = await supabase
          .from('bookings')
          .update({ return_arrived_at: now })
          .eq('id', b.id)
          .is('return_arrived_at', null)
          .select('id')
          .maybeSingle();
        if (!claim.error && claim.data) {
          returnArrived++;
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
    }

    return NextResponse.json({
      ok: true,
      checked,
      has_return_col: hasReturnCol,
      summary: { shipped, delivered, return_arrived: returnArrived, errors: errors.length },
      errors: errors.slice(0, 20),
    });
  } finally {
    await releaseCronLock('sendcloud-status-sync');
  }
}

// Manche Cron-Setups schicken POST statt GET.
export const POST = GET;
