import { describe, it, expect, afterEach } from 'vitest';
import { getCompanyTaxNumber } from '@/lib/company-tax';

const ORIG = process.env.COMPANY_TAX_NUMBER;
afterEach(() => {
  if (ORIG === undefined) delete process.env.COMPANY_TAX_NUMBER;
  else process.env.COMPANY_TAX_NUMBER = ORIG;
});

describe('getCompanyTaxNumber — § 14 Abs. 4 Nr. 2 UStG', () => {
  it('liefert die getrimmte Steuernummer aus der Umgebung', () => {
    process.env.COMPANY_TAX_NUMBER = '  12/345/67890  ';
    expect(getCompanyTaxNumber()).toBe('12/345/67890');
  });

  it('bricht ab (wirft), wenn die Variable fehlt', () => {
    delete process.env.COMPANY_TAX_NUMBER;
    expect(() => getCompanyTaxNumber()).toThrow(/COMPANY_TAX_NUMBER/);
  });

  it('bricht ab, wenn die Variable leer/whitespace ist', () => {
    process.env.COMPANY_TAX_NUMBER = '   ';
    expect(() => getCompanyTaxNumber()).toThrow(/§ 14/);
  });
});
