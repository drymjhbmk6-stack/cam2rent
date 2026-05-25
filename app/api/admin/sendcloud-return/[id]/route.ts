import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getSendcloudKeys } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';
import { checkAdminAuth } from '@/lib/admin-auth';

const SC_BASE = 'https://panel.sendcloud.sc/api/v2';

/**
 * POST /api/admin/sendcloud-return/[id]
 *
 * Erstellt ein Retourenlabel als NORMALES Sendcloud-Etikett mit getauschten
 * Adressen (Kunde = Absender, cam2rent = Empfaenger). Bewusst OHNE
 * is_return:true — Sendcloud erhebt sonst einen Aufschlag fuer
 * "Retourenfunktionen".
 *
 * Erfordert eine vorher erstellte Hin-Versand-Buchung (label_url +
 * shipping_address sind dort hinterlegt) sowie die gleichen Adress- /
 * Gewichts-Daten, damit der Aufruf hier ohne erneutes Sendcloud-Modal
 * gemacht werden kann.
 *
 * Body (alle optional ausser shippingMethodId, weightKg):
 * {
 *   shippingMethodId: number,
 *   weightKg?: number   // default: bookings.pack_weight_kg oder 0.5
 * }
 *
 * Antwort: { success, returnLabelUrl, returnParcelId, returnTrackingNumber }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const body = await req.json().catch(() => ({})) as {
    shippingMethodId?: number;
    weightKg?: number;
  };

  if (!body.shippingMethodId) {
    return NextResponse.json({ error: 'shippingMethodId erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Buchung laden — Kunden-Adresse + Gewicht.
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, customer_name, customer_email, shipping_address, pack_weight_kg')
    .eq('id', bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (!booking.shipping_address) {
    return NextResponse.json({ error: 'Buchung hat keine Versandadresse.' }, { status: 422 });
  }

  // shipping_address = "Strasse Hausnr, PLZ Stadt"
  const parts = booking.shipping_address.split(',');
  const street = (parts[0] ?? '').trim();
  const rest = (parts[1] ?? '').trim();
  const zipCityMatch = rest.match(/^(\d{5})\s+(.+)$/);
  if (!zipCityMatch) {
    return NextResponse.json({ error: 'Versandadresse nicht parsebar.' }, { status: 422 });
  }
  const customerZip = zipCityMatch[1];
  const customerCity = zipCityMatch[2];

  // cam2rent Absender (= Retoure-Empfaenger).
  const shipperName = process.env.SENDCLOUD_SHIPPER_NAME ?? 'cam2rent';
  const shipperStreet = process.env.SENDCLOUD_SHIPPER_STREET ?? '';
  const shipperHouse = process.env.SENDCLOUD_SHIPPER_HOUSE ?? '';
  const shipperZip = process.env.SENDCLOUD_SHIPPER_ZIP ?? '';
  const shipperCity = process.env.SENDCLOUD_SHIPPER_CITY ?? '';
  const shipperEmail = process.env.SENDCLOUD_SHIPPER_EMAIL ?? 'kontakt@cam2rent.de';

  if (!shipperStreet || !shipperZip || !shipperCity) {
    return NextResponse.json(
      { error: 'cam2rent-Absenderadresse nicht konfiguriert (SENDCLOUD_SHIPPER_*).' },
      { status: 500 },
    );
  }

  const weightKg = body.weightKg ?? booking.pack_weight_kg ?? 0.5;
  const weight = Number(weightKg).toFixed(3);

  const { publicKey, secretKey } = await getSendcloudKeys();
  const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  // Normales Sendcloud-Etikett — Empfaenger = cam2rent, Absender = Kunde,
  // bewusst OHNE is_return:true, damit kein Aufpreis greift.
  const scRes = await fetch(`${SC_BASE}/parcels`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parcel: {
        // Empfaenger = cam2rent
        name: shipperName,
        address: `${shipperStreet} ${shipperHouse}`.trim(),
        city: shipperCity,
        postal_code: shipperZip,
        country: 'DE',
        email: shipperEmail,
        // Absender = Kunde
        from_name: booking.customer_name ?? '',
        from_address: street,
        from_city: customerCity,
        from_postal_code: customerZip,
        from_country: 'DE',
        weight,
        order_number: `${bookingId}-RETURN`,
        shipment: { id: body.shippingMethodId },
        request_label: true,
      },
    }),
  });

  if (!scRes.ok) {
    const txt = await scRes.text();
    return NextResponse.json({ error: `Sendcloud-Retour: ${txt}` }, { status: 500 });
  }

  const data = await scRes.json();
  const parcel = data.parcel as {
    id: number;
    tracking_number?: string;
    tracking_url?: string;
    label?: { normal_printer?: string[]; label_printer?: string };
  };

  const returnLabelUrl = parcel.label?.label_printer ?? parcel.label?.normal_printer?.[0] ?? null;

  // Buchung updaten — return_label_url + tracking-Daten + carrier=DHL als
  // Default (Sendcloud-Methode mappt typisch auf DHL; falls eine andere Methode
  // gewaehlt wird, bleibt das eine sinnvolle Vorbelegung).
  await supabase.from('bookings').update({
    sendcloud_return_parcel_id: parcel.id,
    return_label_url: returnLabelUrl,
    return_tracking_number: parcel.tracking_number ?? null,
    return_tracking_url: parcel.tracking_url ?? null,
  }).eq('id', bookingId);

  await logAudit({
    action: 'sendcloud.create_return_label',
    entityType: 'booking',
    entityId: bookingId,
    changes: {
      parcelId: parcel.id,
      trackingNumber: parcel.tracking_number,
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    returnParcelId: parcel.id,
    returnTrackingNumber: parcel.tracking_number,
    returnLabelUrl,
  });
}
