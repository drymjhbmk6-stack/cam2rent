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
  paymentStatus?: string;
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
  colPos: { width: 28, fontSize: 10 },
  colDesc: { flex: 1, fontSize: 10 },
  colDays: { width: 50, fontSize: 10, textAlign: 'center' },
  colTotal: { width: 75, fontSize: 10, textAlign: 'right' },

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
    qty: string;
    total: number;
  }

  const items: LineItem[] = [];
  let pos = 1;

  // Kameras
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

  // Zubehör
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

  // Versand / Abholung
  if (data.deliveryMode === 'abholung') {
    items.push({
      pos: pos++,
      description: 'Selbstabholung',
      qty: '1',
      total: 0,
    });
  } else if (data.shippingPrice > 0) {
    items.push({
      pos: pos++,
      description: data.shippingMethod === 'express' ? 'Express-Versand' : 'Standard-Versand',
      subline: 'Hin- und Rücksendung',
      qty: '1',
      total: data.shippingPrice,
    });
  } else {
    items.push({
      pos: pos++,
      description: 'Standard-Versand (kostenlos)',
      qty: '1',
      total: 0,
    });
  }

  // Steuerberechnung
  const isRegel = data.taxMode === 'regelbesteuerung';
  const taxRate = data.taxRate ?? 19;
  const netAmount = isRegel ? data.priceTotal / (1 + taxRate / 100) : data.priceTotal;
  const taxAmount = isRegel ? data.priceTotal - netAmount : 0;

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
            <Text style={s.headerTitle}>Rechnung</Text>
            <Text style={s.headerInvoiceNr}>{invoiceNumber}</Text>
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
          <Text style={[s.tableHeaderText, s.colTotal]}>Netto</Text>
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
            <Text style={[s.colTotal, item.total === 0 ? { color: C.grayMid } : { color: C.black }]}>
              {item.total > 0 ? fmtEuro(item.total) : '–'}
            </Text>
          </View>
        ))}

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
