// Menschlich lesbare Storno-Staffel — EINZIG aus CANCELLATION_TIERS abgeleitet
// (data/cancellation.ts, Quelle der Wahrheit, AGB § 15 Abs. 1). Damit laufen
// UI-Texte, E-Mails und PDFs bei einer künftigen Staffel-Änderung NICHT mehr
// auseinander. Keine hartkodierten Prozente/Tage in den Templates.

import { CANCELLATION_TIERS } from '@/data/cancellation';

export interface CancellationTierText {
  /** Ausführliches Label, z. B. „Mehr als 7 Tage vor Mietbeginn". */
  label: string;
  /** Kompaktes Label, z. B. „> 7 Tage" / „3–7 Tage" / „< 3 Tage". */
  compact: string;
  /** Erstattungsanteil in Prozent (z. B. 100 / 50 / 10). */
  refundPercent: number;
  /** Stornopauschale in Prozent (100 − refundPercent). */
  feePercent: number;
  /** true → nur per E-Mail (nicht im kostenlosen Self-Service-Fenster). */
  emailOnly: boolean;
}

/**
 * Leitet die Staffel-Beschreibung aus CANCELLATION_TIERS ab. Absteigend nach
 * Vorlauf sortiert (großzügigste Stufe zuerst). Die Tag-Grenzen ergeben sich aus
 * den `minDaysBefore`-Schwellen der jeweils benachbarten Stufe.
 */
export function describeCancellationTiers(): CancellationTierText[] {
  const tiers = [...CANCELLATION_TIERS].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  return tiers.map((t, i) => {
    const refundPercent = Math.round(t.refundRate * 100);
    const feePercent = 100 - refundPercent;
    const prev = tiers[i - 1];
    let label: string;
    let compact: string;
    if (i === 0) {
      label = `Mehr als ${t.minDaysBefore - 1} Tage vor Mietbeginn`;
      compact = `> ${t.minDaysBefore - 1} Tage`;
    } else if (i === tiers.length - 1) {
      label = `Weniger als ${prev.minDaysBefore} Tage vor Mietbeginn`;
      compact = `< ${prev.minDaysBefore} Tage`;
    } else {
      label = `${t.minDaysBefore} bis ${prev.minDaysBefore - 1} Tage vor Mietbeginn`;
      compact = `${t.minDaysBefore}–${prev.minDaysBefore - 1} Tage`;
    }
    return { label, compact, refundPercent, feePercent, emailOnly: refundPercent < 100 };
  });
}

/** Eine vollständige Zeile pro Stufe (für E-Mail/Belehrung). */
export function cancellationTierLine(t: CancellationTierText): string {
  const emailNote = t.emailOnly ? ' (Stornierung nur per E-Mail)' : '';
  if (t.feePercent === 0) {
    return `${t.label}: kostenlose Stornierung (100 % Rückerstattung)`;
  }
  return `${t.label}: ${t.feePercent} % Stornogebühr, ${t.refundPercent} % Rückerstattung${emailNote}`;
}

/** Kompakte Ein-Zeilen-Zusammenfassung (für knappe UI-Hinweise). */
export function cancellationSummaryLine(): string {
  return describeCancellationTiers()
    .map((t) => (t.feePercent === 0 ? `${t.compact}: kostenlos` : `${t.compact}: ${t.feePercent} % Gebühr`))
    .join(' · ');
}
