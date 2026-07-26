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
 * Erstattungsrate (0–1) der Staffel für die Kalendertage bis zum ANKER
 * (ursprünglicher Mietbeginn, AGB § 15 Abs. 2). Die Untergrenze ist 10 % — die
 * AGB-Staffel (Abs. 1) definiert keine 0 %-Stufe VOR Mietbeginn; ihre
 * schlechteste Stufe ist „< 3 Tage → 10 %".
 *
 * WICHTIG: 0 % (keine Erstattung) greift NICHT, nur weil der ANKER in der
 * Vergangenheit liegt (z. B. verlegte Buchung, deren Ur-Termin schon vorbei
 * ist, deren TATSÄCHLICHE Miete aber noch bevorsteht). 0 % gilt ausschließlich,
 * wenn die tatsächliche Miete begonnen hat — das prüft `computeCancellationRefund`
 * separat über `rentalFrom`. Deshalb liefert diese Funktion für negative
 * Anker-Tage die schlechteste Staffelstufe (10 %), nicht 0 %.
 */
export function refundRateForDays(daysUntilAnchor: number): number {
  for (const tier of CANCELLATION_TIERS) {
    if (daysUntilAnchor >= tier.minDaysBefore) return tier.refundRate;
  }
  // Anker liegt in der Vergangenheit → schlechteste Stufe (< 3 Tage) = 10 %.
  return CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1].refundRate;
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

/** Kalendertage von heute bis `dateStr` (positiv = Zukunft, negativ = Vergangenheit). */
function daysBetweenNow(dateStr: string, now: Date): number {
  const target = toMidnight(new Date(dateStr));
  const today = toMidnight(now);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Kalendertage zwischen heute und dem maßgeblichen (Anker-)Mietbeginn. `now`
 * ist für Tests injizierbar; produktiv wird die aktuelle Zeit verwendet.
 */
export function daysUntilRentalStart(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): number {
  return daysBetweenNow(effectiveCancelDate(rentalFrom, cancellationAnchorDate), now);
}

/**
 * true → die TATSÄCHLICHE (evtl. verlegte) Miete hat begonnen (heute > rental_from).
 * Nur dann greift die 0 %-Regel (Leistung läuft); der Mietbeginn-Tag selbst
 * (Tag 0) zählt noch als storniabel (< 3-Tage-Stufe, 10 %).
 */
export function rentalHasStarted(rentalFrom: string, now: Date = new Date()): boolean {
  return daysBetweenNow(rentalFrom, now) < 0;
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
 *
 * Die Fristen bemessen sich nach dem ANKER (`anchorDate` =
 * `cancellation_anchor_date`, ursprünglicher Mietbeginn — AGB § 15 Abs. 2), die
 * 0 %-„Miete läuft"-Prüfung nach dem TATSÄCHLICHEN Mietbeginn (`rentalFrom`).
 * So bekommt ein Kunde, der eine Buchung weit nach hinten verlegt und dann
 * storniert, korrekt die schlechteste Staffelstufe (10 %) gemessen am Ur-Termin
 * — nicht wieder das kostenlose Fenster.
 */
export function computeCancellationRefund(params: {
  priceTotal: number;
  shippingPrice?: number;
  /**
   * `cancellation_anchor_date` — der URSPRÜNGLICH gebuchte Mietbeginn
   * (AGB § 15 Abs. 2). Bei verlegten Buchungen darf hier NIEMALS
   * `start_date`/`rental_from` durchgereicht werden — sonst öffnet die
   * Verlegung ein neues kostenloses Storno-Fenster. Fristen und Stornopauschalen
   * bemessen sich ausschließlich nach diesem Datum.
   */
  anchorDate: string;
  /**
   * Tatsächlicher (evtl. verlegter) Mietbeginn — NUR für die „Miete hat
   * begonnen"-Prüfung (0 % Erstattung, weil die Leistung läuft). Fehlt er,
   * wird der Anker verwendet (Nicht-Verlegungs-Annahme).
   */
  rentalFrom?: string;
  /** true → Paket ist bereits raus, Versandkosten sind verbraucht. */
  alreadyShipped?: boolean;
  now?: Date;
}): CancellationRefund {
  const now = params.now ?? new Date();
  const priceTotal = Math.max(0, params.priceTotal || 0);
  const shipping = Math.max(0, params.shippingPrice || 0);

  // Staffel gegen den ANKER; 0 % nur, wenn die TATSÄCHLICHE Miete bereits läuft.
  const actualFrom = params.rentalFrom || params.anchorDate;
  const refundRate = rentalHasStarted(actualFrom, now)
    ? 0
    : refundRateForDays(daysBetweenNow(params.anchorDate, now));

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

  // „Nicht mehr stornierbar" nur wenn die TATSÄCHLICHE Miete begonnen hat —
  // eine verlegte Buchung mit vergangenem Anker, aber zukünftigem Termin,
  // bleibt stornierbar (dann gegen den Anker: schlechteste Stufe = 10 %).
  if (rentalHasStarted(rentalFrom, now)) return 'not_possible';

  const daysUntilAnchor = daysUntilRentalStart(rentalFrom, cancellationAnchorDate, now);

  if (daysUntilAnchor > 7) return 'allowed';  // > 7 Tage vor Anker → kostenloser Selbstservice
  return 'email_only';                        // 3–7 (50 %) und < 3 / Anker vergangen (10 %) → per E-Mail
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

/** Erstattungsanteil (0–1) für den storniablen Anteil (Staffel gegen den Anker). */
export function getRefundPercentage(
  rentalFrom: string,
  cancellationAnchorDate?: string | null,
  now: Date = new Date(),
): number {
  if (rentalHasStarted(rentalFrom, now)) return 0; // tatsächliche Miete läuft
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

// ─── Admin-Storno: Grund-Kategorien + Erstattungs-Vorschlag ─────────────────
//
// Der Admin-Storno rechnet mit der Staffel als VORSCHLAG (Obergrenze der
// Gebühr, kein fester Betrag). Eine Erstattung ÜBER dem Vorschlag ist nach AGB
// regelmäßig korrekt (§ 15 Abs. 3/4 ersparte Aufwendungen/geringerer Schaden);
// nur eine Erstattung UNTER dem Vorschlag braucht eine Begründung.
//
// Bestimmte Storno-Gründe verlangen nach AGB VOLLE Erstattung — dann wird
// 100 % vorbelegt statt der Staffel.

export type CancellationReasonCategory =
  | 'customer'                    // Stornierung durch Kunden → Staffel
  | 'vermieter_verlegung'         // § 12 Abs. 5 → 100 %
  | 'bereitstellung_unmoeglich'   // § 11 Abs. 3 → 100 %
  | 'nichtannahme_48h'            // § 3 Abs. 5 → 100 %
  | 'kontosperrung';              // § 19 Abs. 2 → 100 %

/** Gründe, die nach AGB volle Erstattung (100 %) verlangen. */
export const FULL_REFUND_CANCEL_REASONS: readonly CancellationReasonCategory[] = [
  'vermieter_verlegung',
  'bereitstellung_unmoeglich',
  'nichtannahme_48h',
  'kontosperrung',
];

/** Auswahloptionen „Grund der Stornierung" für den Admin-Storno-Dialog. */
export const CANCELLATION_REASON_OPTIONS: {
  value: CancellationReasonCategory;
  label: string;
  fullRefund: boolean;
}[] = [
  { value: 'customer', label: 'Stornierung durch Kunden', fullRefund: false },
  { value: 'vermieter_verlegung', label: 'Vermieter-Verlegung, kein zumutbarer Ersatztermin (§ 12 Abs. 5)', fullRefund: true },
  { value: 'bereitstellung_unmoeglich', label: 'Bereitstellung nicht möglich (§ 11 Abs. 3)', fullRefund: true },
  { value: 'nichtannahme_48h', label: 'Nichtannahme innerhalb 48 Stunden (§ 3 Abs. 5)', fullRefund: true },
  { value: 'kontosperrung', label: 'Kontosperrung ohne Verschulden des Mieters (§ 19 Abs. 2)', fullRefund: true },
];

/** Normalisiert eine Freitext-Kategorie auf eine bekannte Option (Fallback 'customer'). */
export function normalizeCancellationReason(value: unknown): CancellationReasonCategory {
  return CANCELLATION_REASON_OPTIONS.some((o) => o.value === value)
    ? (value as CancellationReasonCategory)
    : 'customer';
}

/** True, wenn der Grund nach AGB volle Erstattung verlangt. */
export function isFullRefundReason(reasonCategory: string): boolean {
  return (FULL_REFUND_CANCEL_REASONS as readonly string[]).includes(reasonCategory);
}

export interface CancellationSuggestion {
  reasonCategory: CancellationReasonCategory;
  /** Maßgebliches Anker-Datum (frühester Mietbeginn). */
  anchorDate: string;
  rentalFrom: string;
  /** true → Buchung wurde verlegt, Anker weicht vom aktuellen Mietbeginn ab. */
  anchorDiffers: boolean;
  daysUntilStart: number;
  fullRefundReason: boolean;
  /** Erstattungsrate der Staffel (0–1); bei Voll-Erstattungs-Gründen 1. */
  refundRate: number;
  gradedRefund: number;
  shippingRefund: number;
  /** Vorbelegter Erstattungsbetrag (Obergrenze der Gebühr, nach unten begründungspflichtig). */
  suggestedAmount: number;
  priceTotal: number;
  shippingPrice: number;
}

/**
 * Berechnet den Erstattungs-VORSCHLAG für den Admin-Storno. Nutzt IMMER den
 * Anker (cancellation_anchor_date), nie den aktuellen (evtl. verlegten)
 * Mietbeginn. Voll-Erstattungs-Gründe (§§ 12/11/3/19) belegen 100 % vor.
 */
export function computeCancellationSuggestion(params: {
  priceTotal: number;
  shippingPrice?: number;
  rentalFrom: string;
  cancellationAnchorDate?: string | null;
  reasonCategory?: string;
  alreadyShipped?: boolean;
  now?: Date;
}): CancellationSuggestion {
  const now = params.now ?? new Date();
  const reasonCategory = normalizeCancellationReason(params.reasonCategory);
  const rentalFrom = params.rentalFrom.slice(0, 10);
  const anchorDate = effectiveCancelDate(rentalFrom, params.cancellationAnchorDate);
  const daysUntilStart = daysUntilRentalStart(rentalFrom, params.cancellationAnchorDate, now);
  const priceTotal = Math.max(0, params.priceTotal || 0);
  const shipping = Math.max(0, params.shippingPrice || 0);
  const anchorDiffers = anchorDate !== rentalFrom;

  if (isFullRefundReason(reasonCategory)) {
    return {
      reasonCategory,
      anchorDate,
      rentalFrom,
      anchorDiffers,
      daysUntilStart,
      fullRefundReason: true,
      refundRate: 1,
      gradedRefund: round2(Math.max(0, priceTotal - shipping)),
      shippingRefund: shipping,
      suggestedAmount: round2(priceTotal),
      priceTotal,
      shippingPrice: shipping,
    };
  }

  const r = computeCancellationRefund({
    priceTotal,
    shippingPrice: shipping,
    anchorDate,
    rentalFrom,
    alreadyShipped: params.alreadyShipped,
    now,
  });
  return {
    reasonCategory,
    anchorDate,
    rentalFrom,
    anchorDiffers,
    daysUntilStart,
    fullRefundReason: false,
    refundRate: r.refundRate,
    gradedRefund: r.gradedRefund,
    shippingRefund: r.shippingRefund,
    suggestedAmount: r.refundTotal,
    priceTotal,
    shippingPrice: shipping,
  };
}

/**
 * Liegt die tatsächliche Erstattung unter dem Vorschlag (mit Cent-Toleranz)?
 * Dann ist eine Begründung Pflicht (AGB-widrig ohne Begründung).
 */
export function refundBelowSuggestion(refunded: number, suggested: number): boolean {
  return refunded < suggested - 0.005;
}
