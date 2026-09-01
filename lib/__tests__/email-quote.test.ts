import { describe, it, expect } from 'vitest';
import { splitQuotedReply, stripQuoteMarkers, previewFromBody } from '../email-quote';

describe('splitQuotedReply', () => {
  it('gibt reinen Text unveraendert zurueck', () => {
    const r = splitQuotedReply('Hallo,\n\nhabt ihr die GoPro noch frei?\n\nGruß Anna');
    expect(r.quoted).toBe('');
    expect(r.reply).toContain('habt ihr die GoPro noch frei?');
  });

  it('trennt an der deutschen Einleitungszeile', () => {
    const body = [
      'Super, danke dir!',
      '',
      'Am 26.08.2026 um 15:57 schrieb cam2rent <buchung@cam2rent.de>:',
      '',
      '> Hallo Patricia,',
      '> hier die Preise.',
    ].join('\n');
    const r = splitQuotedReply(body);
    expect(r.reply).toBe('Super, danke dir!');
    expect(r.quoted).toContain('hier die Preise.');
    // Zitat-Praefixe sind fuer die Anzeige entfernt (die Einleitungszeile bleibt).
    expect(r.quoted).not.toMatch(/^>/m);
  });

  it('trennt an der italienischen Einleitungszeile (Screenshot-Fall)', () => {
    const body = [
      'Va bene, grazie!',
      '',
      'Il giorno mer 26 ago 2026 alle ore 15:57 cam2rent',
      '<buchung@cam2rent.de> ha scritto:',
      '',
      '> Cam2Rent',
      '> clever mieten statt kaufen',
    ].join('\n');
    const r = splitQuotedReply(body);
    expect(r.reply).toBe('Va bene, grazie!');
    expect(r.quoted).toContain('clever mieten statt kaufen');
  });

  it('trennt an der englischen Einleitungszeile', () => {
    const r = splitQuotedReply('Thanks!\n\nOn Tue, 26 Aug 2026 at 15:57, cam2rent wrote:\n> hello');
    expect(r.reply).toBe('Thanks!');
    expect(r.quoted).toContain('hello');
  });

  it('trennt an "-----Ursprüngliche Nachricht-----"', () => {
    const r = splitQuotedReply('Passt so.\n\n-----Ursprüngliche Nachricht-----\nVon: cam2rent\nAlter Text');
    expect(r.reply).toBe('Passt so.');
    expect(r.quoted).toContain('Alter Text');
  });

  it('trennt am Outlook-Kopfblock', () => {
    const body = 'Danke.\n\nVon: cam2rent <kontakt@cam2rent.de>\nGesendet: Montag, 1. September 2026\nAn: Kunde\nBetreff: Re: Anfrage\n\nAlter Inhalt';
    const r = splitQuotedReply(body);
    expect(r.reply).toBe('Danke.');
    expect(r.quoted).toContain('Alter Inhalt');
  });

  it('trennt an einem reinen Zitatblock ohne Einleitung', () => {
    const r = splitQuotedReply('Ja gerne.\n\n> Möchtest du verlängern?\n> Sag kurz Bescheid.');
    expect(r.reply).toBe('Ja gerne.');
    expect(r.quoted).toContain('Möchtest du verlängern?');
  });

  it('zeigt alles, wenn der neue Teil leer waere (reine Weiterleitung)', () => {
    const body = '\n\nAm 26.08.2026 um 15:57 schrieb cam2rent:\n> Hallo';
    const r = splitQuotedReply(body);
    expect(r.quoted).toBe('');
    expect(r.reply).toContain('Hallo');
  });

  it('haelt eine einzelne Zitatzeile mitten im Text nicht faelschlich fuer den Verlauf', () => {
    const body = '> Wie lange dauert der Versand?\n\nDas ist meine Frage, könnt ihr das beantworten? Wir brauchen die Kameras dringend für ein Projekt.\n\nDanke!';
    const r = splitQuotedReply(body);
    // Nur 1 von 3 Nicht-Leerzeilen ist zitiert → kein Abschneiden.
    expect(r.quoted).toBe('');
    expect(r.reply).toContain('Das ist meine Frage');
  });

  it('kommt mit leerem Body klar', () => {
    expect(splitQuotedReply('').reply).toBe('');
    expect(splitQuotedReply('').quoted).toBe('');
  });

  it('normalisiert CRLF', () => {
    const r = splitQuotedReply('Hi\r\n\r\nAm 01.09.2026 um 10:00 schrieb X:\r\n> alt');
    expect(r.reply).toBe('Hi');
    expect(r.quoted).toContain('alt');
  });
});

describe('stripQuoteMarkers', () => {
  it('entfernt einfache und verschachtelte Praefixe', () => {
    expect(stripQuoteMarkers('> a\n>> b\n>>> c')).toBe('a\nb\nc');
  });
  it('laesst normalen Text in Ruhe', () => {
    expect(stripQuoteMarkers('kein Zitat')).toBe('kein Zitat');
  });
});

describe('previewFromBody', () => {
  it('nimmt nur den neuen Teil und macht ihn einzeilig', () => {
    const p = previewFromBody('Hallo,\n\nist die X5 frei?\n\nAm 26.08.2026 um 15:57 schrieb cam2rent:\n> alter Kram');
    expect(p).toBe('Hallo, ist die X5 frei?');
  });
  it('kappt auf maxLen', () => {
    expect(previewFromBody('a'.repeat(300), 20)).toHaveLength(20);
  });
});
