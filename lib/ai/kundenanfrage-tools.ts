/**
 * Werkzeuge, die die Antwort-KI selbst aufrufen kann (Anthropic Tool Use).
 *
 * Warum ueberhaupt Werkzeuge: Die Wissensbasis kennt nur Katalogdaten —
 * Listenpreise und Gesamtbestand. Ob an einem konkreten Datum wirklich
 * genuegend Kameras frei sind und was die Bestellung am Ende KOSTET
 * (inkl. Versand, Gratis-Schwelle, Haftungsschutz, Kaution), steht nirgends
 * als Text. Statt die KI rechnen und raten zu lassen, ruft sie dieselbe
 * Funktion auf wie der Preisrechner im Admin — `computeQuote`.
 *
 * Damit sind die Zahlen in der Kundenantwort per Konstruktion dieselben,
 * die der Kunde im Shop sehen wuerde.
 *
 * Sicherheit: Die Werkzeuge sind strikt LESEND. Sie legen nichts an,
 * reservieren nichts und aendern nichts.
 */

import type { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { computeQuote } from '@/lib/quote';
import { getBerlinDateString } from '@/lib/timezone';

type SB = ReturnType<typeof createServiceClient>;

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Tool-Definitionen fuer die Messages-API. */
export const KUNDENANFRAGE_TOOLS = [
  {
    name: 'pruefe_angebot',
    description:
      'Prüft für einen konkreten Mietzeitraum die ECHTE Verfügbarkeit im Buchungskalender und berechnet den verbindlichen Gesamtpreis (Miete, Haftungsschutz, Versand inkl. Gratis-Schwelle, Kaution). ' +
      'IMMER aufrufen, sobald der Kunde ein Datum oder einen Zeitraum nennt — auch wenn du den Listenpreis schon kennst. ' +
      'Niemals selbst multiplizieren oder Versandkosten schätzen; das Ergebnis dieses Werkzeugs ist maßgeblich.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kamera: {
          type: 'string',
          description: 'Name des Kameramodells, so wie der Kunde es nennt (z. B. "Osmo Action 5 Pro", "GoPro Hero13").',
        },
        anzahl: {
          type: 'integer',
          description: 'Wie viele Exemplare dieses Modells (Standard 1).',
        },
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
          description:
            'Haftungsschutz: none = ohne, standard = Basis, premium = Premium. Wenn der Kunde nichts sagt: none.',
        },
      },
      required: ['kamera', 'von', 'bis'],
      additionalProperties: false,
    },
  },
];

/** Findet das Produkt zum vom Kunden genannten Namen (tolerant). */
async function findeProdukt(name: string) {
  const products = await getProducts();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ziel = norm(name);
  if (!ziel) return null;

  // 1. Exakt, 2. Teilstring in beide Richtungen, 3. Wort-Überlappung.
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

/** Grobe Plausibilitätsprüfung eines Datums (JJJJ-MM-TT). */
function istDatum(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

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
): Promise<string> {
  if (name !== 'pruefe_angebot') return `Unbekanntes Werkzeug: ${name}`;

  try {
    const kamera = String(input.kamera ?? '').trim();
    const von = input.von;
    const bis = input.bis;

    if (!istDatum(von) || !istDatum(bis)) {
      return 'Fehler: "von" und "bis" müssen im Format JJJJ-MM-TT angegeben werden.';
    }
    if (bis < von) return 'Fehler: Das Enddatum liegt vor dem Startdatum.';

    const heute = getBerlinDateString();
    if (bis < heute) {
      return `Hinweis: Der angefragte Zeitraum (${von} bis ${bis}) liegt in der Vergangenheit. Bitte beim Kunden nachfragen, welches Jahr gemeint ist — keine Verfügbarkeit nennen.`;
    }

    const produkt = await findeProdukt(kamera);
    if (!produkt) {
      const alle = (await getProducts()).map((p) => p.name).join(', ');
      return `Kein Modell mit dem Namen "${kamera}" im Verleih. Verfügbare Modelle: ${alle || '(keine)'}. Bitte beim Kunden nachfragen, welches Modell gemeint ist.`;
    }

    const anzahlRaw = Number(input.anzahl ?? 1);
    const anzahl = Number.isFinite(anzahlRaw) ? Math.min(20, Math.max(1, Math.floor(anzahlRaw))) : 1;
    const lieferart = input.lieferart === 'abholung' ? 'abholung' : 'versand';
    const haftung =
      input.haftung === 'standard' || input.haftung === 'premium'
        ? (input.haftung as 'standard' | 'premium')
        : 'none';

    const quote = await computeQuote(supabase, {
      rentalFrom: von,
      rentalTo: bis,
      deliveryMode: lieferart,
      shippingMethod: 'standard',
      lines: [{ productId: produkt.id, qty: anzahl, haftung, accessories: [] }],
    });

    const line = quote.lines[0];
    if (!line) return 'Fehler: Der Preis konnte nicht berechnet werden.';

    const teile: string[] = [];
    teile.push(`Modell: ${line.productName}`);
    teile.push(`Zeitraum: ${von} bis ${bis} (${quote.days} Miettage)`);
    teile.push(`Menge: ${anzahl}`);

    // ── Verfügbarkeit ──────────────────────────────────────────────────────
    if (line.cameraAvailable) {
      teile.push(
        `VERFÜGBARKEIT: ${anzahl} Stück sind im gesamten Zeitraum frei und buchbar (Stand jetzt, ohne Reservierung).`,
      );
    } else {
      const frei = line.cameraFree ?? 0;
      teile.push(
        `VERFÜGBARKEIT: NICHT möglich — am ${line.cameraConflictDay} ${frei === 0 ? 'ist kein Exemplar' : `sind nur ${frei} Exemplare`} frei (benötigt: ${anzahl}).`,
      );
      if (frei > 0) {
        teile.push(`Es könnten stattdessen ${frei} Stück gebucht werden.`);
      }
    }

    // ── Preis ──────────────────────────────────────────────────────────────
    teile.push(`Miete: ${eur(line.rentalUnitPrice)} pro Kamera → ${eur(line.rentalTotal)} gesamt`);
    if (haftung !== 'none') {
      teile.push(`${line.haftungLabel}: ${eur(line.haftungPrice)}`);
    }
    if (lieferart === 'versand') {
      teile.push(
        quote.shipping.isFree
          ? `Versand: kostenlos (Gratis-Versand-Schwelle erreicht)`
          : `Versand: ${eur(quote.shipping.price)}`,
      );
    } else {
      teile.push('Abholung: kostenlos');
    }
    teile.push(`GESAMTPREIS: ${eur(quote.grandTotal)}`);
    if (quote.depositSum > 0) {
      teile.push(
        `Kaution: ${eur(quote.depositSum)} (wird nur auf der Kreditkarte vorgemerkt, nicht abgebucht)`,
      );
    }
    if (haftung === 'none') {
      teile.push(
        'Hinweis: ohne Haftungsschutz gerechnet. Basis- und Premium-Haftungsschutz sind optional dazubuchbar (Preise siehe Fakten).',
      );
    }

    return teile.join('\n');
  } catch (err) {
    return `Fehler bei der Prüfung: ${err instanceof Error ? err.message : 'unbekannt'}`;
  }
}
