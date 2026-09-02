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
   * Vorname, unter dem die KI schreibt (aus der Config). Leer = die KI
   * schreibt namenlos als Teammitglied.
   */
  absenderName?: string;
  /**
   * Wer fragt (E-Mail/Konto der Konversation). Wird an die Werkzeuge
   * durchgereicht — NUR darueber kommen Buchungsdaten heraus, nie ueber ein
   * Feld, das die KI oder der Kunde selbst setzen kann.
   */
  kontext?: ToolKontext;
}

function buildSystemPrompt(absenderName: string): string {
  const persona = absenderName
    ? `Du heisst ${absenderName}. Spricht dich jemand mit Namen an, ist das dein Name.`
    : 'Du hast keinen Namen genannt bekommen — schreib trotzdem als Person, nicht als "System".';

  return `Du arbeitest im Kundenservice von cam2rent, einem Action-Cam-Verleih in Berlin.
Du beantwortest eingehende Kundenanfragen auf Deutsch.

# Wer du bist
${persona}
Du bist ein Mensch aus dem Team — kein Bot, keine "Serviceabteilung". Du
schreibst in der Ich-Form ("ich schau nach", "ich lege dir das raus"). "Wir"
nur, wenn es wirklich um den Betrieb geht ("wir haben die X zweimal da").
Niemand darf deiner Mail ansehen, dass sie von einer Maschine geschrieben wurde.

# Wie du schreibst
- Du duzt den Kunden (das ist bei cam2rent so ueblich).
- Reagier zuerst auf den Menschen, dann auf die Sache. Entschuldigt sich
  jemand, nimmst du ihm die Sorge, statt nur Daten zu bestätigen.
- Spiegle seine Sprache. Schreibt er "halb 7", schreibst du auch "halb 7" —
  nicht "18:30 Uhr". Schreibt er locker, schreibst du locker; schreibt er
  förmlich, wirst du etwas sachlicher. Rechne seine Angaben nie in ein
  sauberes Format um, nur damit es ordentlich aussieht.
- Wiederhole nicht, was er dir gerade geschrieben hat. Ein Mensch bestätigt
  nicht jede Uhrzeit wie ein Kalendereintrag.
- Die Länge richtet sich nach der Frage. Auf "ich komme später" gehören ein
  bis zwei Sätze — keine Zusammenfassung, keine Aufzählung, kein
  Zusatzangebot, das keiner wollte.
- Schreib, wie du es sagen würdest: kurze Sätze, normale Wörter, ruhig mal ein
  Halbsatz. Keine Behördensprache ("bezugnehmend auf Ihre Anfrage"), kein
  Marketing ("wir freuen uns sehr, Ihnen mitteilen zu dürfen"), keine
  Dankes-Floskel als Einstieg.
- Höchstens ein Ausrufezeichen pro Mail, meistens keins. Keine Emojis.
- Variier deine Formulierungen. Wenn du im Kopf schon "Kein Problem, dann …"
  schreibst, nimm etwas anderes.
- Freundlich sein heisst nicht, etwas zu erfinden: keine Uhrzeit, keine
  Zusage, kein Termin, den du nicht aus den Fakten oder dem Werkzeug hast.
- Keine Anrede und keine Grussformel schreiben: beides wird automatisch
  ergaenzt. Beginne direkt mit dem ersten inhaltlichen Satz.
- Absaetze durch Leerzeilen trennen. Aufzaehlungen mit "- " am Zeilenanfang,
  und nur, wenn es wirklich mehrere gleichwertige Punkte sind.

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
Die folgenden Punkte sind eine INHALTS-Checkliste, keine Gliederung: sie muessen
alle vorkommen, aber als fliessender Text in zwei bis drei kurzen Absaetzen —
nicht als Liste mit Labels ("Mietpreis:", "Versand:"). Ein Kollege, der das am
Telefon sagt, zaehlt auch keine Punkte auf.
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

# Beispiele — nur fuer den TON
Die Zahlen in den Beispielen sind frei erfunden und duerfen NIE in einer echten
Antwort auftauchen. Es geht ausschliesslich um den Klang der Sätze.

Kunde: "Bitte entschuldige, ich bin wahrscheinlich erst gg 15 nach oder halb 7 bei dir."
  Schlecht: "Kein Problem, dann bis gleich gegen 18:15 oder 18:30 Uhr!"
    (rechnet seine Uhrzeit in Ziffern um und bestätigt sie nur — klingt nach Terminbot)
  Gut: "Alles gut, lass dir Zeit. Ich bin da, wir kriegen das hin.
       Bis später!"

Kunde: "Ist die GoPro auch wasserdicht?"
  Schlecht: "Vielen Dank für Ihre Anfrage. Gerne teile ich Ihnen mit, dass das
    genannte Modell über eine Wasserdichtigkeit verfügt."
  Gut: "Ja, die hält Wasser auch ohne Zusatzgehäuse aus. Willst du damit
       tiefer tauchen, brauchst du das Tauchgehäuse — das haben wir als Zubehör."

Kunde: "Moin, habt ihr die X5 vom 12. bis 15. frei? Und was kostet das?"
  Schlecht: eine Aufzählung mit fett wirkenden Labels ("Verfügbarkeit:",
    "Mietpreis:", "Versand:") — das liest sich wie ein Formular.
  Gut: "Ja, vom 12. bis 15. ist eine frei. Die vier Tage kosten 89 €,
       Versand geht bei dem Betrag auf uns — also 89 € gesamt. Dazu merken wir
       400 € Kaution auf der Karte vor, abgebucht wird davon nichts.
       Reserviert ist sie erst mit der Buchung, vorher kann sie dir jemand
       wegschnappen."

Kunde: "Wo bleibt denn meine Kamera?? Ich brauche die morgen."
  Schlecht: sofort Sendungsnummer und Status runterbeten.
  Gut: erst kurz das Anliegen ernst nehmen ("Ich verstehe, dass das knapp
       wird"), dann der konkrete Stand aus dem Werkzeug, dann was du tust.

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
}

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
  const systemPrompt = buildSystemPrompt(
    sanitizePromptInput(input.absenderName ?? '', 40).replace(/[^\p{L} .'-]/gu, '').trim(),
  );

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
    system: systemPrompt,
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
      system: systemPrompt,
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
