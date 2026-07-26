/**
 * Steuernummer des Kleinunternehmers (§ 14 Abs. 4 Nr. 2 UStG).
 *
 * cam2rent ist Kleinunternehmer nach § 19 UStG — es gibt KEINE USt-IdNr.
 * (siehe Impressum). Auf jeder Rechnung ist stattdessen die Steuernummer
 * anzugeben. Sie kommt aus der Umgebung (`COMPANY_TAX_NUMBER`, in Coolify
 * gesetzt), nicht aus dem Code.
 *
 * Ist die Variable leer, wird die Rechnungserstellung BEWUSST abgebrochen —
 * eine Rechnung ohne Pflichtangabe darf nicht entstehen (§ 14 UStG).
 */
export function getCompanyTaxNumber(): string {
  const raw = (process.env.COMPANY_TAX_NUMBER ?? '').trim();
  if (!raw) {
    throw new Error(
      'COMPANY_TAX_NUMBER ist nicht gesetzt — Rechnungserstellung abgebrochen. ' +
        'Die Steuernummer ist nach § 14 Abs. 4 Nr. 2 UStG Pflichtangabe auf jeder ' +
        'Rechnung. Bitte COMPANY_TAX_NUMBER als Umgebungsvariable (Coolify) setzen.',
    );
  }
  return raw;
}
