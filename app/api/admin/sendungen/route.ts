import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import {
  fetchParcelStatuses,
  fetchParcelStatusesByTracking,
  fetchParcelsByOrderNumber,
  type TrackingCategory,
} from '@/lib/sendcloud-tracking';

/**
 * GET /api/admin/sendungen
 * Paketverfolgung: alle Versand-Sendungen mit Live-Status aus Sendcloud
 * (DHL/DPD). Primaerquelle ist Sendcloud selbst (Lookup pro Bestellnummer /
 * order_number) — so erscheinen auch Retourlabels, die direkt im Sendcloud-Panel
 * erstellt wurden und in unserer DB nicht hinterlegt sind. Faellt Sendcloud aus
 * (keine Keys/Fehler), greift der DB-Fallback aus den gespeicherten Tracking-Spalten.
 */

export interface SendungEntry {
  bookingId: string;
  customerName: string;
  productName: string;
  bookingStatus: string;
  rentalFrom: string;
  rentalTo: string;
  direction: 'outbound' | 'return';
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  parcelId: number | null;
  statusMessage: string | null;
  category: TrackingCategory;
}

type Row = Record<string, unknown>;

export async function GET() {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const fullCols =
    'id, customer_name, product_name, status, delivery_mode, rental_from, rental_to, ' +
    'tracking_number, tracking_url, tracking_carrier, sendcloud_parcel_id, ' +
    'return_tracking_number, return_tracking_url, return_tracking_carrier, sendcloud_return_parcel_id';

  // Versand-Buchungen der letzten Zeit (inkl. completed/returned, damit auch
  // Retouren abgeschlossener Mieten auftauchen, solange das Paket noch laeuft).
  const STATUSES = ['preparing_shipment', 'shipped', 'delivered', 'picked_up', 'returned', 'confirmed', 'completed'];
  const LIMIT = 80;

  let rows: Row[] | null = null;
  let errMsg: string | null = null;

  {
    const r = await supabase
      .from('bookings')
      .select(fullCols)
      .eq('delivery_mode', 'versand')
      .in('status', STATUSES)
      .order('rental_from', { ascending: false })
      .limit(LIMIT);
    rows = (r.data as Row[] | null) ?? null;
    errMsg = r.error?.message ?? null;
  }

  // Defensiv: Migration der return_tracking_*/tracking_carrier-Spalten evtl.
  // noch nicht durch → ohne diese Spalten erneut laden.
  if (errMsg && /tracking_carrier|return_tracking|sendcloud_return/i.test(errMsg)) {
    const r = await supabase
      .from('bookings')
      .select('id, customer_name, product_name, status, delivery_mode, rental_from, rental_to, tracking_number, tracking_url, sendcloud_parcel_id')
      .eq('delivery_mode', 'versand')
      .in('status', STATUSES)
      .order('rental_from', { ascending: false })
      .limit(LIMIT);
    rows = (r.data as Row[] | null) ?? null;
    errMsg = r.error?.message ?? null;
  }

  if (errMsg) {
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  const bookingRows = (rows ?? []) as Row[];
  const baseOf = (r: Row) => ({
    bookingId: String(r.id),
    customerName: String(r.customer_name ?? ''),
    productName: String(r.product_name ?? ''),
    bookingStatus: String(r.status ?? ''),
    rentalFrom: String(r.rental_from ?? ''),
    rentalTo: String(r.rental_to ?? ''),
  });

  // Primaer: Sendcloud pro Bestellnummer abfragen (findet auch Panel-Retouren).
  const orderMap = await fetchParcelsByOrderNumber(bookingRows.map((r) => String(r.id)));

  const entries: SendungEntry[] = [];
  const dbFallbackRows: Row[] = [];

  for (const r of bookingRows) {
    const parcels = orderMap.get(String(r.id));
    if (parcels && parcels.length > 0) {
      const base = baseOf(r);
      for (const p of parcels) {
        entries.push({
          ...base,
          direction: p.isReturn ? 'return' : 'outbound',
          carrier: p.carrier,
          trackingNumber: p.trackingNumber,
          trackingUrl: p.trackingUrl,
          parcelId: p.parcelId || null,
          statusMessage: p.statusMessage,
          category: p.category,
        });
      }
    } else {
      // Sendcloud lieferte nichts (kein Treffer / Keys fehlen / Fehler) → DB-Fallback.
      dbFallbackRows.push(r);
    }
  }

  // ── DB-Fallback: aus gespeicherten Tracking-Spalten Eintraege bauen ──
  const fallbackEntries: SendungEntry[] = [];
  const parcelIds: number[] = [];
  for (const r of dbFallbackRows) {
    const base = baseOf(r);
    const outParcel = r.sendcloud_parcel_id != null ? Number(r.sendcloud_parcel_id) : null;
    const outTracking = (r.tracking_number as string) ?? null;
    if (outParcel || outTracking) {
      if (outParcel) parcelIds.push(outParcel);
      fallbackEntries.push({
        ...base, direction: 'outbound', carrier: (r.tracking_carrier as string) ?? null,
        trackingNumber: outTracking, trackingUrl: (r.tracking_url as string) ?? null,
        parcelId: outParcel, statusMessage: null, category: 'unknown',
      });
    }
    const retParcel = r.sendcloud_return_parcel_id != null ? Number(r.sendcloud_return_parcel_id) : null;
    const retTracking = (r.return_tracking_number as string) ?? null;
    if (retParcel || retTracking) {
      if (retParcel) parcelIds.push(retParcel);
      fallbackEntries.push({
        ...base, direction: 'return', carrier: (r.return_tracking_carrier as string) ?? null,
        trackingNumber: retTracking, trackingUrl: (r.return_tracking_url as string) ?? null,
        parcelId: retParcel, statusMessage: null, category: 'unknown',
      });
    }
  }

  if (fallbackEntries.length > 0) {
    const trackingOnly = fallbackEntries
      .filter((e) => e.parcelId == null && e.trackingNumber)
      .map((e) => e.trackingNumber as string);
    const [statusMap, trackingMap] = await Promise.all([
      fetchParcelStatuses(parcelIds),
      fetchParcelStatusesByTracking(trackingOnly),
    ]);
    const applyStatus = (e: SendungEntry, s: ReturnType<typeof statusMap.get>) => {
      if (!s) return;
      e.statusMessage = s.statusMessage;
      e.category = s.category;
      if (s.parcelId) e.parcelId = s.parcelId;
      if (!e.carrier && s.carrier) e.carrier = s.carrier;
      if (!e.trackingNumber && s.trackingNumber) e.trackingNumber = s.trackingNumber;
      if (!e.trackingUrl && s.trackingUrl) e.trackingUrl = s.trackingUrl;
    };
    for (const e of fallbackEntries) {
      if (e.parcelId != null) applyStatus(e, statusMap.get(e.parcelId));
      else if (e.trackingNumber) applyStatus(e, trackingMap.get(e.trackingNumber));
    }
    entries.push(...fallbackEntries);
  }

  return NextResponse.json({ entries });
}
