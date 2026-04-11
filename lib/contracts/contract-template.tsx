import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RentalContractData {
  bookingId: string;
  bookingNumber: string;
  contractDate: string;          // 'DD.MM.YYYY'
  // Mieter
  customerName: string;
  customerEmail: string;
  customerStreet?: string;
  customerZip?: string;
  customerCity?: string;
  customerNumber?: string;
  // Mietgegenstand
  productName: string;
  exemplarId?: string;
  accessories: string[];
  // Zeitraum
  rentalFrom: string;            // 'DD.MM.YYYY'
  rentalTo: string;              // 'DD.MM.YYYY'
  rentalDays: number;
  // Preise
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  priceShipping: number;
  priceTotal: number;
  deposit: number;
  // Steuer
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  // Signatur
  signatureDataUrl?: string;     // base64 PNG oder null fuer getippten Namen
  signatureMethod: 'canvas' | 'typed';
  signerName: string;
  signedAt: string;              // 'DD.MM.YYYY HH:MM' UTC
  ipAddress: string;
  contractHash: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' \u20ac';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAVY = '#0f172a';
const CYAN = '#06b6d4';
const GRAY = '#6b7280';
const DARK = '#1a1a1a';
const LIGHT_BG = '#f8fafc';

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
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: CYAN,
  },
  // Detail rows
  detailRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  detailLabel: {
    width: '32%',
    fontSize: 8,
    color: GRAY,
  },
  detailValue: {
    width: '68%',
    fontSize: 9,
    color: DARK,
  },
  detailValueBold: {
    width: '68%',
    fontSize: 9,
    color: DARK,
    fontFamily: 'Helvetica-Bold',
  },
  // Paragraphs (Vertragsbedingungen)
  clauseTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 10,
    marginBottom: 3,
  },
  clauseText: {
    fontSize: 8,
    color: '#374151',
    lineHeight: 1.55,
    marginBottom: 2,
  },
  // Signature
  signatureBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    backgroundColor: LIGHT_BG,
  },
  signatureImage: {
    width: 180,
    height: 50,
    objectFit: 'contain',
    marginTop: 6,
  },
  signatureLabel: {
    fontSize: 7,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  signatureValue: {
    fontSize: 8,
    color: DARK,
    marginBottom: 3,
  },
  hashValue: {
    fontSize: 6.5,
    fontFamily: 'Courier',
    color: GRAY,
    marginBottom: 3,
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

// ─── Vertragstext-Klauseln ────────────────────────────────────────────────────

function buildClauses(data: RentalContractData) {
  const companyEmail = BUSINESS.email;
  const companyWebsite = BUSINESS.url;
  const companyCity = BUSINESS.city;

  return [
    {
      title: '\u00a7 1 \u2013 Mietgegenstand',
      paragraphs: [
        '(1) Der Vermieter vermietet dem Mieter folgende(s) Geraet(e) und Zubehoer (nachfolgend \u201eMietgegenstand\u201c):',
        `${data.productName}${data.exemplarId ? ` (Exemplar-ID: ${data.exemplarId})` : ''}`,
        data.accessories.length > 0 ? `Zubehoer: ${data.accessories.join(', ')}` : '',
        '(2) Der Mietgegenstand ist Eigentum des Vermieters. Der Mieter erwirbt durch diesen Vertrag keinerlei Eigentumsrechte.',
        '(3) Dem Mieter ist es untersagt, den Mietgegenstand an Dritte weiterzuvermieten, zu ueberlassen oder als Sicherheit zu verwenden.',
      ],
    },
    {
      title: '\u00a7 2 \u2013 Mietzeitraum',
      paragraphs: [
        '(1) Der Mietzeitraum beginnt mit Anlieferung des Mietgegenstands beim Mieter und endet mit dem Eingang des vollstaendig und unbeschaedigt zurueckgesendeten Mietgegenstands beim Vermieter.',
        `(2) Vereinbarter Mietzeitraum: ${data.rentalFrom} bis ${data.rentalTo} (${data.rentalDays} Tag${data.rentalDays !== 1 ? 'e' : ''}).`,
        '(3) Massgeblich fuer das Ende des Mietzeitraums ist der Eingang der Ruecksendung beim Vermieter, nicht der Aufgabezeitpunkt beim Paketdienstleister.',
      ],
    },
    {
      title: '\u00a7 3 \u2013 Mietpreis und Zahlung',
      paragraphs: [
        `(1) Der Mietpreis betraegt insgesamt ${fmt(data.priceTotal)}.`,
        data.taxMode === 'kleinunternehmer'
          ? '(2) Der Vermieter ist Kleinunternehmer im Sinne von \u00a7 19 Abs. 1 UStG. Es wird keine Umsatzsteuer berechnet und ausgewiesen.'
          : `(2) Alle Betraege verstehen sich inkl. ${data.taxRate || 19}% MwSt.`,
        '(3) Die Zahlung erfolgt bargeldlos ueber den Zahlungsdienstleister Stripe per Kreditkarte oder SEPA-Lastschrift.',
      ],
    },
    {
      title: '\u00a7 4 \u2013 Kaution (Vorautorisierung)',
      paragraphs: [
        `(1) Zur Absicherung wird eine Vorautorisierung in Hoehe von ${fmt(data.deposit)} auf der Zahlungsmethode des Mieters vorgemerkt. Dieser Betrag wird nicht sofort eingezogen, sondern lediglich reserviert.`,
        '(2) Die Vorautorisierung wird vollstaendig freigegeben, wenn der Mietgegenstand fristgerecht, vollstaendig und ohne Schaeden zurueckgegeben wird.',
        '(3) Im Falle von Schaeden oder Verlust ist der Vermieter berechtigt, die Vorautorisierung ganz oder teilweise einzuziehen. Voraussetzung ist eine schriftliche Schadensbenachrichtigung mit Fotodokumentation.',
        '(4) Uebersteigt der Schaden die Hoehe der Vorautorisierung, ist der Vermieter berechtigt, den Differenzbetrag gesondert in Rechnung zu stellen.',
      ],
    },
    {
      title: '\u00a7 5 \u2013 Versand und Uebergabe',
      paragraphs: [
        '(1) Der Mietgegenstand wird per Paketdienstleister an die vom Mieter angegebene Lieferadresse versandt.',
        `(2) Der Mieter ist verpflichtet, den Mietgegenstand bei Empfang auf Vollstaendigkeit und Maengel zu pruefen. Maengel sind innerhalb von 24 Stunden per E-Mail an ${companyEmail} mit Fotodokumentation zu melden.`,
        '(3) Werden Maengel nicht innerhalb dieser Frist gemeldet, gilt der Mietgegenstand als in einwandfreiem Zustand uebergeben.',
        '(4) Der Vermieter stellt ein vorfrankiertes Ruecksendeetikett bereit. Die Ruecksendung hat in der Originalverpackung oder gleichwertiger Schutzverpackung zu erfolgen.',
      ],
    },
    {
      title: '\u00a7 6 \u2013 Sorgfaltspflicht und zulaessige Nutzung',
      paragraphs: [
        '(1) Der Mieter ist verpflichtet, den Mietgegenstand mit der Sorgfalt eines ordentlichen Kaufmanns zu behandeln.',
        '(2) Der Mieter ist insbesondere verpflichtet: den Mietgegenstand vor Feuchtigkeit, Regen und Hitze (>45\u00b0C) zu schuetzen; vor Stoessen und mechanischen Schaeden zu schuetzen; keine inkompatiblen Speicherkarten oder Akkus zu verwenden; keine eigenmaaechtigen Reparaturversuche vorzunehmen.',
        '(3) Verboten ist die Nutzung zur Verletzung der Persoenlichkeitsrechte Dritter, in Bereichen ohne erforderliche Genehmigung oder fuer strafbare Handlungen.',
      ],
    },
    {
      title: '\u00a7 7 \u2013 Haftung bei Schaeden und Verlust',
      paragraphs: [
        '(1) Der Mieter haftet fuer alle Schaeden, die waehrend des Mietzeitraums am Mietgegenstand entstehen.',
        '(2) Bei Totalschaden oder Verlust ist der Mieter zum Ersatz des Wiederbeschaffungswertes verpflichtet.',
        '(3) Bei Diebstahl ist unverzueglich eine Anzeige bei der Polizei zu erstatten. Die Erstattung entbindet den Mieter nicht von der Ersatzpflicht.',
        '(4) Schaeden durch normale, bestimmungsgemaesse Abnutzung werden dem Mieter nicht in Rechnung gestellt.',
      ],
    },
    {
      title: '\u00a7 8 \u2013 Verspaetete Rueckgabe',
      paragraphs: [
        '(1) Bei verspaeteter Rueckgabe wird fuer jeden angefangenen Tag der regulaere Tagespreis zzgl. 5,00 \u20ac Bearbeitungsgebuehr berechnet.',
        '(2) Ab einer Verspaetung von mehr als 3 Werktagen ohne Absprache ist der Vermieter berechtigt, die Vorautorisierung einzuziehen und die Polizei wegen Unterschlagung (\u00a7 246 StGB) zu informieren.',
        `(3) Drohende Verspaetungen sind so frueh wie moeglich per E-Mail an ${companyEmail} zu melden.`,
      ],
    },
    {
      title: '\u00a7 9 \u2013 Stornierung und Ruecktritt',
      paragraphs: [
        '(1) Stornierung mehr als 7 Tage vor Mietbeginn: 100% Erstattung. 3\u20137 Tage vorher: 50% Erstattung. Weniger als 3 Tage: keine Erstattung.',
        `(2) Stornierungen sind ueber das Kundenportal auf ${companyWebsite} oder per E-Mail an ${companyEmail} moeglich.`,
        '(3) Gemaess \u00a7 312g Abs. 2 Nr. 9 BGB ist das gesetzliche Widerrufsrecht fuer zeitgebundene Mietvertraege ausgeschlossen.',
      ],
    },
    {
      title: '\u00a7 10 \u2013 Datenschutz',
      paragraphs: [
        '(1) Der Vermieter verarbeitet personenbezogene Daten zur Vertragsdurchfuehrung auf Basis von Art. 6 Abs. 1 lit. b DSGVO.',
        '(2) Daten werden ohne Einwilligung nicht an Dritte weitergegeben, ausgenommen: Stripe (Zahlungsabwicklung), Paketdienstleister (Versand), Steuerberater/Behoerden (gesetzliche Pflicht).',
        `(3) Weitere Informationen unter: ${companyWebsite}/datenschutz`,
      ],
    },
    {
      title: '\u00a7 11 \u2013 Haftungsbeschraenkung des Vermieters',
      paragraphs: [
        '(1) Der Vermieter haftet unbeschraenkt fuer Schaeden aus Verletzung des Lebens, des Koerpers oder der Gesundheit sowie fuer vorsaetzlich verursachte Schaeden.',
        '(2) Im Uebrigen ist die Haftung auf typischerweise vorhersehbare Schaeden begrenzt.',
        '(3) Der Vermieter haftet nicht fuer Datenverluste auf Speicherkarten oder im Geraetespeicher.',
      ],
    },
    {
      title: '\u00a7 12 \u2013 Schlussbestimmungen',
      paragraphs: [
        `(1) Es gilt ausschliesslich deutsches Recht. Das UN-Kaufrecht (CISG) findet keine Anwendung.`,
        `(2) Gerichtsstand ist, soweit gesetzlich zulaessig, ${companyCity}.`,
        '(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der uebrigen Bestimmungen unberuehrt (Salvatorische Klausel).',
        '(4) Aenderungen dieses Vertrages beduerfen der Textform (\u00a7 126b BGB).',
      ],
    },
  ];
}

// ─── Vertragstext als String (fuer SHA-256 Hash) ─────────────────────────────

export function buildContractText(data: RentalContractData): string {
  const clauses = buildClauses(data);
  const lines: string[] = [
    'KAMERA-MIETVERTRAG',
    '',
    `Vermieter: ${BUSINESS.name} | ${BUSINESS.street} | ${BUSINESS.zip} ${BUSINESS.city}`,
    `${BUSINESS.email} | ${BUSINESS.url}`,
    '',
    `Mieter: ${data.customerName}`,
    data.customerStreet ? `${data.customerStreet}, ${data.customerZip} ${data.customerCity}` : '',
    data.customerEmail,
    '',
    `Mietgegenstand: ${data.productName}`,
    data.accessories.length > 0 ? `Zubehoer: ${data.accessories.join(', ')}` : '',
    '',
    `Mietzeitraum: ${data.rentalFrom} bis ${data.rentalTo} (${data.rentalDays} Tage)`,
    `Gesamtbetrag: ${fmt(data.priceTotal)}`,
    `Kaution: ${fmt(data.deposit)}`,
    '',
  ];

  for (const clause of clauses) {
    lines.push(clause.title);
    for (const p of clause.paragraphs) {
      if (p) lines.push(p);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Digitale Signatur:');
  lines.push(`Unterzeichnet von: ${data.signerName}`);
  lines.push(`Datum & Uhrzeit: ${data.signedAt} (UTC)`);
  lines.push(`IP-Adresse: ${data.ipAddress}`);
  lines.push(`Buchungsnummer: ${data.bookingNumber}`);

  return lines.join('\n');
}

// ─── PDF-Dokument ─────────────────────────────────────────────────────────────

export function RentalContractPDF({ data }: { data: RentalContractData }) {
  const contractNumber = data.bookingNumber.replace('BK-', 'MV-');
  const clauses = buildClauses(data);

  // Split clauses into page 1 and page 2 groups
  const page1Clauses = clauses.slice(0, 5);   // §1-§5
  const page2Clauses = clauses.slice(5, 9);   // §6-§9
  const page3Clauses = clauses.slice(9);       // §10-§12 + Signatur

  return (
    <Document>
      {/* ═══════ SEITE 1: Vertragsdetails + §1-§5 ═══════ */}
      <Page size="A4" style={s.page}>
        {/* Header-Balken */}
        <View style={s.headerBar}>
          <Text style={s.headerTitle}>MIETVERTRAG</Text>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Vertragsnummer</Text>
            <Text style={s.headerValue}>{contractNumber}</Text>
            <Text style={[s.headerLabel, { marginTop: 4 }]}>Datum</Text>
            <Text style={[s.headerValue, { color: CYAN }]}>{data.contractDate}</Text>
          </View>
        </View>

        {/* Vertragsparteien */}
        <Text style={s.sectionHeading}>Vertragsparteien</Text>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Vermieter</Text>
          <Text style={s.detailValue}>{BUSINESS.name} | {BUSINESS.owner}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}></Text>
          <Text style={s.detailValue}>{BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mieter</Text>
          <Text style={s.detailValue}>{data.customerName}</Text>
        </View>
        {data.customerStreet && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}></Text>
            <Text style={s.detailValue}>{data.customerStreet}, {data.customerZip} {data.customerCity}</Text>
          </View>
        )}
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>E-Mail</Text>
          <Text style={s.detailValue}>{data.customerEmail}</Text>
        </View>

        {/* Mietdetails */}
        <Text style={s.sectionHeading}>Mietdetails</Text>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietobjekt</Text>
          <Text style={s.detailValueBold}>{data.productName}</Text>
        </View>
        {data.accessories.length > 0 && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Zubehoer</Text>
            <Text style={s.detailValue}>{data.accessories.join(', ')}</Text>
          </View>
        )}
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietzeitraum</Text>
          <Text style={s.detailValue}>{data.rentalFrom} \u2013 {data.rentalTo} ({data.rentalDays} {data.rentalDays === 1 ? 'Tag' : 'Tage'})</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietpreis</Text>
          <Text style={s.detailValue}>{fmt(data.priceRental)}</Text>
        </View>
        {data.priceAccessories > 0 && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Zubehoer</Text>
            <Text style={s.detailValue}>{fmt(data.priceAccessories)}</Text>
          </View>
        )}
        {data.priceHaftung > 0 && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Haftungsschutz</Text>
            <Text style={s.detailValue}>{fmt(data.priceHaftung)}</Text>
          </View>
        )}
        {data.priceShipping > 0 && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Versand</Text>
            <Text style={s.detailValue}>{fmt(data.priceShipping)}</Text>
          </View>
        )}
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Gesamtbetrag</Text>
          <Text style={s.detailValueBold}>{fmt(data.priceTotal)}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Kaution</Text>
          <Text style={s.detailValue}>{fmt(data.deposit)}</Text>
        </View>

        {/* §1-§5 */}
        <Text style={[s.sectionHeading, { marginTop: 14 }]}>Vertragsbedingungen</Text>
        {page1Clauses.map((clause, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{clause.title}</Text>
            {clause.paragraphs.filter(Boolean).map((p, j) => (
              <Text key={j} style={s.clauseText}>{p}</Text>
            ))}
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerBar} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>{BUSINESS.name} | {BUSINESS.street} | {BUSINESS.zip} {BUSINESS.city}</Text>
            <Text style={s.footerText}>Seite 1 von 3</Text>
          </View>
        </View>
      </Page>

      {/* ═══════ SEITE 2: §6-§9 ═══════ */}
      <Page size="A4" style={s.page}>
        <View style={[s.headerBar, { paddingVertical: 12, marginBottom: 16 }]}>
          <Text style={[s.headerTitle, { fontSize: 12 }]}>{BUSINESS.name} \u2013 Mietvertrag {contractNumber}</Text>
          <Text style={{ fontSize: 8, color: '#94a3b8' }}>Seite 2 von 3</Text>
        </View>

        {page2Clauses.map((clause, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{clause.title}</Text>
            {clause.paragraphs.filter(Boolean).map((p, j) => (
              <Text key={j} style={s.clauseText}>{p}</Text>
            ))}
          </View>
        ))}

        <View style={s.footer}>
          <View style={s.footerBar} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>{BUSINESS.name} | {BUSINESS.street} | {BUSINESS.zip} {BUSINESS.city}</Text>
            <Text style={s.footerText}>Seite 2 von 3</Text>
          </View>
        </View>
      </Page>

      {/* ═══════ SEITE 3: §10-§12 + Signatur ═══════ */}
      <Page size="A4" style={s.page}>
        <View style={[s.headerBar, { paddingVertical: 12, marginBottom: 16 }]}>
          <Text style={[s.headerTitle, { fontSize: 12 }]}>{BUSINESS.name} \u2013 Mietvertrag {contractNumber}</Text>
          <Text style={{ fontSize: 8, color: '#94a3b8' }}>Seite 3 von 3</Text>
        </View>

        {page3Clauses.map((clause, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{clause.title}</Text>
            {clause.paragraphs.filter(Boolean).map((p, j) => (
              <Text key={j} style={s.clauseText}>{p}</Text>
            ))}
          </View>
        ))}

        {/* Einwilligungserklaerung */}
        <View style={{ marginTop: 14, padding: 10, backgroundColor: LIGHT_BG, borderRadius: 4 }}>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.55 }}>
            Mit meiner digitalen Unterschrift bestaetige ich: (1) Ich habe diesen Mietvertrag vollstaendig gelesen und verstanden. (2) Ich stimme allen Bedingungen zu. (3) Ich bin volljaehrig und geschaeftsfaehig. (4) Die von mir angegebenen Daten sind korrekt. (5) Ich bin einverstanden, dass diese digitale Signatur gemaess der eIDAS-Verordnung (EU) 2014/910 als rechtsgueltige elektronische Signatur gilt.
          </Text>
        </View>

        {/* Signatur-Block */}
        <View style={s.signatureBox}>
          <Text style={s.signatureLabel}>Digitale Signatur</Text>
          <View style={s.detailRow}>
            <Text style={s.signatureLabel}>Unterzeichnet von:</Text>
            <Text style={[s.signatureValue, { fontFamily: 'Helvetica-Bold' }]}>{data.signerName}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.signatureLabel}>Datum & Uhrzeit:</Text>
            <Text style={s.signatureValue}>{data.signedAt} (UTC)</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.signatureLabel}>IP-Adresse:</Text>
            <Text style={s.signatureValue}>{data.ipAddress}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.signatureLabel}>Dokument-Hash (SHA-256):</Text>
            <Text style={s.hashValue}>{data.contractHash}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.signatureLabel}>Buchungsnummer:</Text>
            <Text style={s.signatureValue}>{data.bookingNumber}</Text>
          </View>

          {/* Unterschriftsbild oder getippter Name */}
          {data.signatureDataUrl && data.signatureMethod === 'canvas' ? (
            <View style={{ marginTop: 6 }}>
              <Text style={s.signatureLabel}>Unterschrift:</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.signatureDataUrl} style={s.signatureImage} />
            </View>
          ) : (
            <View style={{ marginTop: 6 }}>
              <Text style={s.signatureLabel}>Signiert durch (getippt):</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 4 }}>
                {data.signerName}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerBar} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>{BUSINESS.name} | {BUSINESS.street} | {BUSINESS.zip} {BUSINESS.city}</Text>
            <Text style={s.footerText}>Seite 3 von 3</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
