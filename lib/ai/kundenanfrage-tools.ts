/**
 * Werkzeuge, die die Antwort-KI selbst aufrufen kann (Anthropic Tool Use).
 *
 * Warum ueberhaupt Werkzeuge: Die Wissensbasis kennt nur Katalogdaten —
 * Listenpreise und Gesamtbestand. Ob an einem konkreten Datum wirklich
 * genuegend Kameras frei sind, was die Bestellung KOSTET (inkl. Versand,
 * Gratis-Schwelle, Haftungsschutz, Kaution) und wie der Stand einer Buchung
 * ist, steht nirgends als Text. Statt die KI rechnen und raten zu lassen,
 * ruft sie dieselben Funktionen auf wie Shop und Admin.
 *
 * ALLE Werkzeuge sind strikt LESEND. Keines legt etwas an, reserviert etwas
 * oder aendert etwas — bewusste Architekturentscheidung: eine falsche Auskunft
 * ist korrigierbar, eine faelschlich angelegte Buchung blockiert echtes
 * Inventar und bewegt Geld.
 *
 * Datenschutz: Buchungsdaten gibt es NUR zum Anfragenden selbst. Die Zuordnung
 * kommt aus dem Kontext des Aufrufers (E-Mail/Konto der Konversation) und
 * NIEMALS aus einem Feld, das die KI oder der Kunde frei setzen kann.
 */

import type { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { getAllAccessories } from '@/lib/get-accessories';
import { computeQuote } from '@/lib/quote';
import { findCameraOverbookingConflict } from '@/lib/camera-availability-check';
import { loadBufferDays, getEffectiveLeadDays, isoAddDays } from '@/lib/booking-buffer';
import { getBerlinDateString } from '@/lib/timezone';
import { fmtDate } from '@/lib/format-utils';
import { ladeBuchungsZeilen, formatiereBuchungen } from '@/lib/ai/kundenanfrage-kontext';

type SB = ReturnType<typeof createServiceClient>;

/** Wer fragt? Wird vom Aufrufer gesetzt, nie von der KI. */
export interface ToolKontext {
  customerEmail: string | null;
  customerId: string | null;
}

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Wie weit in die Zukunft nach einem freien Termin gesucht wird. */
const ALTERNATIV_HORIZONT_TAGE = 120;
/** Wie viele Fenster maximal vorgeschlagen werden. */
const MAX_ALTERNATIVEN = 3;

// ─── Tool-Definitionen ──────────────────────────────────────────────────────

export const KUNDENANFRAGE_TOOLS = [
  {
    name: 'pruefe_angebot',
    description:
      'Prüft für einen konkreten Mietzeitraum die ECHTE Verfügbarkeit im Buchungskalender und berechnet den verbindlichen Gesamtpreis (Miete, Zubehör/Sets, Haftungsschutz, Versand inkl. Gratis-Schwelle, Kaution). ' +
      'IMMER aufrufen, sobald der Kunde ein Datum oder einen Zeitraum nennt — auch wenn du den Listenpreis schon kennst. ' +
      'Niemals selbst multiplizieren oder Versandkosten schätzen; das Ergebnis dieses Werkzeugs ist maßgeblich.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kamera: {
          type: 'string',
          description: 'Name des Kameramodells, so wie der Kunde es nennt (z. B. "Osmo Action 5 Pro", "GoPro Hero13").',
        },
        anzahl: { type: 'integer', description: 'Wie viele Exemplare dieses Modells (Standard 1).' },
        von: { type: 'string', description: 'Erster Miettag im Format JJJJ-MM-TT.' },
        bis: { type: 'string', description: 'Letzter Miettag im Format JJJJ-MM-TT.' },
        lieferart: {
          type: 'string',
          enum: ['versand', 'abholung'],
          description: 'Versand oder Selbstabholung. Wenn der Kunde nichts sagt: versand.',
        },
        haftung: {
          type: 'string',
          enum: ['none', 'standard', 'premium'],
          description: 'none = ohne, standard = Basis, premium = Premium. Wenn der Kunde nichts sagt: none.',
        },
        zubehoer: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Namen von Zubehör oder Sets, die der Kunde dazu haben möchte (z. B. ["Basic Set", "Extra Akku"]). Leer lassen, wenn nichts genannt wurde.',
        },
      },
      required: ['kamera', 'von', 'bis'],
      additionalProperties: false,
    },
  },
  {
    name: 'finde_alternativtermine',
    description:
      'Sucht die nächsten Zeiträume, in denen ein Kameramodell in der gewünschten Menge frei ist. ' +
      'Aufrufen, wenn pruefe_angebot "nicht möglich" gemeldet hat, oder wenn der Kunde nach einem freien Termin fragt, ohne ein Datum zu nennen. ' +
      'So bekommt der Kunde statt einer reinen Absage einen konkreten Gegenvorschlag.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kamera: { type: 'string', description: 'Name des Kameramodells.' },
        anzahl: { type: 'integer', description: 'Wie viele Exemplare benötigt werden (Standard 1).' },
        dauer_tage: { type: 'integer', description: 'Gewünschte Mietdauer in Tagen.' },
        ab: {
          type: 'string',
          description: 'Ab welchem Datum gesucht wird (JJJJ-MM-TT). Weglassen = ab dem frühestmöglichen Termin.',
        },
        lieferart: { type: 'string', enum: ['versand', 'abholung'] },
      },
      required: ['kamera', 'dauer_tage'],
      additionalProperties: false,
    },
  },
  {
    name: 'buchung_status',
    description:
      'Liefert den aktuellen Stand einer Buchung DIESES Kunden: Status, Mietzeitraum, Versandart, Sendungsnummer und ob der Mietvertrag unterschrieben ist. ' +
      'Aufrufen bei Fragen wie "Wo ist mein Paket?", "Wann muss ich zurückschicken?", "Ist meine Buchung bestätigt?". ' +
      'Es werden ausschließlich Buchungen des Anfragenden zurückgegeben.',
    input_schema: {
      type: 'object' as const,
      properties: {
        buchungsnummer: {
          type: 'string',
          description: 'Buchungsnummer wie C2R-2635-001, falls der Kunde eine nennt. Weglassen = alle eigenen Buchungen.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

// ─── Namens-Auflösung ───────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Findet das Produkt zum vom Kunden genannten Namen (tolerant). */
async function findeProdukt(name: string) {
  const products = await getProducts();
  const ziel = norm(name);
  if (!ziel) return null;
  return (
    products.find((p) => norm(p.name) === ziel) ??
    products.find((p) => norm(p.name).includes(ziel) || ziel.includes(norm(p.name))) ??
    products.find((p) => {
      const woerter = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const hay = `${p.name} ${p.brand} ${p.model}`.toLowerCase();
      return woerter.length > 0 && woerter.every((w) => hay.includes(w));
    }) ??
    null
  );
}

/**
 * Loest Zubehoer-/Set-Namen in IDs auf. Sets werden von computeQuote als
 * Pseudo-Zubehoer behandelt und intern in ihre Bestandteile expandiert.
 */
async function findeZubehoer(
  supabase: SB,
  namen: string[],
): Promise<{ treffer: { id: string; name: string }[]; unbekannt: string[] }> {
  const treffer: { id: string; name: string }[] = [];
  const unbekannt: string[] = [];
  if (namen.length === 0) return { treffer, unbekannt };

  const ladeSets = async (): Promise<{ id: string; name: string | null }[]> => {
    try {
      const { data } = await supabase.from('sets').select('id, name');
      return (data ?? []) as { id: string; name: string | null }[];
    } catch {
      return [];
    }
  };

  const [accs, setRows] = await Promise.all([
    getAllAccessories().catch((): Awaited<ReturnType<typeof getAllAccessories>> => []),
    ladeSets(),
  ]);

  const kandidaten: { id: string; name: string }[] = [
    ...setRows.map((s) => ({ id: s.id, name: s.name ?? s.id })),
    ...accs.map((a) => ({ id: a.id, name: a.name })),
  ];

  for (const gesucht of namen.slice(0, 10)) {
    const ziel = norm(gesucht);
    if (!ziel) continue;
    const hit =
      kandidaten.find((k) => norm(k.name) === ziel) ??
      kandidaten.find((k) => norm(k.name).includes(ziel) || ziel.includes(norm(k.name)));
    if (hit) treffer.push(hit);
    else unbekannt.push(gesucht);
  }
  return { treffer, unbekannt };
}

/** Grobe Plausibilitätsprüfung eines Datums (JJJJ-MM-TT). */
function istDatum(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function clampAnzahl(raw: unknown, max = 20): number {
  const n = Number(raw ?? 1);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : 1;
}

/** Frühestmöglicher Miettag unter Berücksichtigung der Vorlaufzeit. */
async function fruehesterStart(supabase: SB, lieferart: 'versand' | 'abholung'): Promise<string> {
  try {
    const buf = await loadBufferDays(supabase);
    return isoAddDays(getBerlinDateString(), getEffectiveLeadDays(buf, lieferart));
  } catch {
    return isoAddDays(getBerlinDateString(), 3);
  }
}

// ─── Werkzeug 1: Verfügbarkeit + Preis ──────────────────────────────────────

async function toolPruefeAngebot(supabase: SB, input: Record<string, unknown>): Promise<string> {
  const kamera = String(input.kamera ?? '').trim();
  const von = input.von;
  const bis = input.bis;

  if (!istDatum(von) || !istDatum(bis)) {
    return 'Fehler: "von" und "bis" müssen im Format JJJJ-MM-TT angegeben werden.';
  }
  if (bis < von) return 'Fehler: Das Enddatum liegt vor dem Startdatum.';
  if (bis < getBerlinDateString()) {
    return `Hinweis: Der angefragte Zeitraum (${von} bis ${bis}) liegt in der Vergangenheit. Bitte beim Kunden nachfragen, welches Jahr gemeint ist — keine Verfügbarkeit nennen.`;
  }

  const produkt = await findeProdukt(kamera);
  if (!produkt) {
    const alle = (await getProducts()).map((p) => p.name).join(', ');
    return `Kein Modell mit dem Namen "${kamera}" im Verleih. Verfügbare Modelle: ${alle || '(keine)'}. Bitte beim Kunden nachfragen, welches Modell gemeint ist.`;
  }

  const anzahl = clampAnzahl(input.anzahl);
  const lieferart = input.lieferart === 'abholung' ? 'abholung' : 'versand';
  const haftung =
    input.haftung === 'standard' || input.haftung === 'premium'
      ? (input.haftung as 'standard' | 'premium')
      : 'none';

  const zubehoerNamen = Array.isArray(input.zubehoer)
    ? input.zubehoer.filter((z): z is string => typeof z === 'string')
    : [];
  const { treffer, unbekannt } = await findeZubehoer(supabase, zubehoerNamen);

  const quote = await computeQuote(supabase, {
    rentalFrom: von,
    rentalTo: bis,
    deliveryMode: lieferart,
    shippingMethod: 'standard',
    lines: [
      {
        productId: produkt.id,
        qty: anzahl,
        haftung,
        accessories: treffer.map((t) => ({ accessory_id: t.id, qty: 1 })),
      },
    ],
  });

  const line = quote.lines[0];
  if (!line) return 'Fehler: Der Preis konnte nicht berechnet werden.';

  const teile: string[] = [];
  teile.push(`Modell: ${line.productName}`);
  teile.push(`Zeitraum: ${von} bis ${bis} (${quote.days} Miettage)`);
  teile.push(`Menge: ${anzahl}`);

  // Verfügbarkeit Kamera
  if (line.cameraAvailable) {
    teile.push(`VERFÜGBARKEIT: ${anzahl} Stück sind im gesamten Zeitraum frei und buchbar (Stand jetzt, ohne Reservierung).`);
  } else {
    const frei = line.cameraFree ?? 0;
    teile.push(
      `VERFÜGBARKEIT: NICHT möglich — am ${line.cameraConflictDay} ${frei === 0 ? 'ist kein Exemplar' : `sind nur ${frei} Exemplare`} frei (benötigt: ${anzahl}).`,
    );
    if (frei > 0) teile.push(`Es könnten stattdessen ${frei} Stück gebucht werden.`);
    teile.push('Rufe finde_alternativtermine auf, um dem Kunden freie Zeiträume anzubieten.');
  }

  // Preis
  teile.push(`Miete: ${eur(line.rentalUnitPrice)} pro Kamera → ${eur(line.rentalTotal)} gesamt`);

  for (const a of line.accessories) {
    const stand = a.available
      ? 'verfügbar'
      : `NICHT verfügbar${a.remaining != null ? ` (nur noch ${a.remaining} frei)` : ''}`;
    teile.push(`${a.isSet ? 'Set' : 'Zubehör'} "${a.name}": ${eur(a.total)} — ${stand}`);
  }
  if (unbekannt.length > 0) {
    teile.push(`Nicht im Sortiment gefunden: ${unbekannt.join(', ')} — beim Kunden nachfragen, nichts dazu zusagen.`);
  }

  if (haftung !== 'none') teile.push(`${line.haftungLabel}: ${eur(line.haftungPrice)}`);

  if (lieferart === 'versand') {
    teile.push(
      quote.shipping.isFree
        ? 'Versand: kostenlos (Gratis-Versand-Schwelle erreicht)'
        : `Versand: ${eur(quote.shipping.price)}`,
    );
  } else {
    teile.push('Abholung: kostenlos');
  }

  teile.push(`GESAMTPREIS: ${eur(quote.grandTotal)}`);
  if (quote.depositSum > 0) {
    teile.push(`Kaution: ${eur(quote.depositSum)} (wird nur auf der Kreditkarte vorgemerkt, nicht abgebucht)`);
  }
  if (haftung === 'none') {
    teile.push('Hinweis: ohne Haftungsschutz gerechnet. Basis- und Premium-Haftungsschutz sind optional dazubuchbar (Preise siehe Fakten).');
  }

  return teile.join('\n');
}

// ─── Werkzeug 2: Alternativtermine ──────────────────────────────────────────

async function toolFindeAlternativtermine(supabase: SB, input: Record<string, unknown>): Promise<string> {
  const kamera = String(input.kamera ?? '').trim();
  const produkt = await findeProdukt(kamera);
  if (!produkt) {
    const alle = (await getProducts()).map((p) => p.name).join(', ');
    return `Kein Modell mit dem Namen "${kamera}" im Verleih. Verfügbare Modelle: ${alle || '(keine)'}.`;
  }

  const anzahl = clampAnzahl(input.anzahl);
  const dauer = clampAnzahl(input.dauer_tage, 60);
  const lieferart = input.lieferart === 'abholung' ? 'abholung' : 'versand';

  const frueheste = await fruehesterStart(supabase, lieferart);
  let start = istDatum(input.ab) && input.ab > frueheste ? input.ab : frueheste;
  const grenze = isoAddDays(getBerlinDateString(), ALTERNATIV_HORIZONT_TAGE);

  const gefunden: { von: string; bis: string }[] = [];

  // Gleitende Suche: bei einem Konflikt wird direkt hinter den blockierten Tag
  // gesprungen — dadurch sind nur wenige Prüfungen nötig, statt Tag für Tag.
  for (let versuch = 0; versuch < 25 && gefunden.length < MAX_ALTERNATIVEN; versuch++) {
    if (start > grenze) break;
    const ende = isoAddDays(start, dauer - 1);
    const conflict = await findCameraOverbookingConflict(supabase, {
      productId: produkt.id,
      rentalFrom: start,
      rentalTo: ende,
      deliveryMode: lieferart,
      neededUnits: anzahl,
    });
    if (!conflict) {
      gefunden.push({ von: start, bis: ende });
      // Nächstes Fenster erst nach diesem suchen, sonst kommen
      // überlappende Vorschläge heraus.
      start = isoAddDays(ende, 1);
    } else {
      start = isoAddDays(conflict.day, 1);
    }
  }

  if (gefunden.length === 0) {
    return `Für ${produkt.name} (${anzahl} Stück, ${dauer} Tage) ist in den nächsten ${ALTERNATIV_HORIZONT_TAGE} Tagen kein durchgehend freier Zeitraum gefunden worden. Dem Kunden anbieten, sich mit einem konkreten Wunschtermin zu melden, oder auf eine kleinere Stückzahl ausweichen.`;
  }

  const zeilen = gefunden.map(
    (g) => `- ${fmtDate(g.von)} bis ${fmtDate(g.bis)} (${dauer} Tage)`,
  );
  return [
    `Freie Zeiträume für ${produkt.name}, ${anzahl} Stück, ${dauer} Tage (Stand jetzt, frühestens ab ${fmtDate(frueheste)} wegen Vorlaufzeit):`,
    ...zeilen,
    'Diese Termine sind NICHT reserviert — erst die Buchung sichert sie.',
  ].join('\n');
}

// ─── Werkzeug 3: Buchungsstatus ─────────────────────────────────────────────

async function toolBuchungStatus(
  supabase: SB,
  input: Record<string, unknown>,
  kontext: ToolKontext,
): Promise<string> {
  if (!kontext.customerId && !kontext.customerEmail) {
    return 'Diese Anfrage lässt sich keinem Kundenkonto zuordnen. Es dürfen KEINE Buchungsdaten genannt werden — bitte den Kunden nach seiner Buchungsnummer fragen und an einen Mitarbeiter übergeben.';
  }

  const nummer = typeof input.buchungsnummer === 'string' ? input.buchungsnummer.trim() : '';

  // Zuordnung IMMER über den Kontext des Anfragenden — die von der KI
  // gelieferte Buchungsnummer darf nur zusaetzlich einschraenken, niemals
  // fremde Buchungen oeffnen.
  const rows = await ladeBuchungsZeilen(supabase, (cols) => {
    let q = supabase.from('bookings').select(cols).order('created_at', { ascending: false }).limit(5);
    q = kontext.customerId
      ? q.eq('user_id', kontext.customerId)
      : q.ilike('customer_email', kontext.customerEmail as string);
    if (nummer) q = q.eq('id', nummer.toUpperCase());
    return q;
  });

  if (rows.length === 0) {
    return nummer
      ? `Zu diesem Kunden gibt es keine Buchung mit der Nummer ${nummer}. Nichts dazu zusagen — nachfragen oder an einen Mitarbeiter übergeben.`
      : 'Zu diesem Kunden ist keine Buchung hinterlegt. KEINE Auskunft zu einer konkreten Buchung geben.';
  }

  // Gleicher Formatter wie die Wissensbasis — sonst haette die KI zwei
  // unterschiedlich formatierte Staende derselben Buchung im Prompt.
  const zeilen = await formatiereBuchungen(supabase, rows);

  return [
    'Buchungen dieses Kunden (aktueller Stand):',
    ...zeilen,
    'Nenne Modelle, Stueckzahlen und Zubehoer AUSSCHLIESSLICH so, wie sie hier stehen.',
  ].join('\n');
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Fuehrt einen Werkzeug-Aufruf der KI aus und gibt das Ergebnis als Text
 * zurueck (geht als tool_result zurueck ins Gespraech).
 *
 * Wirft nie — ein Fehlertext ist fuer die KI brauchbarer als ein Absturz.
 */
export async function fuehreToolAus(
  supabase: SB,
  name: string,
  input: Record<string, unknown>,
  kontext: ToolKontext,
): Promise<string> {
  try {
    switch (name) {
      case 'pruefe_angebot':
        return await toolPruefeAngebot(supabase, input);
      case 'finde_alternativtermine':
        return await toolFindeAlternativtermine(supabase, input);
      case 'buchung_status':
        return await toolBuchungStatus(supabase, input, kontext);
      default:
        return `Unbekanntes Werkzeug: ${name}`;
    }
  } catch (err) {
    return `Fehler bei der Prüfung: ${err instanceof Error ? err.message : 'unbekannt'}`;
  }
}
