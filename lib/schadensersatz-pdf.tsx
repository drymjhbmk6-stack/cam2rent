/**
 * Zahlungsaufforderung / Kostenaufstellung – Schadensersatz.
 *
 * BEWUSST KEINE Rechnung: echter Schadensersatz ist kein Leistungsaustausch
 * (§ 1 UStG), daher kein steuerbarer Umsatz und keine Ausgangsrechnung mit
 * fortlaufender Rechnungsnummer. Als Kleinunternehmer (§ 19 UStG) ohnehin
 * kein USt-Ausweis. Das Dokument fordert den vom Kunden verursachten
 * Reparaturschaden (brutto) als Schadensersatz an und verweist auf die
 * beiliegende Reparaturrechnung.
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PdfLogo, PDF_NAVY, PDF_CYAN } from '@/lib/pdf/common';
import { BUSINESS } from '@/lib/business-config';

export interface SchadensersatzPdfData {
  vorgangsNr: string;
  datum: string; // TT.MM.JJJJ
  customerName: string;
  customerAddress?: string; // mehrzeilig (\n)
  sourceBookingId: string;
  positionText: string;
  amount: number;
  hasRepairInvoiceCopy: boolean;
}

const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')} €`;

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: '#1a1a1a', fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  brandName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: PDF_NAVY, letterSpacing: -0.5 },
  brandSub: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  senderLine: { fontSize: 8, color: '#6b7280', marginBottom: 14 },
  addrLabel: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  addrValue: { fontSize: 11, color: '#111827', lineHeight: 1.4 },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: PDF_NAVY, marginTop: 22, marginBottom: 4 },
  metaRow: { flexDirection: 'row', gap: 26, marginBottom: 18 },
  metaLabel: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6 },
  metaValue: { fontSize: 11, color: '#111827', marginTop: 1 },
  intro: { fontSize: 10, color: '#374151', lineHeight: 1.5, marginBottom: 16 },
  tHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 5, marginBottom: 6 },
  tRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  colDesc: { flex: 1, paddingRight: 10 },
  colAmt: { width: 90, textAlign: 'right' },
  thText: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalBox: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  totalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PDF_NAVY },
  totalValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: PDF_NAVY },
  note: { marginTop: 20, backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#e2e8f0', borderRadius: 6, padding: 12 },
  noteText: { fontSize: 9, color: '#475569', lineHeight: 1.5 },
  payBox: { marginTop: 16, padding: 12, borderRadius: 6, borderWidth: 0.5, borderColor: PDF_CYAN, backgroundColor: '#ecfeff' },
  payTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: PDF_NAVY, marginBottom: 4 },
  payLine: { fontSize: 9, color: '#334155', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 28, left: 44, right: 44, textAlign: 'center', fontSize: 8, color: '#9ca3af', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 8 },
});

export function SchadensersatzPDF({ data }: { data: SchadensersatzPdfData }) {
  const addrLines = (data.customerAddress ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PdfLogo width={40} height={26} />
            <View>
              <Text style={s.brandName}>{BUSINESS.name}</Text>
              <Text style={s.brandSub}>Action-Cam Verleih</Text>
            </View>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={s.addrValue}>{BUSINESS.owner}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{BUSINESS.street}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{BUSINESS.zip} {BUSINESS.city}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{BUSINESS.emailKontakt}</Text>
          </View>
        </View>

        {/* Absenderzeile + Empfänger */}
        <Text style={s.senderLine}>{BUSINESS.owner} · {BUSINESS.street} · {BUSINESS.zip} {BUSINESS.city}</Text>
        <Text style={s.addrLabel}>An</Text>
        <Text style={s.addrValue}>{data.customerName || '—'}</Text>
        {addrLines.map((l, i) => (
          <Text key={i} style={{ fontSize: 10, color: '#374151' }}>{l}</Text>
        ))}

        {/* Titel + Meta */}
        <Text style={s.title}>Zahlungsaufforderung – Schadensersatz</Text>
        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Vorgangsnummer</Text>
            <Text style={s.metaValue}>{data.vorgangsNr}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Datum</Text>
            <Text style={s.metaValue}>{data.datum}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Betroffene Buchung</Text>
            <Text style={s.metaValue}>{data.sourceBookingId}</Text>
          </View>
        </View>

        <Text style={s.intro}>
          im Rahmen deiner Buchung {data.sourceBookingId} ist an der überlassenen Ausrüstung ein
          Schaden entstanden. Die dadurch entstandenen Reparaturkosten machen wir hiermit als
          Schadensersatz geltend. Die zugrunde liegende Reparaturrechnung liegt {data.hasRepairInvoiceCopy ? 'als Kopie bei' : 'zur Einsicht vor'}.
        </Text>

        {/* Positionstabelle */}
        <View style={s.tHead}>
          <Text style={[s.colDesc, s.thText]}>Schadensposition</Text>
          <Text style={[s.colAmt, s.thText]}>Betrag</Text>
        </View>
        <View style={s.tRow}>
          <Text style={s.colDesc}>{data.positionText}</Text>
          <Text style={s.colAmt}>{eur(data.amount)}</Text>
        </View>

        {/* Summe */}
        <View style={s.totalRow}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Zu zahlen</Text>
            <Text style={s.totalValue}>{eur(data.amount)}</Text>
          </View>
        </View>

        {/* Rechtlicher Hinweis */}
        <View style={s.note}>
          <Text style={s.noteText}>
            Es handelt sich um echten Schadensersatz (Ersatz eines Vermögensschadens), nicht um ein
            Entgelt für eine Leistung. Ein Leistungsaustausch im Sinne des Umsatzsteuerrechts liegt
            nicht vor; ein Umsatzsteuerausweis erfolgt daher nicht. Der ausgewiesene Betrag ist der
            Bruttobetrag der Reparaturkosten. (Kleinunternehmer gemäß § 19 UStG – kein Ausweis von
            Umsatzsteuer.)
          </Text>
        </View>

        {/* Zahlung */}
        <View style={s.payBox}>
          <Text style={s.payTitle}>Zahlung</Text>
          <Text style={s.payLine}>
            Bitte überweise den Betrag von {eur(data.amount)} unter Angabe der Vorgangsnummer {data.vorgangsNr} auf:
          </Text>
          <Text style={s.payLine}>
            {BUSINESS.owner} · IBAN {BUSINESS.ibanFormatted} · BIC {BUSINESS.bic} · {BUSINESS.bankName}
          </Text>
          <Text style={[s.payLine, { marginTop: 4, color: '#64748b' }]}>
            Alternativ nutze den Zahlungslink aus unserer E-Mail (Kreditkarte oder PayPal).
          </Text>
        </View>

        <Text style={s.footer}>
          {BUSINESS.name} · {BUSINESS.owner} · {BUSINESS.street} · {BUSINESS.zip} {BUSINESS.city} · {BUSINESS.emailKontakt} · {BUSINESS.phone}
        </Text>
      </Page>
    </Document>
  );
}
