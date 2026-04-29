import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/regenerate-contract
 *
 * Regeneriert den Mietvertrag aus der in der Buchung gespeicherten Signatur.
 * Nutzt die Felder bookings.contract_signature_url + contract_signer_name, die
 * confirm-cart/confirm-booking beim Insert mitschreiben. Damit kann der Admin
 * den Vertrag jederzeit nachgenerieren, falls der after()-Block beim
 * urspruenglichen Confirm gescheitert ist (Container-Restart, Storage-Hiccup,
 * PDF-Crash).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (booking.contract_signed) {
    return NextResponse.json({ error: 'Vertrag ist bereits unterschrieben.' }, { status: 400 });
  }

  const signerName = booking.contract_signer_name;
  const signatureDataUrl = booking.contract_signature_url;

  if (!signerName) {
    return NextResponse.json({
      error: 'Keine gespeicherte Signatur gefunden. Bitte den Vertrag manuell ueber "Jetzt unterschreiben" anlegen.',
    }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'admin-recovery';

  const fmtD = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = (iso || '').split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  };

  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate']);
  const txMap: Record<string, string> = {};
  for (const s of taxSettings ?? []) txMap[s.key] = s.value;

  try {
    const result = await generateContractPDF({
      bookingId: id,
      bookingNumber: id,
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
      signatureMethod: signatureDataUrl ? 'canvas' : 'typed',
      signerName,
      ipAddress: ip,
      unitId: booking.unit_id ?? null,
    });

    await storeContract(id, result.pdfBuffer, {
      contractHash: result.contractHash,
      customerName: signerName,
      ipAddress: ip,
      signedAt: new Date().toISOString(),
      signatureMethod: signatureDataUrl ? 'canvas' : 'typed',
    });

    await logAudit({
      action: 'booking.regenerate_contract',
      entityType: 'booking',
      entityId: id,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[regenerate-contract] error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Vertrag konnte nicht regeneriert werden.',
    }, { status: 500 });
  }
}
