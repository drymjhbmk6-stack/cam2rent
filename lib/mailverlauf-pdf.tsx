/**
 * Mailverlauf-PDF – kompakte Übersicht des für eine Buchung protokollierten
 * E-Mail-Verlaufs (aus `email_log`). Wird optional als Anhang an eine
 * Schadensmeldung gehängt (Doku für Betriebsprüfung / Nachvollziehbarkeit).
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PdfLogo, PDF_NAVY } from '@/lib/pdf/common';
import { BUSINESS } from '@/lib/business-config';

export interface MailverlaufEntry {
  datum: string;      // TT.MM.JJJJ HH:MM
  typ: string;        // lesbarer Typ
  betreff: string;
  empfaenger: string;
  status: string;     // Gesendet / Fehler
}

export interface MailverlaufPdfData {
  bookingId: string;
  customerName: string;
  erstelltAm: string;
  entries: MailverlaufEntry[];
}

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 9, color: '#1a1a1a', fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  brandName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PDF_NAVY },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PDF_NAVY, marginBottom: 4 },
  meta: { fontSize: 9, color: '#6b7280', marginBottom: 16 },
  tHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 4, marginBottom: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  th: { fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  cDate: { width: 92 },
  cType: { width: 96 },
  cSubject: { flex: 1, paddingRight: 6 },
  cStatus: { width: 52, textAlign: 'right' },
  empty: { fontSize: 10, color: '#6b7280', marginTop: 20 },
  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, textAlign: 'center', fontSize: 7.5, color: '#9ca3af', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
});

export function MailverlaufPDF({ data }: { data: MailverlaufPdfData }) {
  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PdfLogo width={36} height={24} />
            <Text style={s.brandName}>{BUSINESS.name}</Text>
          </View>
          <Text style={{ fontSize: 8, color: '#6b7280' }}>{data.erstelltAm}</Text>
        </View>

        <Text style={s.title}>E-Mail-Verlauf zur Buchung {data.bookingId}</Text>
        <Text style={s.meta}>Kunde: {data.customerName || '—'} · protokollierte E-Mails: {data.entries.length}</Text>

        {data.entries.length === 0 ? (
          <Text style={s.empty}>Zu dieser Buchung sind keine E-Mails protokolliert.</Text>
        ) : (
          <>
            <View style={s.tHead}>
              <Text style={[s.cDate, s.th]}>Datum</Text>
              <Text style={[s.cType, s.th]}>Typ</Text>
              <Text style={[s.cSubject, s.th]}>Betreff / Empfänger</Text>
              <Text style={[s.cStatus, s.th]}>Status</Text>
            </View>
            {data.entries.map((e, i) => (
              <View key={i} style={s.tRow} wrap={false}>
                <Text style={s.cDate}>{e.datum}</Text>
                <Text style={s.cType}>{e.typ}</Text>
                <View style={s.cSubject}>
                  <Text>{e.betreff || '—'}</Text>
                  <Text style={{ fontSize: 7.5, color: '#9ca3af' }}>{e.empfaenger}</Text>
                </View>
                <Text style={[s.cStatus, { color: e.status === 'Fehler' ? '#dc2626' : '#16a34a' }]}>{e.status}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.footer}>
          {BUSINESS.name} · {BUSINESS.owner} · {BUSINESS.street} · {BUSINESS.zip} {BUSINESS.city} · {BUSINESS.emailKontakt}
        </Text>
      </Page>
    </Document>
  );
}
