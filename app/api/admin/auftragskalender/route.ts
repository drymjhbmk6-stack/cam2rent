import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/auftragskalender?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Liefert alle aktiven Buchungen im Zeitraum fuer den Auftrags-/Planungskalender.
 * Pro Buchung werden zwei Aktions-Tage berechnet:
 *  - ship_date:   Tag, an dem das Paket raus muss bzw. die Uebergabe stattfindet
 *  - return_date: Tag, an dem das Paket zurueck erwartet wird
 * Grundlage sind die konfigurierten Puffertage (admin_settings.booking_buffer_days)
 * bzw. der Buchungs-individuelle Override (ship_date_override / return_due_date_override).
 */

const LOCAL_DEFAULT_BUFFER: BufferDays = {
  versand_before: 3,
  versand_after: 3,
  abholung_before: 1,
  abholung_after: 1,
};

function normDate(value: unknown): string {
  return String(value ?? '').slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');

  if (
    !fromParam ||
    !toParam ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toParam)
  ) {
    return NextResponse.json(
      { error: 'Parameter "from" und "to" (YYYY-MM-DD) erforderlich.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Puffertage laden (Default in dieser Route ist 3/3 vs 1/1, anders als
  // im globalen DEFAULT_BUFFER der lib).
  const buf: BufferDays = await loadBufferDays(supabase, LOCAL_DEFAULT_BUFFER);

  // Bereich erweitern, damit Versand-/Rueckgabe-Aktionen am Rand mitgeladen
  // werden. +30 Tage extra Margin fuer eventuelle Override-Termine pro Buchung.
  const maxBuf = Math.max(
    buf.versand_before,
    buf.versand_after,
    buf.abholung_before,
    buf.abholung_after,
    0,
  ) + 30;
  const extFrom = addDays(fromParam, -maxBuf);
  const extTo = addDays(toParam, maxBuf);

  // Defensiver Select-Retry: bei fehlender Override-Migration ohne die zwei
  // Spalten erneut versuchen.
  const baseCols = 'id, product_name, rental_from, rental_to, days, status, delivery_mode, shipping_method, customer_name, customer_email, tracking_number, price_total, is_test';
  const runSelect = (cols: string) => supabase
    .from('bookings')
    .select(cols)
    .in('status', [
      'awaiting_payment', 'confirmed', 'preparing_shipment', 'awaiting_pickup',
      'shipped', 'delivered', 'picked_up', 'returned', 'completed',
    ])
    .lte('rental_from', extTo)
    .gte('rental_to', extFrom)
    .order('rental_from', { ascending: true });

  let { data, error } = await runSelect(`${baseCols}, ship_date_override, return_due_date_override`);
  if (error && /ship_date_override|return_due_date_override/i.test(error.message || '')) {
    ({ data, error } = await runSelect(baseCols));
  }

  if (error) {
    console.error('auftragskalender error:', error);
    return NextResponse.json(
      { error: 'Buchungen konnten nicht geladen werden.' },
      { status: 500 }
    );
  }

  const bookings = (data ?? []).map((b) => {
    const row = b as unknown as Record<string, unknown>;
    const rentalFrom = normDate(row.rental_from);
    const rentalTo = normDate(row.rental_to);
    const isAbholung = row.delivery_mode === 'abholung';
    const shipOverride = (row.ship_date_override as string | null | undefined) ?? null;
    const returnOverride = (row.return_due_date_override as string | null | undefined) ?? null;

    // Override hat Vorrang vor globalen Puffern (computeShipDate /
    // computeReturnDueDate kuemmern sich um die Logik).
    const shipDate = toIsoDate(computeShipDate(rentalFrom, isAbholung ? 'abholung' : 'versand', buf, shipOverride));
    const returnDate = toIsoDate(computeReturnDueDate(rentalTo, isAbholung ? 'abholung' : 'versand', buf, returnOverride));

    return {
      id: row.id as string,
      product_name: row.product_name as string,
      customer_name: row.customer_name as string | null,
      customer_email: row.customer_email as string | null,
      rental_from: rentalFrom,
      rental_to: rentalTo,
      days: row.days as number,
      status: row.status as string,
      delivery_mode: isAbholung ? 'abholung' : 'versand',
      shipping_method: row.shipping_method as string | null,
      tracking_number: row.tracking_number as string | null,
      price_total: row.price_total as number,
      is_test: !!row.is_test,
      ship_date: shipDate,
      return_date: returnDate,
      ship_date_overridden: !!shipOverride,
      return_date_overridden: !!returnOverride,
    };
  });

  return NextResponse.json({ bookings, buffer: buf });
}
