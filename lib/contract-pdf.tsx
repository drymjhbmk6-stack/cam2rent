import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

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
  return n.toFixed(2).replace('.', ',') + ' €';
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
  termsTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0a0a0a',
    marginBottom: 8,
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
});

// ─── Contract terms ───────────────────────────────────────────────────────────

const CONTRACT_TERMS = `1. Mietgegenstand
Der Vermieter überlässt dem Mieter das oben genannte Mietobjekt für den vereinbarten Zeitraum zur bestimmungsgemäßen Nutzung.

2. Mietdauer und Rückgabe
Die Mietdauer beginnt und endet zu den oben angegebenen Daten. Die Rückgabe muss spätestens am letzten Miettag erfolgen. Bei verspäteter Rückgabe werden zusätzliche Mietgebühren pro angefangenem Tag berechnet.

3. Sorgfaltspflicht
Der Mieter verpflichtet sich, das Mietobjekt pfleglich zu behandeln und vor Beschädigungen, Diebstahl und Verlust zu schützen. Die Nutzung erfolgt auf eigene Gefahr.

4. Haftung und Kaution
Der Mieter haftet für Schäden am Mietobjekt, die während der Mietzeit entstehen. Die hinterlegte Kaution dient als Sicherheit und wird nach Prüfung des Mietobjekts bei ordnungsgemäßer Rückgabe freigegeben.

5. Stornierung
Stornierungen richten sich nach den auf cam2rent.de veröffentlichten Stornierungsbedingungen.

6. Gerichtsstand
Es gilt deutsches Recht. Gerichtsstand ist Berlin.`;

// ─── PDF Document ─────────────────────────────────────────────────────────────

export function ContractPDF({ data }: { data: ContractData }) {
  const contractNumber = data.bookingId.replace('BK-', 'MV-');

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>cam2rent</Text>
            <Text style={s.brandSub}>Action-Cam Verleih</Text>
          </View>
          <View>
            <Text style={s.senderBlock}>
              Lennart Schickel{'\n'}
              Heimsbrunner Str. 12{'\n'}
              12349 Berlin{'\n'}
              buchung@cam2rent.de{'\n'}
              cam2rent.de
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
          <Text style={s.detailValue}>cam2rent · Lennart Schickel · Heimsbrunner Str. 12 · 12349 Berlin</Text>
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

        {/* Terms */}
        <Text style={s.sectionHeading}>Mietbedingungen</Text>
        <View style={s.termsBlock}>
          <Text style={s.termsText}>{CONTRACT_TERMS}</Text>
        </View>

        {/* Signature */}
        <View style={s.signatureSection}>
          <Text style={s.signatureLabel}>Unterschrift des Mieters</Text>
          {data.signatureDataUrl ? (
            <>
              <Text style={s.signatureName}>{data.signerName}</Text>
              <Text style={s.signatureDate}>Unterschrieben am {data.signedAt}</Text>
              <Image src={data.signatureDataUrl} style={s.signatureImage} />
            </>
          ) : (
            <Text style={s.unsignedNote}>Noch nicht unterschrieben</Text>
          )}
        </View>

        {/* Tax note */}
        <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f9f9f7', borderRadius: 6 }}>
          <Text style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
            {data.taxMode === 'regelbesteuerung'
              ? `Alle Beträge verstehen sich inkl. ${data.taxRate || 19}% MwSt.${data.ustId ? ` USt-IdNr.: ${data.ustId}` : ''}`
              : 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet.'}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>cam2rent · Lennart Schickel · Heimsbrunner Str. 12 · 12349 Berlin</Text>
          <Text style={s.footerText}>cam2rent.de · buchung@cam2rent.de</Text>
        </View>

      </Page>
    </Document>
  );
}
