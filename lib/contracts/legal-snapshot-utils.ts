/**
 * Reine (JSX-freie) Helfer rund um den Vertrags-Rechtstext-Snapshot, damit sie
 * ohne @react-pdf-Import unit-getestet werden können.
 */

/**
 * Höchstbetrag der Ersatzpflicht je Haftungsoption (Mietvertrag § 8 Abs. 2 b).
 *  • Premium-Haftungsschutz → 0 EUR
 *  • Basis-Haftungsschutz    → kategorie-spezifischer Betrag (eb)
 *  • Ohne Haftungsschutz     → null (Haftung bis zum Wiederbeschaffungswert
 *    laut Tabelle, kein fixer Höchstbetrag)
 */
export function computeLiabilityMaxAmount(
  haftungOption: string,
  eb: number,
): number | null {
  if (haftungOption === 'Premium-Haftungsschutz') return 0;
  if (haftungOption === 'Basis-Haftungsschutz') return eb;
  return null;
}

/**
 * Formatiert die einbezogenen Rechtstext-Fassungen (AGB § 1 Abs. 5 /
 * Vertrag § 1 Abs. 4). Numerische Versionen als „vN", Sentinel-Werte
 * (z. B. „unbekannt (Altbestand)") unverändert. Liefert null, wenn keine
 * Fassung hinterlegt ist.
 */
export function formatLegalVersions(v: {
  termsVersion?: string;
  liabilityTermsVersion?: string;
  withdrawalVersion?: string;
  privacyVersion?: string;
}): string | null {
  const fmt = (x?: string) => (x ? (/^\d+$/.test(x) ? `v${x}` : x) : null);
  const parts = [
    v.termsVersion && `AGB ${fmt(v.termsVersion)}`,
    v.liabilityTermsVersion && `Haftungsbedingungen ${fmt(v.liabilityTermsVersion)}`,
    v.withdrawalVersion && `Widerruf ${fmt(v.withdrawalVersion)}`,
    v.privacyVersion && `Datenschutz ${fmt(v.privacyVersion)}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
