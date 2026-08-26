/**
 * Unvollstaendige Rueckgabe: nicht zurueckgegebene Positionen einer Buchung.
 *
 * Wenn bei der Rueckgabe-Pruefung (`/admin/retouren/[id]/pruefen`) etwas fehlt,
 * entscheidet der Admin pro Position:
 *   'replace'   — Kunde ersetzt und zahlt den Wiederbeschaffungswert
 *   'follow_up' — Kunde bringt/schickt es nach (mit Frist)
 *
 * Diese Lib ist die EINE Wahrheitsquelle fuer Sanitizing, Persistenz und
 * Abfrage. Alle Funktionen sind defensiv: fehlt die Migration
 * (`supabase/supabase-return-open-items.sql`), laufen sie ins Leere statt zu
 * werfen — der Rueckgabe-Flow darf daran NIE scheitern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OpenItemKind = 'camera' | 'accessory';
export type OpenItemResolution = 'replace' | 'follow_up';
export type OpenItemStatus = 'open' | 'received' | 'charged' | 'waived';

export const OPEN_ITEM_RESOLUTIONS: OpenItemResolution[] = ['replace', 'follow_up'];
export const OPEN_ITEM_STATUSES: OpenItemStatus[] = ['open', 'received', 'charged', 'waived'];

/** Vom Client gemeldete Auflösung einer offenen Position. */
export interface OpenItemInput {
  kind: OpenItemKind;
  accessoryId?: string | null;
  productId?: string | null;
  label: string;
  qty: number;
  resolution: OpenItemResolution;
  /** Wiederbeschaffungswert pro Stueck — nur bei 'replace' relevant. */
  unitValue?: number | null;
  /** Frist YYYY-MM-DD — nur bei 'follow_up' relevant. */
  dueDate?: string | null;
}

/** Persistierte Zeile (Ausschnitt, den die UI braucht). */
export interface OpenItemRow {
  id: string;
  booking_id: string;
  kind: OpenItemKind;
  accessory_id: string | null;
  product_id: string | null;
  label: string;
  qty: number;
  resolution: OpenItemResolution;
  unit_value: number | null;
  total_value: number | null;
  due_date: string | null;
  status: OpenItemStatus;
  accessory_unit_ids: string[];
  sale_booking_id: string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

const MAX_ITEMS = 50;
const MAX_QTY = 999;
const MAX_LABEL = 200;
const MAX_VALUE = 100_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Erkennt eine fehlende Tabelle. PostgREST meldet einen Schema-Cache-Miss als
 * `PGRST205`, PostgreSQL selbst `42P01` — beide muessen abgefangen werden
 * (gleiches Muster wie `lib/buchhaltung/asset-auto-generator.ts`).
 */
export function isMissingOpenItemsTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = String(error.message ?? '');
  return /booking_return_open_items/i.test(msg)
    && /(does not exist|schema cache|could not find)/i.test(msg);
}

/**
 * Saeubert die vom Client gemeldeten Positionen.
 *
 * `caps` deckelt die Menge pro Position auf das, was die Buchung ueberhaupt
 * enthaelt (Key: `accessory:<id>` bzw. `camera:<lowercase name>`) — ein
 * manipulierter Client kann so keine Fantasie-Mengen als „fehlend" melden.
 * Ohne passenden Cap-Eintrag greift nur der harte MAX_QTY-Deckel.
 */
export function sanitizeOpenItems(
  raw: unknown,
  caps?: Map<string, number>,
): OpenItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenItemInput[] = [];

  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;

    const kind: OpenItemKind = o.kind === 'camera' ? 'camera' : 'accessory';
    const resolution = String(o.resolution ?? '');
    if (!OPEN_ITEM_RESOLUTIONS.includes(resolution as OpenItemResolution)) continue;

    const label = String(o.label ?? '').trim().slice(0, MAX_LABEL);
    if (!label) continue;

    const accessoryId = kind === 'accessory'
      ? (String(o.accessoryId ?? '').trim().slice(0, 200) || null)
      : null;
    const productId = kind === 'camera'
      ? (String(o.productId ?? '').trim().slice(0, 200) || null)
      : null;

    // Menge: mindestens 1, gegen den echten Buchungsbestand gedeckelt.
    let qty = Math.floor(Number(o.qty));
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    const capKey = kind === 'accessory'
      ? `accessory:${accessoryId ?? ''}`
      : `camera:${label.toLowerCase()}`;
    const cap = caps?.get(capKey);
    if (typeof cap === 'number' && cap >= 0) qty = Math.min(qty, cap);
    qty = Math.min(qty, MAX_QTY);
    if (qty < 1) continue;

    // Betrag nur bei 'replace'; nie negativ.
    let unitValue: number | null = null;
    if (resolution === 'replace') {
      const v = Number(o.unitValue);
      unitValue = Number.isFinite(v)
        ? Math.round(Math.min(Math.max(v, 0), MAX_VALUE) * 100) / 100
        : 0;
    }

    // Frist nur bei 'follow_up'; nur echtes YYYY-MM-DD.
    let dueDate: string | null = null;
    if (resolution === 'follow_up') {
      const d = String(o.dueDate ?? '').slice(0, 10);
      if (DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))) dueDate = d;
    }

    out.push({
      kind, accessoryId, productId, label, qty,
      resolution: resolution as OpenItemResolution,
      unitValue, dueDate,
    });
  }

  return out;
}

/** Gesamtsumme der Ersatzforderung ueber alle 'replace'-Positionen. */
export function totalReplacementValue(items: OpenItemInput[]): number {
  const sum = items
    .filter((it) => it.resolution === 'replace')
    .reduce((s, it) => s + (it.unitValue ?? 0) * it.qty, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Schreibt die offenen Positionen. `unitIdsByItem` ordnet jeder Position die
 * konkreten `accessory_units`-IDs zu (Index-gleich zu `items`).
 *
 * Gibt die angelegten Zeilen zurueck; bei fehlender Migration ein leeres
 * Ergebnis mit `migrationPending: true` (kein Wurf).
 */
export async function persistOpenItems(
  supabase: SupabaseClient,
  bookingId: string,
  items: OpenItemInput[],
  unitIdsByItem?: string[][],
): Promise<{ rows: OpenItemRow[]; migrationPending: boolean; error?: string }> {
  if (items.length === 0) return { rows: [], migrationPending: false };

  const payload = items.map((it, i) => ({
    booking_id: bookingId,
    kind: it.kind,
    accessory_id: it.accessoryId ?? null,
    product_id: it.productId ?? null,
    label: it.label,
    qty: it.qty,
    resolution: it.resolution,
    unit_value: it.resolution === 'replace' ? (it.unitValue ?? 0) : null,
    total_value: it.resolution === 'replace'
      ? Math.round((it.unitValue ?? 0) * it.qty * 100) / 100
      : null,
    due_date: it.resolution === 'follow_up' ? it.dueDate : null,
    status: 'open' as const,
    accessory_unit_ids: unitIdsByItem?.[i] ?? [],
  }));

  const { data, error } = await supabase
    .from('booking_return_open_items')
    .insert(payload)
    .select('*');

  if (error) {
    if (isMissingOpenItemsTable(error)) return { rows: [], migrationPending: true };
    console.error('[return-open-items] insert failed:', error);
    return { rows: [], migrationPending: false, error: error.message };
  }

  return { rows: (data ?? []) as OpenItemRow[], migrationPending: false };
}

/**
 * Laedt offene Positionen. Ohne `status` werden nur `open`-Zeilen geliefert;
 * `status: 'all'` liefert alle. Defensiv → leere Liste + migrationPending.
 */
export async function loadOpenItems(
  supabase: SupabaseClient,
  opts: { bookingIds?: string[]; status?: OpenItemStatus | 'all'; limit?: number } = {},
): Promise<{ rows: OpenItemRow[]; migrationPending: boolean }> {
  // Leere ID-Liste = nichts zu laden (ein `.in()` mit [] liefert ohnehin nichts,
  // spart aber den Roundtrip).
  if (opts.bookingIds && opts.bookingIds.length === 0) {
    return { rows: [], migrationPending: false };
  }

  let q = supabase
    .from('booking_return_open_items')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 300, 1), 1000));

  if (opts.bookingIds) q = q.in('booking_id', opts.bookingIds);
  if (opts.status !== 'all') q = q.eq('status', opts.status ?? 'open');

  const { data, error } = await q;
  if (error) {
    if (isMissingOpenItemsTable(error)) return { rows: [], migrationPending: true };
    console.error('[return-open-items] load failed:', error);
    return { rows: [], migrationPending: false };
  }
  return { rows: (data ?? []) as OpenItemRow[], migrationPending: false };
}

/**
 * Verteilt die `accessory_unit_ids` einer Buchung auf die offenen Positionen.
 *
 * Pro Zubehoer-Position werden bis zu `qty` Exemplare beansprucht; der Rest
 * bleibt uebrig und wird vom Aufrufer regulaer freigegeben.
 */
export function splitAccessoryUnitIds(
  items: OpenItemInput[],
  bookingUnitIds: string[],
  unitToAccessory: Map<string, string>,
): { perItem: string[][]; releasable: string[] } {
  const claimed = new Set<string>();
  const perItem: string[][] = items.map((it) => {
    if (it.kind !== 'accessory' || !it.accessoryId) return [];
    const mine: string[] = [];
    for (const uid of bookingUnitIds) {
      if (mine.length >= it.qty) break;
      if (claimed.has(uid)) continue;
      if (unitToAccessory.get(uid) !== it.accessoryId) continue;
      mine.push(uid);
      claimed.add(uid);
    }
    return mine;
  });
  return { perItem, releasable: bookingUnitIds.filter((uid) => !claimed.has(uid)) };
}
