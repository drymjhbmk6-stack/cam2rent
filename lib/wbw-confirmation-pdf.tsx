import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro, isoToDE } from '@/lib/format-utils';

export interface WbwConfirmationItem {
  position: number;
  name: string;
  serial: string | null;
  value: number;
}

export interface WbwConfirmationData {
  bookingId: string;
  rentalFrom: string;
  rentalTo: string;
  finalizedAt: string;
  customerName: string;
  customerStreet: string;
  customerZipCity: string;
  customerEmail: string;
  items: WbwConfirmationItem[];
  totalWbw: number;
}

const NAVY = '#0f172a';
const CYAN = '#06b6d4';
const GRAY = '#64748b';
const ZEBRA = '#f1f5f9';

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a', backgroundColor: '#ffffff', paddingBottom: 70 },
  header: { backgroundColor: NAVY, paddingVertical: 22, paddingHorizontal: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  logoAccent: { color: CYAN },
  headerRight: { textAlign: 'right' },
  headerTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },
  headerBooking: { fontSize: 11, color: CYAN, marginTop: 3 },
  body: { paddingHorizontal: 40, paddingTop: 26 },
  cols: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  col: { width: '48%' },
  colLabel: { fontSize: 8, color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  colText: { fontSize: 10, color: NAVY, lineHeight: 1.4 },
  metaRow: { fontSize: 10, color: NAVY, marginBottom: 20 },
  metaAccent: { color: CYAN, fontFamily: 'Helvetica-Bold' },
  tHead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 7, paddingHorizontal: 8 },
  tHeadCell: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8 },
  tCell: { fontSize: 9, color: NAVY },
  cPos: { width: '8%' },
  cArt: { width: '47%' },
  cSer: { width: '25%' },
  cVal: { width: '20%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: NAVY },
  totalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginRight: 16 },
  totalValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  legal: { marginTop: 26, padding: 12, backgroundColor: ZEBRA, borderRadius: 4 },
  legalText: { fontSize: 8.5, color: GRAY, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  footerBar: { height: 3, backgroundColor: CYAN },
  footerInner: { paddingVertical: 12, paddingHorizontal: 40 },
  footerText: { fontSize: 8, color: GRAY, textAlign: 'center', lineHeight: 1.5 },
});

export function WbwConfirmationPdf({ data }: { data: WbwConfirmationData }) {
  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page} wrap>
        <View style={s.header} fixed>
          <Text style={s.logo}>cam<Text style={s.logoAccent}>2</Text>rent</Text>
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>WIEDERBESCHAFFUNGSWERTE</Text>
            <Text style={s.headerBooking}>{data.bookingId}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.cols}>
            <View style={s.col}>
              <Text style={s.colLabel}>Vermieter</Text>
              <Text style={s.colText}>
                {BUSINESS.name} – {BUSINESS.owner}{'\n'}
                {BUSINESS.street}{'\n'}
                {BUSINESS.zip} {BUSINESS.city}{'\n'}
                {BUSINESS.emailKontakt}
              </Text>
            </View>
            <View style={s.col}>
              <Text style={s.colLabel}>Mieter</Text>
              <Text style={s.colText}>
                {data.customerName || '–'}{'\n'}
                {data.customerStreet || '–'}{'\n'}
                {data.customerZipCity || '–'}{'\n'}
                {data.customerEmail || '–'}
              </Text>
            </View>
          </View>

          <Text style={s.metaRow}>
            Mietzeitraum: <Text style={s.metaAccent}>{isoToDE(data.rentalFrom)} – {isoToDE(data.rentalTo)}</Text>
            {'   ·   '}Stand: <Text style={s.metaAccent}>{isoToDE(data.finalizedAt)}</Text>
          </Text>

          <View style={s.tHead}>
            <Text style={[s.tHeadCell, s.cPos]}>Pos</Text>
            <Text style={[s.tHeadCell, s.cArt]}>Artikel</Text>
            <Text style={[s.tHeadCell, s.cSer]}>Seriennummer</Text>
            <Text style={[s.tHeadCell, s.cVal]}>WBW</Text>
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={[s.tRow, { backgroundColor: i % 2 === 0 ? '#ffffff' : ZEBRA }]} wrap={false}>
              <Text style={[s.tCell, s.cPos]}>{it.position}</Text>
              <Text style={[s.tCell, s.cArt]}>{it.name}</Text>
              <Text style={[s.tCell, s.cSer]}>{it.serial || '–'}</Text>
              <Text style={[s.tCell, s.cVal]}>{fmtEuro(it.value)}</Text>
            </View>
          ))}

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Gesamt-Wiederbeschaffungswert</Text>
            <Text style={s.totalValue}>{fmtEuro(data.totalWbw)}</Text>
          </View>

          <View style={s.legal}>
            <Text style={s.legalText}>
              Die ausgewiesenen Wiederbeschaffungswerte sind gemäß Mietvertrag maßgeblich für etwaige
              Ersatzansprüche im Schadensfall. Dieses Dokument wurde automatisch erstellt und ist ohne
              Unterschrift gültig.
            </Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <View style={s.footerBar} />
          <View style={s.footerInner}>
            <Text style={s.footerText}>
              {BUSINESS.name} – {BUSINESS.owner} · {BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city} · {BUSINESS.emailKontakt} · {BUSINESS.url}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
