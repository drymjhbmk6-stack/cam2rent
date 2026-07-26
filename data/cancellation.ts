// Stornierungsrichtlinie für cam2rent — Staffel gemäß AGB § 15 Abs. 1 und
// Mietvertrag § 15 Abs. 1.
//
// Gerechnet in Kalendertagen zwischen dem Zugang der Stornierung (heute) und
// dem MAßGEBLICHEN Mietbeginn. Maßgeblich ist der ursprünglich gebuchte Termin
// (cancellation_anchor_date, eingefroren beim ersten Verlegen), sonst
// rental_from — siehe AGB § 15 Abs. 2 / Vertrag § 15 Abs. 2. Eine Verlegung
// darf das Storno-Fenster nicht neu eröffnen.
//
//   > 7 Tage vor Mietbeginn   →  0 % Stornopauschale, 100 % Erstattung
//   3–7 Tage (einschließlich) → 50 % Stornopauschale,  50 % Erstattung
//   < 3 Tage (0–2 Tage)       → 90 % Stornopauschale,  10 % Erstattung
//
// Versandkosten werden bei Stornierung VOR Versand IMMER voll erstattet,
// unabhängig von der Stufe (AGB § 15 Abs. 5). Die Staffel wirkt ausschließlich
// auf den storniablen Anteil (Mietpreis + Haftungsschutz + Zubehör =
// price_total − Versandkosten). Nach dem Versand sind die Versandkosten
// verbraucht und werden nicht mehr erstattet.

export type SelfServiceEligibility =
  | 'allowed'       // > 7 Tage → Selbstservice möglich (100 %)
  | 'email_only'    // 3–7 Tage (50 %) oder < 3 Tage (10 %) → nur per E-Mail
  | 'not_possible'; // Miete hat begonnen / Buchung nicht stornierbar

export interface CancellationTier {
  /** Untergrenze (einschließlich) der Kalendertage vor Mietbeginn. */
  minDaysBefore: number;
  /** Anteil des storniablen Betrags, der dem Kunden erstattet wird (0–1). */
  refundRate: number;
}

/**
 * Storno-Staffel — EINZIGE Quelle der Wahrheit für alle Erstattungssätze.
 * Absteigend nach `minDaysBefore` sortiert; die erste passende Stufe
 * (`daysUntilStart >= minDaysBefore`) gewinnt. Grenzfälle:
 *   8 Tage → 100 %, 7 Tage → 50 %, 3 Tage → 50 %, 2 Tage → 10 %, 0 Tage → 10 %.
 */
export const CANCELLATION_TIERS: readonly CancellationTier[] = [
  { minDaysBefore: 8, refundRate: 1.0 }, // > 7 Tage vor Mietbeginn
  { minDaysBefore: 3, refundRate: 0.5 }, // 3–7 Tage (einschließlich)
  { minDaysBefore: 0, refundRate: 0.1 }, // < 3 Tage (0, 1, 2 Tage)
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Erstattungsrate (0–1) für die gegebene Anzahl Kalendertage vor Mietbeginn.
 * Hat die Miete bereits begonnen (`daysUntilStart < 0`) → 0 %.
 */
export function refundRateForDays(daysUntilStart: number): number {
  if (daysUntilStart < 0) return 0;
  for (const tier of CANCELLATION_TIERS) {
    if (daysUntilStart >= tier.minDaysBefore) return tier.refundRate;
  }
  return 0;
}

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

function toMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Kalendertage zwischen heute und dem maßgeblichen Mietbeginn. `now` ist für
 * Tests injizierbar; produktiv wird die aktuelle Zeit verwendet.
 */
export function daysUntilRentalStart(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): number {
  const start = toMidnight(new Date(effectiveCancelDate(rentalFrom, cancellationAnchorDate)));
  const today = toMidnight(now);
  return Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export interface CancellationRefund {
  /** Angewandte Erstattungsrate der Staffel (0–1). */
  refundRate: number;
  /** Stornopauschale-Rate auf den storniablen Anteil (1 − refundRate). */
  feeRate: number;
  /** Erstattung auf Mietpreis + Haftungsschutz + Zubehör (gestaffelt). */
  gradedRefund: number;
  /** Erstattung der Versandkosten (voll, sofern noch nicht versendet). */
  shippingRefund: number;
  /** Gesamterstattung = gradedRefund + shippingRefund. */
  refundTotal: number;
}

/**
 * Berechnet die Erstattung gemäß AGB § 15. Die Staffel wirkt nur auf den
 * storniablen Anteil (price_total − Versand); Versandkosten werden — solange
 * noch nicht versendet — IMMER voll erstattet (§ 15 Abs. 5).
 */
export function computeCancellationRefund(params: {
  priceTotal: number;
  shippingPrice?: number;
  daysUntilStart: number;
  /** true → Paket ist bereits raus, Versandkosten sind verbraucht. */
  alreadyShipped?: boolean;
}): CancellationRefund {
  const priceTotal = Math.max(0, params.priceTotal || 0);
  const shipping = Math.max(0, params.shippingPrice || 0);
  const refundRate = refundRateForDays(params.daysUntilStart);

  // Storniabler Anteil = alles außer Versand (Mietpreis + Haftung + Zubehör
  // − eventuelle Rabatte, weil price_total den Rabatt bereits enthält).
  const gradedBase = Math.max(0, priceTotal - shipping);
  const gradedRefund = round2(gradedBase * refundRate);
  const shippingRefund = params.alreadyShipped ? 0 : shipping;

  return {
    refundRate,
    feeRate: round2(1 - refundRate),
    gradedRefund,
    shippingRefund,
    refundTotal: round2(gradedRefund + shippingRefund),
  };
}

/** Gibt an, ob und wie eine Buchung storniert werden kann. */
export function getCancellationEligibility(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): SelfServiceEligibility {
  if (status !== 'confirmed') return 'not_possible';

  const daysUntilStart = daysUntilRentalStart(rentalFrom, cancellationAnchorDate, now);

  if (daysUntilStart < 0) return 'not_possible'; // Miete hat begonnen
  if (daysUntilStart > 7) return 'allowed';       // > 7 Tage → kostenloser Selbstservice
  return 'email_only';                            // 3–7 (50 %) und < 3 (10 %) → per E-Mail
}

/** Prüft ob Selbstservice-Stornierung (kostenlos, > 7 Tage) erlaubt ist. */
export function isSelfServiceCancellable(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): boolean {
  return getCancellationEligibility(rentalFrom, status, cancellationAnchorDate, now) === 'allowed';
}

/** Erstattungsanteil (0–1) für den storniablen Anteil. */
export function getRefundPercentage(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): number {
  return refundRateForDays(daysUntilRentalStart(rentalFrom, cancellationAnchorDate, now));
}

/** Label-Texte für die UI je nach Stornierungsstatus. */
export function getCancellationInfo(
  rentalFrom: string,
  status: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): {
  eligibility: SelfServiceEligibility;
  label: string;
  description: string;
  refundPercentage: number;
} {
  const eligibility = getCancellationEligibility(rentalFrom, status, cancellationAnchorDate, now);
  const days = daysUntilRentalStart(rentalFrom, cancellationAnchorDate, now);
  const refundPercentage = Math.round(refundRateForDays(days) * 100);

  if (eligibility === 'allowed') {
    return {
      eligibility,
      label: 'Kostenlose Stornierung',
      description:
        'Stornierung mehr als 7 Tage vor Mietbeginn: volle Rückerstattung (Versandkosten inklusive).',
      refundPercentage: 100,
    };
  }

  if (eligibility === 'email_only') {
    if (refundPercentage >= 50) {
      return {
        eligibility,
        label: '50 % Stornopauschale',
        description:
          'Stornierung 3 bis 7 Tage vor Mietbeginn: 50 % von Mietpreis und Haftungsschutz werden als Stornopauschale einbehalten, 50 % werden erstattet. Versandkosten werden — sofern noch nicht versendet — voll erstattet. Stornierung per E-Mail.',
        refundPercentage: 50,
      };
    }
    return {
      eligibility,
      label: '90 % Stornopauschale',
      description:
        'Stornierung weniger als 3 Tage vor Mietbeginn: 90 % von Mietpreis und Haftungsschutz werden als Stornopauschale einbehalten, 10 % werden erstattet. Versandkosten werden — sofern noch nicht versendet — voll erstattet. Stornierung per E-Mail.',
      refundPercentage: 10,
    };
  }

  return {
    eligibility,
    label: 'Keine Stornierung möglich',
    description:
      'Die Miete hat bereits begonnen — eine Stornierung ist nicht mehr möglich.',
    refundPercentage: 0,
  };
}
