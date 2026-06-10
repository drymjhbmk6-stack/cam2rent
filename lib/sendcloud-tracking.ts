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
  /** Sendcloud-Retoure-Parcel (is_return) → Rückversand */
  isReturn?: boolean;
  /** true = aus Cache, sonst frisch von Sendcloud */
  cached?: boolean;
}

// Kurzlebiger In-Memory-Cache, damit ein Seiten-Reload nicht erneut N
// Sendcloud-Calls ausloest. TTL 3 Minuten.
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<number, { ts: number; data: ParcelStatus }>();

function categorize(message: string, statusId: number | null): TrackingCategory {
  const m = (message || '').toLowerCase();
  if (!m || m === 'unbekannt') return 'unknown';

  // Sendcloud-Status-IDs (deterministisch, falls bekannt): 11 = Delivered.
  if (statusId === 11) return 'delivered';

  // Probleme zuerst (Meldungen enthalten teils "deliver"/"return").
  if (/fail|error|cancel|refus|problem|exception|not collected|undeliver|lost|returned to sender|return to sender|delivery attempt failed|customs|address (issue|problem|invalid)|delayed|on hold|held|rejected/.test(m)) {
    return 'problem';
  }
  // Zugestellt / beim Kunden / im Shop abholbereit.
  if (/delivered|zugestellt|abgeholt|collected by customer|picked up by customer|available for pickup|ready for pickup|at pickup point|delivered to service point|successfully delivered|delivery successful/.test(m)) {
    return 'delivered';
  }
  // Unterwegs im Carrier-Netz.
  if (/transit|en route|unterwegs|sorting|sorted|hub|depot|out for delivery|in delivery|being delivered|driver|handed to|received by carrier|carrier accepted|on its way|on the way|underway|scanned|processed|parcel center|paketzentrum|transported|forwarded|loaded|arrived|departed|has left|left the|distribution|picked up|collected|shipped/.test(m)) {
    return 'transit';
  }
  // Angekuendigt / Daten erfasst / Label erstellt / Versandart geaendert.
  if (/announced|angekuendigt|ready to send|versandbereit|registered|data received|pre-advice|preadvice|information received|shipment information|label|created|accepted|method changed|order processed|awaiting|en attente|pending/.test(m)) {
    return 'announced';
  }
  return 'unknown';
}

interface SendcloudParcel {
  id?: number;
  status?: { id?: number; message?: string };
  carrier?: { code?: string };
  tracking_number?: string;
  tracking_url?: string;
  is_return?: boolean;
}

function mapParcel(p: SendcloudParcel, fallbackId: number): ParcelStatus {
  const rawMessage: string = p.status?.message ?? 'Unbekannt';
  const statusId: number | null = typeof p.status?.id === 'number' ? p.status.id : null;
  return {
    parcelId: typeof p.id === 'number' ? p.id : fallbackId,
    statusId,
    // Kategorie auf dem englischen Originaltext bestimmen, Anzeige uebersetzen.
    statusMessage: translateStatus(rawMessage),
    category: categorize(rawMessage, statusId),
    carrier: p.carrier?.code ?? null,
    trackingNumber: p.tracking_number ?? null,
    trackingUrl: p.tracking_url ?? null,
    isReturn: !!p.is_return,
  };
}

async function getAuth(): Promise<string | null> {
  try {
    const { publicKey, secretKey } = await getSendcloudKeys();
    if (!publicKey || !secretKey) return null;
    return 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
  } catch {
    return null;
  }
}

async function fetchOne(parcelId: number, auth: string): Promise<ParcelStatus> {
  const res = await fetch(`${SC_BASE}/parcels/${parcelId}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    throw new Error(`Sendcloud ${res.status}`);
  }
  const data = await res.json();
  return mapParcel(data.parcel ?? {}, parcelId);
}

async function fetchByTracking(trackingNumber: string, auth: string): Promise<ParcelStatus | null> {
  const res = await fetch(`${SC_BASE}/parcels?tracking_number=${encodeURIComponent(trackingNumber)}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    throw new Error(`Sendcloud ${res.status}`);
  }
  const data = await res.json();
  const parcels: SendcloudParcel[] = Array.isArray(data.parcels) ? data.parcels : [];
  if (parcels.length === 0) return null;
  // Bei mehreren Treffern (z.B. Hin + Retoure teilen sich selten eine Nummer)
  // den juengsten nehmen — Sendcloud liefert i.d.R. den passendsten zuerst.
  return mapParcel(parcels[0], 0);
}

// Sendcloud-/Carrier-Statusmeldungen ins Deutsche uebersetzen. Exakte Treffer
// zuerst (case-insensitive), dann Teilstring-Regeln, sonst Originaltext.
const STATUS_DE_EXACT: Record<string, string> = {
  'ready to send': 'Versandbereit',
  'being announced': 'Wird angekündigt',
  'announced': 'Angekündigt',
  'announcement failed': 'Anmeldung fehlgeschlagen',
  'submitting data': 'Daten werden übermittelt',
  'data received': 'Versanddaten erfasst',
  'shipment information received': 'Versanddaten erfasst',
  'registered': 'Registriert',
  'no label': 'Kein Etikett',
  'delivery method changed': 'Zustellart geändert',
  'en route': 'Unterwegs',
  'parcel en route': 'Unterwegs',
  'on its way': 'Unterwegs',
  'in transit': 'Unterwegs',
  'shipment picked up by driver': 'Vom Fahrer abgeholt',
  'shipment collected by carrier': 'Vom Versanddienstleister abgeholt',
  'handed to carrier': 'An Versanddienstleister übergeben',
  'at sorting centre': 'Im Sortierzentrum',
  'at sorting center': 'Im Sortierzentrum',
  'being sorted': 'Wird sortiert',
  'sorted': 'Sortiert',
  'out for delivery': 'In Zustellung',
  'delivered': 'Zugestellt',
  'delivery attempt failed': 'Zustellversuch fehlgeschlagen',
  'available for pickup': 'Abholbereit',
  'ready for pickup': 'Abholbereit',
  'at pickup point': 'Im Paketshop',
  'delivered to service point': 'An Paketshop zugestellt',
  'awaiting customer pickup': 'Wartet auf Abholung',
  'cancelled': 'Storniert',
  'cancellation requested': 'Stornierung angefragt',
  'refused by recipient': 'Vom Empfänger abgelehnt',
  'returned to sender': 'An Absender zurückgesendet',
  'address invalid': 'Adresse ungültig',
  'customs': 'Im Zoll',
  'delayed': 'Verzögert',
  'unknown': 'Unbekannt',
  'unknown status': 'Unbekannt',
};

const STATUS_DE_PARTIAL: [RegExp, string][] = [
  [/delivery method changed/i, 'Zustellart geändert'],
  [/out for delivery/i, 'In Zustellung'],
  [/delivery attempt/i, 'Zustellversuch fehlgeschlagen'],
  [/available for pickup|ready for pickup/i, 'Abholbereit'],
  [/pickup point|service point/i, 'Im Paketshop'],
  [/delivered/i, 'Zugestellt'],
  [/returned to sender|return to sender/i, 'An Absender zurückgesendet'],
  [/refused/i, 'Vom Empfänger abgelehnt'],
  [/customs/i, 'Im Zoll'],
  [/delay/i, 'Verzögert'],
  [/sorting|sorted/i, 'Im Sortierzentrum'],
  [/en route|in transit|on its way/i, 'Unterwegs'],
  [/picked up|collected/i, 'Abgeholt'],
  [/announced/i, 'Angekündigt'],
  [/ready to send/i, 'Versandbereit'],
  [/cancel/i, 'Storniert'],
  [/fail|error/i, 'Fehler'],
];

export function translateStatus(message: string): string {
  const raw = (message || '').trim();
  if (!raw) return 'Unbekannt';
  const exact = STATUS_DE_EXACT[raw.toLowerCase()];
  if (exact) return exact;
  for (const [re, de] of STATUS_DE_PARTIAL) {
    if (re.test(raw)) return de;
  }
  return raw; // Fallback: unbekannte Meldung im Original zeigen.
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

  const auth = await getAuth();
  if (!auth) {
    // Keine Keys konfiguriert → Status unbekannt, kein harter Fehler.
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

const trackingCache = new Map<string, { ts: number; data: ParcelStatus }>();

/**
 * Wie fetchParcelStatuses, aber per Trackingnummer — fuer Sendungen, deren
 * Sendcloud-Parcel-ID wir nicht gespeichert haben (z.B. Retourlabels, die direkt
 * im Sendcloud-Panel erstellt wurden). Sendcloud liefert das Parcel via
 * `GET /parcels?tracking_number=...`. Liefert Map trackingNumber → Status.
 */
export async function fetchParcelStatusesByTracking(
  trackingNumbers: string[],
): Promise<Map<string, ParcelStatus | null>> {
  const result = new Map<string, ParcelStatus | null>();
  const unique = [...new Set(trackingNumbers.map((t) => (t || '').trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const now = Date.now();
  const toFetch: string[] = [];
  for (const tn of unique) {
    const c = trackingCache.get(tn);
    if (c && now - c.ts < CACHE_TTL_MS) result.set(tn, { ...c.data, cached: true });
    else toFetch.push(tn);
  }
  if (toFetch.length === 0) return result;

  const auth = await getAuth();
  if (!auth) {
    for (const tn of toFetch) result.set(tn, null);
    return result;
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((tn) => fetchByTracking(tn, auth)));
    settled.forEach((s, idx) => {
      const tn = chunk[idx];
      if (s.status === 'fulfilled' && s.value) {
        trackingCache.set(tn, { ts: Date.now(), data: s.value });
        result.set(tn, s.value);
      } else {
        result.set(tn, null);
      }
    });
  }
  return result;
}

async function fetchByOrderNumber(orderNumber: string, auth: string): Promise<ParcelStatus[]> {
  const res = await fetch(`${SC_BASE}/parcels?order_number=${encodeURIComponent(orderNumber)}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`Sendcloud ${res.status}`);
  const data = await res.json();
  const parcels: SendcloudParcel[] = Array.isArray(data.parcels) ? data.parcels : [];
  return parcels.map((p) => mapParcel(p, 0));
}

const orderCache = new Map<string, { ts: number; data: ParcelStatus[] }>();

/**
 * Holt ALLE Sendcloud-Parcels pro Bestellnummer (`order_number`) — also Hin-
 * UND Rückversand, auch Retourlabels, die direkt im Sendcloud-Panel erstellt
 * wurden (die kennen wir in der DB nicht, aber Sendcloud setzt die
 * Bestellnummer). Liefert Map orderNumber → ParcelStatus[]. Bei fehlenden Keys
 * / Fehlern → leere Map (Aufrufer faellt auf DB-Daten zurueck).
 */
export async function fetchParcelsByOrderNumber(
  orderNumbers: string[],
): Promise<Map<string, ParcelStatus[]>> {
  const result = new Map<string, ParcelStatus[]>();
  const unique = [...new Set(orderNumbers.map((o) => (o || '').trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const now = Date.now();
  const toFetch: string[] = [];
  for (const on of unique) {
    const c = orderCache.get(on);
    if (c && now - c.ts < CACHE_TTL_MS) result.set(on, c.data);
    else toFetch.push(on);
  }
  if (toFetch.length === 0) return result;

  const auth = await getAuth();
  if (!auth) return result; // keine Keys → Aufrufer nutzt DB-Fallback

  const CONCURRENCY = 6;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((on) => fetchByOrderNumber(on, auth)));
    settled.forEach((s, idx) => {
      const on = chunk[idx];
      if (s.status === 'fulfilled') {
        orderCache.set(on, { ts: Date.now(), data: s.value });
        result.set(on, s.value);
      }
      // Fehler: nicht eintragen → DB-Fallback greift
    });
  }
  return result;
}
