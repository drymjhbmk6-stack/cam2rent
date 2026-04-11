import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PacklistData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  productName: string;
  rentalFrom: string;
  rentalTo: string;
  days: number;
  deliveryMode: string;
  shippingMethod: string;
  accessories: string[];
  haftung: string;
}

// ─── Colors (identisch mit Rechnung) ─────────────────────────────────────────

const C = {
  navy: '#0f172a',
  cyan: '#06b6d4',
  white: '#ffffff',
  grayText: '#64748b',
  grayLight: '#f1f5f9',
  border: '#e2e8f0',
  black: '#0a0a0a',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function accName(id: string): string {
  return id.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.black,
    paddingBottom: 70,
  },
  headerBar: {
    backgroundColor: C.navy,
    paddingVertical: 18,
    paddingHorizontal: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerBrand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  headerNr: {
    fontSize: 10,
    color: C.cyan,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 40,
  },
  subtitle: {
    fontSize: 8,
    color: C.grayText,
    marginBottom: 20,
    textAlign: 'center',
  },

  // Meta
  metaRow: { flexDirection: 'row', marginBottom: 4 },
  metaLabel: { width: 110, fontSize: 9, color: C.grayText },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black },

  // Section
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.cyan,
    marginTop: 18,
    marginBottom: 8,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginVertical: 12,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    padding: '6 10',
    borderRadius: 3,
    marginBottom: 1,
  },
  tableHeaderText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '5 10',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: {
    backgroundColor: C.grayLight,
  },
  colNr: { width: 30, fontSize: 10 },
  colBez: { flex: 1, fontSize: 10 },
  colOk: { width: 40, fontSize: 10, textAlign: 'center' },

  // Checkbox
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: C.navy,
    borderRadius: 1,
  },

  // Checkrow
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  checkLabel: {
    fontSize: 10,
    color: C.black,
  },

  // Writeline
  writeLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    width: 180,
    marginLeft: 4,
    height: 14,
  },
  writeLineLong: {
    width: 280,
  },

  // Signatures
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  sigBlock: {
    alignItems: 'center',
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    width: 180,
    marginBottom: 4,
    paddingTop: 4,
  },
  sigLabel: {
    fontSize: 8,
    color: C.grayText,
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
    paddingHorizontal: 40,
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 8,
    color: C.grayText,
  },
});

// ─── Checkbox Component ──────────────────────────────────────────────────────

function Checkbox() {
  return <View style={s.checkbox} />;
}

// ─── PDF Document ────────────────────────────────────────────────────────────

export function PacklistPDF({ data }: { data: PacklistData }) {
  // Kameras aufspalten (koennen kommagetrennt sein)
  const cameras = data.productName.split(',').map((n) => n.trim());

  // Zubehoer-Namen aufloesen
  const accItems = data.accessories.map((id) => accName(id));

  // Haftung Label
  const haftungLabel = data.haftung === 'standard' ? 'Standard-Haftungsschutz'
    : data.haftung === 'premium' ? 'Premium-Haftungsschutz' : null;

  return (
    <Document>
      {cameras.map((camera, cameraIdx) => (
        <Page key={cameraIdx} size="A4" style={s.page}>

          {/* ── Header Bar ── */}
          <View style={s.headerBar}>
            <Text style={s.headerBrand}>{BUSINESS.name || 'cam2rent'}</Text>
            <View style={s.headerRight}>
              <Text style={s.headerTitle}>VERSAND-PACKLISTE</Text>
              <Text style={s.headerNr}>{data.bookingId}</Text>
            </View>
          </View>

          <Text style={s.subtitle}>cam2rent — internes Versanddokument{cameras.length > 1 ? ` (Kamera ${cameraIdx + 1} von ${cameras.length})` : ''}</Text>

          <View style={s.content}>

            {/* ── Buchungsdaten ── */}
            <View style={{ marginBottom: 12 }}>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Buchungsnummer:</Text>
                <Text style={s.metaValue}>{data.bookingId}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Kunde:</Text>
                <Text style={s.metaValue}>{data.customerName}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Mietzeitraum:</Text>
                <Text style={s.metaValue}>{fmtDate(data.rentalFrom)} – {fmtDate(data.rentalTo)} ({data.days} Tage)</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Versandart:</Text>
                <Text style={s.metaValue}>{data.shippingMethod === 'express' ? 'Express-Versand' : data.deliveryMode === 'abholung' ? 'Abholung' : 'Standard-Versand'}</Text>
              </View>
              {data.customerAddress && (
                <View style={s.metaRow}>
                  <Text style={s.metaLabel}>Lieferadresse:</Text>
                  <Text style={s.metaValue}>{data.customerAddress}</Text>
                </View>
              )}
            </View>

            <View style={s.divider} />

            {/* ── 1. Versanddatum ── */}
            <Text style={s.sectionTitle}>1. Versanddatum</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
              <Text style={{ fontSize: 10 }}>Datum: </Text>
              <View style={s.writeLine} />
            </View>

            <View style={s.divider} />

            {/* ── 2. Versandgegenstand ── */}
            <Text style={s.sectionTitle}>2. Versandgegenstand</Text>

            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Kamera / Geraet:</Text>
              <Text style={[s.metaValue, { color: C.navy }]}>{camera}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
              <Text style={{ fontSize: 10 }}>Seriennummer: </Text>
              <View style={[s.writeLine, s.writeLineLong]} />
            </View>

            {haftungLabel && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Haftungsschutz:</Text>
                <Text style={s.metaValue}>{haftungLabel}</Text>
              </View>
            )}

            {/* Zubehoer-Tabelle */}
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 6 }}>Zubehoer:</Text>

            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.colNr]}>Nr.</Text>
              <Text style={[s.tableHeaderText, s.colBez]}>Bezeichnung</Text>
              <Text style={[s.tableHeaderText, s.colOk]}>OK</Text>
            </View>

            {accItems.length > 0 ? (
              accItems.map((name, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.colNr}>{i + 1}</Text>
                  <Text style={s.colBez}>{name}</Text>
                  <View style={[s.colOk, { alignItems: 'center' }]}>
                    <Checkbox />
                  </View>
                </View>
              ))
            ) : (
              <View style={s.tableRow}>
                <Text style={s.colNr}>–</Text>
                <Text style={[s.colBez, { color: C.grayText, fontStyle: 'italic' }]}>Kein Zubehoer gebucht</Text>
                <Text style={s.colOk}>–</Text>
              </View>
            )}

            {/* Ruecksendeetikett */}
            <View style={[s.tableRow, { marginTop: 4, backgroundColor: C.grayLight }]}>
              <Text style={s.colNr}>+</Text>
              <Text style={[s.colBez, { fontFamily: 'Helvetica-Bold' }]}>Ruecksendeetikett beilegen</Text>
              <View style={[s.colOk, { alignItems: 'center' }]}>
                <Checkbox />
              </View>
            </View>

            <View style={s.divider} />

            {/* ── 3. Zustand bei Verpackung ── */}
            <Text style={s.sectionTitle}>3. Zustand bei Verpackung</Text>
            <View style={s.checkRow}><Checkbox /><Text style={s.checkLabel}>Geraet funktionsfaehig getestet</Text></View>
            <View style={s.checkRow}><Checkbox /><Text style={s.checkLabel}>Keine sichtbaren Schaeden</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Checkbox />
              <Text style={s.checkLabel}>Sonstiges: </Text>
              <View style={[s.writeLine, { width: 220 }]} />
            </View>

            <View style={s.divider} />

            {/* ── 4. Verpackungskontrolle ── */}
            <Text style={s.sectionTitle}>4. Verpackungskontrolle</Text>
            <View style={s.checkRow}><Checkbox /><Text style={s.checkLabel}>Geraet sicher verpackt</Text></View>
            <View style={s.checkRow}><Checkbox /><Text style={s.checkLabel}>Zubehoer vollstaendig</Text></View>
            <View style={s.checkRow}><Checkbox /><Text style={s.checkLabel}>Paketinhalt dokumentiert (Foto/Video)</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Checkbox />
              <Text style={s.checkLabel}>Paketnummer: </Text>
              <View style={[s.writeLine, { width: 200 }]} />
            </View>

            <View style={s.divider} />

            {/* ── 5. Bestaetigung ── */}
            <Text style={s.sectionTitle}>5. Bestaetigung</Text>
            <Text style={{ fontSize: 9, color: C.grayText, lineHeight: 1.5, marginBottom: 4 }}>
              Der Unterzeichner bestaetigt die vollstaendige und ordnungsgemaesse Verpackung des oben genannten Equipments.
              Die Kontrolle wurde durch eine zweite Person gegengezeichnet.
            </Text>

            <View style={s.sigRow}>
              <View style={s.sigBlock}>
                <View style={s.sigLine} />
                <Text style={s.sigLabel}>(Packer, Ort/Datum)</Text>
              </View>
              <View style={s.sigBlock}>
                <View style={s.sigLine} />
                <Text style={s.sigLabel}>(Kontrolleur, Ort/Datum)</Text>
              </View>
            </View>

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
      ))}
    </Document>
  );
}
