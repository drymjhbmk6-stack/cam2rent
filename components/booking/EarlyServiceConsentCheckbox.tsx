'use client';

/**
 * Zustimmung nach § 356 Abs. 4 BGB — vorzeitige Leistungserbringung.
 *
 * Wird angezeigt, wenn eine Buchung VOR Ablauf der 14-tägigen Widerrufsfrist
 * beginnt. Ohne diese ausdrückliche Erklärung erlischt das Widerrufsrecht nicht
 * und der Kunde schuldet bei Widerruf keinen Wertersatz (§ 357a Abs. 2 BGB).
 *
 * Gemeinsame Komponente für Warenkorb-Checkout (`app/checkout`) UND den
 * Angebots-/Direkt-Zahlungspfad (`app/kameras/[slug]/buchen`), damit der
 * Wortlaut nicht auseinanderläuft. Wortlaut deckt sich mit AGB § 16 Abs. 3,
 * Mietvertrag § 16 Abs. 3 und der Widerrufsbelehrung.
 *
 * NICHT vorausgewählt (AGB § 16 Abs. 3 — Zustimmung muss aktiv erfolgen). Der
 * Aufrufer sperrt den Absende-Button, bis `checked` true ist.
 */
export default function EarlyServiceConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded border-brand-border accent-accent-blue flex-shrink-0"
      />
      <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-relaxed">
        Ich verlange ausdrücklich, dass cam2rent vor Ablauf der 14-tägigen
        Widerrufsfrist mit der Ausführung der Dienstleistung
        (Versand/Bereitstellung der Mietgeräte) beginnt. Mir ist bekannt, dass
        mein Widerrufsrecht mit vollständiger Vertragserfüllung durch cam2rent
        erlischt (§ 356 Abs. 4 BGB).
      </span>
    </label>
  );
}
