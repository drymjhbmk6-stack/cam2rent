import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import type { FirmwareAdapter, FirmwareInfo } from '../types';

/**
 * Claude-Fallback-Adapter: nutzt das Anthropic `web_search`-Tool, um
 * Hersteller-Webseiten live zu durchsuchen. Wird nur aufgerufen, wenn
 * der marken-spezifische Adapter `error` oder `unsupported` liefert.
 *
 * Kosten: ~0,02–0,05 € pro Anfrage (Sonnet 4.6 + 1–3 Web-Searches).
 *
 * Anti-Halluzinations-Maßnahmen:
 *   1. Strikter JSON-Output (System-Prompt erzwingt das Format).
 *   2. Quelle muss von einer Hersteller-Domain stammen
 *      (gopro.com, dji.com, insta360.com, …).
 *   3. Version muss einem typischen Firmware-Pattern entsprechen
 *      (`\d+\.\d+`).
 *   4. Bei Unsicherheit gibt Claude `version: null` zurück → wir werfen
 *      → Status bleibt 'error' (kein Fake-Eintrag).
 */

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Du recherchierst die aktuell vom Hersteller veröffentlichte Firmware-Version für eine konkrete Action-/360°-Kamera. Nutze das web_search-Tool und suche AUSSCHLIESSLICH auf der offiziellen Hersteller-Webseite (z.B. gopro.com, dji.com, insta360.com, sony.com, ricoh.com). Forum-Posts, Reviews, YouTube oder Reddit sind KEINE verlässlichen Quellen.

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt in dieser Form (kein Markdown, kein Fließtext drumherum):

{
  "version": "string oder null",
  "source_url": "string oder null",
  "release_date": "YYYY-MM-DD oder null"
}

Regeln:
- "version" MUSS eine typische Firmware-Versionsnummer sein (z.B. "v01.00", "2.10", "H24.01.02.32.00"). Niemals nur "1" oder "neu".
- "source_url" MUSS auf eine offizielle Hersteller-Domain zeigen.
- Wenn du keine sichere Antwort findest oder unsicher bist: setze ALLE drei Felder auf null. Lieber kein Ergebnis als ein falsches.
- "release_date" ist optional; setze auf null wenn nicht eindeutig.`;

async function loadApiKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .maybeSingle();
  const settings = data?.value
    ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)
    : null;
  const key = (settings as { anthropic_api_key?: string })?.anthropic_api_key;
  if (!key) {
    throw new Error(
      'Anthropic API-Key nicht konfiguriert (admin_settings.blog_settings.anthropic_api_key) — Claude-Fallback kann nicht laufen',
    );
  }
  return key;
}

interface ClaudeFirmwareResponse {
  version: string | null;
  source_url: string | null;
  release_date: string | null;
}

const ALLOWED_HOSTS = [
  'gopro.com',
  'dji.com',
  'insta360.com',
  'sony.com',
  'sony.de',
  'sony.net',
  'ricoh.com',
  'ricoh-imaging.com',
  'akaso.net',
  'akasotech.com',
];

function isAllowedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith('.' + domain));
  } catch {
    return false;
  }
}

function looksLikeFirmwareVersion(v: string): boolean {
  // Mindestens ein Pattern `\d+\.\d+` (z.B. "2.10", "v1.0.2", "H24.01.02.32.00")
  return /\d+\.\d+/.test(v) && v.trim().length >= 3 && v.trim().length <= 40;
}

function extractJsonFromText(text: string): ClaudeFirmwareResponse | null {
  // Claude bettet das JSON manchmal in Markdown ein — robust extrahieren.
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      return {
        version: typeof obj.version === 'string' ? obj.version : null,
        source_url: typeof obj.source_url === 'string' ? obj.source_url : null,
        release_date: typeof obj.release_date === 'string' ? obj.release_date : null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export const claudeAdapter: FirmwareAdapter = {
  brand: 'Claude-Fallback',
  supports(): boolean {
    return true; // marken-agnostisch
  },
  async fetchLatest(model: string): Promise<FirmwareInfo> {
    const apiKey = await loadApiKey();
    const client = new Anthropic({ apiKey, maxRetries: 2 });

    const userPrompt = `Welche aktuelle Firmware-Version hat die Kamera "${model}"? Suche auf der offiziellen Hersteller-Webseite und gib das Ergebnis als JSON zurück.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
        } as unknown as Anthropic.Messages.ToolUnion,
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Letzten Text-Block extrahieren (nach evtl. Tool-Calls).
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (textBlocks.length === 0) {
      throw new Error('Claude-Antwort enthielt keinen Text-Block (nur Tool-Calls?)');
    }
    const fullText = textBlocks.map((b) => b.text).join('\n').trim();

    const parsed = extractJsonFromText(fullText);
    if (!parsed) {
      throw new Error(
        'Claude-Antwort konnte nicht als JSON gelesen werden — Rohtext: ' + fullText.slice(0, 200),
      );
    }
    if (!parsed.version) {
      throw new Error(
        'Claude konnte keine verlässliche Firmware-Version finden (Modell unbekannt oder Hersteller-Seite unklar)',
      );
    }
    if (!looksLikeFirmwareVersion(parsed.version)) {
      throw new Error(
        `Claude lieferte einen unplausiblen Versions-String: "${parsed.version}" — verworfen`,
      );
    }
    if (!parsed.source_url || !isAllowedHost(parsed.source_url)) {
      throw new Error(
        `Claude-Quelle nicht von Hersteller-Domain (${parsed.source_url ?? 'leer'}) — verworfen, um Halluzinationen zu vermeiden`,
      );
    }

    const releaseDate =
      parsed.release_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.release_date)
        ? parsed.release_date
        : undefined;

    return {
      version: parsed.version.trim(),
      sourceUrl: parsed.source_url,
      releaseDate,
    };
  },
};
