import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { logAudit } from '@/lib/audit';

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
      // Liste der konkret abgehakten Item-Slot-Keys (Kamera + Zubehoer-
      // Stuecke). Wird zusammen mit der Checkliste in den Notizen archiviert,
      // damit der Stand der Vollstaendigkeitspruefung nachvollziehbar bleibt.
      checkedItems?: string[];
      createDamageReport?: boolean;
      damageDescription?: string;
    };

    const { bookingId, condition, notes, checklist, checkedItems, createDamageReport, damageDescription } = body;
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
    // Notizen + Checkliste + abgehakte Items in einem strukturierten Block
    // archivieren — der Admin sieht in der Buchungsdetail-Seite spaeter
    // welche physischen Stuecke abgehakt wurden und welche Pauschalpunkte
    // erfuellt waren.
    const auditPayload: Record<string, unknown> = {};
    if (checklist) auditPayload.checklist = checklist;
    if (Array.isArray(checkedItems) && checkedItems.length > 0) auditPayload.checkedItems = checkedItems;
    const auditStr = Object.keys(auditPayload).length > 0 ? JSON.stringify(auditPayload) : null;
    const finalNotes = notes
      ? (auditStr ? `${notes}\n\nRückgabe-Prüfung: ${auditStr}` : notes)
      : (auditStr ? `Rückgabe-Prüfung: ${auditStr}` : null);

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: newStatus,
        returned_at: new Date().toISOString(),
        return_condition: condition,
        return_notes: finalNotes,
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    // 1a.1 Zubehoer-Exemplare nur bei "completed" zurueck auf 'available' setzen.
    // Bei 'damaged' bleibt der Status auf 'rented' -- der Admin muss einzeln im
    // Schadensmodul (Phase 3) entscheiden, welches Exemplar als 'damaged' bzw.
    // 'lost' markiert wird.
    if (newStatus === 'completed') {
      releaseAccessoryUnitsFromBooking(bookingId)
        .catch((err) => console.error('[return-booking] accessory-unit release failed:', err));
    }

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

    await logAudit({
      action: 'booking.return',
      entityType: 'booking',
      entityId: bookingId,
      changes: {
        condition,
        new_status: newStatus,
        damage_report_created: !!(condition === 'beschaedigt' && createDamageReport),
      },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/return-booking error:', err);
    return NextResponse.json({ error: 'Fehler beim Abschließen der Buchung.' }, { status: 500 });
  }
}
