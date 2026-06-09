import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { fetchParcelStatuses, type TrackingCategory } from '@/lib/sendcloud-tracking';

/**
 * GET /api/admin/sendungen
 * Paketverfolgung: alle aktiven Versand-Buchungen mit Live-Status aus Sendcloud
 * (DHL/DPD). Hin- und Rueckversand werden als eigene Sendungs-Zeilen gelistet.
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

  // Aktive Versand-Buchungen mit Etikett (Hin oder Retoure).
  const STATUSES = ['preparing_shipment', 'shipped', 'delivered', 'picked_up', 'returned', 'confirmed'];

  type Row = Record<string, unknown>;
  let rows: Row[] | null = null;
  let errMsg: string | null = null;

  {
    const r = await supabase
      .from('bookings')
      .select(fullCols)
      .eq('delivery_mode', 'versand')
      .in('status', STATUSES)
      .order('rental_from', { ascending: false })
      .limit(150);
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
      .limit(150);
    rows = (r.data as Row[] | null) ?? null;
    errMsg = r.error?.message ?? null;
  }

  if (errMsg) {
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  const entries: SendungEntry[] = [];
  const parcelIds: number[] = [];

  for (const r of (rows ?? []) as Row[]) {
    const base = {
      bookingId: String(r.id),
      customerName: String(r.customer_name ?? ''),
      productName: String(r.product_name ?? ''),
      bookingStatus: String(r.status ?? ''),
      rentalFrom: String(r.rental_from ?? ''),
      rentalTo: String(r.rental_to ?? ''),
    };

    const outParcel = r.sendcloud_parcel_id != null ? Number(r.sendcloud_parcel_id) : null;
    const outTracking = (r.tracking_number as string) ?? null;
    if (outParcel || outTracking) {
      if (outParcel) parcelIds.push(outParcel);
      entries.push({
        ...base,
        direction: 'outbound',
        carrier: (r.tracking_carrier as string) ?? null,
        trackingNumber: outTracking,
        trackingUrl: (r.tracking_url as string) ?? null,
        parcelId: outParcel,
        statusMessage: null,
        category: 'unknown',
      });
    }

    const retParcel = r.sendcloud_return_parcel_id != null ? Number(r.sendcloud_return_parcel_id) : null;
    const retTracking = (r.return_tracking_number as string) ?? null;
    if (retParcel || retTracking) {
      if (retParcel) parcelIds.push(retParcel);
      entries.push({
        ...base,
        direction: 'return',
        carrier: (r.return_tracking_carrier as string) ?? null,
        trackingNumber: retTracking,
        trackingUrl: (r.return_tracking_url as string) ?? null,
        parcelId: retParcel,
        statusMessage: null,
        category: 'unknown',
      });
    }
  }

  // Live-Status fuer alle Sendcloud-Parcels holen + zuordnen.
  const statusMap = await fetchParcelStatuses(parcelIds);
  for (const e of entries) {
    if (e.parcelId != null) {
      const s = statusMap.get(e.parcelId);
      if (s) {
        e.statusMessage = s.statusMessage;
        e.category = s.category;
        if (!e.carrier && s.carrier) e.carrier = s.carrier;
        if (!e.trackingNumber && s.trackingNumber) e.trackingNumber = s.trackingNumber;
        if (!e.trackingUrl && s.trackingUrl) e.trackingUrl = s.trackingUrl;
      }
    }
  }

  return NextResponse.json({ entries });
}
