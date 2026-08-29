/**
 * Realisierter Umsatz EINER Buchung — die eine Wahrheitsquelle fuer EÜR,
 * DATEV, USt-Vorbereitung und Monatsabschluss.
 *
 * ── Warum es das gibt ──────────────────────────────────────────────────────
 * Vorher rekonstruierte jeder Report den Umsatz aus den Einzelposten
 * (`price_rental + price_accessories + price_haftung + shipping_price`) minus
 * den Rabatt-Spalten. Das geht nur auf, solange JEDER Nachlass in einem
 * Rabatt-Feld steht. Es gibt aber Schreibpfade, die `price_total` senken, ohne
 * die Differenz irgendwo abzulegen (manueller Gesamtpreis in der Bestell-
 * bearbeitung; Checkout, der weniger abbucht als das Frontend als Rabatt
 * meldet). Ergebnis: die EÜR buchte mehr Einnahme als tatsaechlich geflossen
 * ist — die Rechnung selbst weist die Luecke als "Set-Bundle / Anpassung" aus
 * (lib/invoice-pdf.tsx), die Reports ignorierten sie.
 *
 * Deshalb ist `price_total` (= der tatsaechlich kassierte Betrag) hier
 * massgeblich: die Einzelposten werden darauf normiert. Die Aufteilung auf
 * Miete / Zubehoer / Haftung / Versand bleibt erhalten (fuer die Kategorien
 * in der EÜR und die DATEV-Konten), stimmt in der Summe aber immer mit dem
 * Zahlungseingang ueberein.
 *
 * ── Zufluss-Prinzip (§ 11 EStG) ────────────────────────────────────────────
 * Nicht bezahlte Buchungen erzeugen keinen Umsatz: `awaiting_payment` /
 * `pending_verification` (wie bisher) UND zusaetzlich manuelle Rechnungen mit
 * offener Ueberweisung (`MANUAL-UNPAID-…`). Massgeblich ist — analog zum
 * Bezahlt-Haken im Dashboard — die `invoices`-Zeile; ohne sie greift der
 * Prefix-Fallback aus `lib/buchhaltung/store-invoice.ts`.
 *
 * ── Stornierte Buchungen ───────────────────────────────────────────────────
 * Wurden bisher komplett ausgeblendet — auch die einbehaltene Stornogebuehr
 * (bei < 3 Tagen 90 % des Mietpreises). Jetzt zaehlt der einbehaltene Betrag
 * (`price_total − refund_amount`) als Einnahme, ABER nur wenn der Storno
 * dokumentiert ist (`refund_note`/`refund_amount` gesetzt). Alt-Stornos ohne
 * Doku bleiben aussen vor — lieber zu wenig als eine erfundene Einnahme.
 */

export type BookingRevenueKind = 'normal' | 'cancelled_retained' | 'none';
export type BookingRevenueSkipReason = 'unpaid' | 'cancelled' | 'zero';

export interface BookingRevenueRow {
  price_rental?: number | null;
  price_accessories?: number | null;
  price_haftung?: number | null;
  shipping_price?: number | null;
  price_total?: number | null;
  discount_amount?: number | null;
  duration_discount?: number | null;
  loyalty_discount?: number | null;
  early_bird_discount?: number | null;
  special_discount?: number | null;
  refund_amount?: number | null;
  refund_note?: string | null;
  status?: string | null;
  payment_intent_id?: string | null;
}

export interface RevenueSplit {
  rental: number;
  accessories: number;
  haftung: number;
  shipping: number;
}

export interface BookingRevenue {
  /** true, wenn die Buchung ueberhaupt Umsatz erzeugt. */
  counts: boolean;
  kind: BookingRevenueKind;
  /** Nur gesetzt wenn counts=false. */
  skipReason?: BookingRevenueSkipReason;
  /** Listenpreise wie in der DB (vor Rabatt/Erstattung). */
  gross: RevenueSplit;
  /** Realisierter Umsatz je Kategorie (nach Rabatt, Normierung, Erstattung). */
  net: RevenueSplit;
  /** Abzug je Kategorie durch Rabatt + Normierung auf price_total. */
  discountCut: RevenueSplit;
  /** Abzug je Kategorie durch Rueckerstattung. */
  refundCut: RevenueSplit;
  discountTotal: number;
  refundTotal: number;
  /** Summe von `net` — bei kind='cancelled_retained' der Einbehalt. */
  total: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const emptySplit = (): RevenueSplit => ({ rental: 0, accessories: 0, haftung: 0, shipping: 0 });

const sumSplit = (s: RevenueSplit): number => r2(s.rental + s.accessories + s.haftung + s.shipping);

/**
 * Ist das Geld geflossen?
 *
 * `invoicePaid` kommt (falls vorhanden) aus der `invoices`-Zeile der Buchung —
 * das ist die Quelle, die auch "Als bezahlt markieren" pflegt. `mark-paid`
 * aendert `bookings.payment_intent_id` NICHT, ein bar bezahlter Manuell-Beleg
 * traegt also weiterhin `MANUAL-UNPAID-…`; ohne den invoices-Blick wuerde er
 * dauerhaft aus der EÜR fallen.
 */
export function isBookingPaid(
  row: Pick<BookingRevenueRow, 'payment_intent_id' | 'status'>,
  invoicePaid?: boolean | null,
): boolean {
  if (invoicePaid === true) return true;
  const status = (row.status ?? '').toString().toLowerCase();
  if (status === 'awaiting_payment' || status === 'pending_verification') return false;
  if (invoicePaid === false) return false;
  const pi = (row.payment_intent_id ?? '').toString();
  if (/^MANUAL-UNPAID/i.test(pi)) return false;
  if (/^PENDING-/i.test(pi)) return false;
  return true;
}

/** Zieht `amount` der Reihe nach von den Kategorien ab (Wasserfall). */
function applyWaterfall(
  net: RevenueSplit,
  cut: RevenueSplit,
  amount: number,
  order: Array<keyof RevenueSplit>,
): number {
  let left = r2(amount);
  for (const key of order) {
    if (left <= 0.0001) break;
    const available = net[key];
    if (available <= 0) continue;
    const take = Math.min(available, left);
    net[key] = r2(available - take);
    cut[key] = r2(cut[key] + take);
    left = r2(left - take);
  }
  return left;
}

export function computeBookingRevenue(
  row: BookingRevenueRow,
  opts?: { invoicePaid?: boolean | null; hasRefundColumn?: boolean },
): BookingRevenue {
  const gross: RevenueSplit = {
    rental: num(row.price_rental),
    accessories: num(row.price_accessories),
    haftung: num(row.price_haftung),
    shipping: num(row.shipping_price),
  };
  const status = (row.status ?? '').toString().toLowerCase();
  const priceTotalRaw = row.price_total;
  const priceTotal = num(priceTotalRaw);
  const hasPriceTotal =
    priceTotalRaw !== null && priceTotalRaw !== undefined && Number.isFinite(Number(priceTotalRaw));
  const refund = Math.max(0, num(row.refund_amount));

  const skip = (skipReason: BookingRevenueSkipReason): BookingRevenue => ({
    counts: false,
    kind: 'none',
    skipReason,
    gross,
    net: emptySplit(),
    discountCut: emptySplit(),
    refundCut: emptySplit(),
    discountTotal: 0,
    refundTotal: 0,
    total: 0,
  });

  if (!isBookingPaid(row, opts?.invoicePaid)) return skip('unpaid');

  // ── Storno: nur der dokumentierte Einbehalt zaehlt ────────────────────────
  if (status === 'cancelled') {
    const refundColumnAvailable = opts?.hasRefundColumn !== false;
    const noteSet = typeof row.refund_note === 'string' && row.refund_note.trim().length > 0;
    const documented = refundColumnAvailable && (noteSet || refund > 0);
    const retained = r2(Math.max(0, priceTotal - refund));
    if (!documented || retained <= 0) return skip('cancelled');
    return {
      counts: true,
      kind: 'cancelled_retained',
      gross,
      net: emptySplit(),
      discountCut: emptySplit(),
      refundCut: emptySplit(),
      discountTotal: 0,
      refundTotal: r2(refund),
      total: retained,
    };
  }

  // ── Normalfall ───────────────────────────────────────────────────────────
  const net: RevenueSplit = { ...gross };
  const discountCut = emptySplit();
  const refundCut = emptySplit();

  // 1) Explizite Rabatt-Felder — anteilig auf Miete + Zubehoer (Haftung und
  //    Versand werden typischerweise nicht rabattiert).
  const discountFields =
    Math.max(0, num(row.discount_amount)) +
    Math.max(0, num(row.duration_discount)) +
    Math.max(0, num(row.loyalty_discount)) +
    Math.max(0, num(row.early_bird_discount)) +
    Math.max(0, num(row.special_discount));
  const base = net.rental + net.accessories;
  if (discountFields > 0 && base > 0) {
    const rentalCut = Math.min(net.rental, r2(discountFields * (net.rental / base)));
    const accCut = Math.min(net.accessories, r2(discountFields * (net.accessories / base)));
    net.rental = r2(net.rental - rentalCut);
    net.accessories = r2(net.accessories - accCut);
    discountCut.rental = rentalCut;
    discountCut.accessories = accCut;
  }

  // 2) Normierung auf den tatsaechlich gezahlten Betrag. Alles, was die
  //    Rabatt-Felder nicht erklaeren (Set-Bundle, manuelle Preis-Anpassung,
  //    nicht persistierter Checkout-Nachlass), wird hier verrechnet.
  if (hasPriceTotal && priceTotal > 0) {
    const gap = r2(sumSplit(net) - priceTotal);
    if (gap > 0.005) {
      const cutBase = net.rental + net.accessories;
      const onItems = Math.min(gap, cutBase);
      if (onItems > 0 && cutBase > 0) {
        const rentalCut = Math.min(net.rental, r2(onItems * (net.rental / cutBase)));
        const accCut = Math.min(net.accessories, r2(onItems - rentalCut));
        net.rental = r2(net.rental - rentalCut);
        net.accessories = r2(net.accessories - accCut);
        discountCut.rental = r2(discountCut.rental + rentalCut);
        discountCut.accessories = r2(discountCut.accessories + accCut);
      }
      // Rest (z.B. Buchung besteht nur aus Haftung/Versand) nachziehen.
      applyWaterfall(net, discountCut, r2(gap - onItems), ['haftung', 'shipping', 'rental', 'accessories']);
    } else if (gap < -0.005) {
      // Aufpreis (manuelle Anpassung nach oben) — auf die Miete legen, damit
      // die Summe dem Zahlungseingang entspricht.
      net.rental = r2(net.rental - gap);
      discountCut.rental = r2(discountCut.rental + gap);
    }
  }

  // 3) Rueckerstattungen (Teilerstattung / Fehlbuchung) mindern das
  //    realisierte Einkommen — Wasserfall, damit keine Kategorie negativ wird.
  if (refund > 0) {
    applyWaterfall(net, refundCut, refund, ['rental', 'accessories', 'haftung', 'shipping']);
  }

  const total = sumSplit(net);
  return {
    counts: total > 0,
    kind: 'normal',
    ...(total > 0 ? {} : { skipReason: 'zero' as const }),
    gross,
    net,
    discountCut,
    refundCut,
    discountTotal: sumSplit(discountCut),
    refundTotal: sumSplit(refundCut),
    total,
  };
}

/**
 * Baut aus einer `invoices`-Liste die Map booking_id → "nachweislich bezahlt".
 *
 * Bewusst nur POSITIVE Signale: die Map enthaelt einen Eintrag genau dann, wenn
 * mindestens eine nicht stornierte Rechnung der Buchung als bezahlt gefuehrt
 * wird. Fehlt der Eintrag, entscheidet der Prefix-/Status-Fallback in
 * `isBookingPaid`.
 *
 * Warum kein "false": Eine Rechnung wird auch dann auf `cancelled` gesetzt,
 * wenn nur eine TEILgutschrift freigegeben wurde (siehe credit-notes/approve).
 * Wuerde die Map daraus "unbezahlt" ableiten, fiele die ganze Buchung aus der
 * EÜR — obwohl der groesste Teil des Geldes geflossen ist. Gleiches gilt fuer
 * `partially_paid`/`overdue`.
 */
export function buildInvoicePaidMap(
  rows: Array<{ booking_id?: string | null; status?: string | null; payment_status?: string | null }> | null | undefined,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const row of rows ?? []) {
    const id = row.booking_id;
    if (!id) continue;
    if (row.status === 'cancelled') continue;
    if (row.payment_status === 'paid' || row.status === 'paid') map.set(id, true);
  }
  return map;
}
