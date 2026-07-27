import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import {
  describeCancellationTiers,
  cancellationTierLine,
  cancellationSummaryLine,
} from '@/lib/cancellation-text';

/** grep über den Produktivcode; liefert Trefferdateien (leer = kein Treffer). */
function grepFiles(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rIl --exclude-dir=__tests__ -e ${JSON.stringify(pattern)} app lib components data`,
      { encoding: 'utf8', cwd: process.cwd() },
    );
    return out.trim().split('\n').filter(Boolean);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return []; // grep: kein Treffer
    throw e;
  }
}

describe('Widerrufsrecht-Konsistenz — kein § 312g-Ausschluss im Produktivcode', () => {
  it('nirgends mehr "312g"', () => {
    expect(grepFiles('312g')).toEqual([]);
  });
  it('nirgends mehr "kein gesetzliches Widerrufsrecht"', () => {
    expect(grepFiles('kein gesetzliches Widerrufsrecht')).toEqual([]);
  });
  it('nirgends mehr "kein Widerrufsrecht besteht"', () => {
    expect(grepFiles('kein Widerrufsrecht besteht')).toEqual([]);
  });
  it('nirgends mehr "Freizeitdienstleistung"/"Freizeitbetätigung"', () => {
    expect(grepFiles('Freizeitdienstleistung')).toEqual([]);
    expect(grepFiles('Freizeitbetätigung')).toEqual([]);
  });
});

/**
 * Haftungs-Terminologie-Guard (Rechtstexte-Compliance-Sweep 2026-07-26).
 *
 * Ziel: die verbotenen Haftungs-Begriffe dürfen NICHT mehr im Produktivcode
 * auftauchen. Der Guard prüft ausschließlich TEXT-Vorkommen im Quellcode
 * (Anzeige-/Rechtstexte) — NICHT die DB-Feld-WERTE (`haftung='standard'`,
 * `<option value="standard">`, `shipping_method='standard'`), die bleiben
 * absichtlich unverändert und sind hier auch nicht betroffen (das Wort
 * "standard" allein wird nicht geprüft, nur die verbotenen Anzeige-Labels).
 *
 * Zwei Sorten:
 *  (1) Begriffe mit NULL legitimen Vorkommen → harte Assertion `=== []`.
 *  (2) Begriffe, die als interner Code-Identifier bzw. in Fremdkontexten
 *      legitim vorkommen (`Versicherung` als Buchhaltungs-Kategorie / in
 *      KI-Prompt-Leitplanken / in der Pflicht-Negation „keine Versicherung im
 *      Sinne des VVG"; `Eigenbeteiligung` als DB-Feld-/Helper-Identifier) →
 *      Datei-Allowlist mit Begründung je Eintrag. Jede NEUE Datei mit dem
 *      Begriff lässt den Guard fehlschlagen und erzwingt so eine bewusste
 *      Entscheidung (fixen oder mit Begründung whitelisten).
 *
 * Limitierung der Allowlist-Variante: sie erkennt nur NEUE Dateien, nicht das
 * Wieder-Einführen eines Anzeige-Strings in einer bereits gelisteten Datei —
 * unvermeidbar, weil `Versicherung`/`Eigenbeteiligung` dort als legitime
 * Bezeichner/Fremdbegriffe leben und ein reiner Wort-Grep sie nicht trennen
 * kann.
 */

/** Verbotene Haftungs-Anzeige-Labels ohne jedes legitime Vorkommen. */
const VERBOTENE_HAFTUNGS_BEGRIFFE = [
  'Reparaturdepot', // ersatzlos gestrichen — Restschaden „trägt cam2rent"
  'Schadenspauschale', // → „Haftungsschutz"
  'Selbstbeteiligung', // → „Höchstbetrag der Ersatzpflicht"
  'Standard-Haftung', // Optionsname ist „Basis-Haftungsschutz"
  'Standard-Haftungsschutz', // dito
  'Standard-Haftungsoption', // dito
] as const;

/**
 * `Versicherung` ist im Kunden-/Rechtstext verboten (cam2rent ist kein
 * Versicherer), kommt aber in drei legitimen Kontexten vor. Allowlist mit
 * Begründung je Datei — eine neue Datei mit dem Wort bricht den Guard.
 */
const VERSICHERUNG_ALLOWLIST: Record<string, string> = {
  // — Pflicht-Negation „keine Versicherung im Sinne des VVG" (rechtlich zwingend) —
  'app/agb/page.tsx': 'AGB: Pflicht-Negation „KEINE Versicherung im Sinne des VVG"',
  'app/haftungsbedingungen/page.tsx': 'Haftungsbedingungen: Pflicht-Negation VVG',
  'app/faq/FaqContent.tsx': 'FAQ: Negation + Verweis auf die private Versicherung des Kunden',
  'lib/contracts/contract-template.tsx': 'Mietvertrag § 7 (5): Pflicht-Negation VVG',
  'lib/haftungsbedingungen-pdf.tsx': 'Haftungsbedingungen-PDF: Pflicht-Negation VVG',
  // — Buchhaltungs-Ausgabenkategorie „Versicherungen" (Betriebsausgabe, kein Bezug zum Haftungsschutz) —
  'app/admin/anlagen/nachtragen/page.tsx': 'Buchhaltung: Kategorie „Versicherungen"',
  'app/admin/buchhaltung/belege/[id]/page.tsx': 'Buchhaltung: Klassifizierungs-Hilfetext',
  'app/admin/buchhaltung/belege/neu/page.tsx': 'Buchhaltung: Klassifizierungs-Hilfetext',
  'app/admin/buchhaltung/components/AusgabenTab.tsx': 'Buchhaltung: Kategorie-Label',
  'app/admin/einkauf/upload/page.tsx': 'Buchhaltung: Kategorie-Label',
  'app/api/admin/ausgaben/route.ts': 'Buchhaltung: Kommentar zur Klassifizierung',
  'app/api/admin/buchhaltung/reports/euer/route.ts': 'EÜR: Kategorie-Label',
  'components/admin/PurchaseItemClassifier.tsx': 'Buchhaltung: Kategorie-Label',
  'lib/accounting/kontenrahmen.ts': 'Buchhaltung: SKR-Konto „Versicherungen"',
  'lib/ai/invoice-extract.ts': 'OCR-Prompt: Versicherungsprämien als Betriebsausgabe',
  'lib/ai/klassifiziere-positionen.ts': 'Klassifizier-Prompt: Versicherungsprämien',
  // — KI-Leitplanken-Prompts, die dem Modell das Wort VERBIETEN (enthalten es dadurch) —
  'app/api/admin/blog/factcheck/route.ts': 'KI-Leitplanke: „Versicherung → Haftungsschutz"',
  'app/api/admin/blog/schedule/route.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'app/api/admin/legal/export-prompt/route.ts': 'Rechtstext-Prüf-Prompt: NIEMALS Versicherung',
  'app/api/cron/blog-generate/route.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'app/api/cron/social-generate/route.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'lib/blog/system-prompt.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'lib/meta/generate-plan-entry.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'lib/meta/social-prompt.ts': 'KI-Leitplanke: NIEMALS Versicherung',
  'lib/reels/script-ai.ts': 'KI-Leitplanke: keine Versicherungs-Aussagen',
  'components/admin/SocialEinstellungenContent.tsx': 'KI-Kontext-Hinweis: NIEMALS Versicherung',
};

/**
 * `Eigenbeteiligung` ist als Anzeige-Label verboten (→ „Höchstbetrag der
 * Ersatzpflicht"), lebt aber als interner DB-Feld-/Helper-Identifier
 * (`standardEigenbeteiligung`, `getEigenbeteiligung`) und in Code-Kommentaren.
 * Die Kunden-Anzeige ist bereits auf „Höchstbetrag der Ersatzpflicht"
 * umgestellt (siehe buchen-Seite `opt.liability`).
 */
const EIGENBETEILIGUNG_ALLOWLIST: Record<string, string> = {
  'lib/price-config.ts': 'DB-Feld `standardEigenbeteiligung` + Helper `getEigenbeteiligung`',
  'app/admin/buchungen/neu/page.tsx': 'Typ-Feld `standardEigenbeteiligung`',
  'app/kameras/[slug]/buchen/page.tsx': 'Helper-Import + Kommentar (Anzeige nutzt `opt.liability`)',
  'app/api/admin/booking/[id]/route.ts': 'Helper `getEigenbeteiligung` + Kommentar',
  'app/api/rental-contract/[bookingId]/route.ts': 'Helper `getEigenbeteiligung` + Kommentar',
  'lib/contracts/contract-template.tsx': 'Kommentar zur dynamischen Kategorie',
  'lib/contracts/generate-contract.ts': 'Helper `getEigenbeteiligung` + Kommentar',
  // Admin-interne Konfig-UI beschreibt das DB-Feld. Kein Kunden-/Rechtstext.
  // (Ob die Admin-Labels ebenfalls umbenannt werden sollen, ist offen — siehe Report.)
  // Anzeige-Labels sind auf „Höchstbetrag der Ersatzpflicht" umbenannt; verbleibt
  // NUR noch der DB-Feld-Identifier `standardEigenbeteiligung` (Feldname bewusst
  // unangetastet) — daher kann der Eintrag nicht entfernt werden.
  'components/admin/HaftungContent.tsx': 'DB-Feld-Identifier `standardEigenbeteiligung` (Anzeige-Labels bereinigt)',
};

/** Prüft: alle Grep-Treffer müssen in der Allowlist stehen (sonst Verstoß). */
function unerlaubteDateien(term: string, allowlist: Record<string, string>): string[] {
  return grepFiles(term).filter((f) => !(f in allowlist));
}

describe('Haftungs-Terminologie-Guard — verbotene Begriffe im Produktivcode', () => {
  it.each(VERBOTENE_HAFTUNGS_BEGRIFFE)('kein Vorkommen von "%s"', (term) => {
    expect(grepFiles(term)).toEqual([]);
  });

  it('"Versicherung" nur in den (begründet) whitelisteten Dateien', () => {
    expect(unerlaubteDateien('Versicherung', VERSICHERUNG_ALLOWLIST)).toEqual([]);
  });

  it('"Eigenbeteiligung" nur in den (begründet) whitelisteten Dateien', () => {
    expect(unerlaubteDateien('Eigenbeteiligung', EIGENBETEILIGUNG_ALLOWLIST)).toEqual([]);
  });

  it('Allowlist-Einträge tragen jeweils eine Begründung', () => {
    for (const reason of Object.values(VERSICHERUNG_ALLOWLIST)) expect(reason.length).toBeGreaterThan(5);
    for (const reason of Object.values(EIGENBETEILIGUNG_ALLOWLIST)) expect(reason.length).toBeGreaterThan(5);
  });
});

describe('Storno-Staffel aus CANCELLATION_TIERS (AGB § 15)', () => {
  it('liefert 3 Stufen mit 100 / 50 / 10 % Erstattung', () => {
    const tiers = describeCancellationTiers();
    expect(tiers.map((t) => t.refundPercent)).toEqual([100, 50, 10]);
    expect(tiers.map((t) => t.feePercent)).toEqual([0, 50, 90]);
  });

  it('korrekte Tag-Grenzen (> 7 / 3–7 / < 3 Tage)', () => {
    const tiers = describeCancellationTiers();
    expect(tiers[0].label).toBe('Mehr als 7 Tage vor Mietbeginn');
    expect(tiers[1].label).toBe('3 bis 7 Tage vor Mietbeginn');
    expect(tiers[2].label).toBe('Weniger als 3 Tage vor Mietbeginn');
    expect(tiers[0].compact).toBe('> 7 Tage');
    expect(tiers[1].compact).toBe('3–7 Tage');
    expect(tiers[2].compact).toBe('< 3 Tage');
  });

  it('die < 3-Tage-Stufe zeigt 10 % Rückerstattung / 90 % Gebühr — NICHT "keine Erstattung"', () => {
    const last = describeCancellationTiers().at(-1)!;
    const line = cancellationTierLine(last);
    expect(line).toContain('90 % Stornogebühr');
    expect(line).toContain('10 % Rückerstattung');
    expect(line).not.toMatch(/keine (Rück)?[eE]rstattung/);
    expect(line).not.toContain('100 %');
  });

  it('Zusammenfassung enthält 90 % Gebühr für < 3 Tage, kein "keine Erstattung"', () => {
    const summary = cancellationSummaryLine();
    expect(summary).toContain('< 3 Tage: 90 % Gebühr');
    expect(summary).toContain('> 7 Tage: kostenlos');
    expect(summary).not.toMatch(/keine (Rück)?[eE]rstattung/);
  });
});
