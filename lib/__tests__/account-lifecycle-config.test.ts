import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCOUNT_LIFECYCLE_CONFIG,
  normalizeAccountLifecycleConfig,
} from '@/lib/account-lifecycle-config';

/**
 * Konto-Lebenszyklus-Fristen (AGB § 19 Abs. 3 / Datenschutz Ziffer 6/15):
 * unverifizierte Konten ~30 Tage nach Registrierung, inaktive nach 24 Monaten,
 * Vorwarnung in beiden Fällen mindestens 30 Tage vorher.
 */
describe('Konto-Lebenszyklus — Default-Fristen entsprechen den Zusagen', () => {
  it('24 Monate Inaktivität, 30 Tage Vorwarnungen', () => {
    expect(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG.inactive_warn_after_days).toBe(730); // 24 Monate
    expect(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG.inactive_grace_days).toBe(30);
    expect(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG.unverified_grace_hours).toBe(720); // 30 Tage
    expect(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG.unverified_warn_after_days).toBe(30);
  });
});

describe('normalizeAccountLifecycleConfig — erzwingt ≥ 30 Tage Vorwarnung', () => {
  it('leere Config → Defaults', () => {
    expect(normalizeAccountLifecycleConfig(null)).toEqual(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG);
    expect(normalizeAccountLifecycleConfig({})).toEqual(DEFAULT_ACCOUNT_LIFECYCLE_CONFIG);
  });

  it('zu kurze Vorwarnfristen werden auf 30 Tage angehoben', () => {
    const c = normalizeAccountLifecycleConfig({
      unverified_grace_hours: 48, // < 30 Tage
      inactive_grace_days: 14, // < 30 Tage
    });
    expect(c.unverified_grace_hours).toBe(720); // 30 Tage
    expect(c.inactive_grace_days).toBe(30);
  });

  it('längere Vorwarnfristen bleiben erhalten', () => {
    const c = normalizeAccountLifecycleConfig({
      unverified_grace_hours: 1440, // 60 Tage
      inactive_grace_days: 60,
    });
    expect(c.unverified_grace_hours).toBe(1440);
    expect(c.inactive_grace_days).toBe(60);
  });

  it('unplausible/negative Werte fallen auf die Defaults zurück', () => {
    const c = normalizeAccountLifecycleConfig({
      inactive_warn_after_days: -5,
      inactive_grace_days: 0,
    });
    expect(c.inactive_warn_after_days).toBe(730);
    expect(c.inactive_grace_days).toBe(30);
  });
});
