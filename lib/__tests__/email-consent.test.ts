import { describe, it, expect } from 'vitest';
import { renderEarlyServiceConsentBlock } from '@/lib/email-consent';

describe('renderEarlyServiceConsentBlock — § 356 Abs. 4 BGB', () => {
  it('zeigt Datum/Uhrzeit (Berliner Zeit) UND IP, wenn Zustimmung erteilt wurde', () => {
    const html = renderEarlyServiceConsentBlock('2026-07-27T09:30:00.000Z', '203.0.113.42');
    expect(html).toContain('§ 356 Abs. 4 BGB');
    expect(html).toContain('IP-Adresse 203.0.113.42');
    // 09:30 UTC → 11:30 MESZ (Berlin, Sommerzeit).
    expect(html).toMatch(/erteilt am 27\.07\.2026, 11:30 Uhr/);
    expect(html).toContain('Widerrufsrecht erlischt');
  });

  it('lässt den Block KOMPLETT weg (leerer String), wenn keine Zustimmung erteilt wurde', () => {
    expect(renderEarlyServiceConsentBlock(null, null)).toBe('');
    expect(renderEarlyServiceConsentBlock(undefined, undefined)).toBe('');
    expect(renderEarlyServiceConsentBlock('', '203.0.113.42')).toBe('');
  });

  it('zeigt den Satz ohne IP-Fragment, wenn nur der Zeitstempel vorliegt', () => {
    const html = renderEarlyServiceConsentBlock('2026-07-27T09:30:00.000Z', null);
    expect(html).toContain('§ 356 Abs. 4 BGB');
    expect(html).not.toContain('IP-Adresse');
  });

  it('escaped eine manipulierte IP (kein HTML-Durchschlag)', () => {
    const html = renderEarlyServiceConsentBlock('2026-07-27T09:30:00.000Z', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
