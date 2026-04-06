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

export interface ContractData {
  bookingId: string;
  contractDate: string;        // 'DD.MM.YYYY'
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  productName: string;
  rentalFrom: string;          // 'YYYY-MM-DD'
  rentalTo: string;            // 'YYYY-MM-DD'
  days: number;
  priceTotal: number;
  deposit: number;
  haftung: string;
  signatureDataUrl?: string;   // base64 PNG or Supabase storage URL
  signedAt?: string;           // 'DD.MM.YYYY HH:MM'
  signerName?: string;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' \u20ac';
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function haftungLabel(h: string) {
  if (h === 'standard') return 'Standard-Haftungsschutz';
  if (h === 'premium') return 'Premium-Haftungsschutz (Vollschutz)';
  return 'Basis (ohne zusätzlichen Schutz)';
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
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
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 20,
  },
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
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 16,
  },
  termsBlock: {
    backgroundColor: '#f9f9f7',
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  termsText: {
    fontSize: 9,
    color: '#4a5568',
    lineHeight: 1.6,
  },
  signatureSection: {
    marginTop: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  signatureName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    marginBottom: 4,
  },
  signatureDate: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 10,
  },
  signatureImage: {
    width: 200,
    height: 60,
    objectFit: 'contain',
  },
  unsignedNote: {
    fontSize: 10,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
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
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
});

// ─── Contract terms ───────────────────────────────────────────────────────────

const CONTRACT_TERMS = [
  {
    title: '1. Mietgegenstand',
    text: 'Der Vermieter überlässt dem Mieter das oben genannte Mietobjekt für den vereinbarten Zeitraum zur bestimmungsgemäßen Nutzung.',
  },
  {
    title: '2. Mietdauer und Rueckgabe',
    text: 'Die Mietdauer beginnt und endet zu den oben angegebenen Daten. Die Rückgabe muss spätestens am letzten Miettag erfolgen. Bei verspäteter Rückgabe werden zusätzliche Mietgebühren pro angefangenem Tag berechnet.',
  },
  {
    title: '3. Sorgfaltspflicht',
    text: 'Der Mieter verpflichtet sich, das Mietobjekt pfleglich zu behandeln und vor Beschädigungen, Diebstahl und Verlust zu schützen. Die Nutzung erfolgt auf eigene Gefahr.',
  },
  {
    title: '4. Haftung und Kaution',
    text: 'Der Mieter haftet für Schäden am Mietobjekt, die während der Mietzeit entstehen. Die hinterlegte Kaution dient als Sicherheit und wird nach Prüfung des Mietobjekts bei ordnungsgemäßer Rückgabe freigegeben.',
  },
  {
    title: '5. Stornierung',
    text: `Stornierungen richten sich nach den auf ${BUSINESS.domain} veröffentlichten Stornierungsbedingungen.`,
  },
  {
    title: '6. Gerichtsstand',
    text: 'Es gilt deutsches Recht. Gerichtsstand ist Berlin.',
  },
];

// ─── PDF Document ─────────────────────────────────────────────────────────────

export function ContractPDF({ data }: { data: ContractData }) {
  const contractNumber = data.bookingId.replace('BK-', 'MV-');

  return (
    <Document>
      {/* ═══════ SEITE 1: Vertragsdetails ═══════ */}
      <Page size="A4" style={s.page}>
        {/* Header */}
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

        {/* Title */}
        <Text style={s.title}>Mietvertrag</Text>
        <Text style={s.subtitle}>Vertragsnummer {contractNumber} · erstellt am {data.contractDate}</Text>

        {/* Parties */}
        <Text style={s.sectionHeading}>Vertragsparteien</Text>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Vermieter</Text>
          <Text style={s.detailValue}>{BUSINESS.addressLine}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mieter</Text>
          <Text style={s.detailValue}>{data.customerName || 'Kunde'}{data.customerAddress ? ` · ${data.customerAddress}` : ''}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>E-Mail</Text>
          <Text style={s.detailValue}>{data.customerEmail}</Text>
        </View>

        <View style={s.divider} />

        {/* Booking details */}
        <Text style={s.sectionHeading}>Mietdetails</Text>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietobjekt</Text>
          <Text style={s.detailValue}>{data.productName}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietzeitraum</Text>
          <Text style={s.detailValue}>{fmtDate(data.rentalFrom)} – {fmtDate(data.rentalTo)} ({data.days} {data.days === 1 ? 'Tag' : 'Tage'})</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Mietpreis gesamt</Text>
          <Text style={[s.detailValue, { fontFamily: 'Helvetica-Bold' }]}>{fmt(data.priceTotal)}</Text>
        </View>
        {data.deposit > 0 && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Kaution</Text>
            <Text style={s.detailValue}>{fmt(data.deposit)}</Text>
          </View>
        )}
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Haftungsschutz</Text>
          <Text style={s.detailValue}>{haftungLabel(data.haftung)}</Text>
        </View>

        <View style={s.divider} />

        {/* Tax note on page 1 */}
        <View style={{ padding: 10, backgroundColor: '#f9f9f7', borderRadius: 6, marginTop: 8 }}>
          <Text style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
            {data.taxMode === 'regelbesteuerung'
              ? `Alle Betraege verstehen sich inkl. ${data.taxRate || 19}% MwSt.${data.ustId ? ` USt-IdNr.: ${data.ustId}` : ''}`
              : 'Gemaess §19 UStG wird keine Umsatzsteuer berechnet.'}
          </Text>
        </View>

        {/* Page hint */}
        <View style={{ marginTop: 'auto', paddingTop: 20 }}>
          <Text style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>
            Mietbedingungen und Unterschrift auf Seite 2
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>{BUSINESS.addressLine}</Text>
          <Text style={s.footerText}>Seite 1 von 2</Text>
        </View>
      </Page>

      {/* ═══════ SEITE 2: Mietbedingungen & Unterschrift ═══════ */}
      <Page size="A4" style={s.page}>
        {/* Mini-Header */}
        <View style={[s.header, { marginBottom: 20 }]}>
          <View>
            <Text style={[s.brand, { fontSize: 14 }]}>{BUSINESS.name}</Text>
            <Text style={s.brandSub}>Mietvertrag {contractNumber}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'right' }}>
              {data.customerName}{'\n'}
              {data.contractDate}
            </Text>
          </View>
        </View>

        {/* Terms */}
        <Text style={[s.sectionHeading, { marginTop: 0 }]}>Mietbedingungen</Text>
        <View style={s.termsBlock}>
          {CONTRACT_TERMS.map((clause, i) => (
            <View key={i} style={{ marginBottom: i < CONTRACT_TERMS.length - 1 ? 10 : 0 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', marginBottom: 2 }}>
                {clause.title}
              </Text>
              <Text style={s.termsText}>{clause.text}</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        {/* Signature */}
        <Text style={s.sectionHeading}>Unterschrift des Mieters</Text>
        <View style={s.signatureSection}>
          {data.signatureDataUrl ? (
            <>
              <Text style={s.signatureName}>{data.signerName}</Text>
              <Text style={s.signatureDate}>Unterschrieben am {data.signedAt}</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.signatureDataUrl} style={s.signatureImage} />
            </>
          ) : (
            <Text style={s.unsignedNote}>Noch nicht unterschrieben</Text>
          )}
        </View>

        {/* Confirmation text */}
        <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f9f9f7', borderRadius: 6 }}>
          <Text style={{ fontSize: 9, color: '#4a5568', lineHeight: 1.6 }}>
            Mit der Unterschrift bestätigt der Mieter, die oben genannten Mietbedingungen gelesen und akzeptiert zu haben.
            Beide Vertragsparteien erkennen diesen Mietvertrag als verbindlich an.
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>{BUSINESS.addressLine}</Text>
          <Text style={s.footerText}>Seite 2 von 2</Text>
        </View>
      </Page>
    </Document>
  );
}
