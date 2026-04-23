import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { sendContractEmail } from '@/lib/contracts/send-contract-email';

/**
 * POST /api/admin/sign-contract
 *
 * Signiert einen bestehenden Mietvertrag nachtraeglich.
 * Generiert das Vertrags-PDF und sendet es per E-Mail (falls E-Mail vorhanden).
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId, signatureDataUrl, signatureMethod, signerName } = await req.json();

    if (!bookingId || !signerName) {
      return NextResponse.json({ error: 'bookingId und signerName erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (booking.contract_signed) {
      return NextResponse.json({ error: 'Vertrag ist bereits unterschrieben.' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || 'admin';

    const fmtD = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = (iso || '').split('T')[0].split('-');
      return `${d}.${m}.${y}`;
    };

    // Steuer-Config
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    // Vertrag generieren
    const result = await generateContractPDF({
      bookingId,
      bookingNumber: bookingId,
      customerName: signerName,
      customerEmail: booking.customer_email || '',
      productName: booking.product_name || '',
      accessories: Array.isArray(booking.accessories) ? booking.accessories : [],
      accessoryItems: Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
        ? booking.accessory_items as { accessory_id: string; qty: number }[]
        : undefined,
      rentalFrom: fmtD(booking.rental_from),
      rentalTo: fmtD(booking.rental_to),
      rentalDays: booking.days || 1,
      priceRental: booking.price_rental || 0,
      priceAccessories: booking.price_accessories || 0,
      priceHaftung: booking.price_haftung || 0,
      priceShipping: booking.shipping_price || 0,
      priceTotal: booking.price_total || 0,
      deposit: booking.deposit || 0,
      taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
      taxRate: parseFloat(txMap['tax_rate'] || '19'),
      signatureDataUrl: signatureDataUrl || null,
      signatureMethod: signatureMethod || 'typed',
      signerName,
      ipAddress: ip,
      unitId: booking.unit_id ?? null,
    });

    // Vertrag speichern
    await storeContract(bookingId, result.pdfBuffer, {
      contractHash: result.contractHash,
      customerName: signerName,
      ipAddress: ip,
      signedAt: new Date().toISOString(),
      signatureMethod: signatureMethod || 'typed',
    });

    // Buchung als signiert markieren
    await supabase
      .from('bookings')
      .update({ contract_signed: true, contract_signed_at: new Date().toISOString() })
      .eq('id', bookingId);

    // E-Mail im Hintergrund senden
    if (booking.customer_email) {
      sendContractEmail({
        to: booking.customer_email,
        bookingId,
        bookingNumber: booking.booking_number || bookingId,
        customerName: signerName,
        productName: booking.product_name || '',
        rentalFrom: fmtD(booking.rental_from),
        rentalTo: fmtD(booking.rental_to),
        pdfBuffer: result.pdfBuffer,
      }).catch((err) => console.error('[sign-contract] Email error:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/sign-contract error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
