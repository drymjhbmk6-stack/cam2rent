import type { FirmwareAdapter, FirmwareInfo } from '../types';

/**
 * DJI-Firmware-Adapter.
 *
 * DJI hat **keine** öffentliche JSON-API für Firmware-Stände. Stattdessen
 * pflegt DJI pro Produkt eine Downloads-Seite mit „Release Notes". Wir
 * holen das HTML und greppen nach dem ersten Version-Pattern in der
 * Antwort. Das ist fragil — wenn DJI das Markup ändert, fallen Modelle
 * auf `status='error'`. Im Admin-UI sichtbar; URL/Regex hier dann nachziehen.
 *
 * Modelle, die DJI pflegt + die wir vermieten: Osmo Action 4/5 Pro,
 * Osmo Pocket 3, Mic 2. Erweitern via `MODEL_REGISTRY`.
 */

const MODEL_REGISTRY: Record<string, { url: string; label: string }> = {
  osmoaction5pro: {
    url: 'https://www.dji.com/de/downloads/products/osmo-action-5-pro',
    label: 'Osmo Action 5 Pro',
  },
  osmoaction4: {
    url: 'https://www.dji.com/de/downloads/products/osmo-action-4',
    label: 'Osmo Action 4',
  },
  osmoaction3: {
    url: 'https://www.dji.com/de/downloads/products/osmo-action-3',
    label: 'Osmo Action 3',
  },
  osmopocket3: {
    url: 'https://www.dji.com/de/downloads/products/osmo-pocket-3',
    label: 'Osmo Pocket 3',
  },
  osmopocket: {
    url: 'https://www.dji.com/de/downloads/products/osmo-pocket',
    label: 'Osmo Pocket',
  },
};

function normalize(model: string): string {
  return model
    .toLowerCase()
    .replace(/dji/g, '')
    .replace(/[\s\-_]/g, '')
    .trim();
}

function lookup(model: string): { url: string; label: string } | null {
  return MODEL_REGISTRY[normalize(model)] ?? null;
}

// Sucht im DJI-HTML nach der ersten Versionsangabe der Form „v01.02.03"
// oder „Version 1.2.3" — gepaart mit einem optionalen Datum im Format
// „2025-04-15" oder „15. April 2025".
const VERSION_RE = /(?:firmware|version)[^a-z0-9]{0,8}v?(\d{1,2}(?:[._]\d{1,3}){1,4})/i;
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
      throw new Error(`DJI-Downloadseite antwortete mit HTTP ${res.status} (${url})`);
    }
    const html = await res.text();
    const match = VERSION_RE.exec(html);
    if (!match) {
      throw new Error(
        'Kein Versions-Pattern auf der DJI-Downloadseite gefunden — Markup hat sich vermutlich geändert',
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

export const djiAdapter: FirmwareAdapter = {
  brand: 'DJI',
  supports(model: string): boolean {
    return lookup(model) !== null;
  },
  async fetchLatest(model: string): Promise<FirmwareInfo> {
    const entry = lookup(model);
    if (!entry) {
      throw new Error(
        `DJI-Modell "${model}" ist im Adapter-Registry nicht hinterlegt — ` +
          `bekannte Modelle: ${Object.values(MODEL_REGISTRY).map((m) => m.label).join(', ')}`,
      );
    }
    return fetchFromDownloadPage(entry.url);
  },
};
