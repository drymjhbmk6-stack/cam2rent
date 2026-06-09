/**
 * Zentrale Formatierungsfunktionen für Datum, Preis und Währung.
 * Statt in jeder Datei eigene fmtDate/fmtEuro/formatCurrency zu definieren,
 * diese Funktionen importieren.
 */

// ─── Preis / Währung ─────────────────────────────────────────────────────────

/** 12.50 → "12,50 €" */
export function fmtEuro(amount: number): string {
  return amount.toFixed(2).replace('.', ',') + ' €';
}

/** 12.50 → "12,50\u00a0€" (mit geschütztem Leerzeichen, Intl-konform) */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

// ─── Datum ───────────────────────────────────────────────────────────────────

// WICHTIG: Alle Formatierer nutzen explizit Europe/Berlin, damit sie auf
// UTC-Servern (Hetzner) dasselbe Datum anzeigen wie dem Nutzer in DE.
// Ohne die Option landen Zeiten 22:00-02:00 Berlin auf dem Vortag.
const TZ = 'Europe/Berlin';

/** ISO-String → "14.04.2026" */
export function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
}

/** ISO-String → "14. Apr. 2026" */
export function fmtDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
}

/** ISO-String → "14. April 2026" */
export function fmtDateLong(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ });
}

/** ISO-String → "Mo., 14.04.2026" (Wochentag + Datum) */
export function fmtDateWeekday(iso: string | Date): string {
  let d: Date;
  if (typeof iso === 'string') {
    // Reine Datums-Strings (YYYY-MM-DD) bewusst auf Mittag-UTC ankern, damit der
    // Wochentag nicht an der Tagesgrenze in Berlin-TZ kippt.
    const datePart = iso.split('T')[0];
    d = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? new Date(`${datePart}T12:00:00Z`) : new Date(iso);
  } else {
    d = iso;
  }
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
}

/** ISO-String → "14.04.2026, 10:30" */
export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  });
}

/** ISO-String → "14. Apr. 2026, 10:30 Uhr" */
export function fmtDateTimeShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  });
}

/** "2026-04-14" → "14.04.2026" (ohne Date-Objekt, rein string-basiert) */
export function isoToDE(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ─── Rundung ─────────────────────────────────────────────────────────────────

/**
 * Auf 2 Nachkommastellen runden. Standard fuer Euro-Betraege,
 * die nicht direkt aus DB kommen (z.B. Rabatt-Berechnung, Brutto/Netto-Konversion).
 *
 * Beispiel: 12.34567 → 12.35
 */
export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── HTML-Escaping ───────────────────────────────────────────────────────────

/**
 * Escapet HTML-Sonderzeichen in beliebigen Werten — schuetzt vor XSS, wenn
 * User-Input (Kundenname, Produktname, Notizen) ins HTML interpoliert wird.
 *
 * Client-safe Variante (dieselbe Logik wie `escapeHtml` aus `lib/email.ts`,
 * aber ohne Resend-Abhaengigkeiten — kann in Client Components importiert
 * werden ohne den Server-Mail-Stack ins Client-Bundle zu ziehen).
 */
export function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
