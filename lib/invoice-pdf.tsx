import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro, isoToDE } from '@/lib/format-utils';

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
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  shippingPrice: number;
  priceTotal: number;
  deposit: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
  qrCodeDataUrl?: string;
  paymentMethod?: string;
  stripePaymentId?: string;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy: '#0f172a',
  cyan: '#06b6d4',
  white: '#ffffff',
  grayText: '#64748b',
  grayLight: '#f1f5f9',
  border: '#e2e8f0',
  black: '#0a0a0a',
  success: '#16a34a',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haftungLabel(h: string) {
  if (h === 'standard') return 'Standard-Haftungsschutz (pauschal)';
  if (h === 'premium') return 'Premium-Haftungsschutz (pauschal)';
  return null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.black,
    paddingBottom: 70,
  },

  // Header Bar
  headerBar: {
    backgroundColor: C.navy,
    paddingVertical: 20,
    paddingHorizontal: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  headerBrand: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 0.5,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  headerInvoiceNr: {
    fontSize: 11,
    color: C.cyan,
    marginTop: 2,
  },

  // Content wrapper
  content: {
    paddingHorizontal: 48,
  },

  // Address blocks
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  addressBlock: {
    width: '48%',
  },
  addressLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  addressName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
    marginBottom: 2,
  },
  addressLine: {
    fontSize: 9,
    color: C.grayText,
    lineHeight: 1.5,
  },

  // Rental period bar
  periodBar: {
    backgroundColor: C.grayLight,
    borderRadius: 4,
    padding: '8 14',
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  periodLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  periodValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
  },

  // Meta info
  metaRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  metaLabel: {
    width: 120,
    fontSize: 9,
    color: C.grayText,
  },
  metaValue: {
    fontSize: 10,
    color: C.black,
  },

  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginVertical: 16,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    padding: '8 12',
    borderRadius: 4,
    marginBottom: 1,
  },
  tableHeaderText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '7 12',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: {
    backgroundColor: C.grayLight,
  },
  colPos: { width: 30, fontSize: 10 },
  colDesc: { flex: 1, fontSize: 10 },
  colDays: { width: 45, fontSize: 10, textAlign: 'center' },
  colTotal: { width: 75, fontSize: 10, textAlign: 'right' },

  // Summen
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: '5 12',
  },
  sumLabel: { fontSize: 10, color: C.grayText, width: 120, textAlign: 'right', marginRight: 12 },
  sumValue: { fontSize: 10, color: C.black, width: 75, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    borderRadius: 4,
    padding: '10 12',
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    width: 140,
    textAlign: 'right',
    marginRight: 12,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    width: 75,
    textAlign: 'right',
  },

  // Payment + Notes
  noteBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: C.grayLight,
    borderRadius: 4,
  },
  noteText: {
    fontSize: 9,
    color: C.grayText,
    lineHeight: 1.6,
  },

  // Footer
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerLine: {
    height: 3,
    backgroundColor: C.cyan,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 8,
    color: C.grayText,
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
    qty: string;
    total: number;
  }

  const items: LineItem[] = [];
  let pos = 1;

  // Kameras (können kommagetrennt sein)
  const cameras = data.productName.split(',').map((n) => n.trim());
  const rentalPerCamera = cameras.length > 1 ? data.priceRental / cameras.length : data.priceRental;

  for (const cam of cameras) {
    items.push({
      pos: pos++,
      description: cam,
      subline: `Kamera-Miete (${data.days} ${data.days === 1 ? 'Tag' : 'Tage'})`,
      qty: String(data.days),
      total: rentalPerCamera,
    });
  }

  // Zubehör — einzeln auflisten
  if (data.accessories.length > 0) {
    for (const accId of data.accessories) {
      const name = accId.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      items.push({
        pos: pos++,
        description: name,
        subline: 'Zubehör',
        qty: '1',
        total: data.priceAccessories > 0 && data.accessories.length > 0
          ? data.priceAccessories / data.accessories.length
          : 0,
      });
    }
  }

  // Haftungsschutz
  const hLabel = haftungLabel(data.haftung);
  if (hLabel && data.priceHaftung > 0) {
    items.push({
      pos: pos++,
      description: hLabel,
      qty: '1',
      total: data.priceHaftung,
    });
  }

  // Versand
  if (data.shippingPrice > 0) {
    items.push({
      pos: pos++,
      description: data.shippingMethod === 'express' ? 'Express-Versand' : 'Standard-Versand',
      subline: 'Hin- und Rücksendung',
      qty: '1',
      total: data.shippingPrice,
    });
  }

  // Steuerberechnung
  const isRegel = data.taxMode === 'regelbesteuerung';
  const taxRate = data.taxRate ?? 19;
  const netAmount = isRegel ? data.priceTotal / (1 + taxRate / 100) : data.priceTotal;
  const taxAmount = isRegel ? data.priceTotal - netAmount : 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header Bar ── */}
        <View style={s.headerBar}>
          <Text style={s.headerBrand}>{BUSINESS.name || 'cam2rent'}</Text>
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>RECHNUNG</Text>
            <Text style={s.headerInvoiceNr}>{invoiceNumber}</Text>
          </View>
        </View>

        <View style={s.content}>

          {/* ── Adressen ── */}
          <View style={s.addressRow}>
            {/* Links: Rechnungssteller */}
            <View style={s.addressBlock}>
              <Text style={s.addressLabel}>Rechnungssteller</Text>
              <Text style={s.addressName}>{BUSINESS.name || 'cam2rent'}</Text>
              <Text style={s.addressLine}>
                {BUSINESS.owner}{'\n'}
                {BUSINESS.street}{'\n'}
                {BUSINESS.zip} {BUSINESS.city}{'\n'}
                {BUSINESS.email}{'\n'}
                {data.ustId ? `USt-IdNr.: ${data.ustId}` : `${BUSINESS.domain}`}
              </Text>
            </View>

            {/* Rechts: Rechnungsempfänger */}
            <View style={s.addressBlock}>
              <Text style={s.addressLabel}>Rechnungsempfänger</Text>
              <Text style={s.addressName}>{data.customerName || 'Kunde'}</Text>
              <Text style={s.addressLine}>
                {data.customerAddress ? `${data.customerAddress}\n` : ''}
                {data.customerEmail}
              </Text>
            </View>
          </View>

          {/* ── Meta-Info ── */}
          <View style={{ marginBottom: 16 }}>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Rechnungsdatum:</Text>
              <Text style={s.metaValue}>{data.invoiceDate}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Buchungsnummer:</Text>
              <Text style={s.metaValue}>{data.bookingId}</Text>
            </View>
          </View>

          {/* ── Leistungszeitraum ── */}
          <View style={s.periodBar}>
            <Text style={s.periodLabel}>Leistungszeitraum</Text>
            <Text style={s.periodValue}>
              {isoToDE(data.rentalFrom)} – {isoToDE(data.rentalTo)} ({data.days} {data.days === 1 ? 'Tag' : 'Tage'})
            </Text>
          </View>

          {/* ── Positionstabelle ── */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colPos]}>Pos</Text>
            <Text style={[s.tableHeaderText, s.colDesc]}>Beschreibung</Text>
            <Text style={[s.tableHeaderText, s.colDays]}>Menge</Text>
            <Text style={[s.tableHeaderText, s.colTotal]}>Netto</Text>
          </View>

          {items.map((item, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={s.colPos}>{item.pos}</Text>
              <View style={s.colDesc}>
                <Text>{item.description}</Text>
                {item.subline && (
                  <Text style={{ fontSize: 8, color: C.grayText, marginTop: 1 }}>{item.subline}</Text>
                )}
              </View>
              <Text style={s.colDays}>{item.qty}</Text>
              <Text style={s.colTotal}>{fmtEuro(item.total)}</Text>
            </View>
          ))}

          {/* ── Summen ── */}
          <View style={{ marginTop: 8 }}>
            {isRegel ? (
              <>
                <View style={s.sumRow}>
                  <Text style={s.sumLabel}>Nettobetrag:</Text>
                  <Text style={s.sumValue}>{fmtEuro(netAmount)}</Text>
                </View>
                <View style={s.sumRow}>
                  <Text style={s.sumLabel}>MwSt. {taxRate}%:</Text>
                  <Text style={s.sumValue}>{fmtEuro(taxAmount)}</Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>
              Gesamtbetrag{isRegel ? ' (brutto)' : ''}:
            </Text>
            <Text style={s.totalValue}>{fmtEuro(data.priceTotal)}</Text>
          </View>

          {data.deposit > 0 && (
            <Text style={{ fontSize: 8, color: C.grayText, marginTop: 6, textAlign: 'right', paddingRight: 12 }}>
              Kaution: {fmtEuro(data.deposit)} (wird nach Rückgabe freigegeben)
            </Text>
          )}

          <View style={s.divider} />

          {/* ── Bezahlt / Zahlungsinformation ── */}
          {data.paymentMethod !== 'Ausstehend' ? (
            <View style={[s.noteBox, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#16a34a' }}>
                Bezahlt
              </Text>
            </View>
          ) : (
            <View style={s.noteBox}>
              <Text style={[s.noteText, { fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 4 }]}>
                Zahlung ausstehend
              </Text>
              <Text style={s.noteText}>
                Bitte überweise den Gesamtbetrag auf das angegebene Konto.
                {data.deliveryMode === 'abholung' ? '\nAbholung — kein Versand.' : ''}
              </Text>
            </View>
          )}

          {/* ── Steuer-Hinweis ── */}
          <View style={[s.noteBox, { marginTop: 12 }]}>
            <Text style={s.noteText}>
              {isRegel
                ? `${data.ustId ? `USt-IdNr.: ${data.ustId}\n` : ''}Alle Beträge verstehen sich inkl. ${taxRate}% MwSt.`
                : 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).'}
            </Text>
          </View>

          {/* ── QR-Code — nur wenn nicht bezahlt ── */}
          {data.paymentMethod === 'Ausstehend' && data.qrCodeDataUrl && (
            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image src={data.qrCodeDataUrl} style={{ width: 72, height: 72 }} />
              <View>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 2 }}>
                  QR-Code für Überweisung
                </Text>
                <Text style={{ fontSize: 8, color: C.grayText, lineHeight: 1.5 }}>
                  Scanne mit deiner Banking-App.{'\n'}
                  IBAN, Betrag und Verwendungszweck{'\n'}
                  werden automatisch ausgefüllt.
                </Text>
              </View>
            </View>
          )}

        </View>

        {/* ── Footer ── */}
        <View style={s.footerBar} fixed>
          <View style={s.footerLine} />
          <View style={s.footerContent}>
            <Text style={s.footerText}>{BUSINESS.addressLine || `${BUSINESS.name} · ${BUSINESS.street} · ${BUSINESS.zip} ${BUSINESS.city}`}</Text>
            <Text style={s.footerText}>{BUSINESS.domain} · {BUSINESS.email}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
