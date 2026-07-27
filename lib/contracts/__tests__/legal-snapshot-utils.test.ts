import { describe, it, expect } from 'vitest';
import {
  computeLiabilityMaxAmount,
  formatLegalVersions,
} from '@/lib/contracts/legal-snapshot-utils';

describe('computeLiabilityMaxAmount — Höchstbetrag der Ersatzpflicht (§ 8 Abs. 2 b)', () => {
  it('Premium → 0 EUR', () => {
    expect(computeLiabilityMaxAmount('Premium-Haftungsschutz', 200)).toBe(0);
  });

  it('Basis → kategorie-spezifischer Betrag (nicht pauschal 200)', () => {
    expect(computeLiabilityMaxAmount('Basis-Haftungsschutz', 200)).toBe(200); // Action-Cam
    expect(computeLiabilityMaxAmount('Basis-Haftungsschutz', 300)).toBe(300); // 360°/Vlog
  });

  it('Ohne Haftungsschutz → null (Wiederbeschaffungswert laut Tabelle)', () => {
    expect(computeLiabilityMaxAmount('Ohne Haftungsschutz', 200)).toBeNull();
  });
});

describe('formatLegalVersions — Ausweis der einbezogenen Fassungen (§ 1 Abs. 4/5)', () => {
  it('numerische Versionen als vN, alle vier Dokumente', () => {
    expect(
      formatLegalVersions({
        termsVersion: '9',
        liabilityTermsVersion: '9',
        withdrawalVersion: '7',
        privacyVersion: '6',
      }),
    ).toBe('AGB v9 · Haftungsbedingungen v9 · Widerruf v7 · Datenschutz v6');
  });

  it('Sentinel-Werte (Altbestand) unverändert, ohne v-Präfix', () => {
    expect(formatLegalVersions({ termsVersion: 'unbekannt (Altbestand)' })).toBe(
      'AGB unbekannt (Altbestand)',
    );
  });

  it('null wenn keine Fassung hinterlegt', () => {
    expect(formatLegalVersions({})).toBeNull();
  });

  it('lässt fehlende Einzeldokumente aus', () => {
    expect(formatLegalVersions({ termsVersion: '9', privacyVersion: '6' })).toBe(
      'AGB v9 · Datenschutz v6',
    );
  });
});
