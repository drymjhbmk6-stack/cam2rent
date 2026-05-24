import type { FirmwareAdapter, FirmwareInfo } from '../types';

/**
 * GoPro-Firmware-Adapter.
 *
 * Quelle: die öffentliche GoPro-Update-Catalog-API
 * (`https://api.gopro.com/firmware/v2/catalog?...`). Wird auch von der
 * Quik-Mobile-App benutzt und liefert eine JSON-Antwort.
 *
 * **Wichtig:** Hartcodierte Hersteller-Endpunkte sind per Definition fragil.
 * Wenn GoPro die API umbaut, fallen alle Modelle auf `status='error'` —
 * dann muss das `MODEL_REGISTRY` unten + ggf. die Parse-Logik angepasst
 * werden. In der Admin-UI ist die Fehlermeldung sichtbar.
 *
 * Modellnamen kommen direkt aus `admin_config.products[].model` (oder
 * Fallback `name`). Die Erkennung ist case-insensitiv + normalisiert
 * (Leerzeichen + Bindestriche raus), damit „Hero 13 Black", „Hero13Black"
 * und „HERO13 BLACK" alle dasselbe Mapping treffen.
 */

const MODEL_REGISTRY: Record<string, { device: string; label: string }> = {
  // Format: normalisierter Modellname → GoPro-API-Device-ID
  hero13black: { device: 'H24Black', label: 'HERO13 Black' },
  hero12black: { device: 'H23Black', label: 'HERO12 Black' },
  hero11black: { device: 'H22Black', label: 'HERO11 Black' },
  hero11blackmini: { device: 'H22BlackMini', label: 'HERO11 Black Mini' },
  hero10black: { device: 'H21Black', label: 'HERO10 Black' },
  hero9black: { device: 'HD9Black', label: 'HERO9 Black' },
  max: { device: 'Fusion2', label: 'MAX' },
};

function normalize(model: string): string {
  return model
    .toLowerCase()
    .replace(/gopro/g, '')
    .replace(/[\s\-_]/g, '')
    .trim();
}

function lookup(model: string): { device: string; label: string } | null {
  return MODEL_REGISTRY[normalize(model)] ?? null;
}

const ENDPOINT = 'https://api.gopro.com/firmware/v2/catalog';

async function fetchFromCatalog(device: string): Promise<FirmwareInfo> {
  const url = `${ENDPOINT}?os=ufd-ble&device=${encodeURIComponent(device)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'cam2rent-firmware-check/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`GoPro-API antwortete mit HTTP ${res.status} (${url})`);
    }
    const json: unknown = await res.json();
    return parseCatalogResponse(json, url);
  } finally {
    clearTimeout(timeout);
  }
}

function parseCatalogResponse(json: unknown, url: string): FirmwareInfo {
  // GoPro-Catalog liefert i.d.R. eine geschachtelte Struktur:
  //   { "version": 1, "firmware": [{ "version": "H24.01.02.32.00", ... }] }
  // wobei `version: 1` die **Schema-Version** der API ist (nicht die
  // Firmware). Wir akzeptieren NUR Werte, die dem GoPro-Versionsformat
  // entsprechen — `HXX.YY.ZZ.WW.VV` (oder andere Bauarten mit Punkten).
  if (!json || typeof json !== 'object') {
    throw new Error('GoPro-API-Antwort ist kein JSON-Objekt');
  }
  const obj = json as Record<string, unknown>;

  // GoPro-Versions-Pattern: beginnt mit H + 2 Ziffern (Modell-Generation)
  // und enthält mindestens 4 punktgetrennte Segmente.
  const looksLikeFirmware = (v: unknown): v is string =>
    typeof v === 'string' && /^H\d{2}(?:\.\d{1,3}){3,}/i.test(v);

  // Wenn das Top-Level-`version` schon ein echter Firmware-String ist (alte API-Variante)
  if (looksLikeFirmware(obj.version)) {
    const releaseDate = typeof obj.releaseDate === 'string' ? obj.releaseDate.slice(0, 10) : undefined;
    return { version: obj.version as string, sourceUrl: url, releaseDate };
  }

  // Verschachtelter Array-Pfad `firmware[0].version`
  const firmwareArr = Array.isArray(obj.firmware) ? obj.firmware : null;
  if (firmwareArr && firmwareArr.length > 0) {
    const first = firmwareArr[0] as Record<string, unknown>;
    if (looksLikeFirmware(first.version)) {
      const d = typeof first.releaseDate === 'string' ? first.releaseDate.slice(0, 10) : undefined;
      return { version: first.version as string, sourceUrl: url, releaseDate: d };
    }
  }

  // Letzter Versuch: irgendwo im JSON ein Firmware-Pattern finden.
  const flat = JSON.stringify(obj);
  const match = /H\d{2}(?:\.\d{1,3}){3,}/i.exec(flat);
  if (match) {
    return { version: match[0], sourceUrl: url };
  }

  throw new Error(
    'Konnte keine GoPro-Firmware-Version (Format HXX.YY.ZZ.WW.…) in der API-Antwort finden — Endpunkt-Schema hat sich vermutlich geändert',
  );
}

export const goproAdapter: FirmwareAdapter = {
  brand: 'GoPro',
  supports(model: string): boolean {
    return lookup(model) !== null;
  },
  async fetchLatest(model: string): Promise<FirmwareInfo> {
    const entry = lookup(model);
    if (!entry) {
      throw new Error(
        `GoPro-Modell "${model}" ist im Adapter-Registry nicht hinterlegt — ` +
          `bekannte Modelle: ${Object.values(MODEL_REGISTRY).map((m) => m.label).join(', ')}`,
      );
    }
    return fetchFromCatalog(entry.device);
  },
};
