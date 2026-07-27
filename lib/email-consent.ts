// Pure, JSX-frei — bewusst getrennt von lib/email.ts, damit der Zustimmungsblock
// ohne den @react-pdf-Import-Baum (invoice-pdf.tsx) unit-testbar ist.

function esc(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML-Block zur Dokumentation der Zustimmung nach § 356 Abs. 4 BGB in der
 * Buchungsbestätigung (AGB § 16 Abs. 3, Mietvertrag § 16 Abs. 3,
 * Widerrufsbelehrung). Enthält Datum, Uhrzeit (Berliner Zeit) UND IP-Adresse.
 *
 * Wird KOMPLETT weggelassen, wenn keine Zustimmung erteilt wurde (kein
 * Zeitstempel) — keine leeren Platzhalter. Fehlt nur die IP, entfällt das
 * IP-Fragment, der Rest des Satzes bleibt.
 */
export function renderEarlyServiceConsentBlock(
  consentAt?: string | null,
  consentIp?: string | null,
): string {
  if (!consentAt) return '';
  const when = new Date(consentAt).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });
  const ipPart = consentIp ? `, IP-Adresse ${esc(consentIp)}` : '';
  return `<p style="margin:0;font-size:12px;color:#9ca3af;">Zustimmung zur vorzeitigen Leistungserbringung gemäß § 356 Abs. 4 BGB erteilt am ${when} Uhr${ipPart}. Das Widerrufsrecht erlischt mit vollständiger Vertragserfüllung durch cam2rent.</p>`;
}
