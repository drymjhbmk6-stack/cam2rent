/**
 * KI-Klassifizierung von Belegpositionen via Claude (Anthropic SDK).
 *
 * Pro Position: Empfehlung (afa/gwg/ausgabe/ignoriert) + Begruendung +
 * Confidence (0..1). Speichert Resultate als JSONB in
 * beleg_positionen.ki_vorschlag — der Admin kann sie pro Klick anwenden.
 *
 * API-Key wird aus admin_settings.blog_settings.anthropic_api_key geholt
 * (gleiche Quelle wie Blog/Social/OCR).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';

export type PositionKlass = 'afa' | 'gwg' | 'ausgabe' | 'ignoriert';

export interface KlassifizierungsVorschlag {
  klassifizierung: PositionKlass;
  begruendung: string;
  confidence: number;
  art?: 'kamera' | 'zubehoer' | 'buero' | 'werkzeug' | 'sonstiges';
  nutzungsdauer_monate?: number;
  kategorie?: string;
}

interface PositionInput {
  id: string;
  bezeichnung: string;
  menge: number;
  einzelpreis_netto: number;
  mwst_satz: number;
}

export async function klassifizierePositionen(
  positionen: PositionInput[],
): Promise<{ position_id: string; vorschlag: KlassifizierungsVorschlag }[]> {
  if (positionen.length === 0) return [];

  const supabase = createServiceClient();
  const { data: setting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .maybeSingle();

  const apiKey = (setting?.value as { anthropic_api_key?: string } | null)?.anthropic_api_key
    ?? process.env.ANTHROPIC_API_KEY
    ?? '';

  if (!apiKey) {
    throw new Error('Kein Anthropic API-Key konfiguriert (admin_settings.blog_settings.anthropic_api_key)');
  }

  const client = new Anthropic({ apiKey });

  const positionList = positionen.map((p, i) => {
    const netGesamt = p.menge * p.einzelpreis_netto;
    return `${i + 1}. ID=${p.id} | "${p.bezeichnung}" | Menge=${p.menge} | Einzelpreis=${p.einzelpreis_netto.toFixed(2)} EUR netto | Gesamt=${netGesamt.toFixed(2)} EUR netto`;
  }).join('\n');

  const systemPrompt = `Du bist ein deutscher Buchhaltungs-Experte fuer cam2rent (Action-Cam-Verleih in Berlin).

Fuer jede gelistete Belegposition entscheidest du nach §6 EStG die korrekte
steuerliche Behandlung:

- afa (Anlagegut, lineare AfA): Anschaffungswert > 800 EUR netto pro Stueck
  oder zwingend ins Anlagenverzeichnis (Vermietkameras IMMER, egal Preis)
- gwg (Geringwertiges Wirtschaftsgut): 250-800 EUR netto pro Stueck,
  Sofortabschreibung erlaubt, Verzeichnis-Pflicht
- ausgabe (Betriebsausgabe): < 250 EUR netto pro Stueck oder Verbrauchsmaterial
  egal welcher Preis (Reinigung, Versand, Buero-Verbrauch)
- ignoriert: kein Bezug zum Geschaeft (sollte sehr selten vorkommen)

WICHTIG:
- Ueber "Stueck" ist der Einzelpreis entscheidend, NICHT die Gesamtsumme.
- 5 SD-Karten je 30 EUR sind 5 mal "ausgabe", nicht 1 mal "asset".
- Vermietkameras (GoPro, DJI, Insta360) IMMER "afa", auch unter 800 EUR.
- Verpackung, Versandkosten, Reinigungsmaterial IMMER "ausgabe".
- Bei "afa" oder "gwg": gib ein passendes "art" mit (kamera/zubehoer/buero/werkzeug/sonstiges)
  und bei "afa" eine plausible Nutzungsdauer in Monaten (Standard: 84 fuer Kameras, 36-60 fuer Zubehoer).

Antworte AUSSCHLIESSLICH mit gueltigem JSON in diesem Schema, ohne Markdown-Codeblock:

{
  "results": [
    {
      "position_id": "<id>",
      "klassifizierung": "afa" | "gwg" | "ausgabe" | "ignoriert",
      "begruendung": "<1 Satz auf Deutsch>",
      "confidence": <0..1>,
      "art": "kamera" | "zubehoer" | "buero" | "werkzeug" | "sonstiges",
      "nutzungsdauer_monate": <Zahl, nur bei afa>,
      "kategorie": "<optional, z.B. 'shipping', 'office', ...>"
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Klassifiziere die folgenden Belegpositionen:\n\n${positionList}` }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude lieferte keine Text-Antwort');
  }

  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  let parsed: { results?: Array<{ position_id: string } & KlassifizierungsVorschlag> };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Antwort von Claude nicht parsbar: ${(err as Error).message}\n\nAntwort:\n${cleaned}`);
  }

  return (parsed.results ?? []).map((r) => ({
    position_id: r.position_id,
    vorschlag: {
      klassifizierung: r.klassifizierung,
      begruendung: r.begruendung ?? '',
      confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
      art: r.art,
      nutzungsdauer_monate: r.nutzungsdauer_monate,
      kategorie: r.kategorie,
    },
  }));
}
