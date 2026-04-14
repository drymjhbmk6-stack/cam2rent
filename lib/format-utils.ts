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

/** ISO-String → "14.04.2026" */
export function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** ISO-String → "14. Apr. 2026" */
export function fmtDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** ISO-String → "14. April 2026" */
export function fmtDateLong(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** ISO-String → "14.04.2026, 10:30" */
export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** ISO-String → "14. Apr. 2026, 10:30 Uhr" */
export function fmtDateTimeShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "2026-04-14" → "14.04.2026" (ohne Date-Objekt, rein string-basiert) */
export function isoToDE(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
