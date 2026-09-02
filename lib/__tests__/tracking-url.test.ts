import { describe, it, expect } from 'vitest';
import { ALLOWED_CARRIERS, buildTrackingUrl, isAllowedCarrier } from '../tracking-url';

describe('isAllowedCarrier', () => {
  it('akzeptiert die drei genutzten Carrier', () => {
    expect(isAllowedCarrier('DHL')).toBe(true);
    expect(isAllowedCarrier('DHL Express')).toBe(true);
    expect(isAllowedCarrier('DPD')).toBe(true);
  });
  it('lehnt alles andere ab', () => {
    for (const v of ['UPS', 'dhl', 'DHL-Express', '', null, undefined, 42, {}]) {
      expect(isAllowedCarrier(v)).toBe(false);
    }
  });
  it('ALLOWED_CARRIERS enthaelt genau die erlaubten Werte', () => {
    expect([...ALLOWED_CARRIERS]).toEqual(['DHL', 'DHL Express', 'DPD']);
  });
});

describe('buildTrackingUrl', () => {
  it('DHL Paket nutzt das Privatkunden-Portal', () => {
    expect(buildTrackingUrl('DHL', '00340434695396135322')).toBe(
      'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434695396135322',
    );
  });

  it('DHL Express nutzt das Express-Portal (Paket-Portal kennt die Nummer nicht)', () => {
    const url = buildTrackingUrl('DHL Express', 'JD014600012806500816');
    expect(url).toContain('tracking-express.html');
    expect(url).toContain('tracking-id=JD014600012806500816');
    expect(url).not.toContain('piececode');
  });

  it('DPD nutzt das DPD-Portal', () => {
    expect(buildTrackingUrl('DPD', '01234567890123')).toContain('parcelId=01234567890123');
  });

  it('trimmt die Nummer', () => {
    expect(buildTrackingUrl('DHL', '  123  ')).toContain('piececode=123');
    expect(buildTrackingUrl('DHL Express', ' JD1 ')).toContain('tracking-id=JD1');
  });

  it('faellt bei unbekanntem Carrier auf DHL Paket zurueck', () => {
    expect(buildTrackingUrl('', '123')).toContain('piececode=123');
    expect(buildTrackingUrl('UPS', '123')).toContain('piececode=123');
  });

  it('kodiert Sonderzeichen, statt die URL zu zerreissen', () => {
    expect(buildTrackingUrl('DHL', 'A&B=1')).toContain('piececode=A%26B%3D1');
  });
});
