import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Rect,
  Circle,
  G,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro, isoToDE } from '@/lib/format-utils';
import type { InvoiceLine } from '@/lib/invoice-lines';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceData {
  bookingId: string;
  invoiceNumber?: string;
  invoiceDate: string;       // 'DD.MM.YYYY'
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  productName: string;
  rentalFrom: string;        // 'YYYY-MM-DD'
  rentalTo: string;          // 'YYYY-MM-DD'
  days: number;
  deliveryMode: string;
  shippingMethod?: string;
  haftung: string;
  accessories: string[];
  /** Optional: Zubehoer mit Stueckzahl (qty-aware). Wenn nicht gesetzt, wird
   *  accessories[] mit qty=1 pro Eintrag als Fallback verwendet. */
  accessoryItems?: { accessory_id: string; qty: number }[];
  /** Optional: Map accessory_id -> Name (vom Aufrufer resolvt, damit der
   *  PDF-Code keine ID-Slugs wie "akku-abc123" zeigt). */
  accessoryNames?: Record<string, string>;
  /** Kamera-Positionen mit Einzelpreis (Katalogpreis fuer die Mietdauer).
   *  Wenn gesetzt, wird daraus die Positionstabelle gebaut. */
  cameraLines?: InvoiceLine[];
  /** Zubehoer-Positionen mit Einzelpreis (Katalogpreis). Wenn gesetzt, wird
   *  daraus die Positionstabelle gebaut. */
  accessoryLines?: InvoiceLine[];
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  shippingPrice: number;
  /** Gesamt-Rabatt (Produkt-/Aktions-Rabatt + Gutschein + Mietdauer- + Loyalitaets-Rabatt).
   *  Wird als eigene Zeile vor dem Gesamtbetrag angezeigt. priceTotal ist bereits nach Abzug. */
  discountAmount?: number;
  /** Optional: Aufschluesselung des Rabatts in seine Komponenten. Wenn
   *  vorhanden, wird unter der Rabatt-Zeile ein kleiner Hinweistext angezeigt,
   *  damit der Kunde sieht, wie sich der Gesamt-Rabatt zusammensetzt. Ein
   *  evtl. verbleibender Differenz-Anteil (Set-Bundle / manuelle Anpassung)
   *  wird automatisch als "Set-Bundle"-Komponente ergaenzt. */
  couponDiscount?: number;     // Aktions-/Coupon-Rabatt (booking.discount_amount)
  durationDiscount?: number;   // Mietdauer-Rabatt (booking.duration_discount)
  loyaltyDiscount?: number;    // Stammkunden-Rabatt (booking.loyalty_discount)
  /** Optional: Gutschein-Code zur Beschriftung der Rabatt-Zeile */
  couponCode?: string;
  priceTotal: number;
  deposit: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
  qrCodeDataUrl?: string;
  paymentMethod?: string;
  stripePaymentId?: string;
  paymentStatus?: string;
  /** Versionsnummer der Rechnung. >= 2 => angepasste Fassung. Bei 1/undefined
   *  ganz normale Erst-Rechnung (Titel "Rechnung"). */
  adjustmentVersion?: number;
  /** Grund der Anpassung (z.B. "Zubehör geändert"). */
  adjustmentReason?: string;
  /** Datum der vorherigen Fassung (DD.MM.YYYY) — fuer den Ersetzt-Hinweis. */
  replacesDate?: string;
}

// ─── Colors (nur Schwarz/Weiß/Grau) ─────────────────────────────────────────

const C = {
  black: '#000000',
  dark: '#1a1a1a',
  grayMid: '#6b7280',
  grayLine: '#d1d5db',
  white: '#ffffff',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haftungLabel(h: string) {
  if (h === 'standard') return 'Standard-Haftungsschutz (pauschal)';
  if (h === 'premium') return 'Premium-Haftungsschutz (pauschal)';
  return null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const M = 50; // Seitenrand

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.dark,
    paddingTop: M,
    paddingBottom: 70,
    paddingHorizontal: M,
    width: '100%',
    height: '100%',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBrand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
    marginLeft: 8,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica',
    color: C.black,
  },
  headerInvoiceNr: {
    fontSize: 10,
    color: C.grayMid,
    marginTop: 2,
  },
  headerAdjustNote: {
    fontSize: 8,
    color: C.grayMid,
    marginTop: 3,
    maxWidth: 240,
  },
  headerLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayLine,
    marginBottom: 20,
    marginTop: 6,
  },

  // Address blocks
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  addressBlock: {
    width: '48%',
  },
  addressLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayMid,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  addressName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
    marginBottom: 2,
  },
  addressLine: {
    fontSize: 10,
    color: C.dark,
    lineHeight: 1.5,
  },

  // Meta (dreispaltig)
  metaRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 9,
    color: C.grayMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    color: C.black,
  },
  metaSub: {
    fontSize: 9,
    color: C.grayMid,
    marginTop: 1,
  },

  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.black,
    marginBottom: 0,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  tableLastLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayLine,
  },
  colPos: { width: 26, fontSize: 10 },
  colDesc: { flex: 1, fontSize: 10 },
  colDays: { width: 42, fontSize: 10, textAlign: 'center' },
  colUnit: { width: 72, fontSize: 10, textAlign: 'right' },
  colTotal: { width: 72, fontSize: 10, textAlign: 'right' },

  // Summen
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 3,
  },
  sumLabel: { fontSize: 10, color: C.grayMid, width: 120, textAlign: 'right', marginRight: 12 },
  sumValue: { fontSize: 10, color: C.black, width: 75, textAlign: 'right' },

  // Total
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 6,
  },
  totalLabel: {
    fontSize: 11,
    color: C.dark,
    width: 140,
    textAlign: 'right',
    marginRight: 12,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
    width: 75,
    textAlign: 'right',
  },

  // Divider
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayLine,
    marginVertical: 14,
  },

  // Footer
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
    paddingHorizontal: M,
  },
  footerLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayLine,
    marginBottom: 8,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: C.grayMid,
  },
});

// ─── PDF Document ────────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoiceData }) {
  const invoiceNumber = data.invoiceNumber ?? data.bookingId.replace(/^(C2R|BK)-/, 'RE-');

  // Positionen aufbauen
  interface LineItem {
    pos: number;
    description: string;
    subline?: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }

  const items: LineItem[] = [];
  let pos = 1;

  const daysLabel = `${data.days} ${data.days === 1 ? 'Tag' : 'Tage'}`;

  if (
    (data.cameraLines && data.cameraLines.length > 0) ||
    (data.accessoryLines && data.accessoryLines.length > 0)
  ) {
    // Neuer Pfad: echte Katalogpreise pro Position (Einzelpreis x Menge).
    for (const c of data.cameraLines ?? []) {
      items.push({
        pos: pos++,
        description: c.name,
        subline: `Kamera-Miete (${daysLabel})`,
        qty: c.qty,
        unitPrice: c.unitPrice,
        lineTotal: c.lineTotal,
      });
    }
    for (const a of data.accessoryLines ?? []) {
      items.push({
        pos: pos++,
        description: a.name,
        subline: 'Zubehör',
        qty: a.qty,
        unitPrice: a.unitPrice,
        lineTotal: a.lineTotal,
      });
    }
  } else {
    // Fallback (Altaufrufer ohne cameraLines/accessoryLines): grobe Aufteilung
    // wie frueher, damit nichts kaputtgeht.
    const cameras = data.productName.split(',').map((n) => n.trim()).filter(Boolean);
    const rentalPerCamera = cameras.length > 0 ? data.priceRental / cameras.length : data.priceRental;
    for (const cam of cameras) {
      items.push({
        pos: pos++,
        description: cam,
        subline: `Kamera-Miete (${daysLabel})`,
        qty: 1,
        unitPrice: rentalPerCamera,
        lineTotal: rentalPerCamera,
      });
    }
    const accItemsForInvoice: { accessory_id: string; qty: number }[] =
      data.accessoryItems && data.accessoryItems.length > 0
        ? data.accessoryItems
        : data.accessories.map((id) => ({ accessory_id: id, qty: 1 }));
    if (accItemsForInvoice.length > 0) {
      const totalUnits = accItemsForInvoice.reduce((s, i) => s + i.qty, 0);
      for (const item of accItemsForInvoice) {
        const resolvedName = data.accessoryNames?.[item.accessory_id]
          ?? item.accessory_id.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const lineTotal = data.priceAccessories > 0 && totalUnits > 0
          ? (data.priceAccessories * item.qty) / totalUnits
          : 0;
        items.push({
          pos: pos++,
          description: resolvedName,
          subline: 'Zubehör',
          qty: item.qty,
          unitPrice: item.qty > 0 ? lineTotal / item.qty : lineTotal,
          lineTotal,
        });
      }
    }
  }

  // Haftungsschutz + Versand sind KEINE Positionszeilen — sie erscheinen unten
  // im Summen-Block (nach Zwischensumme + Rabatt), damit der Kunde von oben
  // nach unten nachrechnen kann, wie der Gesamtbetrag zustande kommt.
  const hLabel = haftungLabel(data.haftung);

  // Steuerberechnung
  const isRegel = data.taxMode === 'regelbesteuerung';
  const taxRate = data.taxRate ?? 19;
  const netAmount = isRegel ? data.priceTotal / (1 + taxRate / 100) : data.priceTotal;
  const taxAmount = isRegel ? data.priceTotal - netAmount : 0;

  // ── Summen-Block (Reihenfolge: Zwischensumme -> Rabatt -> Haftung ->
  //    Versand -> Gesamtbetrag) ──
  // Zwischensumme = Summe aller Positionen zu Katalogpreisen (vor Rabatt).
  const zwischensumme = Math.round(items.reduce((sum, it) => sum + it.lineTotal, 0) * 100) / 100;
  const haftung = data.priceHaftung || 0;
  const versand = data.deliveryMode === 'abholung' ? 0 : (data.shippingPrice || 0);
  // Der Gesamtbetrag MUSS exakt dem bezahlten Betrag entsprechen. Der Rabatt
  // ergibt sich als Differenz, damit die Rechnung immer aufgeht (bei normalem
  // Gutschein = exakt der Coupon-Rabatt; bei Set-Bundle/manueller Anpassung
  // schluckt diese Zeile die Differenz).
  const reduktion = Math.round((zwischensumme + haftung + versand - data.priceTotal) * 100) / 100;
  const rabatt = reduktion > 0.005 ? reduktion : 0;
  const aufpreis = reduktion < -0.005 ? -reduktion : 0;

  // Rabatt-Prozent (gegen die Katalog-Zwischensumme), und Aufschluesselung in
  // Komponenten. Set-Bundle/Anpassung = Differenz zwischen Gesamt-Rabatt und
  // den explizit gespeicherten Rabatt-Komponenten (= "Rest", den der Bundle-
  // Preis automatisch erzeugt).
  const rabattProzent = zwischensumme > 0 ? Math.round((rabatt / zwischensumme) * 100) : 0;
  const couponPart = Math.max(0, Math.round((data.couponDiscount ?? 0) * 100) / 100);
  const durationPart = Math.max(0, Math.round((data.durationDiscount ?? 0) * 100) / 100);
  const loyaltyPart = Math.max(0, Math.round((data.loyaltyDiscount ?? 0) * 100) / 100);
  const explicitSum = Math.round((couponPart + durationPart + loyaltyPart) * 100) / 100;
  const bundlePart = Math.max(0, Math.round((rabatt - explicitSum) * 100) / 100);
  const rabattParts: { label: string; value: number }[] = [];
  if (couponPart > 0) {
    rabattParts.push({
      label: data.couponCode ? `Gutschein ${data.couponCode}` : 'Aktion / Gutschein',
      value: couponPart,
    });
  }
  if (durationPart > 0) rabattParts.push({ label: 'Mietdauer', value: durationPart });
  if (loyaltyPart > 0) rabattParts.push({ label: 'Stammkunde', value: loyaltyPart });
  if (bundlePart > 0.01) rabattParts.push({ label: 'Set-Bundle / Anpassung', value: bundlePart });

  const isUnpaid = data.paymentStatus === 'unpaid' || data.paymentMethod === 'Ausstehend';
  const verwendungszweck = `${invoiceNumber} ${data.customerName}`;

  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page} wrap>

        {/* ── Header ── */}
        <View style={s.headerRow}>
          <View style={s.headerBrandGroup}>
            <Svg width={34} height={22} viewBox="0 0 160 100">
              <G transform="translate(80, 50)">
                <Rect x={-40} y={-18} width={80} height={48} rx={6} fill={C.black} />
                <Rect x={-22} y={-26} width={20} height={10} rx={2} fill={C.black} />
                <Circle cx={0} cy={6} r={14} fill={C.white} />
                <Circle cx={0} cy={6} r={9} fill={C.black} />
                <Circle cx={26} cy={-10} r={2} fill={C.white} />
              </G>
            </Svg>
            <Text style={s.headerBrand}>cam2rent</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>
              {(data.adjustmentVersion ?? 1) >= 2 ? 'Rechnungsanpassung' : 'Rechnung'}
            </Text>
            <Text style={s.headerInvoiceNr}>{invoiceNumber}</Text>
            {(data.adjustmentVersion ?? 1) >= 2 && (
              <Text style={s.headerAdjustNote}>
                Anpassung Nr. {data.adjustmentVersion}
                {data.replacesDate ? ` · ersetzt die Fassung vom ${data.replacesDate}` : ' · ersetzt die vorherige Fassung'}
                {data.adjustmentReason ? `\nGrund: ${data.adjustmentReason}` : ''}
              </Text>
            )}
          </View>
        </View>
        <View style={s.headerLine} />

        {/* ── Adressen (zweispaltig) ── */}
        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Rechnungsempfänger</Text>
            <Text style={s.addressName}>{data.customerName || 'Kunde'}</Text>
            <Text style={s.addressLine}>
              {(() => {
                if (!data.customerAddress) return data.customerEmail || '';
                const parts = data.customerAddress.split(',').map((p) => p.trim());
                return parts.join('\n') + (data.customerEmail ? `\n${data.customerEmail}` : '');
              })()}
            </Text>
          </View>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Rechnungssteller</Text>
            <Text style={s.addressName}>{BUSINESS.name || 'cam2rent'}</Text>
            <Text style={s.addressLine}>
              {BUSINESS.owner}{'\n'}
              {BUSINESS.street}{'\n'}
              {BUSINESS.zip} {BUSINESS.city}{'\n'}
              {BUSINESS.email}{'\n'}
              {data.ustId ? `USt-IdNr.: ${data.ustId}` : BUSINESS.domain}
            </Text>
          </View>
        </View>

        {/* ── Meta-Daten (dreispaltig) ── */}
        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Rechnungsdatum</Text>
            <Text style={s.metaValue}>{data.invoiceDate}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Buchungsnummer</Text>
            <Text style={s.metaValue}>{data.bookingId}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Leistungszeitraum</Text>
            <Text style={s.metaValue}>{isoToDE(data.rentalFrom)} – {isoToDE(data.rentalTo)}</Text>
            <Text style={s.metaSub}>({data.days} {data.days === 1 ? 'Tag' : 'Tage'})</Text>
          </View>
        </View>

        {/* ── Positionstabelle ── */}
        <View style={s.tableHeaderRow}>
          <Text style={[s.tableHeaderText, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>Beschreibung</Text>
          <Text style={[s.tableHeaderText, s.colDays]}>Menge</Text>
          <Text style={[s.tableHeaderText, s.colUnit]}>Einzelpreis</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>Gesamt</Text>
        </View>

        {items.map((item, i) => (
          <View key={i} style={[s.tableRow, i === items.length - 1 ? s.tableLastLine : {}]} wrap={false}>
            <Text style={s.colPos}>{item.pos}</Text>
            <View style={s.colDesc}>
              <Text style={{ color: C.black }}>{item.description}</Text>
              {item.subline && (
                <Text style={{ fontSize: 9, color: C.grayMid, marginTop: 1 }}>{item.subline}</Text>
              )}
            </View>
            <Text style={s.colDays}>{item.qty}</Text>
            <Text style={[s.colUnit, item.unitPrice === 0 ? { color: C.grayMid } : { color: C.black }]}>
              {item.unitPrice > 0 ? fmtEuro(item.unitPrice) : '–'}
            </Text>
            <Text style={[s.colTotal, item.lineTotal === 0 ? { color: C.grayMid } : { color: C.black }]}>
              {item.lineTotal > 0 ? fmtEuro(item.lineTotal) : '–'}
            </Text>
          </View>
        ))}

        {/* ── Zusammenfassung: Zwischensumme -> Rabatt -> Haftungsschutz ->
            Versand -> Gesamtbetrag. So kann der Kunde von oben nach unten
            nachrechnen, wie der Endpreis zustande kommt. ── */}
        <View style={{ marginTop: 6 }}>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Zwischensumme:</Text>
            <Text style={s.sumValue}>{fmtEuro(zwischensumme)}</Text>
          </View>
          {rabatt > 0 && (
            <>
              <View style={s.sumRow}>
                <Text style={s.sumLabel}>
                  Rabatt{rabattProzent > 0 ? ` (${rabattProzent} %)` : ''}{data.couponCode ? ` (${data.couponCode})` : ''}:
                </Text>
                <Text style={s.sumValue}>-{fmtEuro(rabatt)}</Text>
              </View>
              {rabattParts.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -1, marginBottom: 2 }}>
                  <Text style={{ fontSize: 8, color: C.grayMid, width: 207, textAlign: 'right' }}>
                    {rabattParts.map((p) => `${p.label}: -${fmtEuro(p.value)}`).join('  ·  ')}
                  </Text>
                </View>
              )}
            </>
          )}
          {aufpreis > 0 && (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Anpassung:</Text>
              <Text style={s.sumValue}>+{fmtEuro(aufpreis)}</Text>
            </View>
          )}
          {hLabel && haftung > 0 && (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>{hLabel}:</Text>
              <Text style={s.sumValue}>{fmtEuro(haftung)}</Text>
            </View>
          )}
          {data.deliveryMode === 'abholung' ? (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Selbstabholung:</Text>
              <Text style={s.sumValue}>0,00 €</Text>
            </View>
          ) : versand > 0 ? (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>
                {data.shippingMethod === 'express' ? 'Express-Versand' : 'Standard-Versand'}:
              </Text>
              <Text style={s.sumValue}>{fmtEuro(versand)}</Text>
            </View>
          ) : (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Versand (kostenlos):</Text>
              <Text style={s.sumValue}>0,00 €</Text>
            </View>
          )}
        </View>

        {/* ── Summen ── */}
        {isRegel ? (
          <View style={{ marginTop: 6 }}>
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Nettobetrag:</Text>
              <Text style={s.sumValue}>{fmtEuro(netAmount)}</Text>
            </View>
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>MwSt. {taxRate}%:</Text>
              <Text style={s.sumValue}>{fmtEuro(taxAmount)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Gesamtbetrag (rechtsbündig, kein Balken) ── */}
        <View style={s.totalRow} wrap={false}>
          <Text style={s.totalLabel}>Gesamtbetrag{isRegel ? ' (brutto)' : ''}:</Text>
          <Text style={s.totalValue}>{fmtEuro(data.priceTotal)}</Text>
        </View>

        {data.deposit > 0 && (
          <Text style={{ fontSize: 8, color: C.grayMid, marginTop: 3, textAlign: 'right' }}>
            Kaution: {fmtEuro(data.deposit)} (wird nach Rückgabe freigegeben)
          </Text>
        )}

        {/* ── Steuer-Hinweis ── */}
        <Text style={{ fontSize: 9, color: C.grayMid, marginTop: 6 }}>
          {isRegel
            ? `${data.ustId ? `USt-IdNr.: ${data.ustId} · ` : ''}Alle Beträge verstehen sich inkl. ${taxRate}% MwSt.`
            : 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).'}
        </Text>

        <View style={s.divider} />

        {/* ── Zahlungsstatus ── */}
        {isUnpaid ? (
          <View wrap={false}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 4 }}>
              Zahlung ausstehend
            </Text>
            <Text style={{ fontSize: 10, color: C.dark, marginBottom: 12 }}>
              Bitte überweise den Gesamtbetrag auf das angegebene Konto.
            </Text>

            {/* Bankdaten (ohne Box) */}
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, color: C.grayMid, width: 130 }}>Kontoinhaber:</Text>
                <Text style={{ fontSize: 10, color: C.black }}>{BUSINESS.owner}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, color: C.grayMid, width: 130 }}>IBAN:</Text>
                <Text style={{ fontSize: 10, color: C.black, fontFamily: 'Courier' }}>{BUSINESS.ibanFormatted || BUSINESS.iban}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, color: C.grayMid, width: 130 }}>BIC:</Text>
                <Text style={{ fontSize: 10, color: C.black, fontFamily: 'Courier' }}>{BUSINESS.bic}</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 9, color: C.grayMid, width: 130 }}>Verwendungszweck:</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black }}>{verwendungszweck}</Text>
              </View>
            </View>

            {/* QR-Codes nebeneinander */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {data.qrCodeDataUrl && (
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                  <Image src={data.qrCodeDataUrl} style={{ width: 70, height: 70 }} />
                  <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 2 }}>
                      Banküberweisung
                    </Text>
                    <Text style={{ fontSize: 9, color: C.grayMid, lineHeight: 1.4 }}>
                      Scanne mit deiner{'\n'}Banking-App
                    </Text>
                  </View>
                </View>
              )}
              {BUSINESS.paypalMe && (
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=000000&bgcolor=ffffff&data=${encodeURIComponent(`${BUSINESS.paypalMe}/${data.priceTotal.toFixed(2)}`)}`}
                    style={{ width: 70, height: 70 }}
                  />
                  <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 2 }}>
                      PayPal
                    </Text>
                    <Text style={{ fontSize: 9, color: C.grayMid, lineHeight: 1.4 }}>
                      {BUSINESS.paypalMe.replace('https://', '')}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.black }}>
            Bezahlt
          </Text>
        )}

        {/* ── Footer ── */}
        <View style={s.footerBar} fixed>
          <View style={s.footerLine} />
          <View style={s.footerContent}>
            <Text style={s.footerText}>
              {BUSINESS.name || 'cam2rent'} · {BUSINESS.owner} · {BUSINESS.street} · {BUSINESS.zip} {BUSINESS.city}
            </Text>
            <Text style={s.footerText}>{BUSINESS.domain} · {BUSINESS.email}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
