import { describe, it, expect } from 'vitest';
import {
  normalizeBelegInboxConfig,
  isBelegRecipient,
  type BelegInboxConfig,
} from '../inbound-beleg-config';

describe('normalizeBelegInboxConfig', () => {
  it('gibt Default zurueck bei null/undefined', () => {
    expect(normalizeBelegInboxConfig(null)).toEqual({ address: '', enabled: false });
    expect(normalizeBelegInboxConfig(undefined)).toEqual({ address: '', enabled: false });
  });

  it('parst JSON-String', () => {
    const r = normalizeBelegInboxConfig('{"address":"BELEGE@cam2rent.de","enabled":true}');
    expect(r).toEqual({ address: 'belege@cam2rent.de', enabled: true });
  });

  it('lowercased + trimmt die Adresse', () => {
    const r = normalizeBelegInboxConfig({ address: '  Belege@Cam2Rent.DE ', enabled: true });
    expect(r.address).toBe('belege@cam2rent.de');
    expect(r.enabled).toBe(true);
  });

  it('deaktiviert bei Adresse ohne @ (auch wenn enabled=true)', () => {
    const r = normalizeBelegInboxConfig({ address: 'kaputt', enabled: true });
    expect(r.enabled).toBe(false);
  });

  it('deaktiviert bei leerer Adresse', () => {
    const r = normalizeBelegInboxConfig({ address: '', enabled: true });
    expect(r.enabled).toBe(false);
  });

  it('respektiert enabled=false trotz gueltiger Adresse', () => {
    const r = normalizeBelegInboxConfig({ address: 'belege@cam2rent.de', enabled: false });
    expect(r.enabled).toBe(false);
    expect(r.address).toBe('belege@cam2rent.de');
  });

  it('ungueltiger JSON-String -> Default', () => {
    expect(normalizeBelegInboxConfig('{kaputt')).toEqual({ address: '', enabled: false });
  });
});

describe('isBelegRecipient', () => {
  const active: BelegInboxConfig = { address: 'belege@cam2rent.de', enabled: true };

  it('matcht die konfigurierte Adresse (case-insensitive)', () => {
    expect(isBelegRecipient(['belege@cam2rent.de'], active)).toBe(true);
    expect(isBelegRecipient(['BELEGE@CAM2RENT.DE'], active)).toBe(true);
  });

  it('matcht wenn die Adresse in einer Empfaengerliste steht', () => {
    expect(isBelegRecipient(['kunde@x.de', 'belege@cam2rent.de'], active)).toBe(true);
  });

  it('matcht NICHT bei anderer Adresse', () => {
    expect(isBelegRecipient(['kontakt@cam2rent.de'], active)).toBe(false);
  });

  it('matcht nie wenn deaktiviert', () => {
    const off: BelegInboxConfig = { address: 'belege@cam2rent.de', enabled: false };
    expect(isBelegRecipient(['belege@cam2rent.de'], off)).toBe(false);
  });

  it('matcht nie bei leerer Empfaengerliste', () => {
    expect(isBelegRecipient([], active)).toBe(false);
  });
});
