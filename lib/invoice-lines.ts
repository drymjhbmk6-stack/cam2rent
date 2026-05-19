/**
 * Baut die Rechnungs-Positionen aus den ECHTEN Katalogpreisen.
 *
 * Hintergrund: Frueher hat das Rechnungs-PDF den (schon rabattierten)
 * Gesamt-Zubehoerbetrag proportional auf die Zeilen verteilt — das ergab
 * sinnlose Einzelpreise (Stativ 7,90 EUR wurde als 2,23 EUR gezeigt).
 *
 * Diese Funktion ist die einzige Quelle der Wahrheit fuer die Positionszeilen:
 *   - Kamera-Preis = booking.price_rental / Anzahl Kameras (Katalog-Mietsumme
 *     ist bereits pro Buchung gespeichert, vor Rabatt).
 *   - Zubehoer-Preis = verifyAccessoryPrice() — laedt pro accessory_id den
 *     echten Preis aus DB mit derselben Logik wie der Checkout
 *     (flat → price, sonst price * Tage).
 *
 * Wiederverwendet von /api/invoice/[bookingId], /api/admin/booking/[id]/
 * send-email und lib/email.ts, damit ueberall die gleiche Rechnung entsteht.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAccessoryItems } from '@/lib/booking-accessories';
import { verifyAccessoryPrice } from '@/lib/booking/verify-accessory-price';

export interface InvoiceLine {
  /** Anzeigename der Position. */
  name: string;
  /** Stueckzahl. */
  qty: number;
  /** Preis pro Stueck (fuer die Mietdauer, Katalogpreis, vor Rabatt). */
  unitPrice: number;
  /** unitPrice * qty. */
  lineTotal: number;
}

/** Minimal-Shape der Buchungs-Row, die wir hier brauchen. */
interface BookingForLines {
  product_name?: string | null;
  price_rental?: number | null;
  price_accessories?: number | null;
  days?: number | null;
  accessory_items?: unknown;
  accessories?: unknown;
}

export async function computeInvoiceLines(
  supabase: SupabaseClient,
  booking: BookingForLines,
): Promise<{ cameraLines: InvoiceLine[]; accessoryLines: InvoiceLine[] }> {
  const days = Math.max(1, booking.days ?? 1);

  // ── Kameras ──────────────────────────────────────────────────────────────
  // product_name ist kommagetrennt (z.B. "OSMO Action 5 Pro , OSMO Action 5 Pro").
  // price_rental ist die Katalog-Mietsumme aller Kameras (vor Rabatt).
  const cameraNames = (booking.product_name ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  const cameraLines: InvoiceLine[] = [];
  if (cameraNames.length > 0) {
    const priceRental = Number(booking.price_rental ?? 0);
    const totalCameras = cameraNames.length;
    const unitPrice = totalCameras > 0
      ? Math.round((priceRental / totalCameras) * 100) / 100
      : 0;

    // Gleiche Modellnamen zu einer Zeile zusammenfassen (Menge hochzaehlen).
    const grouped = new Map<string, number>();
    for (const name of cameraNames) {
      grouped.set(name, (grouped.get(name) ?? 0) + 1);
    }
    for (const [name, qty] of grouped) {
      cameraLines.push({
        name,
        qty,
        unitPrice,
        lineTotal: Math.round(unitPrice * qty * 100) / 100,
      });
    }
  }

  // ── Zubehoer ─────────────────────────────────────────────────────────────
  const accItems = normalizeAccessoryItems(
    booking.accessory_items,
    booking.accessories,
  );
  const accessoryLines: InvoiceLine[] = [];
  if (accItems.length > 0) {
    const check = await verifyAccessoryPrice(supabase, {
      items: accItems,
      days,
      reportedTotal: Number(booking.price_accessories ?? 0),
    });
    for (const d of check.details) {
      accessoryLines.push({
        name: d.name,
        qty: d.qty,
        unitPrice: d.unit_price,
        lineTotal: d.line_total,
      });
    }
    // IDs, die weder in accessories noch in sets gefunden wurden: als Zeile
    // mit 0 EUR aufnehmen, damit sie nicht still verschwinden.
    for (const id of check.unknownIds) {
      accessoryLines.push({
        name: id
          .replace(/-[a-z0-9]{6,}$/, '')
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        qty: 1,
        unitPrice: 0,
        lineTotal: 0,
      });
    }
  }

  return { cameraLines, accessoryLines };
}
