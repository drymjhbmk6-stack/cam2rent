import { describe, it, expect } from 'vitest';
import {
  countParagraphs,
  renderGeneratedModule,
  type ContractParagraph,
  type LegalDoc,
} from '../sync-legal-fallbacks';

function makeParagraphs(n: number): ContractParagraph[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `§ ${i + 1} Titel ${i + 1}`,
    text: `(1) Absatz von Paragraph ${i + 1}.\n(2) Zweiter Absatz mit 'Anführungszeichen' und \\ Backslash.`,
  }));
}

function makeAgbMarkdown(n: number): string {
  let md = '# Allgemeine Geschäftsbedingungen\n\n*Stand: Juli 2026*\n\n';
  for (let i = 1; i <= n; i++) md += `## § ${i} Abschnitt ${i}\n\n(1) Inhalt ${i}.\n\n`;
  return md;
}

describe('countParagraphs', () => {
  it('zählt § N-Überschriften in Markdown', () => {
    expect(countParagraphs(makeAgbMarkdown(25))).toBe(25);
  });
  it('zählt § N in einer Titel-Liste', () => {
    expect(countParagraphs('§ 1 A\n§ 2 B\n§ 3 C')).toBe(3);
  });
  it('liefert 0 ohne §', () => {
    expect(countParagraphs('kein Paragraph hier')).toBe(0);
  });
});

describe('renderGeneratedModule', () => {
  const legal: LegalDoc[] = [
    { slug: 'agb', title: 'AGB', markdown: makeAgbMarkdown(25) },
    { slug: 'widerruf', title: 'Widerrufsbelehrung', markdown: '# Widerruf\n\nText.' },
  ];

  it('erzeugt gültiges TS mit allen 24 Vertragsparagraphen in korrekter Nummerierung', () => {
    const out = renderGeneratedModule(makeParagraphs(24), legal, '2026-07-27T00:00:00.000Z');
    // Jede §-Nummer 1..24 muss als Titel vorkommen.
    for (let i = 1; i <= 24; i++) {
      expect(out).toContain(`§ ${i} Titel ${i}`);
    }
    // Exakt 24 Vertragsparagraph-Objekte (deren Titel mit "§ " beginnen).
    const paragraphObjCount = (out.match(/title: '§ /g) || []).length;
    expect(paragraphObjCount).toBe(24);
    expect(out).toContain('export const CONTRACT_PARAGRAPHS_FALLBACK');
    expect(out).toContain('NICHT VON HAND EDITIEREN');
    expect(out).toContain('2026-07-27T00:00:00.000Z');
  });

  it('escaped Anführungszeichen, Backslashes und Zeilenumbrüche sicher', () => {
    const out = renderGeneratedModule(makeParagraphs(24), legal, '2026-07-27T00:00:00.000Z');
    // Keine rohen Zeilenumbrüche innerhalb der String-Literale (alle als \n).
    expect(out).toContain("\\'Anführungszeichen\\'");
    expect(out).toContain('\\\\ Backslash');
    expect(out).not.toContain('Absatz von Paragraph 1.\n(2)'); // roher \n wäre ungültig
  });

  it('nimmt die AGB (25 §§) als Markdown-Fallback mit auf', () => {
    const out = renderGeneratedModule(makeParagraphs(24), legal, '2026-07-27T00:00:00.000Z');
    expect(out).toContain("'agb': { title: 'AGB'");
    expect(out).toContain('LEGAL_FALLBACKS');
  });
});
