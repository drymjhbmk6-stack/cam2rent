import { describe, it, expect } from 'vitest';
import {
  entscheideAutoVersand,
  findeEskalationsBegriffe,
  istWahrscheinlichAutoNachricht,
} from '@/lib/ai/auto-reply-gates';
import {
  DEFAULT_AI_REPLY_CONFIG,
  normalizeAiReplyConfig,
  NIEMALS_AUTOMATISCH,
  type AiReplyConfig,
} from '@/lib/ai/auto-reply-config';

const cfg = (over: Partial<AiReplyConfig> = {}): AiReplyConfig => ({
  ...DEFAULT_AI_REPLY_CONFIG,
  ...over,
});

/** Standardfall: harmlose Preisfrage, hohe Sicherheit → darf automatisch raus. */
const basis = {
  config: cfg(),
  kanal: 'email' as const,
  kategorie: 'preise_verfuegbarkeit' as const,
  confidence: 0.95,
  brauchtMensch: false,
  kundenText: 'Was kostet die GoPro für drei Tage?',
  autoAntwortenImThread: 0,
  autoAntwortenHeute: 0,
};

describe('entscheideAutoVersand — der Normalfall', () => {
  it('sendet eine sichere Standardfrage automatisch', () => {
    const r = entscheideAutoVersand(basis);
    expect(r.auto).toBe(true);
    expect(r.eskalation).toEqual([]);
  });
});

describe('entscheideAutoVersand — harte Sperren', () => {
  it('sendet im Entwurfs-Modus nie automatisch', () => {
    const r = entscheideAutoVersand({ ...basis, config: cfg({ mode: 'draft_only' }) });
    expect(r.auto).toBe(false);
  });

  it.each(NIEMALS_AUTOMATISCH)('sperrt die Kategorie %s auch bei voller Sicherheit', (kat) => {
    const r = entscheideAutoVersand({
      ...basis,
      kategorie: kat,
      confidence: 1,
      // selbst wenn jemand die Kategorie in die Whitelist schmuggelt:
      config: cfg({ auto_categories: [kat] }),
    });
    expect(r.auto).toBe(false);
  });

  it('sperrt eine Kategorie, die nicht freigegeben ist', () => {
    const r = entscheideAutoVersand({
      ...basis,
      config: cfg({ auto_categories: ['versand_abholung'] }),
    });
    expect(r.auto).toBe(false);
  });

  it('respektiert die Selbsteinschätzung der KI', () => {
    expect(entscheideAutoVersand({ ...basis, brauchtMensch: true }).auto).toBe(false);
  });

  it('sendet unterhalb der Mindest-Sicherheit nicht', () => {
    expect(entscheideAutoVersand({ ...basis, confidence: 0.79 }).auto).toBe(false);
    expect(entscheideAutoVersand({ ...basis, confidence: 0.8 }).auto).toBe(true);
  });

  it('behandelt eine unbrauchbare Confidence wie zu niedrig', () => {
    expect(entscheideAutoVersand({ ...basis, confidence: Number.NaN }).auto).toBe(false);
  });

  it('respektiert abgeschaltete Kanäle', () => {
    expect(
      entscheideAutoVersand({ ...basis, config: cfg({ channels: { email: false, account: true } }) }).auto,
    ).toBe(false);
    expect(
      entscheideAutoVersand({
        ...basis,
        kanal: 'account',
        config: cfg({ channels: { email: true, account: false } }),
      }).auto,
    ).toBe(false);
  });
});

describe('entscheideAutoVersand — Eskalation über Stichwörter', () => {
  it.each([
    ['Die Kamera ist runtergefallen und jetzt kaputt.', 'Schaden'],
    ['Ich möchte meine Buchung stornieren.', 'Storno'],
    ['Bitte um Rückerstattung des Betrags.', 'Geld'],
    ['Mein Anwalt meldet sich.', 'Recht'],
    ['Ich bin sehr unzufrieden mit dem Service.', 'Beschwerde'],
    ['Kann ich mit einem Mitarbeiter sprechen?', 'Mensch gewünscht'],
    ['Das Paket ist nicht angekommen.', 'Logistik'],
  ])('hält %s zurück (%s)', (text) => {
    const r = entscheideAutoVersand({ ...basis, kundenText: text });
    expect(r.auto).toBe(false);
    expect(r.eskalation.length).toBeGreaterThan(0);
  });

  it('greift auch bei abweichender Groß-/Kleinschreibung', () => {
    expect(findeEskalationsBegriffe('KAPUTT!').length).toBeGreaterThan(0);
  });

  it('meldet bei einer harmlosen Frage keine Eskalation', () => {
    expect(findeEskalationsBegriffe('Habt ihr die Insta360 nächste Woche frei?')).toEqual([]);
  });
});

describe('entscheideAutoVersand — Schleifen- und Mengenschutz', () => {
  it('antwortet nicht endlos im selben Thread', () => {
    const r = entscheideAutoVersand({
      ...basis,
      autoAntwortenImThread: DEFAULT_AI_REPLY_CONFIG.max_auto_replies_per_thread,
    });
    expect(r.auto).toBe(false);
  });

  it('hält das Tageslimit ein', () => {
    const r = entscheideAutoVersand({
      ...basis,
      autoAntwortenHeute: DEFAULT_AI_REPLY_CONFIG.max_auto_replies_per_day,
    });
    expect(r.auto).toBe(false);
  });

  it('sendet bei einem Limit von 0 nie automatisch', () => {
    const r = entscheideAutoVersand({ ...basis, config: cfg({ max_auto_replies_per_thread: 0 }) });
    expect(r.auto).toBe(false);
  });
});

describe('istWahrscheinlichAutoNachricht', () => {
  it.each([
    'Automatische Antwort: Ich bin im Urlaub',
    'Out of office until Monday',
    'Abwesenheitsnotiz',
    'Diese E-Mail wurde automatisch erzeugt.',
  ])('erkennt "%s" als Roboter-Nachricht', (text) => {
    expect(istWahrscheinlichAutoNachricht(text)).toBe(true);
  });

  it('erkennt den Marker auch im Betreff', () => {
    expect(istWahrscheinlichAutoNachricht('Bin ab Montag zurück', 'Automatische Antwort')).toBe(true);
  });

  it('hält eine echte Kundenmail nicht für einen Roboter', () => {
    expect(istWahrscheinlichAutoNachricht('Hallo, ist die X5 am Wochenende frei?')).toBe(false);
  });
});

describe('normalizeAiReplyConfig', () => {
  it('nimmt gesperrte Kategorien aus der Whitelist heraus', () => {
    const c = normalizeAiReplyConfig({ auto_categories: ['schaden_reklamation', 'produkt_technik'] });
    expect(c.auto_categories).toEqual(['produkt_technik']);
  });

  it('erlaubt keine fahrlässig niedrige Mindest-Sicherheit', () => {
    expect(normalizeAiReplyConfig({ confidence_min: 0.1 }).confidence_min).toBe(0.5);
    expect(normalizeAiReplyConfig({ confidence_min: 5 }).confidence_min).toBe(1);
  });

  it('fällt bei Unsinn auf die Vorgaben zurück', () => {
    expect(normalizeAiReplyConfig(null)).toEqual(DEFAULT_AI_REPLY_CONFIG);
    expect(normalizeAiReplyConfig('kaputt')).toEqual(DEFAULT_AI_REPLY_CONFIG);
  });

  it('kennt nur die zwei erlaubten Betriebsarten', () => {
    expect(normalizeAiReplyConfig({ mode: 'voll_automatisch' }).mode).toBe('hybrid');
    expect(normalizeAiReplyConfig({ mode: 'draft_only' }).mode).toBe('draft_only');
  });

  it('deckelt die Mengenbegrenzungen', () => {
    expect(normalizeAiReplyConfig({ max_auto_replies_per_thread: 999 }).max_auto_replies_per_thread).toBe(10);
    expect(normalizeAiReplyConfig({ max_auto_replies_per_day: -5 }).max_auto_replies_per_day).toBe(0);
  });
});
