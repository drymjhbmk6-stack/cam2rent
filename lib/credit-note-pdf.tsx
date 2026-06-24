import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  Circle,
  G,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro } from '@/lib/format-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreditNotePdfData {
  creditNoteNumber: string;
  creditNoteDate: string;   // 'DD.MM.YYYY'
  bookingId?: string;
  /** Bezug auf die stornierte Originalrechnung. */
  invoiceNumber?: string;
  invoiceDate?: string;     // 'DD.MM.YYYY'
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  /** Grund der Stornierung (frei, vom Admin). */
  reason?: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
  /** true = Betrag wurde bereits erstattet, false = wird erstattet. */
  refunded?: boolean;
}

// ─── Colors (nur Schwarz/Weiß/Grau) ─────────────────────────────────────────

const C = {
  black: '#000000',
  dark: '#1a1a1a',
  grayMid: '#6b7280',
  grayLine: '#d1d5db',
  white: '#ffffff',
};

const M = 50;

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerBrandGroup: { flexDirection: 'row', alignItems: 'center' },
  headerBrand: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.black, marginLeft: 8 },
  headerRight: { textAlign: 'right' },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica', color: C.black },
  headerNr: { fontSize: 10, color: C.grayMid, marginTop: 2 },
  headerLine: { borderBottomWidth: 0.5, borderBottomColor: C.grayLine, marginBottom: 20, marginTop: 6 },

  addressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  addressBlock: { width: '48%' },
  addressLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayMid,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5,
  },
  addressName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 2 },
  addressLine: { fontSize: 10, color: C.dark, lineHeight: 1.5 },

  metaRow: { flexDirection: 'row', marginBottom: 18 },
  metaCol: { flex: 1 },
  metaLabel: {
    fontSize: 9, color: C.grayMid, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 3,
  },
  metaValue: { fontSize: 10, color: C.black },

  reasonBox: { marginBottom: 16 },
  reasonLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayMid,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  reasonText: { fontSize: 10, color: C.dark, lineHeight: 1.4 },

  tableHeaderRow: {
    flexDirection: 'row', paddingBottom: 5,
    borderBottomWidth: 0.5, borderBottomColor: C.black,
  },
  tableHeaderText: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayMid,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.grayLine },
  colPos: { width: 26, fontSize: 10 },
  colDesc: { flex: 1, fontSize: 10 },
  colTotal: { width: 90, fontSize: 10, textAlign: 'right' },

  sumRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3 },
  sumLabel: { fontSize: 10, color: C.grayMid, width: 140, textAlign: 'right', marginRight: 12 },
  sumValue: { fontSize: 10, color: C.black, width: 90, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, paddingTop: 6 },
  totalLabel: { fontSize: 11, color: C.dark, width: 140, textAlign: 'right', marginRight: 12 },
  totalValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.black, width: 90, textAlign: 'right' },

  divider: { borderBottomWidth: 0.5, borderBottomColor: C.grayLine, marginVertical: 14 },

  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 30, paddingHorizontal: M },
  footerLine: { borderBottomWidth: 0.5, borderBottomColor: C.grayLine, marginBottom: 8 },
  footerContent: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: C.grayMid },
});

// ─── PDF Document ────────────────────────────────────────────────────────────

export function CreditNotePDF({ data }: { data: CreditNotePdfData }) {
  const isRegel = data.taxMode === 'regelbesteuerung';
  const taxRate = data.taxRate ?? 19;
  // Betraege werden NEGATIV ausgewiesen (Gutschrift).
  const neg = (n: number) => `-${fmtEuro(Math.abs(n))}`;

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
            <Text style={s.headerTitle}>Stornorechnung / Gutschrift</Text>
            <Text style={s.headerNr}>{data.creditNoteNumber}</Text>
          </View>
        </View>
        <View style={s.headerLine} />

        {/* ── Adressen ── */}
        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Empfänger</Text>
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
            <Text style={s.addressLabel}>Aussteller</Text>
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

        {/* ── Meta ── */}
        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Gutschriftdatum</Text>
            <Text style={s.metaValue}>{data.creditNoteDate}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Bezug Rechnung</Text>
            <Text style={s.metaValue}>{data.invoiceNumber || '–'}</Text>
            {data.invoiceDate ? <Text style={[s.metaValue, { color: C.grayMid, fontSize: 9 }]}>{data.invoiceDate}</Text> : null}
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Buchungsnummer</Text>
            <Text style={s.metaValue}>{data.bookingId || '–'}</Text>
          </View>
        </View>

        {/* ── Grund ── */}
        {data.reason ? (
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>Grund der Stornierung</Text>
            <Text style={s.reasonText}>{data.reason}</Text>
          </View>
        ) : null}

        {/* ── Position ── */}
        <View style={s.tableHeaderRow}>
          <Text style={[s.tableHeaderText, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>Beschreibung</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>Betrag</Text>
        </View>
        <View style={s.tableRow} wrap={false}>
          <Text style={s.colPos}>1</Text>
          <View style={s.colDesc}>
            <Text style={{ color: C.black }}>Stornierung / Gutschrift</Text>
            <Text style={{ fontSize: 9, color: C.grayMid, marginTop: 1 }}>
              {data.invoiceNumber ? `zur Rechnung ${data.invoiceNumber}` : 'Rückerstattung'}
            </Text>
          </View>
          <Text style={[s.colTotal, { color: C.black }]}>{neg(data.grossAmount)}</Text>
        </View>

        {/* ── Summen ── */}
        {isRegel ? (
          <View style={{ marginTop: 6 }}>
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Nettobetrag:</Text>
              <Text style={s.sumValue}>{neg(data.netAmount)}</Text>
            </View>
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>MwSt. {taxRate}%:</Text>
              <Text style={s.sumValue}>{neg(data.taxAmount)}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.totalRow} wrap={false}>
          <Text style={s.totalLabel}>Gutschriftbetrag{isRegel ? ' (brutto)' : ''}:</Text>
          <Text style={s.totalValue}>{neg(data.grossAmount)}</Text>
        </View>

        {/* ── Steuer-Hinweis ── */}
        <Text style={{ fontSize: 9, color: C.grayMid, marginTop: 6 }}>
          {isRegel
            ? `${data.ustId ? `USt-IdNr.: ${data.ustId} · ` : ''}Alle Beträge verstehen sich inkl. ${taxRate}% MwSt.`
            : 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).'}
        </Text>

        <View style={s.divider} />

        <Text style={{ fontSize: 10, color: C.dark, lineHeight: 1.5 }}>
          {data.refunded
            ? `Der Betrag von ${fmtEuro(Math.abs(data.grossAmount))} wurde auf dein ursprüngliches Zahlungsmittel zurückerstattet.`
            : `Der Betrag von ${fmtEuro(Math.abs(data.grossAmount))} wird auf dein ursprüngliches Zahlungsmittel zurückerstattet.`}
        </Text>

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
