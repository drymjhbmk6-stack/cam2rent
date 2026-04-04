import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const SC_BASE = 'https://panel.sendcloud.sc/api/v2';

function scAuth() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY!;
  const sec = process.env.SENDCLOUD_SECRET_KEY!;
  return 'Basic ' + Buffer.from(`${pub}:${sec}`).toString('base64');
}

/**
 * GET /api/admin/sendcloud?action=methods
 * Gibt verfügbare Versandmethoden zurück (zum Auswählen).
 */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'methods') {
    try {
      const res = await fetch(`${SC_BASE}/shipping_methods?is_return=false`, {
        headers: { Authorization: scAuth() },
      });
      if (!res.ok) {
        const txt = await res.text();
        return NextResponse.json({ error: `Sendcloud: ${txt}` }, { status: res.status });
      }
      const data = await res.json();
      // Nur DE-relevante Methoden zurückgeben
      const methods = (data.shipping_methods ?? []).filter(
        (m: { countries: { iso_2: string }[] }) =>
          m.countries?.some((c) => c.iso_2 === 'DE')
      );
      return NextResponse.json({ methods });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}

/**
 * POST /api/admin/sendcloud
 * Erstellt Versandetikett + Rücksendeetikett und speichert IDs in der Buchung.
 *
 * Body:
 * {
 *   bookingId: string,
 *   shippingMethodId: number,
 *   customer: { name, address, city, postalCode, email },
 *   weightKg?: number   // default 0.5
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      bookingId: string;
      shippingMethodId: number;
      customer: { name: string; address: string; city: string; postalCode: string; email: string };
      weightKg?: number;
    };

    const { bookingId, shippingMethodId, customer, weightKg = 0.5 } = body;

    if (!bookingId || !shippingMethodId || !customer?.name || !customer?.address) {
      return NextResponse.json({ error: 'Pflichtfelder fehlen.' }, { status: 400 });
    }

    const weight = weightKg.toFixed(3);

    // ── 1. Versandetikett erstellen (cam2rent → Kunde) ────────────────────────
    const outboundRes = await fetch(`${SC_BASE}/parcels`, {
      method: 'POST',
      headers: {
        Authorization: scAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parcel: {
          name: customer.name,
          address: customer.address,
          city: customer.city,
          postal_code: customer.postalCode,
          country: 'DE',
          email: customer.email,
          weight,
          order_number: bookingId,
          shipment: { id: shippingMethodId },
          request_label: true,
        },
      }),
    });

    if (!outboundRes.ok) {
      const txt = await outboundRes.text();
      return NextResponse.json({ error: `Sendcloud Hinversand: ${txt}` }, { status: 500 });
    }

    const outboundData = await outboundRes.json();
    const outParcel = outboundData.parcel;

    // ── 2. Rücksendeetikett erstellen (Kunde → cam2rent) ─────────────────────
    const shipperName = process.env.SENDCLOUD_SHIPPER_NAME ?? 'cam2rent';
    const shipperStreet = process.env.SENDCLOUD_SHIPPER_STREET ?? '';
    const shipperHouse = process.env.SENDCLOUD_SHIPPER_HOUSE ?? '';
    const shipperZip = process.env.SENDCLOUD_SHIPPER_ZIP ?? '';
    const shipperCity = process.env.SENDCLOUD_SHIPPER_CITY ?? '';

    let returnParcel: { id: number; label?: { normal_printer: string[]; label_printer: string } } | null = null;
    let returnError: string | null = null;

    try {
      const returnRes = await fetch(`${SC_BASE}/parcels`, {
        method: 'POST',
        headers: {
          Authorization: scAuth(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parcel: {
            // Empfänger = cam2rent (Ziel der Retoure)
            name: shipperName,
            address: `${shipperStreet} ${shipperHouse}`.trim(),
            city: shipperCity,
            postal_code: shipperZip,
            country: 'DE',
            // Absender = Kunde (from_* Felder zwingend bei is_return)
            from_name: customer.name,
            from_address: customer.address,
            from_city: customer.city,
            from_postal_code: customer.postalCode,
            from_country: 'DE',
            email: customer.email,
            weight,
            order_number: `${bookingId}-RETURN`,
            shipment: { id: shippingMethodId },
            request_label: true,
            is_return: true,
          },
        }),
      });
      if (returnRes.ok) {
        const d = await returnRes.json();
        returnParcel = d.parcel;
      } else {
        returnError = await returnRes.text();
        console.error('Sendcloud return parcel error:', returnError);
      }
    } catch (e) {
      returnError = String(e);
      console.error('Sendcloud return parcel exception:', e);
    }

    // ── 3. In Supabase speichern ──────────────────────────────────────────────
    const supabase = createServiceClient();
    await supabase.from('bookings').update({
      sendcloud_parcel_id: outParcel.id,
      tracking_number: outParcel.tracking_number ?? null,
      tracking_url: outParcel.tracking_url ?? null,
      label_url: outParcel.label?.label_printer ?? outParcel.label?.normal_printer?.[0] ?? null,
      sendcloud_return_parcel_id: returnParcel?.id ?? null,
      return_label_url: returnParcel?.label?.label_printer ?? returnParcel?.label?.normal_printer?.[0] ?? null,
    }).eq('id', bookingId);

    return NextResponse.json({
      success: true,
      parcelId: outParcel.id,
      trackingNumber: outParcel.tracking_number,
      labelUrl: outParcel.label?.label_printer ?? outParcel.label?.normal_printer?.[0] ?? null,
      returnParcelId: returnParcel?.id ?? null,
      returnLabelUrl: returnParcel?.label?.label_printer ?? returnParcel?.label?.normal_printer?.[0] ?? null,
      returnError: returnError ?? undefined,
    });

  } catch (err) {
    console.error('POST /api/admin/sendcloud error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
