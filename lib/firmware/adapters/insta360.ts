import type { FirmwareAdapter, FirmwareInfo } from '../types';

/**
 * Insta360-Firmware-Adapter.
 *
 * Insta360 hat ebenfalls keine öffentliche JSON-API. Wir scrapen die
 * jeweilige Download-Seite und greppen nach dem ersten Versions-Pattern.
 * Erweiterungen ins `MODEL_REGISTRY`.
 */

const MODEL_REGISTRY: Record<string, { url: string; label: string }> = {
  x4: { url: 'https://www.insta360.com/de/download/insta360-x4', label: 'X4' },
  x3: { url: 'https://www.insta360.com/de/download/insta360-x3', label: 'X3' },
  oners: { url: 'https://www.insta360.com/de/download/insta360-oners', label: 'ONE RS' },
  onex2: { url: 'https://www.insta360.com/de/download/insta360-onex2', label: 'ONE X2' },
  acepro: { url: 'https://www.insta360.com/de/download/insta360-ace-pro', label: 'Ace Pro' },
  ace: { url: 'https://www.insta360.com/de/download/insta360-ace', label: 'Ace' },
  go3s: { url: 'https://www.insta360.com/de/download/insta360-go-3s', label: 'GO 3S' },
  go3: { url: 'https://www.insta360.com/de/download/insta360-go-3', label: 'GO 3' },
};

function normalize(model: string): string {
  return model
    .toLowerCase()
    .replace(/insta360/g, '')
    .replace(/[\s\-_]/g, '')
    .trim();
}

function lookup(model: string): { url: string; label: string } | null {
  return MODEL_REGISTRY[normalize(model)] ?? null;
}

const VERSION_RE = /(?:firmware|version|v)\s*[:\-]?\s*v?(\d{1,2}(?:[._]\d{1,3}){1,4})/i;
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

async function fetchFromDownloadPage(url: string): Promise<FirmwareInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        'user-agent':
          'Mozilla/5.0 (compatible; cam2rent-firmware-check/1.0; +https://cam2rent.de)',
      },
    });
    if (!res.ok) {
      throw new Error(`Insta360-Downloadseite antwortete mit HTTP ${res.status} (${url})`);
    }
    const html = await res.text();
    const match = VERSION_RE.exec(html);
    if (!match) {
      throw new Error(
        'Kein Versions-Pattern auf der Insta360-Downloadseite gefunden — Markup hat sich vermutlich geändert',
      );
    }
    const version = match[1].replace(/_/g, '.');
    const dateMatch = ISO_DATE_RE.exec(html.slice(match.index, match.index + 800));
    const releaseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : undefined;
    return { version, sourceUrl: url, releaseDate };
  } finally {
    clearTimeout(timeout);
  }
}

export const insta360Adapter: FirmwareAdapter = {
  brand: 'Insta360',
  supports(model: string): boolean {
    return lookup(model) !== null;
  },
  async fetchLatest(model: string): Promise<FirmwareInfo> {
    const entry = lookup(model);
    if (!entry) {
      throw new Error(
        `Insta360-Modell "${model}" ist im Adapter-Registry nicht hinterlegt — ` +
          `bekannte Modelle: ${Object.values(MODEL_REGISTRY).map((m) => m.label).join(', ')}`,
      );
    }
    return fetchFromDownloadPage(entry.url);
  },
};
