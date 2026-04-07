import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { products } from '@/data/products';

interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

/**
 * GET /api/availability/[productId]?month=2026-04
 *
 * Returns per-day availability for the given product and month.
 * Public endpoint – no auth required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const month = new URL(req.url).searchParams.get('month');

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Parameter "month" im Format YYYY-MM erforderlich.' },
      { status: 400 }
    );
  }

  // ── Stock ermitteln ─────────────────────────────────────────────────────────
  const product = products.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: 'Produkt nicht gefunden.' }, { status: 404 });
  }
  const totalStock = product.stock;

  // ── Monats-Range berechnen ─────────────────────────────────────────────────
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const firstDay = `${month}-01`;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const supabase = createServiceClient();

  // ── Puffer-Tage laden ─────────────────────────────────────────────────────
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  const buf: BufferDays = bufferSetting?.value
    ? (typeof bufferSetting.value === 'string' ? JSON.parse(bufferSetting.value) : bufferSetting.value)
    : { versand_before: 2, versand_after: 2, abholung_before: 0, abholung_after: 1 };

  const maxBuffer = Math.max(buf.versand_before, buf.versand_after, buf.abholung_before, buf.abholung_after);

  // Erweiterten Zeitraum abfragen (Monat + maxBuffer auf beiden Seiten)
  const extFirst = new Date(year, mon - 1, 1 - maxBuffer).toISOString().split('T')[0];
  const extLast = new Date(year, mon - 1, daysInMonth + maxBuffer).toISOString().split('T')[0];

  // ── Buchungen abfragen (erweitert um Puffer) ──────────────────────────────
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('rental_from, rental_to, delivery_mode')
    .eq('product_id', productId)
    .in('status', ['confirmed', 'shipped', 'active'])
    .lte('rental_from', extLast)
    .gte('rental_to', extFirst);

  if (bookErr) {
    console.error('Availability bookings query error:', bookErr);
    return NextResponse.json(
      { error: 'Verfügbarkeit konnte nicht geladen werden.' },
      { status: 500 }
    );
  }

  // ── Blockierte Tage abfragen ───────────────────────────────────────────────
  const { data: blocked, error: blockErr } = await supabase
    .from('product_blocked_dates')
    .select('start_date, end_date')
    .eq('product_id', productId)
    .lte('start_date', lastDay)
    .gte('end_date', firstDay);

  if (blockErr) {
    console.error('Availability blocked query error:', blockErr);
    // Nicht-kritisch: weiter ohne blocked dates
  }

  // ── Pro Tag berechnen ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: {
    date: string;
    status: 'available' | 'partial' | 'booked' | 'blocked' | 'past';
    available: number;
    total: number;
  }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, mon - 1, d);

    // Vergangene Tage
    if (dateObj < today) {
      days.push({ date: dateStr, status: 'past', available: 0, total: totalStock });
      continue;
    }

    // Buchungen zählen die diesen Tag überlappen (inkl. Puffer)
    let bookedCount = 0;
    if (bookings) {
      for (const b of bookings) {
        const bMode = b.delivery_mode ?? 'versand';
        const bBefore = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
        const bAfter = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;

        // Effektiver Zeitraum dieser Buchung inkl. Puffer
        const bFrom = new Date(b.rental_from);
        const bTo = new Date(b.rental_to);
        bFrom.setDate(bFrom.getDate() - bBefore);
        bTo.setDate(bTo.getDate() + bAfter);
        const effFrom = bFrom.toISOString().split('T')[0];
        const effTo = bTo.toISOString().split('T')[0];

        if (effFrom <= dateStr && effTo >= dateStr) {
          bookedCount++;
        }
      }
    }

    // Blockierungen zählen
    let blockedCount = 0;
    if (blocked) {
      for (const bl of blocked) {
        if (bl.start_date <= dateStr && bl.end_date >= dateStr) {
          blockedCount++;
        }
      }
    }

    const available = Math.max(0, totalStock - bookedCount - blockedCount);

    let status: 'available' | 'partial' | 'booked' | 'blocked';
    if (blockedCount >= totalStock) {
      status = 'blocked';
    } else if (available === 0) {
      status = 'booked';
    } else if (available < totalStock) {
      status = 'partial';
    } else {
      status = 'available';
    }

    days.push({ date: dateStr, status, available, total: totalStock });
  }

  return NextResponse.json({ days });
}
