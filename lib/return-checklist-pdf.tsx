import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { isoToDE } from '@/lib/format-utils';
import { PdfLogo } from '@/lib/pdf/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReturnChecklistData {
  bookingId: string;
  customerName: string;
  rentalFrom: string;
  rentalTo: string;
  /** 'versand' | 'abholung' — steuert den Hinweistext (zurücksenden vs. zurückbringen). */
  deliveryMode: string;
  cameras: { product_name: string; serial_number: string | null }[];
  items: { name: string; qty: number; included_parts?: string[] }[];
}

// ─── Colors (identisch zur Packliste) ────────────────────────────────────────

const C = {
  navy: '#0f172a',
  cyan: '#06b6d4',
  white: '#ffffff',
  grayText: '#64748b',
  grayLight: '#f1f5f9',
  border: '#e2e8f0',
  black: '#0a0a0a',
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: C.black, paddingBottom: 70 },
  headerBar: {
    backgroundColor: C.navy,
    paddingVertical: 18,
    paddingHorizontal: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerBrand: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.white },
  headerRight: { textAlign: 'right' },
  headerTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.white },
  headerNr: { fontSize: 10, color: C.cyan, marginTop: 2 },
  content: { paddingHorizontal: 40 },
  subtitle: { fontSize: 8, color: C.grayText, marginBottom: 20, textAlign: 'center' },

  intro: { fontSize: 10, color: C.black, lineHeight: 1.5, marginBottom: 14 },

  metaRow: { flexDirection: 'row', marginBottom: 4 },
  metaLabel: { width: 130, fontSize: 9, color: C.grayText },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.black },

  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.cyan,
    marginTop: 18,
    marginBottom: 8,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 12 },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    padding: '6 10',
    borderRadius: 3,
    marginBottom: 1,
  },
  tableHeaderText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },
  tableRow: {
    flexDirection: 'row',
    padding: '6 10',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: C.grayLight },
  colCheck: { width: 34, alignItems: 'center' },
  colBez: { flex: 1, fontSize: 10 },
  colMenge: { width: 50, fontSize: 10, textAlign: 'center' },

  checkbox: { width: 12, height: 12, borderWidth: 1, borderColor: C.navy, borderRadius: 1 },

  hint: { fontSize: 9, color: C.grayText, lineHeight: 1.5, marginTop: 4 },

  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  footerLine: { height: 3, backgroundColor: C.cyan },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 8,
  },
  footerText: { fontSize: 8, color: C.grayText },
});

// ─── PDF Document ────────────────────────────────────────────────────────────

export function ReturnChecklistPDF({ data }: { data: ReturnChecklistData }) {
  const isAbholung = data.deliveryMode === 'abholung';
  const cameras =
    data.cameras.length > 0
      ? data.cameras
      : [{ product_name: '', serial_number: null }];

  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page}>
        {/* ── Header Bar ── */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfLogo width={38} height={25} />
            <Text style={[s.headerBrand, { marginLeft: 10 }]}>{BUSINESS.name || 'cam2rent'}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>RÜCKGABE-CHECKLISTE</Text>
            <Text style={s.headerNr}>{data.bookingId}</Text>
          </View>
        </View>

        <Text style={s.subtitle}>
          cam2rent — bitte vor der {isAbholung ? 'Rückgabe' : 'Rücksendung'} alle Teile abhaken
        </Text>

        <View style={s.content}>
          <Text style={s.intro}>
            Hallo {data.customerName || 'Kunde'}, heute endet dein Mietzeitraum. Bitte gib alle
            unten aufgeführten Teile vollständig {isAbholung ? 'zurück' : 'zurück (Rücksendung)'}.
            Hake jede Position ab, damit nichts vergessen wird.
          </Text>

          {/* ── Buchungsdaten ── */}
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Buchungsnummer:</Text>
            <Text style={s.metaValue}>{data.bookingId}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Mietzeitraum:</Text>
            <Text style={s.metaValue}>
              {isoToDE(data.rentalFrom)} – {isoToDE(data.rentalTo)}
            </Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Rückgabe:</Text>
            <Text style={s.metaValue}>{isAbholung ? 'Persönliche Rückgabe' : 'Rücksendung per Paket'}</Text>
          </View>

          <View style={s.divider} />

          {/* ── 1. Kamera(s) ── */}
          <Text style={s.sectionTitle}>1. Kamera{cameras.length > 1 ? 's' : ''}</Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colCheck]}>OK</Text>
            <Text style={[s.tableHeaderText, s.colBez]}>Gerät</Text>
            <Text style={[s.tableHeaderText, s.colMenge]}>Seriennr.</Text>
          </View>
          {cameras.map((cam, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
              <View style={s.colCheck}>
                <View style={s.checkbox} />
              </View>
              <Text style={s.colBez}>{cam.product_name || 'Kamera'}</Text>
              <Text style={[s.colMenge, { fontSize: 8, color: C.grayText }]}>
                {cam.serial_number ?? '—'}
              </Text>
            </View>
          ))}

          {/* ── 2. Zubehör ── */}
          <Text style={s.sectionTitle}>2. Zubehör</Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colCheck]}>OK</Text>
            <Text style={[s.tableHeaderText, s.colBez]}>Bezeichnung</Text>
            <Text style={[s.tableHeaderText, s.colMenge]}>Menge</Text>
          </View>
          {data.items.length > 0 ? (
            data.items.map((row, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
                <View style={s.colCheck}>
                  <View style={s.checkbox} />
                </View>
                <View style={s.colBez}>
                  <Text>{row.name}</Text>
                  {row.included_parts && row.included_parts.length > 0 && (
                    <Text style={{ fontSize: 8, color: C.grayText, marginTop: 1 }}>
                      Enthält: {row.included_parts.join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={s.colMenge}>{row.qty}x</Text>
              </View>
            ))
          ) : (
            <View style={s.tableRow}>
              <View style={s.colCheck}>
                <View style={s.checkbox} />
              </View>
              <Text style={[s.colBez, { color: C.grayText }]}>Kein Zubehör gebucht</Text>
              <Text style={s.colMenge}>—</Text>
            </View>
          )}

          <View style={s.divider} />

          {/* ── Hinweise ── */}
          <Text style={s.sectionTitle}>3. Bitte beachten</Text>
          {isAbholung ? (
            <Text style={s.hint}>
              • Bitte bringe das komplette Equipment in der Originalverpackung zurück.{'\n'}
              • Speicherkarte zurücksetzen (deine Aufnahmen vorher sichern!).{'\n'}
              • Akkus möglichst geladen zurückgeben.
            </Text>
          ) : (
            <Text style={s.hint}>
              • Lege das beiliegende Rücksendeetikett gut sichtbar auf das Paket.{'\n'}
              • Verpacke das Equipment sicher (Originalverpackung verwenden).{'\n'}
              • Speicherkarte zurücksetzen (deine Aufnahmen vorher sichern!).{'\n'}
              • Gib das Paket noch heute bei der Annahmestelle ab.
            </Text>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={s.footerBar} fixed>
          <View style={s.footerLine} />
          <View style={s.footerContent}>
            <Text style={s.footerText}>
              {BUSINESS.addressLine || `${BUSINESS.name} · ${BUSINESS.street} · ${BUSINESS.zip} ${BUSINESS.city}`}
            </Text>
            <Text style={s.footerText}>{BUSINESS.domain} · {BUSINESS.email}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
