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

export interface MietgegenstandItem {
  position: number;
  bezeichnung: string;
  seriennr: string;
  tage: number;
  preis: number;
  wiederbeschaffungswert: number;
}

export interface RentalContractData {
  bookingId: string;
  bookingNumber: string;
  contractDate: string;          // 'DD.MM.YYYY'
  contractTime: string;          // 'HH:MM'
  // Mieter
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerStreet?: string;
  customerZip?: string;
  customerCity?: string;
  customerCountry?: string;
  customerBirthdate?: string;
  customerNumber?: string;
  customerVerifiedAt?: string;
  // Mietgegenstand
  items: MietgegenstandItem[];
  // Zeitraum
  rentalFrom: string;            // 'DD.MM.YYYY'
  rentalTo: string;              // 'DD.MM.YYYY'
  rentalDays: number;
  deliveryMode: string;          // 'Versand' | 'Abholung'
  returnMode: string;            // 'Rücksendung' | 'Rückgabe vor Ort'
  deliveryAddress?: string;
  // Preise
  priceRental: number;
  priceShipping: number;
  priceHaftung: number;
  priceTotal: number;
  // Haftung
  haftungOption: string;         // 'Ohne Schadenspauschale' | 'Basis-Schadenspauschale' | 'Premium-Schadenspauschale'
  haftungDescription: string;
  // Stripe
  stripePaymentIntentId?: string;
  paymentDate?: string;
  // Signatur (Legacy-Kompatibilität)
  signatureDataUrl?: string;
  signatureMethod: 'canvas' | 'typed';
  signerName: string;
  signedAt: string;
  ipAddress: string;
  contractHash: string;
  // Backwards compat
  productName?: string;
  accessories?: string[];
  priceAccessories?: number;
  deposit?: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  exemplarId?: string;
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

// ─── Tabellen-Hilfsfunktionen ─────────────────────────────────────────────────

const ALT_ROW = '#f1f5f9';

function TableRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: alt ? ALT_ROW : '#ffffff', paddingVertical: 4, paddingHorizontal: 8 }}>
      <Text style={{ width: '38%', fontSize: 8, color: GRAY }}>{label}</Text>
      <Text style={{ width: '62%', fontSize: 9, color: DARK }}>{value}</Text>
    </View>
  );
}

function TableHeader({ children }: { children: string }) {
  return (
    <View style={{ backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>{children}</Text>
    </View>
  );
}

// ─── Vertragsparagraphen ──────────────────────────────────────────────────────

const PARAGRAPHEN: { title: string; text: string }[] = [
  { title: '\u00a7 1 Vertragsgegenstand und Eigentum', text: '(1) Der Vermieter \u00fcberl\u00e4sst dem Mieter die in der Tabelle Mietgegenstand aufgef\u00fchrten Ger\u00e4te nebst Zubeh\u00f6r (nachfolgend Mietsache) f\u00fcr die vereinbarte Mietdauer zum vertragsgem\u00e4\u00dfen Gebrauch gegen Zahlung des vereinbarten Mietentgelts.\n(2) Das Eigentum an der Mietsache verbleibt w\u00e4hrend der gesamten Mietdauer ausschlie\u00dflich beim Vermieter. Der Mieter erwirbt kein Eigentum, keine Anwartschaft und kein Recht, die Mietsache zu ver\u00e4u\u00dfern, zu verpf\u00e4nden, sicherungshalber zu \u00fcbereignen oder Dritten Rechte an ihr einzur\u00e4umen.\n(3) Wird auf die Mietsache durch Dritte zugegriffen (insbesondere Pf\u00e4ndung, Beschlagnahme), hat der Mieter den Vermieter unverz\u00fcglich schriftlich zu benachrichtigen und den Dritten auf das Eigentum des Vermieters hinzuweisen.' },
  { title: '\u00a7 2 Voraussetzungen des Vertragsschlusses, Konto-Verifizierung', text: '(1) Der Mieter erkl\u00e4rt, mindestens 18 Jahre alt und voll gesch\u00e4ftsf\u00e4hig zu sein. Der Vermieter ist berechtigt, bei begr\u00fcndeten Zweifeln einen Altersnachweis zu verlangen.\n(2) Vor der ersten Buchung muss der Mieter sein Kundenkonto verifizieren: a) Best\u00e4tigung der E-Mail-Adresse durch Verifizierungslink, b) Upload eines amtlichen Lichtbilddokuments.\n(3) Das Ausweisdokument dient ausschlie\u00dflich der Identit\u00e4tspr\u00fcfung (Art. 6 Abs. 1 lit. b und f DSGVO). Es wird verschl\u00fcsselt gespeichert und sp\u00e4testens 90 Tage nach Ende der letzten Gesch\u00e4ftsbeziehung gel\u00f6scht.\n(4) Ohne abgeschlossene Verifizierung ist keine Buchung m\u00f6glich.\n(5) Der Mieter versichert, dass die angegebenen Daten vollst\u00e4ndig und wahrheitsgem\u00e4\u00df sind.' },
  { title: '\u00a7 3 Zustandekommen des Vertrags', text: '(1) Die Darstellung der Mietgegenst\u00e4nde auf der Website stellt kein bindendes Angebot, sondern eine Aufforderung zur Abgabe eines Angebots dar.\n(2) Durch Klick auf "zahlungspflichtig buchen" und erfolgreichen Zahlungsvorgang gibt der Mieter ein verbindliches Angebot ab.\n(3) Der Vertrag kommt zustande wenn: a) der vollst\u00e4ndige Mietpreis erfolgreich eingezogen ist, b) der Vermieter eine Buchungsbest\u00e4tigung per E-Mail zugesandt hat.\n(4) Schl\u00e4gt die Zahlung fehl, kommt kein Vertrag zustande.\n(5) Der Vermieter kann Buchungen innerhalb von 48 Stunden ohne Angabe von Gr\u00fcnden ablehnen. Der Betrag wird vollst\u00e4ndig erstattet.' },
  { title: '\u00a7 4 Mietdauer, \u00dcbergabe, R\u00fcckgabe', text: '(1) Die Mietdauer ergibt sich aus den Buchungsdaten dieses Vertrags.\n(2) Bei Versand beginnt die Mietdauer mit dem vereinbarten Mietbeginn, unabh\u00e4ngig vom tats\u00e4chlichen Zustelldatum.\n(3) Bei Abholung beginnt die Mietdauer mit der tats\u00e4chlichen \u00dcbergabe.\n(4) Die R\u00fcckgabe erfolgt fristgerecht, wenn der Mieter die Mietsache am letzten Miettag bis 18:00 Uhr nachweislich an den Versanddienstleister \u00fcbergibt oder pers\u00f6nlich zur\u00fcckgibt.\n(5) Die R\u00fcckgabe umfasst die Mietsache, s\u00e4mtliches Zubeh\u00f6r und die Originalverpackung.' },
  { title: '\u00a7 5 Gefahr\u00fcbergang beim Versand', text: '(1) Der Vermieter tr\u00e4gt das Risiko des Hinversands bis zur Zustellung.\n(2) Das Risiko beim R\u00fcckversand tr\u00e4gt der Vermieter ab \u00dcbergabe an den Versanddienstleister, sofern der Mieter den bereitgestellten R\u00fccksendeschein und eine transportsichere Verpackung verwendet.' },
  { title: '\u00a7 6 Pflichten des Mieters', text: '(1) Der Mieter verpflichtet sich, die Mietsache pfleglich, bestimmungsgem\u00e4\u00df und unter Beachtung der Herstellerangaben zu behandeln.\n(2) Untersagt sind insbesondere: a) Nutzung entgegen Herstellerangaben, b) \u00d6ffnen, Modifizieren oder Reparieren der Mietsache, c) Weitergabe an Dritte ohne Zustimmung, d) gewerbliche Nutzung ohne Zustimmung, e) rechtswidrige Nutzung.\n(3) Der Mieter sch\u00fctzt die Mietsache vor Verlust, Diebstahl und Witterungseinfl\u00fcssen.\n(4) Zuwiderhandlungen berechtigen zur fristlosen K\u00fcndigung.' },
  { title: '\u00a7 7 Haftung des Mieters, Schadenspauschale', text: '(1) Der Mieter haftet f\u00fcr Sch\u00e4den, Verlust, Zerst\u00f6rung oder Diebstahl der Mietsache w\u00e4hrend der Mietdauer.\n(2) Die gew\u00e4hlte Schadenspauschale bestimmt die Haftungsobergrenze:\na) Ohne Schadenspauschale: Haftung bis zum Zeitwert (Wiederbeschaffungswert).\nb) Basis-Schadenspauschale: Ersatzpflicht auf 200 EUR je Schadensereignis begrenzt.\nc) Premium-Schadenspauschale: Ersatzpflicht auf 0 EUR begrenzt.\n(2a) Die Tagespauschalen sind nach Mietdauer gestaffelt:\n\u2022 Basis: 15 EUR/Tag (1\u20137 Tage), 20 EUR/Tag (8\u201314), 25 EUR/Tag (15\u201321), +5 EUR/Tag je weitere 7 Tage.\n\u2022 Premium: 25 EUR/Tag (1\u20137 Tage), 35 EUR/Tag (8\u201314), 45 EUR/Tag (15\u201321), +10 EUR/Tag je weitere 7 Tage.\n(3) Schadensh\u00f6he: a) bei reparablen Sch\u00e4den die Reparaturkosten, b) bei Totalschaden/Verlust der Zeitwert.\n(4) Die Haftungsbegrenzung gilt NICHT bei: a) Vorsatz/grobe Fahrl\u00e4ssigkeit, b) bestimmungswidriger Nutzung, c) Versto\u00df gegen \u00a7 6, d) unterlassener Schadensmeldung, e) Diebstahl ohne Anzeige.\n(5) Die Schadenspauschale ist KEINE Versicherung im Sinne des VVG.' },
  { title: '\u00a7 8 Schadensmeldung', text: '(1) Sch\u00e4den, Verlust oder Diebstahl sind dem Vermieter unverz\u00fcglich, sp\u00e4testens innerhalb von 48 Stunden, per E-Mail an kontakt@cam2rent.de zu melden.\n(2) Bei Diebstahl ist zus\u00e4tzlich Strafanzeige zu erstatten. Eine Kopie ist binnen 7 Tagen vorzulegen.\n(3) Der Vermieter dokumentiert den Schaden nachvollziehbar und \u00fcbermittelt die Nachweise vor Geltendmachung.' },
  { title: '\u00a7 9 Schadensabrechnung, Zahlungsmodalit\u00e4ten', text: '(1) Weder eine Kaution noch eine Kreditkartenvorautorisierung wird erhoben. Anspr\u00fcche werden separat abgerechnet.\n(2) Im Schadensfall stellt der Vermieter eine Rechnung mit Aufstellung, Fotodokumentation und ggf. Kostenvoranschlag. Zahlungsfrist: 14 Tage.\n(3) Der Mieter erh\u00e4lt die Schadensdokumentation zur Pr\u00fcfung und kann binnen 14 Tagen widersprechen.\n(4) Bei Zahlungsverzug gelten die gesetzlichen Regelungen (\u00a7\u00a7 286 ff. BGB).\n(5) Der Mieter bleibt verpflichtet, die Mietsache fristgerecht zur\u00fcckzugeben. Ein Zur\u00fcckbehaltungsrecht besteht nicht.' },
  { title: '\u00a7 10 M\u00e4ngel der Mietsache', text: '(1) Bei M\u00e4ngeln stehen dem Mieter die gesetzlichen Rechte nach \u00a7\u00a7 536 ff. BGB zu.\n(2) Offensichtliche M\u00e4ngel sollten m\u00f6glichst zeitnah angezeigt werden. Gesetzliche Rechte bleiben unber\u00fchrt.\n(3) Kann der Vermieter die Mietsache nicht bereitstellen, werden gezahlte Betr\u00e4ge binnen 14 Tagen erstattet.' },
  { title: '\u00a7 11 Versp\u00e4tete R\u00fcckgabe', text: '(1) Bei versp\u00e4teter R\u00fcckgabe schuldet der Mieter f\u00fcr jeden angefangenen weiteren Miettag den regul\u00e4ren Tagesmietpreis.\n(2) Der Vermieter kann Ersatz weiterer nachweisbar entstandener Sch\u00e4den verlangen.\n(3) Dem Mieter bleibt der Nachweis vorbehalten, dass kein oder ein geringerer Schaden entstanden ist.\n(4) Eine nachtr\u00e4gliche Verl\u00e4ngerung ist auf Anfrage m\u00f6glich.' },
  { title: '\u00a7 12 Stornierung', text: '(1) Der Mieter kann bis zum Mietbeginn stornieren:\n\u2022 Mehr als 7 Tage vorher: kostenfrei (100 % R\u00fcckerstattung)\n\u2022 3 bis 7 Tage vorher: 50 % des Mietpreises\n\u2022 Weniger als 3 Tage vorher: 90 % des Mietpreises\n(2) Dem Mieter bleibt der Nachweis eines geringeren Schadens vorbehalten. Dem Vermieter bleibt der Nachweis eines h\u00f6heren Schadens vorbehalten.\n(3) Versandkosten werden bei Stornierung vor Versand vollst\u00e4ndig erstattet.\n(4) Die Stornierung erfolgt per E-Mail an kontakt@cam2rent.de.' },
  { title: '\u00a7 13 Widerrufsrecht', text: 'Der Mieter als Verbraucher hat ein gesetzliches Widerrufsrecht nach \u00a7\u00a7 355 ff. BGB. Einzelheiten ergeben sich aus der separat zur Verf\u00fcgung gestellten Widerrufsbelehrung.' },
  { title: '\u00a7 14 Haftung des Vermieters', text: '(1) Der Vermieter haftet unbeschr\u00e4nkt bei Vorsatz, grober Fahrl\u00e4ssigkeit, Verletzung von Leben/K\u00f6rper/Gesundheit und nach dem Produkthaftungsgesetz.\n(2) Bei leichter Fahrl\u00e4ssigkeit haftet der Vermieter nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten), begrenzt auf den vorhersehbaren, vertragstypischen Schaden.\n(3) Eine weitergehende Haftung ist ausgeschlossen.\n(4) Die Haftungsbeschr\u00e4nkungen gelten auch f\u00fcr Mitarbeiter und Erf\u00fcllungsgehilfen.' },
  { title: '\u00a7 15 Aufrechnung, Zur\u00fcckbehaltungsrecht', text: 'Der Mieter kann nur mit unbestrittenen oder rechtskr\u00e4ftig festgestellten Gegenforderungen aufrechnen. Ein Zur\u00fcckbehaltungsrecht besteht nur bei Gegenansprüchen aus demselben Vertragsverh\u00e4ltnis.' },
  { title: '\u00a7 16 Datenschutz', text: '(1) Der Vermieter verarbeitet Daten zur Vertragsdurchf\u00fchrung (Art. 6 Abs. 1 lit. b DSGVO), zur Betrugspr\u00e4vention (Art. 6 Abs. 1 lit. f DSGVO) und zur Erf\u00fcllung gesetzlicher Pflichten (Art. 6 Abs. 1 lit. c DSGVO).\n(2) Empf\u00e4nger: Stripe (Zahlung), Resend (E-Mail), Sendcloud (Versand). Auftragsverarbeitungsvertr\u00e4ge bestehen.\n(3) Einzelheiten unter www.cam2rent.de/datenschutz.' },
  { title: '\u00a7 17 Elektronischer Vertragsschluss, Textform', text: '(1) Der Vertrag wird elektronisch geschlossen. Die Best\u00e4tigung erfolgt per E-Mail.\n(2) Der Vertragstext wird gespeichert und dem Mieter als PDF \u00fcbermittelt.\n(3) \u00c4nderungen bed\u00fcrfen der Textform (E-Mail gen\u00fcgt).\n(4) Eine handschriftliche Unterschrift ist zur Wirksamkeit nicht erforderlich.' },
  { title: '\u00a7 18 Online-Streitbeilegung, Verbraucherschlichtung', text: '(1) Die Europ\u00e4ische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: https://ec.europa.eu/consumers/odr/\n(2) Der Vermieter ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (\u00a7 36 VSBG).' },
  { title: '\u00a7 19 Anwendbares Recht, Schlussbestimmungen', text: '(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften bleiben unber\u00fchrt.\n(2) Eine Gerichtsstandsvereinbarung wird nicht getroffen; es gelten die gesetzlichen Regelungen.\n(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der \u00fcbrigen Bestimmungen unber\u00fchrt (Salvatorische Klausel).\n(4) M\u00fcndliche Nebenabreden bestehen nicht.' },
];

// ─── buildContractText (für SHA-256 Hash) ───────────────────────────────────

export function buildContractText(data: RentalContractData): string {
  const lines: string[] = [
    'MIETVERTRAG',
    'über die Vermietung von Kamera- und Zubehörprodukten',
    '',
    `Vermieter: ${BUSINESS.name} | ${BUSINESS.owner} | ${BUSINESS.street} | ${BUSINESS.zip} ${BUSINESS.city}`,
    `Mieter: ${data.customerName} | ${data.customerEmail}`,
    `Buchungsnummer: ${data.bookingNumber}`,
    `Mietbeginn: ${data.rentalFrom} | Mietende: ${data.rentalTo} | Dauer: ${data.rentalDays} Tage`,
    `Gesamtbetrag: ${fmt(data.priceTotal)}`,
    `Haftungsoption: ${data.haftungOption}`,
    '',
  ];
  for (const item of data.items) {
    lines.push(`Pos ${item.position}: ${item.bezeichnung} | ${item.seriennr} | ${fmt(item.preis)} | Wert: ${fmt(item.wiederbeschaffungswert)}`);
  }
  lines.push('');
  for (const p of PARAGRAPHEN) {
    lines.push(p.title);
    lines.push(p.text);
    lines.push('');
  }
  lines.push(`Vertragsschluss: ${data.contractDate} um ${data.contractTime} Uhr`);
  return lines.join('\n');
}

// ─── Footer-Komponente ────────────────────────────────────────────────────────

function Footer({ pageNum, totalPages }: { pageNum: number; totalPages: number }) {
  return (
    <View style={s.footer}>
      <View style={s.footerBar} />
      <View style={s.footerRow}>
        <Text style={s.footerText}>cam2rent \u2013 Lennart Schickel \u2013 Heimsbrunner Str. 12, 12349 Berlin</Text>
        <Text style={s.footerText}>Seite {pageNum} von {totalPages}</Text>
      </View>
    </View>
  );
}

function MiniHeader({ contractNumber }: { contractNumber: string }) {
  return (
    <View style={[s.headerBar, { paddingVertical: 12, marginBottom: 16 }]}>
      <Text style={[s.headerTitle, { fontSize: 12 }]}>{BUSINESS.name} \u2013 Mietvertrag {contractNumber}</Text>
    </View>
  );
}

// ─── PDF-Dokument ─────────────────────────────────────────────────────────────

export function RentalContractPDF({ data }: { data: RentalContractData }) {
  const contractNumber = data.bookingNumber.replace('BK-', 'MV-').replace('C2R-', 'MV-');
  const totalPages = 5;

  return (
    <Document>
      {/* ═══════ SEITE 1: Header + Vertragsparteien + Buchungsdaten + Mietgegenstand ═══════ */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerBar}>
          <View>
            <Text style={s.headerTitle}>Mietvertrag</Text>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>über die Vermietung von Kamera- und Zubehörprodukten</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Vertragsnummer</Text>
            <Text style={s.headerValue}>{contractNumber}</Text>
            <Text style={[s.headerLabel, { marginTop: 4 }]}>Datum</Text>
            <Text style={[s.headerValue, { color: CYAN }]}>{data.contractDate}</Text>
          </View>
        </View>

        {/* Vertragsparteien */}
        <Text style={s.sectionHeading}>Vertragsparteien</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          {/* Vermieter */}
          <View style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <TableHeader>Vermieter</TableHeader>
            <View style={{ padding: 8 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 }}>{BUSINESS.name}</Text>
              <Text style={{ fontSize: 8, color: GRAY }}>{BUSINESS.owner} (Einzelunternehmen)</Text>
              <Text style={{ fontSize: 8, color: GRAY }}>{BUSINESS.street}</Text>
              <Text style={{ fontSize: 8, color: GRAY }}>{BUSINESS.zip} {BUSINESS.city}</Text>
              <Text style={{ fontSize: 8, color: GRAY }}>Tel.: {BUSINESS.phone}</Text>
              <Text style={{ fontSize: 8, color: GRAY }}>E-Mail: {BUSINESS.emailKontakt}</Text>
              <Text style={{ fontSize: 8, color: GRAY, marginTop: 3 }}>Kleinunternehmer gem. § 19 UStG</Text>
            </View>
          </View>
          {/* Mieter */}
          <View style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <TableHeader>Mieter</TableHeader>
            <View style={{ padding: 8 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 }}>{data.customerName}</Text>
              {data.customerStreet && <Text style={{ fontSize: 8, color: GRAY }}>{data.customerStreet}</Text>}
              {(data.customerZip || data.customerCity) && <Text style={{ fontSize: 8, color: GRAY }}>{data.customerZip} {data.customerCity}</Text>}
              {data.customerCountry && <Text style={{ fontSize: 8, color: GRAY }}>Land: {data.customerCountry}</Text>}
              {data.customerBirthdate && <Text style={{ fontSize: 8, color: GRAY }}>Geb.: {data.customerBirthdate}</Text>}
              {data.customerPhone && <Text style={{ fontSize: 8, color: GRAY }}>Tel.: {data.customerPhone}</Text>}
              <Text style={{ fontSize: 8, color: GRAY }}>E-Mail: {data.customerEmail}</Text>
              {data.customerNumber && <Text style={{ fontSize: 8, color: GRAY }}>Kundennr.: {data.customerNumber}</Text>}
              {data.customerVerifiedAt && <Text style={{ fontSize: 8, color: GRAY }}>Verifiziert: {data.customerVerifiedAt}</Text>}
            </View>
          </View>
        </View>

        {/* Buchungsdaten */}
        <Text style={s.sectionHeading}>Buchungsdaten</Text>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
          <TableRow label="Buchungsnummer" value={data.bookingNumber} />
          <TableRow label="Vertragsschluss" value={`${data.contractDate} um ${data.contractTime} Uhr`} alt />
          <TableRow label="Mietbeginn" value={data.rentalFrom} />
          <TableRow label="Mietende" value={data.rentalTo} alt />
          <TableRow label="Mietdauer" value={`${data.rentalDays} Tage`} />
          <TableRow label="Übergabeart" value={data.deliveryMode} alt />
          <TableRow label="Rückgabeart" value={data.returnMode} />
          {data.deliveryAddress && <TableRow label="Lieferadresse" value={data.deliveryAddress} alt />}
        </View>

        {/* Mietgegenstand */}
        <Text style={s.sectionHeading}>Mietgegenstand</Text>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
          {/* Tabellenkopf */}
          <View style={{ flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={{ width: '8%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Pos</Text>
            <Text style={{ width: '37%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Bezeichnung</Text>
            <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Seriennr.</Text>
            <Text style={{ width: '15%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' }}>Tage</Text>
            <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' }}>Preis</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 === 1 ? ALT_ROW : '#fff', paddingVertical: 4, paddingHorizontal: 6 }}>
              <Text style={{ width: '8%', fontSize: 8, color: DARK }}>{item.position}</Text>
              <Text style={{ width: '37%', fontSize: 8, color: DARK }}>{item.bezeichnung}</Text>
              <Text style={{ width: '20%', fontSize: 8, color: GRAY }}>{item.seriennr || '\u2013'}</Text>
              <Text style={{ width: '15%', fontSize: 8, color: DARK, textAlign: 'right' }}>{item.tage}</Text>
              <Text style={{ width: '20%', fontSize: 8, color: DARK, textAlign: 'right' }}>{fmt(item.preis)}</Text>
            </View>
          ))}
        </View>

        {/* Wiederbeschaffungswerte */}
        <Text style={{ fontSize: 8, color: GRAY, marginBottom: 4 }}>Zur Transparenz: Die folgenden Zeitwerte dienen als Obergrenze der Ersatzpflicht bei Totalschaden oder Verlust (Option Ohne Schadenspauschale, siehe § 7).</Text>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 3, paddingHorizontal: 6 }}>
            <Text style={{ width: '60%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Artikel</Text>
            <Text style={{ width: '40%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' }}>Zeitwert</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 === 1 ? ALT_ROW : '#fff', paddingVertical: 3, paddingHorizontal: 6 }}>
              <Text style={{ width: '60%', fontSize: 8, color: DARK }}>{item.bezeichnung}</Text>
              <Text style={{ width: '40%', fontSize: 8, color: DARK, textAlign: 'right' }}>{fmt(item.wiederbeschaffungswert)}</Text>
            </View>
          ))}
        </View>

        <Footer pageNum={1} totalPages={totalPages} />
      </Page>

      {/* ═══════ SEITE 2: Entgelt + Haftungsoption + §1-§5 ═══════ */}
      <Page size="A4" style={s.page}>
        <MiniHeader contractNumber={contractNumber} />

        {/* Entgelt und Zahlung */}
        <Text style={s.sectionHeading}>Entgelt und Zahlung</Text>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
          <TableRow label="Mietpreis" value={fmt(data.priceRental)} />
          <TableRow label="Versandkosten" value={fmt(data.priceShipping)} alt />
          <TableRow label={`Schadenspauschale (${data.haftungOption})`} value={fmt(data.priceHaftung)} />
          <View style={{ flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 8 }}>
            <Text style={{ width: '38%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Gesamtbetrag</Text>
            <Text style={{ width: '62%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' }}>{fmt(data.priceTotal)}</Text>
          </View>
          <TableRow label="Zahlungsart" value="Kreditkarte via Stripe" />
          {data.stripePaymentIntentId && <TableRow label="Stripe Payment Intent" value={data.stripePaymentIntentId} alt />}
          {data.paymentDate && <TableRow label="Zahlungsstatus" value={`Bezahlt am ${data.paymentDate}`} />}
        </View>
        <Text style={{ fontSize: 7, color: GRAY, fontStyle: 'italic', marginBottom: 2 }}>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</Text>
        <Text style={{ fontSize: 7, color: GRAY, fontStyle: 'italic', marginBottom: 12 }}>Eine Kaution oder Kreditkartenvorautorisierung wird nicht erhoben. Etwaige Schadenersatzansprüche werden nach § 9 dieses Vertrags separat abgerechnet.</Text>

        {/* Gewählte Haftungsoption */}
        <View style={{ backgroundColor: CYAN, borderRadius: 4, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 3 }}>{data.haftungOption}</Text>
          <Text style={{ fontSize: 8, color: '#ffffff', lineHeight: 1.5 }}>{data.haftungDescription}</Text>
        </View>

        {/* Vertragsbedingungen Einleitung */}
        <Text style={[s.sectionHeading, { marginTop: 8 }]}>Vertragsbedingungen</Text>
        <Text style={[s.clauseText, { marginBottom: 8 }]}>Die nachfolgenden Bestimmungen regeln die Rechte und Pflichten der Vertragsparteien. Ergänzend gelten die AGB, die Widerrufsbelehrung, die Haftungsbedingungen und die Datenschutzerklärung des Vermieters in der zum Zeitpunkt des Vertragsschlusses geltenden Fassung. Bei Widersprüchen gehen die Regelungen dieses Vertrags vor.</Text>

        {/* §1-§5 */}
        {PARAGRAPHEN.slice(0, 5).map((p, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{p.title}</Text>
            <Text style={s.clauseText}>{p.text}</Text>
          </View>
        ))}

        <Footer pageNum={2} totalPages={totalPages} />
      </Page>

      {/* ═══════ SEITE 3: §6-§9 ═══════ */}
      <Page size="A4" style={s.page}>
        <MiniHeader contractNumber={contractNumber} />
        {PARAGRAPHEN.slice(5, 9).map((p, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{p.title}</Text>
            <Text style={s.clauseText}>{p.text}</Text>
          </View>
        ))}
        <Footer pageNum={3} totalPages={totalPages} />
      </Page>

      {/* ═══════ SEITE 4: §10-§16 ═══════ */}
      <Page size="A4" style={s.page}>
        <MiniHeader contractNumber={contractNumber} />
        {PARAGRAPHEN.slice(9, 16).map((p, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{p.title}</Text>
            <Text style={s.clauseText}>{p.text}</Text>
          </View>
        ))}
        <Footer pageNum={4} totalPages={totalPages} />
      </Page>

      {/* ═══════ SEITE 5: §17-§19 + Bestätigung + Signatur ═══════ */}
      <Page size="A4" style={s.page}>
        <MiniHeader contractNumber={contractNumber} />
        {PARAGRAPHEN.slice(16).map((p, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{p.title}</Text>
            <Text style={s.clauseText}>{p.text}</Text>
          </View>
        ))}

        {/* Bestätigung und Anlagen */}
        <View style={{ marginTop: 14, padding: 10, backgroundColor: LIGHT_BG, borderRadius: 4 }}>
          <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.55 }}>
            Mit Abschluss der Buchung bestätigt der Mieter, dass er die folgenden Dokumente in ihrer zum Zeitpunkt des Vertragsschlusses geltenden Fassung gelesen hat und akzeptiert:{'\n'}
            {'\u2022'} Allgemeine Geschäftsbedingungen (AGB){'\n'}
            {'\u2022'} Widerrufsbelehrung und Muster-Widerrufsformular{'\n'}
            {'\u2022'} Haftungsbedingungen{'\n'}
            {'\u2022'} Datenschutzerklärung{'\n\n'}
            Der Mieter bestätigt ferner, volljährig und voll geschäftsfähig zu sein sowie die Verifizierung seines Kundenkontos gemäß § 2 abgeschlossen zu haben.{'\n\n'}
            Vertragsschluss: elektronisch am {data.contractDate} um {data.contractTime} Uhr.{'\n'}
            Dieser Vertrag wurde automatisiert erstellt und ist auch ohne handschriftliche Unterschrift gültig.
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
          {data.signatureDataUrl && data.signatureMethod === 'canvas' ? (
            <View style={{ marginTop: 6 }}>
              <Text style={s.signatureLabel}>Unterschrift:</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.signatureDataUrl} style={s.signatureImage} />
            </View>
          ) : (
            <View style={{ marginTop: 6 }}>
              <Text style={s.signatureLabel}>Signiert durch (getippt):</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 4 }}>{data.signerName}</Text>
            </View>
          )}
        </View>

        <Footer pageNum={5} totalPages={totalPages} />
      </Page>
    </Document>
  );
}
