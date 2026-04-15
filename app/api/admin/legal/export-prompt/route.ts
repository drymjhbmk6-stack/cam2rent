import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getParagraphen } from '@/lib/contracts/contract-template';
import { BUSINESS } from '@/lib/business-config';

/**
 * GET /api/admin/legal/export-prompt
 * Exportiert alle Rechtstexte, Vertragsparagraphen und Business-Config
 * als kopierbaren Text für Claude-Prüfung.
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Alle Rechtsseiten laden
  const { data: legalDocs } = await supabase
    .from('legal_documents')
    .select('slug, title, current_version_id');

  const legalTexts: Record<string, { title: string; content: string; version: number }> = {};

  for (const doc of legalDocs || []) {
    if (!doc.current_version_id) continue;
    const { data: version } = await supabase
      .from('legal_document_versions')
      .select('content, version_number')
      .eq('id', doc.current_version_id)
      .maybeSingle();

    if (version) {
      legalTexts[doc.slug] = {
        title: doc.title,
        content: version.content,
        version: version.version_number,
      };
    }
  }

  // 2. Vertragsparagraphen laden (DB oder Fallback)
  const { data: customParas } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'contract_paragraphs')
    .maybeSingle();

  let paragraphs: { title: string; text: string }[];
  let paragraphSource: string;

  if (customParas?.value) {
    try {
      const parsed = typeof customParas.value === 'string' ? JSON.parse(customParas.value) : customParas.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        paragraphs = parsed;
        paragraphSource = 'Benutzerdefiniert (aus DB)';
      } else {
        paragraphs = getParagraphen(200);
        paragraphSource = 'Standard (aus Code)';
      }
    } catch {
      paragraphs = getParagraphen(200);
      paragraphSource = 'Standard (aus Code)';
    }
  } else {
    paragraphs = getParagraphen(200);
    paragraphSource = 'Standard (aus Code)';
  }

  // 3. Haftungs-Config laden
  const { data: haftungConfig } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'haftung_config')
    .maybeSingle();

  // 4. Steuer-Config
  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate']);
  const taxMap: Record<string, string> = {};
  for (const s of taxSettings || []) taxMap[s.key] = s.value;

  // 5. Stornierungsbedingungen aus Business-Config
  const cancellation = {
    freeDaysBefore: 7,
    freeRefundPercent: 100,
    partialDaysBefore: 3,
    partialRefundPercent: 50,
  };

  // ─── Prompt zusammenbauen ────────────────────────────────────────────

  const lines: string[] = [];

  lines.push('# cam2rent — Rechtstexte & Vertrag Prüfung');
  lines.push('');
  lines.push('Bitte prüfe die folgenden Rechtstexte und Vertragsparagraphen auf Konsistenz, juristische Korrektheit und Vollständigkeit. Melde Widersprüche zwischen den Rechtsseiten und dem Vertrag.');
  lines.push('');
  lines.push('## Geschäftsdaten');
  lines.push(`- Firma: ${BUSINESS.name} (${BUSINESS.legalName})`);
  lines.push(`- Inhaber: ${BUSINESS.owner}`);
  lines.push(`- Adresse: ${BUSINESS.fullAddress}`);
  lines.push(`- E-Mail: ${BUSINESS.email} / ${BUSINESS.emailKontakt}`);
  lines.push(`- Steuermodus: ${taxMap.tax_mode || 'kleinunternehmer'} (Steuersatz: ${taxMap.tax_rate || '0'}%)`);
  lines.push(`- Branche: Action-Cam Verleih (Vermietung, KEIN Verkauf)`);
  lines.push('');

  lines.push('## Wichtige Regeln');
  lines.push('- NIEMALS "Versicherung" sagen — immer "Haftungsschutz", "Haftungsbegrenzung" oder "Haftungsoption"');
  lines.push('- Die Haftungsprämien bilden ein eigenes Reparaturdepot, cam2rent ist KEIN Versicherungsunternehmen');
  lines.push(`- Stornierung: >7 Tage = ${cancellation.freeRefundPercent}% Erstattung, 3-7 Tage = ${cancellation.partialRefundPercent}%, <3 Tage = keine Erstattung`);
  lines.push('');

  if (haftungConfig?.value) {
    lines.push('## Haftungsschutz-Konfiguration');
    lines.push('```json');
    lines.push(JSON.stringify(haftungConfig.value, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Rechtsseiten
  const slugOrder = ['agb', 'widerruf', 'haftungsausschluss', 'datenschutz', 'impressum'];
  for (const slug of slugOrder) {
    const doc = legalTexts[slug];
    if (!doc) continue;
    lines.push(`## Rechtsseite: ${doc.title} (Version ${doc.version})`);
    lines.push('');
    lines.push(doc.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Vertragsparagraphen
  lines.push(`## Vertragsparagraphen (${paragraphSource})`);
  lines.push('');
  lines.push('Diese 19 Paragraphen stehen im Mietvertrag-PDF das der Kunde unterschreibt:');
  lines.push('');
  for (const p of paragraphs) {
    lines.push(`### ${p.title}`);
    lines.push(p.text);
    lines.push('');
  }

  // Letzten unterschriebenen Vertrag laden
  const { data: lastAgreement } = await supabase
    .from('rental_agreements')
    .select('booking_id, contract_text, contract_hash, signed_by_name, signed_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAgreement?.contract_text) {
    lines.push('## Aktueller Vertrag (zuletzt unterschrieben)');
    lines.push('');
    lines.push(`Buchung: ${lastAgreement.booking_id} | Unterschrieben von: ${lastAgreement.signed_by_name} | Datum: ${lastAgreement.signed_at}`);
    lines.push(`SHA-256 Hash: ${lastAgreement.contract_hash}`);
    lines.push('');
    lines.push('```');
    lines.push(lastAgreement.contract_text);
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Vertragsstruktur (was der Kunde im PDF sieht)
  lines.push('## Vollständiger Vertragsaufbau (PDF-Struktur)');
  lines.push('');
  lines.push('Der Mietvertrag als PDF hat folgenden Aufbau:');
  lines.push('');
  lines.push('1. **Header:** cam2rent Logo, Vertragsnummer, Datum');
  lines.push('2. **Parteien:** Vermieter (cam2rent-Daten) + Mieter (Name, E-Mail, Adresse)');
  lines.push('3. **Buchungsdaten:** Buchungsnummer, Mietbeginn/-ende, Dauer, Lieferart');
  lines.push('4. **Mietgegenstand-Tabelle:** Position, Bezeichnung, Seriennummer, Tage, Preis');
  lines.push('5. **Wiederbeschaffungswerte-Tabelle:** Artikel + Zeitwert (Obergrenze Ersatzpflicht)');
  lines.push('6. **Entgelt und Zahlung:** Mietpreis, Versandkosten, Haftungsschutz, Gesamtbetrag, Zahlungsart');
  lines.push('7. **Gewählte Haftungsoption:** Hervorgehobene Box mit Beschreibung');
  lines.push('8. **Vertragsbedingungen:** Einleitungstext + die 19 Paragraphen (siehe oben)');
  lines.push('9. **Bestätigungstext:** Mieter bestätigt AGB, Widerruf, Haftung, Datenschutz gelesen zu haben');
  lines.push('10. **Digitale Signatur:** Name, Datum, IP-Adresse, SHA-256 Hash, Unterschrift-Bild');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Bitte prüfe:');
  lines.push('1. Stimmen die Vertragsparagraphen mit den Rechtsseiten überein?');
  lines.push('2. Gibt es Widersprüche (z.B. unterschiedliche Fristen, Beträge, Formulierungen)?');
  lines.push('3. Fehlen wichtige Klauseln?');
  lines.push('4. Werden die Begriffe korrekt verwendet (Haftungsschutz statt Versicherung)?');
  lines.push('5. Sind die Paragraphen juristisch korrekt für deutsches Mietrecht?');
  lines.push('6. Schlage konkrete Textänderungen vor falls nötig.');

  const prompt = lines.join('\n');

  return NextResponse.json({ prompt });
}
