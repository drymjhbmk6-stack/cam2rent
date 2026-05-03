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
  Image,
} from '@react-pdf/renderer';
import { BUSINESS } from '@/lib/business-config';
import { isoToDE } from '@/lib/format-utils';

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
  /** Optional: Zubehoer mit Stueckzahl. Ersetzt accessories[]-Rendering. */
  accessoryItems?: { accessory_id: string; qty: number }[];
  /** Optional: Bereits aufgeloeste Item-Namen mit Stueckzahl. Wenn vorhanden,
   *  hat das Vorrang vor accessoryItems/accessories — wird typischerweise von
   *  der Booking-API geliefert (loest Sets in einzelne Zubehoere auf).
   *  included_parts werden, wenn vorhanden, als kleine Hinweis-Zeile unter
   *  dem Hauptitem im PDF gerendert. */
  resolvedItems?: { name: string; qty: number; included_parts?: string[] }[];
  /** Seriennummer der gebuchten Kamera. Wenn vorhanden, wird sie statt der
   *  leeren Eintrage-Linie ausgegeben. */
  serialNumber?: string | null;
  haftung: string;
  /** Fertig signiert vom Packer (Schritt 1 des Pack-Workflows). */
  packedBy?: string | null;
  packedAt?: string | null;                 // ISO
  packedSignatureDataUrl?: string | null;
  /** Vom Packer abgehakte Item-Keys (camera, ${id}::${i}, return-label). */
  packedItems?: string[] | null;
  /** Zustand-Check vom Packer (Sektion 3). */
  packedCondition?: { tested?: boolean; noVisibleDamage?: boolean; note?: string } | null;
  /** Fertig signiert vom Kontrolleur (Schritt 2). */
  checkedBy?: string | null;
  checkedAt?: string | null;                // ISO
  checkedSignatureDataUrl?: string | null;
  /** Vom Kontrolleur abgehakte Item-Keys (selbe Schluessel wie packedItems). */
  checkedItems?: string[] | null;
  checkedNotes?: string | null;
  /** Storage-Pfad des Verpackungs-Fotos. Wird als Hinweistext ausgegeben,
   *  das Foto selbst landet NICHT im PDF (Datenschutz + Dateigroesse). */
  photoStoragePath?: string | null;
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

function Checkbox({ checked = false }: { checked?: boolean }) {
  if (!checked) return <View style={s.checkbox} />;
  // Gefuelltes Quadrat statt Glyph — viele PDF-Renderer (Browser, Druck)
  // verschlucken das ✓ in der Helvetica-Standard-Schrift. Das Innen-Square
  // ist im Druck garantiert sichtbar.
  return (
    <View style={[s.checkbox, { backgroundColor: C.navy, borderColor: C.navy }]} />
  );
}

// ─── PDF Document ────────────────────────────────────────────────────────────

export function PacklistPDF({ data }: { data: PacklistData }) {
  // Kameras aufspalten (können kommagetrennt sein)
  const cameras = data.productName.split(',').map((n) => n.trim());

  // Zubehör-Namen auflösen.
  // Vorrang: resolvedItems (vom Server bereits expandiert, inkl. Set-Items),
  // dann accessoryItems (qty-aware), zuletzt accessories[] (Legacy, qty=1).
  type AccRow = { label: string; included_parts?: string[] };
  const accItems: AccRow[] = data.resolvedItems && data.resolvedItems.length > 0
    ? data.resolvedItems.map((i) => ({
        label: i.qty > 1 ? `${i.qty}x ${i.name}` : i.name,
        included_parts: Array.isArray(i.included_parts) && i.included_parts.length > 0 ? i.included_parts : undefined,
      }))
    : data.accessoryItems && data.accessoryItems.length > 0
      ? data.accessoryItems.map((i) => {
          const name = accName(i.accessory_id);
          return { label: i.qty > 1 ? `${i.qty}x ${name}` : name };
        })
      : data.accessories.map((id) => ({ label: accName(id) }));

  // Haftung Label
  const haftungLabel = data.haftung === 'standard' ? 'Standard-Haftungsschutz'
    : data.haftung === 'premium' ? 'Premium-Haftungsschutz' : null;

  // Workflow-Status: Sind die Schritte fertig signiert? Die UI erzwingt, dass
  // alle Items abgehakt sein muessen bevor man signieren kann -> wenn der
  // Packer signiert hat, sind alle Items vom Packer geprueft. Genauso fuer
  // den Kontrolleur. Im PDF zeigen wir das kombinierte Ergebnis.
  const packerDone = !!data.packedSignatureDataUrl;
  const checkerDone = !!data.checkedSignatureDataUrl;
  const itemsAcknowledged = packerDone || checkerDone;
  const cond = data.packedCondition ?? {};
  const condTested = !!cond.tested;
  const condNoDamage = !!cond.noVisibleDamage;
  const condNote = typeof cond.note === 'string' ? cond.note.trim() : '';

  return (
    <Document>
      {cameras.map((camera, cameraIdx) => (
        <Page key={cameraIdx} size={[595.28, 841.89]} style={s.page}>

          {/* ── Header Bar ── */}
          <View style={s.headerBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Svg width={38} height={25} viewBox="0 0 160 100">
                <G transform="translate(80, 50)">
                  <Rect x={-40} y={-18} width={80} height={48} rx={6} fill={C.cyan} />
                  <Rect x={-22} y={-26} width={20} height={10} rx={2} fill={C.cyan} />
                  <Circle cx={0} cy={6} r={14} fill={C.navy} />
                  <Circle cx={0} cy={6} r={9} fill={C.cyan} />
                  <Circle cx={26} cy={-10} r={2} fill={C.white} />
                </G>
              </Svg>
              <Text style={[s.headerBrand, { marginLeft: 10 }]}>{BUSINESS.name || 'cam2rent'}</Text>
            </View>
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
                <Text style={s.metaValue}>{isoToDE(data.rentalFrom)} – {isoToDE(data.rentalTo)} ({data.days} Tage)</Text>
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
              <Text style={s.metaLabel}>Kamera / Gerät:</Text>
              <Text style={[s.metaValue, { color: C.navy }]}>{camera}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
              <Text style={{ fontSize: 10 }}>Seriennummer: </Text>
              {data.serialNumber ? (
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy }}>
                  {data.serialNumber}
                </Text>
              ) : (
                <View style={[s.writeLine, s.writeLineLong]} />
              )}
            </View>

            {haftungLabel && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Haftungsschutz:</Text>
                <Text style={s.metaValue}>{haftungLabel}</Text>
              </View>
            )}

            {/* Zubehör-Tabelle */}
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 6 }}>Zubehör:</Text>

            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.colNr]}>Nr.</Text>
              <Text style={[s.tableHeaderText, s.colBez]}>Bezeichnung</Text>
              <Text style={[s.tableHeaderText, s.colOk]}>OK</Text>
            </View>

            {accItems.length > 0 ? (
              accItems.map((row, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
                  <Text style={s.colNr}>{i + 1}</Text>
                  <View style={s.colBez}>
                    <Text>{row.label}</Text>
                    {row.included_parts && row.included_parts.length > 0 && (
                      <Text style={{ fontSize: 8, color: C.grayText, marginTop: 1 }}>
                        Enthält: {row.included_parts.join(' · ')}
                      </Text>
                    )}
                  </View>
                  <View style={[s.colOk, { alignItems: 'center' }]}>
                    <Checkbox checked={itemsAcknowledged} />
                  </View>
                </View>
              ))
            ) : (
              <View style={s.tableRow}>
                <Text style={s.colNr}>–</Text>
                <Text style={[s.colBez, { color: C.grayText, fontStyle: 'italic' }]}>Kein Zubehör gebucht</Text>
                <Text style={s.colOk}>–</Text>
              </View>
            )}

            {/* Rücksendeetikett */}
            <View style={[s.tableRow, { marginTop: 4, backgroundColor: C.grayLight }]}>
              <Text style={s.colNr}>+</Text>
              <Text style={[s.colBez, { fontFamily: 'Helvetica-Bold' }]}>Rücksendeetikett beilegen</Text>
              <View style={[s.colOk, { alignItems: 'center' }]}>
                <Checkbox checked={itemsAcknowledged} />
              </View>
            </View>

            <View style={s.divider} />

            {/* ── 3. Zustand bei Verpackung ── */}
            <Text style={s.sectionTitle}>3. Zustand bei Verpackung</Text>
            <View style={s.checkRow}><Checkbox checked={condTested} /><Text style={s.checkLabel}>Gerät funktionstüchtig getestet</Text></View>
            <View style={s.checkRow}><Checkbox checked={condNoDamage} /><Text style={s.checkLabel}>Keine sichtbaren Schäden</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Checkbox checked={condNote.length > 0} />
              <Text style={s.checkLabel}>Sonstiges: </Text>
              {condNote ? (
                <Text style={[s.checkLabel, { fontFamily: 'Helvetica-Bold' }]}>{condNote}</Text>
              ) : (
                <View style={[s.writeLine, { width: 220 }]} />
              )}
            </View>

            <View style={s.divider} />

            {/* ── 4. Verpackungskontrolle ── */}
            <Text style={s.sectionTitle}>4. Verpackungskontrolle</Text>
            <View style={s.checkRow}><Checkbox checked={checkerDone} /><Text style={s.checkLabel}>Gerät sicher verpackt</Text></View>
            <View style={s.checkRow}><Checkbox checked={checkerDone} /><Text style={s.checkLabel}>Zubehör vollständig</Text></View>
            <View style={s.checkRow}><Checkbox checked={!!data.photoStoragePath} /><Text style={s.checkLabel}>Foto-Nachweis vom Kontrolleur erstellt</Text></View>
            {data.checkedNotes && (
              <Text style={{ fontSize: 9, color: C.grayText, marginTop: 4, marginLeft: 16 }}>
                Notiz Kontrolleur: {data.checkedNotes}
              </Text>
            )}
            {data.photoStoragePath && (
              <Text style={{ fontSize: 8, color: C.grayText, marginTop: 4, marginLeft: 16 }}>
                Foto-Pfad: {data.photoStoragePath} (nur intern abrufbar via Admin-Detail)
              </Text>
            )}

            <View style={s.divider} />

            {/* ── 5. Bestätigung ── */}
            <Text style={s.sectionTitle}>5. Bestätigung (4-Augen-Prinzip)</Text>
            <Text style={{ fontSize: 9, color: C.grayText, lineHeight: 1.5, marginBottom: 8 }}>
              Beide Unterzeichner bestätigen die vollständige und ordnungsgemäße Verpackung
              des oben genannten Equipments. Die Kontrolle erfolgte durch eine zweite,
              unabhängige Person.
            </Text>

            <View style={s.sigRow}>
              <View style={s.sigBlock}>
                {data.packedSignatureDataUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={data.packedSignatureDataUrl} style={{ width: 180, height: 50, marginBottom: 2 }} />
                ) : (
                  <View style={s.sigLine} />
                )}
                <View style={s.sigLine} />
                <Text style={s.sigLabel}>
                  Packer: {data.packedBy || '_______________'}
                </Text>
                {data.packedAt && (
                  <Text style={[s.sigLabel, { fontSize: 8 }]}>
                    {new Date(data.packedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
                  </Text>
                )}
              </View>
              <View style={s.sigBlock}>
                {data.checkedSignatureDataUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={data.checkedSignatureDataUrl} style={{ width: 180, height: 50, marginBottom: 2 }} />
                ) : (
                  <View style={s.sigLine} />
                )}
                <View style={s.sigLine} />
                <Text style={s.sigLabel}>
                  Kontrolleur: {data.checkedBy || '_______________'}
                </Text>
                {data.checkedAt && (
                  <Text style={[s.sigLabel, { fontSize: 8 }]}>
                    {new Date(data.checkedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
                  </Text>
                )}
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
