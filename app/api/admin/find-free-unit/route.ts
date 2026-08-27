import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { toIsoDate } from '@/lib/booking-buffer';
import { ensureCameraMirrorsForProduct, type EnsureCameraMirrorsResult } from '@/lib/inventar-mirror';

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

  // Daten mit Puffer anpassen. toIsoDate liest lokale Kalenderkomponenten
  // (DST-fest) statt toISOString() (UTC → off-by-one an DST-Kanten).
  const bufferedFrom = new Date(from);
  bufferedFrom.setDate(bufferedFrom.getDate() - beforeDays);
  const bufferedTo = new Date(to);
  bufferedTo.setDate(bufferedTo.getDate() + afterDays);
  const bFrom = toIsoDate(bufferedFrom);
  const bTo = toIsoDate(bufferedTo);

  // Alle Units für das Produkt laden — BEWUSST ohne Status-Filter, damit
  // „gar keine Einheit angelegt" und „Einheit da, aber ausgemustert/in
  // Wartung" unterscheidbar bleiben (sonst führen beide zur selben Meldung).
  const loadUnits = async () => {
    const { data } = await supabase
      .from('product_units')
      .select('id, serial_number, label, status')
      .eq('product_id', productId);
    return data ?? [];
  };

  let allUnits = await loadUnits();

  // Selbstheilung: existiert die Kamera NUR in der neuen Inventar-Welt
  // (`inventar_units`), fehlt hier der `product_units`-Spiegel — der Kalender
  // zeigt sie dann frei, das Buchungs-Formular fände sie aber nie. Spiegel
  // lazy nachziehen (gleiche Wirkung wie der Mirror-Backfill auf
  // /admin/inventar) und erneut lesen. Muster wie der Lazy-Backfill im
  // Verfügbarkeits-Gantt (resolveProdukteIdMap mit autoCreate).
  let mirrorInfo: EnsureCameraMirrorsResult | null = null;
  if (allUnits.length === 0) {
    mirrorInfo = await ensureCameraMirrorsForProduct(supabase, productId);
    if (mirrorInfo.mirrored > 0) allUnits = await loadUnits();
  }

  if (allUnits.length === 0) {
    // Konkret sagen, WARUM nichts da ist — sonst ist von aussen nicht
    // unterscheidbar, ob das Modell gar keine Exemplare hat oder ob die
    // Verknuepfung in die neue Inventar-Welt fehlt/kaputt ist.
    let message = 'Keine Kameras für dieses Produkt angelegt.';
    if (mirrorInfo && mirrorInfo.mirrored > 0) {
      // Spiegel gilt als vorhanden, ist unter dieser product_id aber nicht
      // auffindbar — „konnte nicht angelegt werden" waere hier schlicht falsch.
      message = `Die Kamera ist im Inventar vorhanden und verknüpft, der Eintrag ist diesem Modell aber nicht zugeordnet. Bitte auf /admin/inventar unter „Wartung ▾" den Mirror-Backfill ausführen.`;
    } else if (mirrorInfo && mirrorInfo.inventarFound > 0) {
      // Grund mitschicken — sonst steht die echte DB-Meldung nur im
      // Server-Log und der Admin raet, woran es liegt.
      const reason = mirrorInfo.lastError ? ` Grund: ${mirrorInfo.lastError}` : '';
      message = `${mirrorInfo.inventarFound} Einheit(en) im Inventar gefunden, aber der Legacy-Eintrag konnte nicht angelegt werden.${reason}`;
    } else if (mirrorInfo && !mirrorInfo.bridgeOk) {
      message = 'Keine Kameras für dieses Produkt angelegt (auch keine Inventar-Verknüpfung vorhanden).';
    }
    return NextResponse.json({ available: false, unit: null, message });
  }

  const units = allUnits.filter((u) => u.status === 'available' || u.status === 'rented');
  if (units.length === 0) {
    return NextResponse.json({
      available: false,
      unit: null,
      message: `Alle ${allUnits.length} Exemplare dieses Modells sind ausgemustert oder in Wartung.`,
    });
  }

  // Überlappende Buchungen finden. Test-Buchungen blocken die Verfuegbarkeits-
  // Anzeige fuer Live-Buchungen NICHT (Test-/Live-Isolation, analog
  // assign_free_unit RPC).
  const forTest = req.nextUrl.searchParams.get('for_test') === '1';
  let bookingQuery = supabase
    .from('bookings')
    .select('unit_id')
    .eq('product_id', productId)
    .in('status', ['confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'active', 'pending_verification', 'awaiting_payment'])
    .not('unit_id', 'is', null)
    .lte('rental_from', bTo)
    .gte('rental_to', bFrom);
  bookingQuery = forTest
    ? bookingQuery.eq('is_test', true)
    : bookingQuery.not('is_test', 'is', true);
  const { data: bookings } = await bookingQuery;

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
