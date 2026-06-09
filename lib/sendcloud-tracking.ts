import { getSendcloudKeys } from '@/lib/env-mode';

/**
 * Live-Sendungsstatus von Sendcloud (DHL/DPD-Pakete, die ueber Sendcloud
 * gelabelt wurden). Wir speichern pro Buchung `sendcloud_parcel_id` (Hinversand)
 * und `sendcloud_return_parcel_id` (Retoure) — darueber holen wir den aktuellen
 * Status direkt aus Sendcloud, das den Paketlauf der Carrier ohnehin trackt.
 */

const SC_BASE = 'https://panel.sendcloud.sc/api/v2';

export type TrackingCategory = 'delivered' | 'transit' | 'announced' | 'problem' | 'unknown';

export interface ParcelStatus {
  parcelId: number;
  statusId: number | null;
  statusMessage: string;
  category: TrackingCategory;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** true = aus Cache, sonst frisch von Sendcloud */
  cached?: boolean;
}

// Kurzlebiger In-Memory-Cache, damit ein Seiten-Reload nicht erneut N
// Sendcloud-Calls ausloest. TTL 3 Minuten.
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<number, { ts: number; data: ParcelStatus }>();

function categorize(message: string, statusId: number | null): TrackingCategory {
  const m = (message || '').toLowerCase();
  // Probleme zuerst (enthalten teils "deliver"/"return")
  if (/fail|error|cancel|refus|problem|exception|not collected|undeliver|lost|returned to sender|delivery attempt/.test(m)) {
    return 'problem';
  }
  if (/delivered|zugestellt|abgeholt|picked up by customer/.test(m)) return 'delivered';
  if (/transit|en route|unterwegs|sorting|hub|out for delivery|in zustellung|collected|scanned|driver|depot|shipped/.test(m)) {
    return 'transit';
  }
  if (/announced|ready to send|no label|created|angekuendigt|label/.test(m)) return 'announced';
  // Sendcloud-Status-IDs: 11 = Delivered, 1337 = ready to send, 3/4 = en route ...
  if (statusId === 11) return 'delivered';
  return 'unknown';
}

async function fetchOne(parcelId: number, auth: string): Promise<ParcelStatus> {
  const res = await fetch(`${SC_BASE}/parcels/${parcelId}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    throw new Error(`Sendcloud ${res.status}`);
  }
  const data = await res.json();
  const p = data.parcel ?? {};
  const statusMessage: string = p.status?.message ?? 'Unbekannt';
  const statusId: number | null = typeof p.status?.id === 'number' ? p.status.id : null;
  return {
    parcelId,
    statusId,
    statusMessage,
    category: categorize(statusMessage, statusId),
    carrier: p.carrier?.code ?? null,
    trackingNumber: p.tracking_number ?? null,
    trackingUrl: p.tracking_url ?? null,
  };
}

/**
 * Holt den Status mehrerer Parcels parallel (mit kleiner Concurrency-Grenze),
 * nutzt den Cache und fasst Fehler pro Parcel ab (eine fehlerhafte Sendung
 * blockiert die Liste nicht). Liefert eine Map parcelId → Status (oder null
 * bei Fehler/fehlenden Keys).
 */
export async function fetchParcelStatuses(
  parcelIds: number[],
): Promise<Map<number, ParcelStatus | null>> {
  const result = new Map<number, ParcelStatus | null>();
  const unique = [...new Set(parcelIds.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return result;

  // Cache-Treffer vorab
  const now = Date.now();
  const toFetch: number[] = [];
  for (const id of unique) {
    const c = cache.get(id);
    if (c && now - c.ts < CACHE_TTL_MS) {
      result.set(id, { ...c.data, cached: true });
    } else {
      toFetch.push(id);
    }
  }
  if (toFetch.length === 0) return result;

  let auth: string;
  try {
    const { publicKey, secretKey } = await getSendcloudKeys();
    if (!publicKey || !secretKey) {
      // Keine Keys konfiguriert → Status unbekannt, kein harter Fehler.
      for (const id of toFetch) result.set(id, null);
      return result;
    }
    auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
  } catch {
    for (const id of toFetch) result.set(id, null);
    return result;
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((id) => fetchOne(id, auth)));
    settled.forEach((s, idx) => {
      const id = chunk[idx];
      if (s.status === 'fulfilled') {
        cache.set(id, { ts: Date.now(), data: s.value });
        result.set(id, s.value);
      } else {
        result.set(id, null);
      }
    });
  }
  return result;
}
