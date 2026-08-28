/**
 * Sicherheits-Gates der KI-Auto-Beantwortung — reine Funktionen, damit sie
 * unit-testbar sind (lib/ai/__tests__/auto-reply-gates.test.ts).
 *
 * Grundhaltung: Im Zweifel NICHT automatisch senden. Ein Entwurf, den der
 * Admin freigibt, kostet ein paar Sekunden. Eine falsche automatische Auskunft
 * kann vertraglich binden, Geld kosten oder einen Kunden verlieren.
 *
 * Die Gates sind bewusst mehrschichtig und unabhaengig voneinander:
 *   1. Feature/Kanal aus der Config
 *   2. Kategorie (harte Sperrliste, die keine Config uebersteuern kann)
 *   3. Selbsteinschaetzung der KI (Confidence + eigenes "brauche einen Menschen")
 *   4. Schluesselwoerter im Kundentext (unabhaengig von der KI-Einschaetzung)
 *   5. Schleifen-/Mengenschutz (pro Thread und pro Tag)
 */

import {
  NIEMALS_AUTOMATISCH,
  type AiReplyConfig,
  type AnfrageKategorie,
} from '@/lib/ai/auto-reply-config';

/**
 * Begriffe, die eine Anfrage IMMER zum Menschen schicken — egal wie sicher
 * sich die KI ist und in welche Kategorie sie einsortiert hat.
 *
 * Vier Gruppen: Geld, Schaden, Recht/Eskalation, ausdruecklicher Wunsch nach
 * einem Menschen. Lieber ein Fehlalarm zu viel (= Entwurf statt Auto) als
 * eine automatische Antwort auf einen Schadensfall.
 */
export const ESKALATIONS_BEGRIFFE: string[] = [
  // Geld / Vertrag
  'rückerstattung', 'rueckerstattung', 'geld zurück', 'geld zurueck', 'erstatten',
  'gutschrift', 'rechnung stimmt', 'falsche rechnung', 'doppelt abgebucht',
  'abbuchung', 'lastschrift', 'mahnung', 'inkasso', 'zahlungsaufforderung',
  'storno', 'stornier', 'kündig', 'kuendig', 'widerruf', 'rücktritt', 'ruecktritt',
  'umbuchen', 'umbuchung', 'verlegen', 'verschieben', 'kaution zurück', 'kaution zurueck',
  'preisnachlass', 'rabatt geben', 'kulanz',
  // Schaden / Verlust
  'schaden', 'beschädigt', 'beschaedigt', 'kaputt', 'defekt', 'funktioniert nicht',
  'geht nicht mehr', 'gestohlen', 'diebstahl', 'verloren', 'unfall', 'sturz',
  'wasserschaden', 'reklamation', 'mangel',
  // Recht / Eskalation
  'anwalt', 'rechtsanwalt', 'klage', 'gericht', 'rechtliche schritte', 'frist setze',
  'letzte mahnung', 'betrug', 'polizei', 'anzeige', 'verbraucherzentrale',
  'dsgvo', 'datenschutz', 'auskunft nach art', 'löschung meiner daten', 'loeschung meiner daten',
  // Unzufriedenheit
  'beschwerde', 'beschweren', 'unzufrieden', 'enttäuscht', 'enttaeuscht',
  'inakzeptabel', 'unverschämt', 'unverschaemt', 'schlechte erfahrung',
  // Wunsch nach einem Menschen
  'echten menschen', 'echte person', 'mit einem mitarbeiter', 'mitarbeiter sprechen',
  'rückruf', 'rueckruf', 'zurückrufen', 'zurueckrufen', 'telefonisch',
  // Paket-Probleme (immer individuell)
  'nicht angekommen', 'nicht erhalten', 'paket weg', 'sendung weg', 'verspätet', 'verspaetet',
];

/** Normalisiert Text fuer den Keyword-Abgleich (Umlaute bleiben, Case egal). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

/** Liefert alle Eskalations-Begriffe, die im Text vorkommen. */
export function findeEskalationsBegriffe(text: string): string[] {
  const hay = normalize(text);
  return ESKALATIONS_BEGRIFFE.filter((b) => hay.includes(b));
}

export interface GateInput {
  config: AiReplyConfig;
  kanal: 'email' | 'account';
  kategorie: AnfrageKategorie;
  /** Selbsteinschaetzung der KI, 0..1. */
  confidence: number;
  /** KI sagt selbst: das gehoert zu einem Menschen. */
  brauchtMensch: boolean;
  /** Originaltext der Kundenanfrage (fuer den Keyword-Abgleich). */
  kundenText: string;
  /** Wie oft in DIESEM Thread schon automatisch geantwortet wurde. */
  autoAntwortenImThread: number;
  /** Wie oft heute insgesamt schon automatisch geantwortet wurde. */
  autoAntwortenHeute: number;
}

export interface GateErgebnis {
  /** true = darf automatisch versendet werden. */
  auto: boolean;
  /** Kurzer deutscher Grund (wird im Entwurf-Meta gespeichert + im Admin gezeigt). */
  grund: string;
  /** Gefundene Eskalations-Begriffe (fuer die Anzeige im Admin). */
  eskalation: string[];
}

/**
 * Entscheidet, ob die generierte Antwort automatisch rausgeht oder als
 * Entwurf auf die Freigabe wartet. Reihenfolge = Prioritaet der Begruendung.
 */
export function entscheideAutoVersand(input: GateInput): GateErgebnis {
  const eskalation = findeEskalationsBegriffe(input.kundenText);
  const c = input.config;

  if (c.mode === 'draft_only') {
    return { auto: false, grund: 'Automatischer Versand ist ausgeschaltet (nur Entwürfe).', eskalation };
  }
  if (input.kanal === 'email' && !c.channels.email) {
    return { auto: false, grund: 'Automatischer Versand ist für E-Mails ausgeschaltet.', eskalation };
  }
  if (input.kanal === 'account' && !c.channels.account) {
    return { auto: false, grund: 'Automatischer Versand ist für Konto-Nachrichten ausgeschaltet.', eskalation };
  }
  if ((NIEMALS_AUTOMATISCH as string[]).includes(input.kategorie)) {
    return { auto: false, grund: 'Thema wird grundsätzlich persönlich beantwortet.', eskalation };
  }
  if (!c.auto_categories.includes(input.kategorie)) {
    return { auto: false, grund: 'Diese Art von Anfrage ist nicht für den automatischen Versand freigegeben.', eskalation };
  }
  if (input.brauchtMensch) {
    return { auto: false, grund: 'Die KI hält eine persönliche Antwort für nötig.', eskalation };
  }
  if (eskalation.length > 0) {
    return {
      auto: false,
      grund: `Heikles Stichwort in der Anfrage: „${eskalation.slice(0, 3).join('“, „')}“.`,
      eskalation,
    };
  }
  if (!Number.isFinite(input.confidence) || input.confidence < c.confidence_min) {
    return {
      auto: false,
      grund: `Die KI ist sich nicht sicher genug (${Math.round((input.confidence || 0) * 100)} % statt ${Math.round(c.confidence_min * 100)} %).`,
      eskalation,
    };
  }
  if (input.autoAntwortenImThread >= c.max_auto_replies_per_thread) {
    return {
      auto: false,
      grund: 'In dieser Konversation wurde bereits automatisch geantwortet.',
      eskalation,
    };
  }
  if (input.autoAntwortenHeute >= c.max_auto_replies_per_day) {
    return { auto: false, grund: 'Tageslimit für automatische Antworten erreicht.', eskalation };
  }

  return { auto: true, grund: 'Standardfrage, sicher beantwortbar.', eskalation };
}

/**
 * Erkennt Nachrichten, auf die NIE geantwortet werden darf, weil sonst eine
 * Endlosschleife mit einem Auto-Responder der Gegenseite entsteht.
 *
 * Der IMAP-Cron filtert Auto-Mails bereits vor dem Speichern heraus
 * (isAutomatedEmail) — das hier ist die zweite Verteidigungslinie fuer Texte,
 * die es trotzdem in einen Thread geschafft haben.
 */
export function istWahrscheinlichAutoNachricht(text: string, subject = ''): boolean {
  const hay = normalize(`${subject} ${text}`);
  const marker = [
    'automatische antwort', 'automatic reply', 'auto-reply', 'autoreply',
    'abwesenheitsnotiz', 'out of office', 'nicht im büro', 'nicht im buero',
    'diese e-mail wurde automatisch', 'do not reply', 'nicht auf diese e-mail antworten',
    'delivery status notification', 'mail delivery',
  ];
  return marker.some((m) => hay.includes(m));
}
