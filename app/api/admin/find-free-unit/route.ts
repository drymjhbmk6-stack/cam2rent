import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('product_id');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  if (!productId || !from || !to) {
    return NextResponse.json({ error: 'product_id, from, to required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Puffertage aus Einstellungen laden
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  let beforeDays = 1, afterDays = 1;
  if (bufferSetting?.value) {
    const buf = typeof bufferSetting.value === 'string' ? JSON.parse(bufferSetting.value) : bufferSetting.value;
    beforeDays = buf?.versand_before ?? 1;
    afterDays = buf?.versand_after ?? 1;
  }

  // Daten mit Puffer anpassen
  const bufferedFrom = new Date(from);
  bufferedFrom.setDate(bufferedFrom.getDate() - beforeDays);
  const bufferedTo = new Date(to);
  bufferedTo.setDate(bufferedTo.getDate() + afterDays);
  const bFrom = bufferedFrom.toISOString().split('T')[0];
  const bTo = bufferedTo.toISOString().split('T')[0];

  // Alle Units für das Produkt laden
  const { data: units } = await supabase
    .from('product_units')
    .select('id, serial_number, label, status')
    .eq('product_id', productId)
    .in('status', ['available', 'rented']);

  if (!units?.length) {
    return NextResponse.json({ available: false, unit: null, message: 'Keine Kameras für dieses Produkt angelegt.' });
  }

  // Überlappende Buchungen finden
  const { data: bookings } = await supabase
    .from('bookings')
    .select('unit_id')
    .eq('product_id', productId)
    .in('status', ['confirmed', 'shipped', 'active', 'pending_verification', 'awaiting_payment'])
    .not('unit_id', 'is', null)
    .lte('rental_from', bTo)
    .gte('rental_to', bFrom);

  const occupied = new Set((bookings ?? []).map(b => b.unit_id).filter(Boolean));
  const freeUnit = units.find(u => !occupied.has(u.id));

  if (!freeUnit) {
    return NextResponse.json({ available: false, unit: null, message: 'In diesem Zeitraum ist keine Kamera verfügbar.' });
  }

  return NextResponse.json({
    available: true,
    unit: { id: freeUnit.id, serial_number: freeUnit.serial_number, label: freeUnit.label },
  });
}
