import { Document, Page, Text, View, StyleSheet, Svg, Rect, Circle, G } from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro } from '@/lib/format-utils';
import type { WeeklyReportData } from '@/lib/weekly-report';

const NAVY = '#0f172a';
const CYAN = '#06b6d4';
const GRAY = '#6b7280';
const DARK = '#1a1a1a';
const LIGHT_BG = '#f8fafc';

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 48 },
  headerBar: { backgroundColor: NAVY, marginHorizontal: -48, marginTop: -40, paddingHorizontal: 48, paddingVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1 },
  headerSub: { fontSize: 9, color: '#94a3b8', marginTop: 3 },
  headerRight: { textAlign: 'right' },
  headerLabel: { fontSize: 8, color: CYAN, marginBottom: 2 },
  headerValue: { fontSize: 10, color: '#fff', fontFamily: 'Helvetica-Bold' },

  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: CYAN },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  kpi: { width: '32%', backgroundColor: LIGHT_BG, padding: 8, borderRadius: 4 },
  kpiLabel: { fontSize: 7, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY },
  kpiSub: { fontSize: 7, color: GRAY, marginTop: 2 },

  table: { marginTop: 4, marginBottom: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  tableHeader: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: NAVY },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY },
  td: { fontSize: 8.5, color: DARK },

  warningBox: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4, padding: 8, marginTop: 6 },
  warningText: { fontSize: 9, color: '#78350f' },

  footer: { position: 'absolute', bottom: 20, left: 48, right: 48 },
  footerBar: { height: 2, backgroundColor: CYAN, marginBottom: 8 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: GRAY },
});

function trendText(curr: number, prev: number): string {
  if (prev === 0 && curr === 0) return '±0';
  if (prev === 0) return `+${curr}`;
  const diff = curr - prev;
  const pct = Math.abs(Math.round((diff / prev) * 100));
  return `${diff >= 0 ? '↑' : '↓'} ${pct}% (Vorwoche: ${prev})`;
}

function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}

export function WeeklyReportPDF({ data }: { data: WeeklyReportData }) {
  return (
    <Document>
      <Page size={[595.28, 841.89]} style={s.page} wrap>
        <Footer />

        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={38} height={25} viewBox="0 0 160 100">
              <G transform="translate(80, 50)">
                <Rect x={-40} y={-18} width={80} height={48} rx={6} fill={CYAN} />
                <Rect x={-22} y={-26} width={20} height={10} rx={2} fill={CYAN} />
                <Circle cx={0} cy={6} r={14} fill={NAVY} />
                <Circle cx={0} cy={6} r={9} fill={CYAN} />
                <Circle cx={26} cy={-10} r={2} fill="#fff" />
              </G>
            </Svg>
            <View style={{ marginLeft: 10 }}>
              <Text style={s.headerTitle}>Wochenbericht</Text>
              <Text style={s.headerSub}>
                {fmtDateShort(data.periodStart)} {'\u2013'} {fmtDateShort(data.periodEnd)}
              </Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>KALENDERWOCHE</Text>
            <Text style={s.headerValue}>KW {data.weekNumber}/{data.year}</Text>
          </View>
        </View>

        {/* Finanzen */}
        <Text style={s.sectionTitle}>Finanzen</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Umsatz (Woche)</Text>
            <Text style={s.kpiValue}>{fmtEuro(data.finance.revenue)}</Text>
            <Text style={s.kpiSub}>{trendText(data.finance.revenue, data.finance.prevRevenue)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Bezahlte Rechnungen</Text>
            <Text style={s.kpiValue}>{data.finance.invoicesPaid}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Offene Rechnungen</Text>
            <Text style={s.kpiValue}>{data.finance.invoicesOpen}</Text>
            <Text style={s.kpiSub}>davon überfällig: {fmtEuro(data.finance.overdueAmount)}</Text>
          </View>
        </View>

        {/* Buchungen */}
        <Text style={s.sectionTitle}>Buchungen</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Neue Buchungen</Text>
            <Text style={s.kpiValue}>{data.bookings.newCount}</Text>
            <Text style={s.kpiSub}>{trendText(data.bookings.newCount, data.bookings.prevCount)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Stornierungen</Text>
            <Text style={s.kpiValue}>{data.bookings.cancelledCount}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Ø Wert / Buchung</Text>
            <Text style={s.kpiValue}>
              {fmtEuro(data.bookings.newCount > 0 ? data.finance.revenue / data.bookings.newCount : 0)}
            </Text>
          </View>
        </View>

        {data.bookings.topProducts.length > 0 && (
          <>
            <Text style={[s.kpiLabel, { marginTop: 6 }]}>Top-Produkte</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 4 }]}>Produkt</Text>
                <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Anzahl</Text>
                <Text style={[s.th, { flex: 2, textAlign: 'right' }]}>Umsatz</Text>
              </View>
              {data.bookings.topProducts.map((p, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={[s.td, { flex: 4 }]}>{p.name}</Text>
                  <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{p.count}</Text>
                  <Text style={[s.td, { flex: 2, textAlign: 'right' }]}>{fmtEuro(p.revenue)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Kommende Woche */}
        {(data.bookings.upcomingShipping.length > 0 || data.bookings.upcomingReturn.length > 0) && (
          <>
            <Text style={s.sectionTitle}>Nächste 7 Tage</Text>
            {data.bookings.upcomingShipping.length > 0 && (
              <>
                <Text style={[s.kpiLabel, { marginTop: 4 }]}>Versand ({data.bookings.upcomingShipping.length})</Text>
                <View style={s.table}>
                  {data.bookings.upcomingShipping.slice(0, 10).map((b, i) => (
                    <View key={i} style={s.tableRow}>
                      <Text style={[s.td, { flex: 1.2 }]}>{fmtDateShort(b.date)}</Text>
                      <Text style={[s.td, { flex: 3 }]}>{b.customerName}</Text>
                      <Text style={[s.td, { flex: 3 }]}>{b.productName}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            {data.bookings.upcomingReturn.length > 0 && (
              <>
                <Text style={[s.kpiLabel, { marginTop: 4 }]}>Rückgabe ({data.bookings.upcomingReturn.length})</Text>
                <View style={s.table}>
                  {data.bookings.upcomingReturn.slice(0, 10).map((b, i) => (
                    <View key={i} style={s.tableRow}>
                      <Text style={[s.td, { flex: 1.2 }]}>{fmtDateShort(b.date)}</Text>
                      <Text style={[s.td, { flex: 3 }]}>{b.customerName}</Text>
                      <Text style={[s.td, { flex: 3 }]}>{b.productName}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Kunden */}
        <Text style={s.sectionTitle}>Kunden</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Neue Registrierungen</Text>
            <Text style={s.kpiValue}>{data.customers.newRegistrations}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Offene Verifizierungen</Text>
            <Text style={s.kpiValue}>{data.customers.pendingVerifications}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Neue Waitlist</Text>
            <Text style={s.kpiValue}>{data.customers.newWaitlist}</Text>
          </View>
        </View>

        {/* Operativ */}
        <Text style={s.sectionTitle}>Operativ</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Neue Schäden</Text>
            <Text style={s.kpiValue}>{data.operations.newDamages}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Kameras in Wartung</Text>
            <Text style={s.kpiValue}>{data.operations.camerasInMaintenance}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Social-Posts</Text>
            <Text style={s.kpiValue}>{data.content.socialPublishedCount}</Text>
          </View>
        </View>

        {data.content.blogPublished.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Blog-Artikel diese Woche</Text>
            <View style={s.table}>
              {data.content.blogPublished.map((b, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={[s.td, { flex: 1.2 }]}>{fmtDateShort(b.publishedAt)}</Text>
                  <Text style={[s.td, { flex: 5 }]}>{b.title}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Warnungen */}
        {data.warnings.length > 0 && (
          <View style={s.warningBox}>
            <Text style={[s.kpiLabel, { color: '#78350f', marginBottom: 4 }]}>⚠ Warnungen</Text>
            {data.warnings.map((w, i) => (
              <Text key={i} style={s.warningText}>• {w}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerBar} />
      <View style={s.footerRow}>
        <Text style={s.footerText}>
          cam2rent {'\u2013'} {BUSINESS.owner} {'\u2013'} {BUSINESS.street}, {BUSINESS.zip} {BUSINESS.city}
        </Text>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Seite ${pageNumber} von ${totalPages}`
          }
        />
      </View>
    </View>
  );
}
