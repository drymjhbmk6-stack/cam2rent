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

// ─── Farben (passend zum Vertrags-PDF) ──────────────────────────────────────

const NAVY = '#0f172a';
const CYAN = '#06b6d4';
const GRAY = '#6b7280';
const DARK = '#1a1a1a';
const LIGHT_BG = '#f8fafc';
const ALT_ROW = '#f1f5f9';

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  // Header
  headerBar: {
    backgroundColor: NAVY,
    marginHorizontal: -48,
    marginTop: -40,
    paddingHorizontal: 48,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    letterSpacing: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerLabel: {
    fontSize: 8,
    color: CYAN,
    marginBottom: 2,
  },
  headerValue: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  // Sections
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: CYAN,
  },
  bodyText: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.6,
    marginBottom: 6,
  },
  bulletItem: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.6,
    marginBottom: 3,
    paddingLeft: 12,
  },
  boldText: {
    fontFamily: 'Helvetica-Bold',
  },
  // Highlight-Box
  highlightBox: {
    backgroundColor: CYAN,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  highlightTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  highlightText: {
    fontSize: 8,
    color: '#ffffff',
    lineHeight: 1.5,
  },
  // Info-Box
  infoBox: {
    backgroundColor: LIGHT_BG,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 8,
    color: '#374151',
    lineHeight: 1.6,
  },
  // Warn-Box
  warnBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  warnText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
  },
  footerBar: {
    height: 2,
    backgroundColor: CYAN,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: GRAY,
  },
});

// ─── Footer-Komponente ──────────────────────────────────────────────────────

function Footer() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerBar} />
      <View style={s.footerRow}>
        <Text style={s.footerText}>cam2rent {'\u2013'} {BUSINESS.owner} {'\u2013'} {BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}</Text>
        <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </View>
  );
}

// ─── Tabellen-Zeile ─────────────────────────────────────────────────────────

function TableRow({ cells, alt, header }: { cells: string[]; alt?: boolean; header?: boolean }) {
  const bg = header ? NAVY : alt ? ALT_ROW : '#ffffff';
  const color = header ? '#ffffff' : DARK;
  const family = header ? 'Helvetica-Bold' : 'Helvetica';
  return (
    <View style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: 5, paddingHorizontal: 8 }}>
      <Text style={{ width: '40%', fontSize: 8, fontFamily: family, color }}>{cells[0]}</Text>
      <Text style={{ width: '30%', fontSize: 8, fontFamily: family, color }}>{cells[1]}</Text>
      <Text style={{ width: '30%', fontSize: 8, fontFamily: family, color }}>{cells[2]}</Text>
    </View>
  );
}

// ─── PDF-Dokument ───────────────────────────────────────────────────────────

export function HaftungsbedingungenPDF() {
  // Berlin-Zeit, sonst zeigt der Footer auf UTC-Servern zwischen 00-02 Uhr
  // Berlin den falschen Tag.
  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Berlin',
  });

  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page} wrap>
        <Footer />

        {/* Header */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={38} height={25} viewBox="0 0 160 100">
              <G transform="translate(80, 50)">
                <Rect x={-40} y={-18} width={80} height={48} rx={6} fill={CYAN} />
                <Rect x={-22} y={-26} width={20} height={10} rx={2} fill={CYAN} />
                <Circle cx={0} cy={6} r={14} fill={NAVY} />
                <Circle cx={0} cy={6} r={9} fill={CYAN} />
                <Circle cx={26} cy={-10} r={2} fill="#ffffff" />
              </G>
            </Svg>
            <View style={{ marginLeft: 10 }}>
              <Text style={s.headerTitle}>Haftungsbedingungen</Text>
              <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>cam2rent {'\u2013'} Action-Cam Verleih</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Stand</Text>
            <Text style={s.headerValue}>Januar 2026</Text>
            <Text style={[s.headerLabel, { marginTop: 4 }]}>Erstellt am</Text>
            <Text style={[s.headerValue, { color: CYAN }]}>{dateStr}</Text>
          </View>
        </View>

        {/* § 1 Geltungsbereich */}
        <Text style={s.sectionHeading}>{'\u00a7'} 1 Geltungsbereich</Text>
        <Text style={s.bodyText}>
          Diese Haftungsbedingungen gelten f{'\u00fc'}r alle Mietvertr{'\u00e4'}ge {'\u00fc'}ber Kamera-, Audio- und Video-Ausr{'\u00fc'}stung, die {'\u00fc'}ber www.{BUSINESS.domain} gebucht werden. Sie werden mit der Auswahl und Best{'\u00e4'}tigung einer Haftungsoption Bestandteil des Mietvertrages.
        </Text>

        {/* § 2 Haftungsoptionen */}
        <Text style={s.sectionHeading}>{'\u00a7'} 2 Haftungsoptionen</Text>
        <Text style={s.bodyText}>
          Bei jeder Buchung kann der Mieter zwischen folgenden Haftungsoptionen w{'\u00e4'}hlen:
        </Text>

        {/* Option 1: Ohne */}
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: GRAY }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK }}>Ohne Haftungsbegrenzung</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK }}>0 {'\u20ac'}</Text>
          </View>
          <Text style={{ fontSize: 8, color: GRAY, marginBottom: 3 }}>
            Der Mieter haftet in voller H{'\u00f6'}he des Wiederbeschaffungswerts der Ausr{'\u00fc'}stung.
          </Text>
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#dc2626' }}>Volle Haftung</Text>
          </View>
        </View>

        {/* Option 2: Standard */}
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: CYAN }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK }}>Standard-Haftungsschutz</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: CYAN }}>15 {'\u20ac'} / Miete</Text>
          </View>
          <Text style={{ fontSize: 8, color: GRAY, marginBottom: 3 }}>
            Deckt Sch{'\u00e4'}den bei sachgem{'\u00e4'}{'\u00df'}er Nutzung ab (z.B. Sturz-, Sto{'\u00df'}-, Wasser- oder Elektroniksch{'\u00e4'}den). Selbstbeteiligung: maximal 150 {'\u20ac'} pro Schadensfall.
          </Text>
          <View style={{ backgroundColor: '#eff6ff', borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: CYAN }}>Max. 150 {'\u20ac'} Selbstbeteiligung</Text>
          </View>
        </View>

        {/* Option 3: Premium */}
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK }}>Premium-Haftungsschutz</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#22c55e' }}>25 {'\u20ac'} / Miete</Text>
          </View>
          <Text style={{ fontSize: 8, color: GRAY, marginBottom: 3 }}>
            Vollschutz bei bestimmungsgem{'\u00e4'}{'\u00df'}er Nutzung {'\u2014'} keine Selbstbeteiligung im Schadensfall.
          </Text>
          <View style={{ backgroundColor: '#f0fdf4', borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#22c55e' }}>Keine Selbstbeteiligung</Text>
          </View>
        </View>

        {/* § 3 Abgedeckte Schadensfälle */}
        <Text style={s.sectionHeading}>{'\u00a7'} 3 Abgedeckte Schadensf{'\u00e4'}lle</Text>
        <Text style={s.bodyText}>
          Bei Auswahl der Standard- oder Premium-Haftung sind folgende Schadensf{'\u00e4'}lle abgedeckt:
        </Text>
        <Text style={s.bulletItem}>{'\u2022'} Technische Defekte durch normale Nutzung</Text>
        <Text style={s.bulletItem}>{'\u2022'} Sturz- und Sto{'\u00df'}sch{'\u00e4'}den</Text>
        <Text style={s.bulletItem}>{'\u2022'} Wassersch{'\u00e4'}den (innerhalb der Spezifikationen bzw. mit korrektem Schutzgeh{'\u00e4'}use)</Text>
        <Text style={s.bulletItem}>{'\u2022'} Diebstahl (mit Polizeianzeige und Aktenzeichen)</Text>
        <Text style={s.bulletItem}>{'\u2022'} Verlust von Kleinzubeh{'\u00f6'}r bis zu einem Wert von 25 {'\u20ac'}</Text>

        {/* § 4 Ausschlüsse */}
        <Text style={s.sectionHeading}>{'\u00a7'} 4 Ausschl{'\u00fc'}sse</Text>
        <View style={s.warnBox}>
          <Text style={s.warnText}>Kein Haftungsschutz besteht bei:</Text>
        </View>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Vorsatz oder grobe Fahrl{'\u00e4'}ssigkeit</Text> {'\u2014'} In diesen F{'\u00e4'}llen haftet der Mieter unabh{'\u00e4'}ngig von der gew{'\u00e4'}hlten Option in voller H{'\u00f6'}he.</Text>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Unsachgem{'\u00e4'}{'\u00df'}e Nutzung</Text> {'\u2014'} z.B. fehlende Schutzgeh{'\u00e4'}use, {'\u00dc'}berschreitung von Tiefengrenzen, Missachtung der Herstelleranweisungen.</Text>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Verlust ohne Nachweis</Text> {'\u2014'} Ohne polizeiliche Anzeige oder nachvollziehbare Dokumentation.</Text>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Korrosion und Salzablagerungen</Text> {'\u2014'} Wenn die Ausr{'\u00fc'}stung nach Salzwasserkontakt nicht ordnungsgem{'\u00e4'}{'\u00df'} mit S{'\u00fc'}{'\u00df'}wasser gesp{'\u00fc'}lt wurde.</Text>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Kosmetische Sch{'\u00e4'}den</Text> {'\u2014'} Kratzer und Abnutzung {'\u00fc'}ber den normalen Verschlei{'\u00df'} hinaus.</Text>
        <Text style={s.bulletItem}>{'\u2022'} <Text style={s.boldText}>Eigenm{'\u00e4'}chtige Reparaturen oder Modifikationen</Text> {'\u2014'} Jede nicht autorisierte Ver{'\u00e4'}nderung an der Ausr{'\u00fc'}stung.</Text>

        {/* § 5 Schadensmeldung */}
        <Text style={s.sectionHeading}>{'\u00a7'} 5 Schadensmeldung</Text>
        <Text style={s.bulletItem}>1. Sch{'\u00e4'}den m{'\u00fc'}ssen innerhalb von <Text style={s.boldText}>24 Stunden</Text> nach Auftreten gemeldet werden.</Text>
        <Text style={s.bulletItem}>2. Bei Diebstahl oder Verlust ist eine Polizeianzeige erforderlich. Das Aktenzeichen ist bei der Schadensmeldung anzugeben.</Text>
        <Text style={s.bulletItem}>3. Der Mieter muss auf Anfrage Fotos oder weitere Dokumentation des Schadens zur Verf{'\u00fc'}gung stellen.</Text>
        <Text style={[s.bodyText, { marginTop: 4 }]}>
          Schadensmeldungen k{'\u00f6'}nnen {'\u00fc'}ber das Kundenkonto oder per E-Mail an {BUSINESS.emailKontakt} eingereicht werden.
        </Text>

        {/* § 6 Schadensabwicklung */}
        <Text style={s.sectionHeading}>{'\u00a7'} 6 Schadensabwicklung</Text>
        <Text style={s.bulletItem}>1. Nach Eingang der Schadensmeldung wird die Ausr{'\u00fc'}stung gepr{'\u00fc'}ft und die Schadensh{'\u00f6'}he festgestellt.</Text>
        <Text style={s.bulletItem}>2. Der Mieter wird per E-Mail {'\u00fc'}ber das Ergebnis und die anfallenden Kosten informiert.</Text>
        <Text style={s.bulletItem}>3. Je nach gew{'\u00e4'}hlter Haftungsoption wird die Kaution teilweise oder vollst{'\u00e4'}ndig einbehalten bzw. freigegeben.</Text>

        {/* § 7 Schutzdauer */}
        <Text style={s.sectionHeading}>{'\u00a7'} 7 Schutzdauer</Text>
        <Text style={s.bodyText}>
          Der Haftungsschutz beginnt mit der {'\u00dc'}bergabe (Lieferung/Abholung) der Ausr{'\u00fc'}stung und endet einen Kalendertag nach dem vereinbarten Mietende oder bei dokumentierter R{'\u00fc'}ckgabe, je nachdem was zuerst eintritt.
        </Text>

        {/* § 8 Haftungsgrenzen — Zusammenfassung */}
        <Text style={s.sectionHeading}>{'\u00a7'} 8 Haftungsgrenzen {'\u2014'} Zusammenfassung</Text>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
          <TableRow cells={['Option', 'Preis / Miete', 'Selbstbeteiligung']} header />
          <TableRow cells={['Ohne Haftungsbegrenzung', `0 ${'\u20ac'}`, 'Voller Wiederbeschaffungswert']} />
          <TableRow cells={[`Standard-Haftungsschutz`, `15 ${'\u20ac'}`, `Max. 150 ${'\u20ac'}`]} alt />
          <TableRow cells={[`Premium-Haftungsschutz`, `25 ${'\u20ac'}`, 'Keine']} />
        </View>

        {/* Wichtiger Hinweis */}
        <View style={[s.highlightBox, { marginTop: 12 }]}>
          <Text style={s.highlightTitle}>Wichtiger Hinweis</Text>
          <Text style={s.highlightText}>
            Die Haftungsoptionen von cam2rent stellen keine Versicherung im Sinne des Versicherungsvertragsgesetzes (VVG) dar. Die Haftungsbegrenzung wird durch ein selbstfinanziertes Reparaturdepot von cam2rent getragen. Die erhobenen Geb{'\u00fc'}hren f{'\u00fc'}r Standard- und Premium-Haftungsschutz flie{'\u00df'}en in dieses Depot und dienen ausschlie{'\u00df'}lich der Deckung von Reparatur- und Ersatzkosten.
          </Text>
        </View>

        {/* Kontakt */}
        <View style={s.infoBox}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>Kontakt</Text>
          <Text style={s.infoText}>{BUSINESS.name} {'\u2013'} {BUSINESS.owner}</Text>
          <Text style={s.infoText}>{BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}</Text>
          <Text style={s.infoText}>E-Mail: {BUSINESS.emailKontakt}</Text>
          <Text style={s.infoText}>Telefon: {BUSINESS.phone}</Text>
          <Text style={s.infoText}>Web: www.{BUSINESS.domain}</Text>
        </View>

      </Page>
    </Document>
  );
}
