/**
 * Rechnungs-OCR + Klassifikation via Claude Vision (Document Input).
 *
 * Nimmt ein PDF oder ein Bild, gibt strukturiertes JSON zurueck mit
 * Lieferanten, Positionen, Summen und KI-Vorschlag fuer jede Position
 * (Anlagegut vs. Betriebsausgabe).
 *
 * API-Key wird aus admin_settings.blog_settings.anthropic_api_key geholt
 * (gleiche Quelle wie Blog + Social).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';

export type InvoiceKind = 'rental_camera' | 'rental_accessory' | 'office_equipment' | 'tool' | 'other';
export type InvoiceClassification = 'asset' | 'gwg' | 'expense';

export interface ExtractedInvoiceItem {
  description: string;
  quantity: number;
  unit_price_net: number;
  tax_rate: number;
  line_total_net: number;
  line_total_gross: number;
  suggested_classification: InvoiceClassification;
  suggested_category?: string;
  suggested_kind?: InvoiceKind;
  suggested_useful_life_months?: number;
  confidence: number;
}

export interface ExtractedInvoice {
  supplier: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    vat_id?: string;
  };
  invoice_number?: string;
  invoice_date?: string;
  items: ExtractedInvoiceItem[];
  totals: {
    net: number;
    tax: number;
    gross: number;
  };
  payment_method?: string;
  currency?: string;
  notes?: string;
}

export type InvoiceMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

const SYSTEM_PROMPT = `Du bist ein Buchhaltungs-Assistent fuer cam2rent, einen deutschen Action-Cam-Verleih (GoPro, DJI, Insta360 und Zubehoer).
Deine Aufgabe: aus Eingangsrechnungen strukturierte Daten extrahieren und jede Position klassifizieren.

Klassifikations-Regeln (deutsches Steuerrecht, § 6 EStG):
- "asset" = Anlagegut > 800 EUR netto, lineare AfA ueber Nutzungsdauer (Pflicht):
  - Teure Kameras, Objektive, Drohnen, die vermietet werden (kind: rental_camera)
  - Vermietbares Zubehoer > 800 EUR netto (kind: rental_accessory)
  - Teure Laptops, Drucker, Moebel ueber 800 EUR netto (kind: office_equipment)
  - Werkzeug ueber 800 EUR netto (kind: tool)
  - Alle anderen Anlagegueter > 800 EUR netto (kind: other)
- "gwg" = Geringwertiges Wirtschaftsgut 250-800 EUR netto, Sofortabschreibung + Verzeichnis-Pflicht:
  - Vermietbares Zubehoer 250-800 EUR netto (kind: rental_accessory) — typisch: Akku-Pack, Stativ, hochwertige Mikrofone, mittelgrosse Drohnen-Gimbals
  - Buero-Equipment 250-800 EUR netto (kind: office_equipment)
  - Werkzeug 250-800 EUR netto (kind: tool)
  - WICHTIG: Vermietkameras (kind: rental_camera) IMMER als "asset", auch wenn unter 800 EUR — wegen Inventur und Geraete-Lebenszyklus (Mietvertrags-Bezug)
- "expense" = Betriebsausgabe, direkt abziehbar:
  - Verbrauchsmaterial (Akkus unter 250 EUR, SD-Karten, Reinigungsmittel)
  - Software-Abos, Dienstleistungen
  - Versandkosten, Verpackung
  - Kleinteile unter 250 EUR netto

Faustregel:
  netto < 250 EUR  → "expense"
  netto 250-800 EUR → "gwg" (ausser Vermietkameras, die immer "asset")
  netto > 800 EUR  → "asset"

Gaengige Nutzungsdauern (useful_life_months) — nur fuer "asset" relevant, GWG ignoriert das:
- Kamera/Drohne: 36 (3 Jahre)
- Zubehoer: 36
- Laptop: 36
- Buero-Moebel: 156 (13 Jahre)
- Werkzeug: 96 (8 Jahre)

Kategorien (fuer suggested_category bei expense):
stripe_fees, shipping, software, hardware, marketing, office, travel, insurance, legal, other

Antworte AUSSCHLIESSLICH als JSON ohne Markdown-Codefences. Schema:
{
  "supplier": { "name": "...", "address": "...", "email": "...", "phone": "...", "vat_id": "..." },
  "invoice_number": "...",
  "invoice_date": "YYYY-MM-DD",
  "items": [
    {
      "description": "...",
      "quantity": 1,
      "unit_price_net": 0.00,
      "tax_rate": 19,
      "line_total_net": 0.00,
      "line_total_gross": 0.00,
      "suggested_classification": "asset" | "gwg" | "expense",
      "suggested_category": "hardware",
      "suggested_kind": "rental_camera",
      "suggested_useful_life_months": 36,
      "confidence": 0.9
    }
  ],
  "totals": { "net": 0.00, "tax": 0.00, "gross": 0.00 },
  "payment_method": "Rechnung" | "Kreditkarte" | "Lastschrift" | "Bar" | null,
  "currency": "EUR",
  "notes": ""
}

Wenn Felder nicht erkennbar sind: null oder weglassen (bei optionalen Feldern).
Betraege immer als Zahlen (nicht Strings). Deutsche Umlaute korrekt.`;

async function getAnthropicKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .maybeSingle();
  if (!data?.value) {
    throw new Error('Anthropic API-Key nicht konfiguriert (Blog > Einstellungen > Anthropic API Key)');
  }
  const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  const key = (settings as { anthropic_api_key?: string })?.anthropic_api_key;
  if (!key) {
    throw new Error('Anthropic API-Key nicht konfiguriert (Blog > Einstellungen > Anthropic API Key)');
  }
  return key;
}

export async function extractInvoice(
  fileBuffer: Buffer,
  mimeType: InvoiceMimeType
): Promise<{ invoice: ExtractedInvoice; rawResponse: unknown }> {
  const apiKey = await getAnthropicKey();
  const client = new Anthropic({ apiKey });

  const base64 = fileBuffer.toString('base64');

  // Claude Vision Document Input (SDK v0.85 unterstuetzt document + image)
  const userContent =
    mimeType === 'application/pdf'
      ? [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
          },
          {
            type: 'text' as const,
            text: 'Analysiere diese Eingangsrechnung gemaess Schema und gib ausschliesslich JSON zurueck.',
          },
        ]
      : [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mimeType, data: base64 },
          },
          {
            type: 'text' as const,
            text: 'Analysiere diese Eingangsrechnung gemaess Schema und gib ausschliesslich JSON zurueck.',
          },
        ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude lieferte keine Text-Antwort');
  }

  let raw = textBlock.text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  let parsed: ExtractedInvoice;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Claude-Antwort war kein valides JSON: ${(err as Error).message}\nAntwort:\n${raw.slice(0, 500)}`);
  }

  // Defensive Defaults falls Claude Felder vergisst
  if (!parsed.supplier?.name) {
    throw new Error('Lieferant in der Rechnung nicht erkennbar');
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('Keine Rechnungspositionen gefunden');
  }
  if (!parsed.totals) {
    parsed.totals = { net: 0, tax: 0, gross: 0 };
  }

  // Zahlen normalisieren (manche Modelle liefern Strings)
  parsed.items = parsed.items.map((item) => ({
    ...item,
    quantity: Number(item.quantity) || 1,
    unit_price_net: Number(item.unit_price_net) || 0,
    tax_rate: Number(item.tax_rate) || 19,
    line_total_net: Number(item.line_total_net) || 0,
    line_total_gross: Number(item.line_total_gross) || 0,
    confidence: Number(item.confidence) || 0,
  }));
  parsed.totals = {
    net: Number(parsed.totals.net) || 0,
    tax: Number(parsed.totals.tax) || 0,
    gross: Number(parsed.totals.gross) || 0,
  };

  return { invoice: parsed, rawResponse: response };
}
