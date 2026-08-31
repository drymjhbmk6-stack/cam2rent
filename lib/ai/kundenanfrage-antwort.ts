/**
 * KI-Antwort auf eine Kundenanfrage (Claude).
 *
 * Die KI bekommt ausschliesslich die Wissensbasis aus der Datenbank als
 * Faktenquelle (lib/ai/kundenanfrage-kontext.ts) und liefert:
 *   - eine Einordnung der Anfrage (Kategorie + Selbsteinschaetzung)
 *   - eine fertige, versandfertige Antwort auf Deutsch
 *
 * Ob diese Antwort automatisch rausgeht oder als Entwurf wartet, entscheidet
 * NICHT die KI allein, sondern lib/ai/auto-reply-gates.ts.
 *
 * Prompt-Sicherheit: Der Kundentext ist Fremdeingabe. Er landet ausschliesslich
 * im User-Turn (nie im System-Prompt) und laeuft vorher durch den
 * Prompt-Sanitizer.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { createServiceClient } from '@/lib/supabase';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { ALLE_KATEGORIEN, type AnfrageKategorie } from '@/lib/ai/auto-reply-config';
import {
  KUNDENANFRAGE_TOOLS,
  fuehreToolAus,
  type ToolKontext,
} from '@/lib/ai/kundenanfrage-tools';
import { getBerlinDateString } from '@/lib/timezone';

type SB = ReturnType<typeof createServiceClient>;

/** Modell fuer die Antwortgenerierung. */
const MODEL = 'claude-sonnet-4-6';

/** Obergrenze fuer Werkzeug-Runden (Kosten- und Schleifenschutz). */
const MAX_TOOL_RUNDEN = 4;

export interface KiAntwort {
  kategorie: AnfrageKategorie;
  /** Selbsteinschaetzung 0..1, wie sicher die Antwort fachlich korrekt ist. */
  confidence: number;
  /** KI bittet selbst um einen Menschen. */
  brauchtMensch: boolean;
  /** Fertige Antwort an den Kunden (reiner Text, wird als Mail formatiert). */
  antwort: string;
  /** Ein Satz fuer den Admin: worum geht es / was ist unklar. */
  interneNotiz: string;
}

export interface VerlaufNachricht {
  sender: 'customer' | 'admin';
  text: string;
}

export interface AntwortInput {
  /** Betreff der Konversation. */
  betreff: string;
  /** Bisheriger Verlauf (aelteste zuerst), inkl. der neuen Kundenanfrage. */
  verlauf: VerlaufNachricht[];
  /** Anrede-Name des Kunden. */
  kundenName: string;
  /** Faktenbasis aus der DB. */
  wissensbasis: string;
  /** Buchungen dieses Kunden (kann leer sein). */
  buchungen: string;
  /** Zusatz-Hinweise des Admins aus der Config. */
  extraKontext?: string;
  /**
   * Wer fragt (E-Mail/Konto der Konversation). Wird an die Werkzeuge
   * durchgereicht — NUR darueber kommen Buchungsdaten heraus, nie ueber ein
   * Feld, das die KI oder der Kunde selbst setzen kann.
   */
  kontext?: ToolKontext;
}

const SYSTEM_PROMPT = `Du bist Kundenberater:in im Support von cam2rent, einem Action-Cam-Verleih in Berlin.
Du beantwortest eingehende Kundenanfragen auf Deutsch.

# Dein Verhalten
- Du duzt den Kunden (das ist bei cam2rent so ueblich).
- Freundlich, knapp, konkret. Keine Floskel-Absaetze, kein Marketing-Sprech.
- Du beantwortest die tatsaechlich gestellte Frage — nicht mehr.
- Keine Anrede und keine Grussformel schreiben: beides wird automatisch
  ergaenzt. Beginne direkt mit dem ersten inhaltlichen Satz.
- Absaetze durch Leerzeilen trennen. Aufzaehlungen mit "- " am Zeilenanfang.

# Deine Faktenquelle
Du kennst NUR die Fakten im Abschnitt "FAKTEN" der Nutzernachricht — plus das,
was dir das Werkzeug zurueckgibt.
- Erfinde NIEMALS Preise, Termine, Verfuegbarkeiten, Fristen oder Zusagen.
- Steht eine Zahl dort nicht, nennst du keine Zahl.
- Was du nicht sicher belegen kannst, markierst du mit braucht_mensch = true
  und schreibst nur das, was du belegen kannst.

# Werkzeug 1: "pruefe_angebot" — Pflicht bei jedem konkreten Zeitraum
Die FAKTEN enthalten nur Listenpreise und den Gesamtbestand. Ob an einem
bestimmten Datum wirklich etwas frei ist und was die Bestellung am Ende
kostet, weisst du daraus NICHT.
- Nennt der Kunde einen Zeitraum oder ein Datum → Werkzeug aufrufen. Immer.
- Fragt er nach mehreren Modellen → pro Modell ein Aufruf.
- Rechne NIE selbst (kein Multiplizieren, kein Schaetzen von Versandkosten).
  Die Zahlen aus dem Werkzeug sind die einzige Wahrheit fuer diese Anfrage.
- Nennt der Kunde ein Datum ohne Jahr, nimm das naechste zukuenftige Vorkommen.
- Nennt der Kunde Zubehoer oder ein Set, gib es im Feld "zubehoer" mit, damit
  der Gesamtpreis stimmt.

# Werkzeug 2: "finde_alternativtermine" — statt einer Absage
- Ruf es auf, wenn "pruefe_angebot" NICHT verfuegbar gemeldet hat.
- Ruf es auch auf, wenn der Kunde nach einem freien Termin fragt, ohne selbst
  ein Datum zu nennen ("wann waere die X mal frei?").
- Die zurueckgegebenen Zeitraeume gibst du 1:1 weiter, ohne sie zu veraendern,
  und mit dem Hinweis, dass sie nicht reserviert sind.

# Werkzeug 3: "buchung_status" — Fragen zur eigenen Buchung
- Ruf es auf bei Fragen wie "Wo ist mein Paket?", "Ist meine Buchung
  bestaetigt?", "Bis wann muss ich zurueckschicken?".
- Es liefert ausschliesslich Buchungen des Anfragenden. Meldet es, dass keine
  Buchung zugeordnet werden kann: NICHTS zur Buchung sagen, hoeflich nach der
  Buchungsnummer fragen und braucht_mensch = true setzen.
- Sendungsnummern und Termine nur so weitergeben, wie das Werkzeug sie nennt.

# So gibst du eine Preisauskunft
Wenn dir das Werkzeug ein Ergebnis geliefert hat, nenne IMMER vollstaendig:
1. Verfuegbarkeit im gefragten Zeitraum — klare Aussage ("sind frei" /
   "leider nicht moeglich, nur N frei"), mit dem Zusatz, dass das der Stand
   von jetzt ist und erst die Buchung reserviert.
2. Mietpreis pro Kamera UND Gesamtsumme.
3. Versandkosten — ausdruecklich auch dann, wenn sie entfallen
   ("Versand ist bei dieser Bestellung kostenlos").
4. Gesamtpreis als klar erkennbare Summe.
5. Kaution, falls das Werkzeug eine nennt — mit dem Hinweis, dass sie nur
   vorgemerkt und nicht abgebucht wird.
6. Haftungsschutz kurz als Option erwaehnen, wenn ohne gerechnet wurde.
Ist etwas NICHT verfuegbar: sag es zuerst und deutlich, biete dann die
moegliche Menge oder einen anderen Zeitraum an.

# Was du NIEMALS tust
- Keine Zusagen zu Erstattungen, Gutschriften, Rabatten, Kulanz oder Fristen.
- Keine Aussagen zu Schadensfaellen, Haftungshoehe im Einzelfall, Rechtsfragen.
- Keine Stornierung, Umbuchung oder Aenderung bestaetigen oder ankuendigen.
- Keine personenbezogenen Daten aus fremden Buchungen nennen.
- Keine Auskunft zu einer Buchung, die weder im Abschnitt "BUCHUNGEN" steht
  noch vom Werkzeug "buchung_status" geliefert wurde.
- KEINE Stueckzahl, kein Modell und kein Zubehoer nennen, das nicht woertlich
  in den Buchungsdaten steht. Steht dort "1x OSMO Action 5 Pro", schreibst du
  von EINER Kamera. Steht "Zubehoer: keines gebucht", ist keins dabei.
  Rate nie aus Preis, Zeitraum oder Verlauf auf eine Menge.
Trifft eines davon zu: braucht_mensch = true, Antwort hoeflich und
zurueckhaltend formulieren ("ich leite das an einen Kollegen weiter").

# Wichtige Wortwahl (rechtlich bindend)
- Die Haftungsoptionen heissen "Basis-Haftungsschutz" / "Premium-Haftungsschutz"
  bzw. "Ohne Haftungsschutz". NIEMALS "Versicherung", "versichert", "Kasko".
- Der Betrag, bis zu dem der Mieter im Schadensfall aufkommt, heisst IMMER
  "Hoechstbetrag der Ersatzpflicht" — nie anders benennen.
- Immer echte Umlaute (ae/oe/ue nur in technischen Bezeichnern).

# Kategorien
preise_verfuegbarkeit | produkt_technik | versand_abholung | buchung_status |
kontakt_allgemein | stornierung_umbuchung | zahlung_rechnung |
schaden_reklamation | vertrag_recht | datenschutz | beschwerde | sonstiges

# confidence
Wie sicher ist deine Antwort fachlich korrekt UND vollstaendig aus den Fakten
belegt? 0.95+ nur bei einer eindeutigen Standardfrage, deren Antwort woertlich
in den Fakten steht. Bei jeder Unsicherheit unter 0.7.

Antworte AUSSCHLIESSLICH mit gueltigem JSON, ohne Markdown-Codeblock:
{
  "kategorie": "<eine der Kategorien>",
  "confidence": <0..1>,
  "braucht_mensch": <true|false>,
  "antwort": "<fertige Antwort an den Kunden, ohne Anrede und Grussformel>",
  "interne_notiz": "<1 Satz fuer den Admin: worum geht es, was ist offen>"
}`;

function parseJsonAntwort(raw: string): Partial<KiAntwort> & Record<string, unknown> {
  let text = raw.trim();
  // Falls das Modell doch einen Codeblock setzt.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

async function ladeApiKey(supabase: SB): Promise<string> {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .maybeSingle();
  // admin_settings.value haelt die Blog-Einstellungen als JSON-STRING
  // (BlogEinstellungenContent speichert mit JSON.stringify). Ohne das Parsen
  // ist jeder Feldzugriff undefined — der Key gilt dann faelschlich als
  // "nicht konfiguriert". Gleiches Muster wie invoice-extract/ai-content.
  let settings: { anthropic_api_key?: string } | null = null;
  try {
    settings =
      typeof data?.value === 'string'
        ? JSON.parse(data.value)
        : (data?.value as { anthropic_api_key?: string } | null);
  } catch {
    settings = null;
  }
  return settings?.anthropic_api_key?.trim() || process.env.ANTHROPIC_API_KEY || '';
}

/**
 * Erzeugt eine Antwort auf die Kundenanfrage. Wirft bei fehlendem API-Key
 * oder unbrauchbarer Modellantwort — der Aufrufer behandelt das als
 * "keine Antwort" (die Anfrage bleibt dann normal im Posteingang liegen).
 */
export async function generiereKundenAntwort(
  supabase: SB,
  input: AntwortInput,
): Promise<KiAntwort> {
  const apiKey = await ladeApiKey(supabase);
  if (!apiKey) {
    throw new Error('Kein Anthropic API-Key konfiguriert (admin_settings.blog_settings.anthropic_api_key)');
  }

  const client = new Anthropic({ apiKey });

  // Verlauf: nur die letzten 10 Nachrichten, jede gekuerzt + sanitisiert.
  const verlauf = input.verlauf
    .slice(-10)
    .map((m) => {
      const rolle = m.sender === 'customer' ? 'KUNDE' : 'CAM2RENT';
      return `${rolle}: ${sanitizePromptInput(m.text, 4000)}`;
    })
    .join('\n\n');

  const userTurn = [
    `# HEUTE ist der ${getBerlinDateString()} (Format JJJJ-MM-TT).`,
    'Nennt der Kunde ein Datum ohne Jahr, ist das nächste zukünftige Vorkommen gemeint.',
    '',
    '# FAKTEN (einzige erlaubte Quelle)',
    input.wissensbasis,
    input.buchungen ? `\n${input.buchungen}` : '\n## Buchungen dieses Kunden\nKeine Buchung zuordenbar — daher KEINE Auskunft zu einer konkreten Buchung geben.',
    input.extraKontext ? `\n## Zusätzliche Hinweise des Betreibers\n${sanitizePromptInput(input.extraKontext, 4000)}` : '',
    '',
    '# ANFRAGE',
    `Kundenname: ${sanitizePromptInput(input.kundenName, 120)}`,
    `Betreff: ${sanitizePromptInput(input.betreff, 200)}`,
    '',
    '# VERLAUF (älteste zuerst, letzte Zeile ist die neue Anfrage)',
    verlauf,
    '',
    'Beantworte die letzte Kundennachricht nach deinen Regeln. Nur JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  // Gespraechsverlauf mit dem Modell. Die KI darf Werkzeuge aufrufen
  // (Verfuegbarkeit + Preis); wir fuehren sie aus und geben das Ergebnis
  // zurueck, bis sie ihre finale Antwort schreibt.
  const toolKontext: ToolKontext = input.kontext ?? { customerEmail: null, customerId: null };

  const dialog: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: KUNDENANFRAGE_TOOLS,
    messages: dialog,
  });

  // Begrenzt, damit eine Fehlschleife nicht endlos Geld kostet.
  for (let runde = 0; runde < MAX_TOOL_RUNDEN && response.stop_reason === 'tool_use'; runde++) {
    const aufrufe = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
    );
    if (aufrufe.length === 0) break;

    // Alle Werkzeuge parallel ausfuehren; die Ergebnisse muessen zusammen in
    // EINER Nutzernachricht zurueck (sonst hoert das Modell auf, mehrere
    // Aufrufe gleichzeitig zu machen).
    const ergebnisse = await Promise.all(
      aufrufe.map(async (call) => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: await fuehreToolAus(
          supabase,
          call.name,
          (call.input ?? {}) as Record<string, unknown>,
          toolKontext,
        ),
      })),
    );

    dialog.push({ role: 'assistant', content: response.content });
    dialog.push({ role: 'user', content: ergebnisse });

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: KUNDENANFRAGE_TOOLS,
      messages: dialog,
    });
  }

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Leere Antwort vom Modell');
  }

  const parsed = parseJsonAntwort(textBlock.text);

  const antwort = typeof parsed.antwort === 'string' ? parsed.antwort.trim() : '';
  if (!antwort) throw new Error('Modellantwort ohne Text');

  const kategorie = (ALLE_KATEGORIEN as string[]).includes(String(parsed.kategorie))
    ? (parsed.kategorie as AnfrageKategorie)
    : 'sonstiges';

  const confRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;

  return {
    kategorie,
    confidence,
    brauchtMensch: parsed.braucht_mensch === true,
    antwort: antwort.slice(0, 6000),
    interneNotiz:
      typeof parsed.interne_notiz === 'string' ? parsed.interne_notiz.slice(0, 500) : '',
  };
}
