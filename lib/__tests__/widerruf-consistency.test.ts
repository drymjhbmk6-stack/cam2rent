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
