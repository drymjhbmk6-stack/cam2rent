import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/auftragskalender?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Liefert alle aktiven Buchungen im Zeitraum fuer den Auftrags-/Planungskalender.
 * Pro Buchung werden zwei Aktions-Tage berechnet:
 *  - ship_date:   Tag, an dem das Paket raus muss bzw. die Uebergabe stattfindet
 *  - return_date: Tag, an dem das Paket zurueck erwartet wird
 * Grundlage sind die konfigurierten Puffertage (admin_settings.booking_buffer_days).
 */

interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

const DEFAULT_BUFFER: BufferDays = {
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

  // Puffertage laden
  let buf: BufferDays = DEFAULT_BUFFER;
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  if (bufferSetting?.value) {
    try {
      const parsed =
        typeof bufferSetting.value === 'string'
          ? JSON.parse(bufferSetting.value)
          : bufferSetting.value;
      buf = { ...DEFAULT_BUFFER, ...parsed };
    } catch {
      buf = DEFAULT_BUFFER;
    }
  }

  // Bereich erweitern, damit Versand-/Rueckgabe-Aktionen am Rand mitgeladen werden
  const maxBuf = Math.max(
    buf.versand_before,
    buf.versand_after,
    buf.abholung_before,
    buf.abholung_after,
    0
  );
  const extFrom = addDays(fromParam, -maxBuf);
  const extTo = addDays(toParam, maxBuf);

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, product_name, rental_from, rental_to, days, status, delivery_mode, shipping_method, customer_name, customer_email, tracking_number, price_total, is_test'
    )
    .in('status', [
      'awaiting_payment',
      'confirmed',
      'shipped',
      'picked_up',
      'returned',
      'completed',
    ])
    .lte('rental_from', extTo)
    .gte('rental_to', extFrom)
    .order('rental_from', { ascending: true });

  if (error) {
    console.error('auftragskalender error:', error);
    return NextResponse.json(
      { error: 'Buchungen konnten nicht geladen werden.' },
      { status: 500 }
    );
  }

  const bookings = (data ?? []).map((b) => {
    const rentalFrom = normDate(b.rental_from);
    const rentalTo = normDate(b.rental_to);
    const isAbholung = b.delivery_mode === 'abholung';

    const shipDate = isAbholung
      ? addDays(rentalFrom, -buf.abholung_before)
      : addDays(rentalFrom, -buf.versand_before);
    const returnDate = isAbholung
      ? addDays(rentalTo, buf.abholung_after)
      : addDays(rentalTo, buf.versand_after);

    return {
      id: b.id,
      product_name: b.product_name,
      customer_name: b.customer_name,
      customer_email: b.customer_email,
      rental_from: rentalFrom,
      rental_to: rentalTo,
      days: b.days,
      status: b.status,
      delivery_mode: isAbholung ? 'abholung' : 'versand',
      shipping_method: b.shipping_method,
      tracking_number: b.tracking_number,
      price_total: b.price_total,
      is_test: !!b.is_test,
      ship_date: shipDate,
      return_date: returnDate,
    };
  });

  return NextResponse.json({ bookings, buffer: buf });
}
