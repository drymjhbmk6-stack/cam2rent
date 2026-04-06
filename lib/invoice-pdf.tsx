import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceData {
  bookingId: string;
  invoiceDate: string;       // 'DD.MM.YYYY'
  customerName: string;
  customerEmail: string;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function haftungLabel(h: string) {
  if (h === 'standard') return 'Standard-Haftungsoption (pauschal)';
  if (h === 'premium') return 'Premium-Haftungsoption (pauschal)';
  return null;
}

function shippingLabel(method: string | undefined, mode: string) {
  if (mode === 'abholung') return 'Selbst abholen (kostenlos)';
  if (method === 'express') return 'Express-Versand (1–2 Werktage)';
  return 'Standard-Versand (3–5 Werktage)';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 52,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  brand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
  },
  senderBlock: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 1.5,
  },

  // Invoice meta
  invoiceMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  invoiceTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    marginBottom: 4,
  },
  invoiceSubtitle: {
    fontSize: 9,
    color: '#6b7280',
  },
  metaRight: {
    textAlign: 'right',
  },
  metaLabel: {
    fontSize: 9,
    color: '#9ca3af',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
  },

  // Customer address block
  addressBlock: {
    marginBottom: 24,
    padding: 14,
    backgroundColor: '#f9f9f7',
    borderRadius: 6,
  },
  addressLabel: {
    fontSize: 8,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  addressName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    marginBottom: 2,
  },
  addressEmail: {
    fontSize: 9,
    color: '#6b7280',
  },

  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 16,
  },

  // Section heading
  sectionHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Booking details
  detailRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  detailLabel: {
    width: '35%',
    fontSize: 9,
    color: '#6b7280',
  },
  detailValue: {
    width: '65%',
    fontSize: 10,
    color: '#0a0a0a',
  },

  // Line items table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f0',
    padding: '8 10',
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '7 10',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  colDescription: { width: '70%', fontSize: 10 },
  colAmount: { width: '30%', fontSize: 10, textAlign: 'right' },
  colDescriptionHeader: { width: '70%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  colAmountHeader: { width: '30%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', textAlign: 'right' },

  // Total
  totalRow: {
    flexDirection: 'row',
    padding: '10 10',
    backgroundColor: '#0a0a0a',
    borderRadius: 4,
    marginTop: 4,
  },
  totalLabel: {
    width: '70%',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  totalAmount: {
    width: '30%',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textAlign: 'right',
  },
  depositNote: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'right',
  },

  // Kleinunternehmer note
  kleinNote: {
    marginTop: 28,
    padding: 12,
    backgroundColor: '#f9f9f7',
    borderRadius: 6,
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 52,
    right: 52,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
  },
});

// ─── PDF Document ─────────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoiceData }) {
  const lineItems: { description: string; amount: number }[] = [];

  lineItems.push({
    description: `Kamera-Miete: ${data.productName} (${data.days} ${data.days === 1 ? 'Tag' : 'Tage'}, ${fmtDate(data.rentalFrom)} – ${fmtDate(data.rentalTo)})`,
    amount: data.priceRental,
  });

  if (data.priceAccessories > 0) {
    lineItems.push({
      description: `Zubehör${data.accessories.length > 0 ? ': ' + data.accessories.join(', ') : ''}`,
      amount: data.priceAccessories,
    });
  }

  const hLabel = haftungLabel(data.haftung);
  if (hLabel && data.priceHaftung > 0) {
    lineItems.push({ description: hLabel, amount: data.priceHaftung });
  }

  if (data.shippingPrice > 0) {
    lineItems.push({
      description: shippingLabel(data.shippingMethod, data.deliveryMode),
      amount: data.shippingPrice,
    });
  }

  // Invoice number: RE-YYYY-NNNNN (derived from BK- id)
  const invoiceNumber = data.bookingId.replace('BK-', 'RE-');

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{BUSINESS.name}</Text>
            <Text style={s.brandSub}>{BUSINESS.slogan}</Text>
          </View>
          <View>
            <Text style={s.senderBlock}>
              {BUSINESS.owner}{'\n'}
              {BUSINESS.street}{'\n'}
              {`${BUSINESS.zip} ${BUSINESS.city}`}{'\n'}
              {BUSINESS.email}{'\n'}
              {BUSINESS.domain}
            </Text>
          </View>
        </View>

        {/* ── Invoice meta ── */}
        <View style={s.invoiceMeta}>
          <View>
            <Text style={s.invoiceTitle}>Rechnung</Text>
            <Text style={s.invoiceSubtitle}>Buchungsbestätigung & Beleg</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaLabel}>Rechnungsnummer</Text>
            <Text style={s.metaValue}>{invoiceNumber}</Text>
            <Text style={[s.metaLabel, { marginTop: 8 }]}>Rechnungsdatum</Text>
            <Text style={s.metaValue}>{data.invoiceDate}</Text>
            <Text style={[s.metaLabel, { marginTop: 8 }]}>Buchungsnummer</Text>
            <Text style={s.metaValue}>{data.bookingId}</Text>
          </View>
        </View>

        {/* ── Customer ── */}
        <View style={s.addressBlock}>
          <Text style={s.addressLabel}>Rechnungsempfänger</Text>
          <Text style={s.addressName}>{data.customerName || 'Kunde'}</Text>
          <Text style={s.addressEmail}>{data.customerEmail}</Text>
        </View>

        {/* ── Booking details ── */}
        <Text style={s.sectionHeading}>Buchungsdetails</Text>
        <View style={{ marginBottom: 20 }}>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Kamera</Text>
            <Text style={s.detailValue}>{data.productName}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Mietzeitraum</Text>
            <Text style={s.detailValue}>{fmtDate(data.rentalFrom)} – {fmtDate(data.rentalTo)} ({data.days} {data.days === 1 ? 'Tag' : 'Tage'})</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Lieferung</Text>
            <Text style={s.detailValue}>{shippingLabel(data.shippingMethod, data.deliveryMode)}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Zahlungsstatus</Text>
            <Text style={[s.detailValue, { color: '#16a34a', fontFamily: 'Helvetica-Bold' }]}>Bezahlt</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Line items ── */}
        <Text style={s.sectionHeading}>Leistungen</Text>
        <View style={s.tableHeader}>
          <Text style={s.colDescriptionHeader}>Beschreibung</Text>
          <Text style={s.colAmountHeader}>Betrag</Text>
        </View>
        {lineItems.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={s.colDescription}>{item.description}</Text>
            <Text style={s.colAmount}>{fmt(item.amount)}</Text>
          </View>
        ))}

        {/* ── Total ── */}
        {data.taxMode === 'regelbesteuerung' && data.taxRate ? (
          <>
            <View style={[s.tableRow, { borderBottomWidth: 0 }]}>
              <Text style={s.colDescription}>Nettobetrag</Text>
              <Text style={s.colAmount}>{fmt(data.priceTotal / (1 + (data.taxRate) / 100))}</Text>
            </View>
            <View style={[s.tableRow, { borderBottomWidth: 0 }]}>
              <Text style={s.colDescription}>MwSt. ({data.taxRate}%)</Text>
              <Text style={s.colAmount}>{fmt(data.priceTotal - data.priceTotal / (1 + (data.taxRate) / 100))}</Text>
            </View>
          </>
        ) : null}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Gesamtbetrag{data.taxMode === 'regelbesteuerung' ? ' (brutto)' : ''}</Text>
          <Text style={s.totalAmount}>{fmt(data.priceTotal)}</Text>
        </View>
        {data.deposit > 0 && (
          <Text style={s.depositNote}>
            * Enthält Kaution {fmt(data.deposit)} – wird nach Rückgabe erstattet
          </Text>
        )}

        {/* ── Tax note ── */}
        {data.taxMode === 'regelbesteuerung' ? (
          <View style={s.kleinNote}>
            <Text style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
              {data.ustId ? `USt-IdNr.: ${data.ustId}\n` : ''}Alle Beträge verstehen sich inkl. {data.taxRate}% MwSt.
            </Text>
          </View>
        ) : (
          <Text style={s.kleinNote}>
            Gemäß §19 UStG wird keine Umsatzsteuer berechnet.
          </Text>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>{BUSINESS.addressLine}</Text>
          <Text style={s.footerText}>{`${BUSINESS.domain} · ${BUSINESS.email}`}</Text>
        </View>

      </Page>
    </Document>
  );
}
