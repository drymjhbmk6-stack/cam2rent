import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@/lib/contracts/pdf-hash';

describe('sha256Hex — Integritätsnachweis der Vertrags-PDF-Bytes', () => {
  it('deterministisch für identische Bytes (byte-identisches Original)', () => {
    const a = Buffer.from('PDF-BYTES-ORIGINAL');
    const b = Buffer.from('PDF-BYTES-ORIGINAL');
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it('erkennt jede Byte-Abweichung (Manipulation im Storage)', () => {
    const original = Buffer.from('PDF-BYTES-ORIGINAL');
    const tampered = Buffer.from('PDF-BYTES-ORIGINAX');
    expect(sha256Hex(original)).not.toBe(sha256Hex(tampered));
  });

  it('liefert einen 64-stelligen Hex-String', () => {
    expect(sha256Hex(Buffer.from('x'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Uint8Array und Buffer mit gleichem Inhalt sind gleich', () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    const u8 = new Uint8Array([1, 2, 3, 4]);
    expect(sha256Hex(buf)).toBe(sha256Hex(u8));
  });
});
