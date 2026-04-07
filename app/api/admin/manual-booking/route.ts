import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/admin/manual-booking
 *
 * Erstellt eine manuelle Buchung (z.B. fuer Kleinanzeigen-Bestellungen).
 * Kein Stripe Payment Intent noetig — Zahlung wird extern abgewickelt.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      product_id,
      product_name,
      rental_from,
      rental_to,
      days,
      delivery_mode,
      shipping_method,
      shipping_price,
      haftung,
      accessories,
      price_rental,
      price_accessories,
      price_haftung,
      price_total,
      deposit,
      customer_name,
      customer_email,
      shipping_address,
      payment_status,
    } = body;

    // Pflichtfelder pruefen
    if (!product_id || !product_name || !rental_from || !rental_to || !days || !customer_name) {
      return NextResponse.json(
        { error: 'Pflichtfelder fehlen (Produkt, Zeitraum, Name).' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Buchungs-ID generieren: BK-YYYY-NNNNN
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true });
    const seq = ((count ?? 0) + 1).toString().padStart(5, '0');
    const bookingId = `BK-${year}-${seq}`;

    // Manuelle Buchung — payment_intent_id mit MANUAL-Prefix
    const paymentIntentId = `MANUAL-${bookingId}-${Date.now()}`;

    // Notizen aus dem Body (enthalten jetzt auch Produkt-Notizen, Bezahlstatus, Bankdaten etc.)
    const bookingNotes = body.notes || null;

    const insertData: Record<string, unknown> = {
      id: bookingId,
      payment_intent_id: paymentIntentId,
      product_id,
      product_name,
      rental_from,
      rental_to,
      days: parseInt(days, 10),
      delivery_mode: delivery_mode || 'versand',
      shipping_method: shipping_method || null,
      shipping_price: parseFloat(shipping_price || '0'),
      haftung: haftung || 'none',
      accessories: accessories || [],
      price_rental: parseFloat(price_rental || '0'),
      price_accessories: parseFloat(price_accessories || '0'),
      price_haftung: parseFloat(price_haftung || '0'),
      price_total: parseFloat(price_total || '0'),
      deposit: parseFloat(deposit || '0'),
      status: 'confirmed',
      customer_name,
      customer_email: customer_email || null,
      shipping_address: shipping_address || null,
    };

    // Optionale Felder nur setzen wenn vorhanden (Spalten könnten fehlen)
    // Erster Versuch mit allen Feldern, bei Fehler ohne optionale Felder
    if (bookingNotes) insertData.notes = bookingNotes;
    if (payment_status) insertData.payment_status = payment_status;

    let result = await supabase.from('bookings').insert(insertData);

    // Falls Fehler (z.B. unbekannte Spalte), nochmal ohne optionale Felder versuchen
    if (result.error) {
      console.warn('Insert with optional fields failed, retrying without:', result.error.message);
      delete insertData.notes;
      delete insertData.payment_status;
      result = await supabase.from('bookings').insert(insertData);
    }

    const { error } = result;

    if (error) {
      console.error('Manual booking insert error:', error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht erstellt werden.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, bookingId });
  } catch (err) {
    console.error('Manual booking error:', err);
    return NextResponse.json(
      { error: 'Unerwarteter Fehler.' },
      { status: 500 }
    );
  }
}
