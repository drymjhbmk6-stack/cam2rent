// Stornierungsrichtlinie für cam2rent
//
// ≥ 7 Tage vor Mietstart  → kostenlose Stornierung (100 % Erstattung), Selbstservice im Kundenkonto
// 3–6 Tage vor Mietstart  → 50 % Stornogebühren, NUR per E-Mail (nicht Selbstservice)
// ≤ 2 Tage vor Mietstart  → 100 % Stornokosten (keine Erstattung), keine Stornierung möglich

export type SelfServiceEligibility =
  | 'allowed'       // ≥ 7 Tage → Selbstservice möglich
  | 'email_only'    // 3–6 Tage → nur per E-Mail stornierbar
  | 'not_possible'; // ≤ 2 Tage oder Miete hat begonnen → keine Stornierung

/**
 * Maßgebliches Storno-Datum. Verhindert, dass eine Verlegung das kostenlose
 * Storno-Fenster neu öffnet: gerechnet wird IMMER gegen den frühesten je
 * gesetzten Mietbeginn (`cancellationAnchorDate` = ursprünglicher rental_from,
 * eingefroren beim ersten Verlegen). Ohne Anker (Normalfall) gilt rental_from.
 */
export function effectiveCancelDate(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
): string {
  const anchor = (cancellationAnchorDate || '').trim();
  if (!anchor) return rentalFrom;
  // frühestes Datum gewinnt (String-Vergleich auf YYYY-MM-DD ist chronologisch)
  return anchor < rentalFrom ? anchor : rentalFrom;
}

/** Gibt an, ob und wie eine Buchung storniert werden kann */
export function getCancellationEligibility(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
): SelfServiceEligibility {
  if (status !== 'confirmed') return 'not_possible';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(effectiveCancelDate(rentalFrom, cancellationAnchorDate));
  start.setHours(0, 0, 0, 0);
  const daysUntilStart = Math.floor(
    (start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilStart < 0) return 'not_possible'; // Miete hat begonnen
  if (daysUntilStart >= 7) return 'allowed';
  if (daysUntilStart >= 3) return 'email_only';
  return 'not_possible'; // ≤ 2 Tage
}

/** Prüft ob Selbstservice-Stornierung erlaubt (≥ 7 Tage) */
export function isSelfServiceCancellable(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
): boolean {
  return getCancellationEligibility(rentalFrom, status, cancellationAnchorDate) === 'allowed';
}

/** Erstattungsanteil für Selbstservice-Stornierungen (nur ≥ 7 Tage → immer 100 %) */
export function getRefundPercentage(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(effectiveCancelDate(rentalFrom, cancellationAnchorDate));
  start.setHours(0, 0, 0, 0);
  const daysUntilStart = Math.floor(
    (start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilStart >= 7 ? 1.0 : 0;
}

/** Label-Texte für die UI je nach Stornierungsstatus */
export function getCancellationInfo(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
): {
  eligibility: SelfServiceEligibility;
  label: string;
  description: string;
  refundPercentage: number;
} {
  const eligibility = getCancellationEligibility(rentalFrom, status, cancellationAnchorDate);

  if (eligibility === 'allowed') {
    return {
      eligibility,
      label: 'Kostenlose Stornierung',
      description: 'Stornierung ≥ 7 Tage vor Mietstart: volle Rückerstattung',
      refundPercentage: 100,
    };
  }
  if (eligibility === 'email_only') {
    return {
      eligibility,
      label: '50 % Stornogebühren',
      description: 'Stornierung 3–6 Tage vor Mietstart: 50 % des Mietpreises werden berechnet. Stornierung nur per E-Mail.',
      refundPercentage: 50,
    };
  }
  return {
    eligibility,
    label: 'Keine Stornierung möglich',
    description: 'Stornierung ≤ 2 Tage vor Mietstart: 100 % des Mietpreises werden berechnet.',
    refundPercentage: 0,
  };
}
