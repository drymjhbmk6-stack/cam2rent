import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/admin/return-booking
 * Schließt eine Buchung nach Rückgabe ab:
 * 1. Status → 'completed', setzt returned_at + return_condition + return_notes
 * 2. Kamera-Lagerbestand in admin_config erhöhen (+1)
 * 3. Zubehör-Lagerbestand in accessories-Tabelle erhöhen (+qty)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      bookingId: string;
      condition: 'gut' | 'gebrauchsspuren' | 'beschaedigt';
      notes?: string;
      checklist?: {
        kameraVollstaendig: boolean;
        zubehoerVollstaendig: boolean;
        keineSichtbarenSchaeden: boolean;
        speicherkarteZurueckgesetzt: boolean;
        akkuGeladen: boolean;
      };
      createDamageReport?: boolean;
      damageDescription?: string;
    };

    const { bookingId, condition, notes, checklist, createDamageReport, damageDescription } = body;
    if (!bookingId) return NextResponse.json({ error: 'bookingId fehlt.' }, { status: 400 });

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, product_id, accessories, status')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    if (booking.status === 'completed') {
      return NextResponse.json({ error: 'Buchung bereits abgeschlossen.' }, { status: 400 });
    }

    // 1. Buchung abschließen
    const newStatus = condition === 'beschaedigt' ? 'damaged' : 'completed';
    const checklistStr = checklist ? JSON.stringify(checklist) : null;
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: newStatus,
        returned_at: new Date().toISOString(),
        return_condition: condition,
        return_notes: notes ? (checklistStr ? `${notes}\n\nCheckliste: ${checklistStr}` : notes) : (checklistStr ? `Checkliste: ${checklistStr}` : null),
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    // 1b. Bei Beschädigung: automatisch Schadensmeldung erstellen
    if (condition === 'beschaedigt' && createDamageReport) {
      await supabase
        .from('damage_reports')
        .insert({
          booking_id: bookingId,
          reported_by: 'admin',
          description: damageDescription || 'Schaden bei Rückgabe-Prüfung festgestellt.',
          photos: [],
          status: 'open',
        });
    }

    // 2. Kamera-Lagerbestand erhöhen
    const productId = booking.product_id as string;
    const { data: configRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .maybeSingle();

    if (configRow?.value && typeof configRow.value === 'object') {
      const products = configRow.value as Record<string, { stock: number }>;
      if (products[productId]) {
        products[productId].stock = (products[productId].stock ?? 0) + 1;
        await supabase
          .from('admin_config')
          .update({ value: products, updated_at: new Date().toISOString() })
          .eq('key', 'products');
      }
    }

    // 3. Zubehör-Lagerbestand erhöhen
    const accIds: string[] = Array.isArray(booking.accessories) ? booking.accessories : [];
    if (accIds.length > 0) {
      // Jedes Zubehör einzeln um 1 erhöhen (qty ist nicht in bookings gespeichert)
      for (const accId of accIds) {
        const { data: acc } = await supabase
          .from('accessories')
          .select('available_qty')
          .eq('id', accId)
          .maybeSingle();

        if (acc) {
          await supabase
            .from('accessories')
            .update({ available_qty: (acc.available_qty ?? 0) + 1 })
            .eq('id', accId);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/return-booking error:', err);
    return NextResponse.json({ error: 'Fehler beim Abschließen der Buchung.' }, { status: 500 });
  }
}
