import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getSendcloudKeys } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

const SC_BASE = 'https://panel.sendcloud.sc/api/v2';

async function scAuth() {
  const { publicKey, secretKey } = await getSendcloudKeys();
  return 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
}

/**
 * GET /api/admin/sendcloud?action=methods
 * Gibt verfügbare Versandmethoden zurück (zum Auswählen).
 */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'methods') {
    try {
      const auth = await scAuth();
      const res = await fetch(`${SC_BASE}/shipping_methods?is_return=false`, {
        headers: { Authorization: auth },
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
    const authHeader = await scAuth();
    const outboundRes = await fetch(`${SC_BASE}/parcels`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
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

    // ── 2. In Supabase speichern ─────────────────────────────────────────────
    // Wichtig: Sendcloud-Rueckversand-Label (is_return=true) wird NICHT mehr
    // automatisch mit erstellt — kostet bei Sendcloud Aufschlag. Stattdessen
    // bietet die UI einen separaten "Retourlabel"-Button, der ueber
    // /api/admin/sendcloud-return ein NORMALES Sendcloud-Etikett mit
    // getauschten Adressen erzeugt (kein is_return-Aufpreis).
    const supabase = createServiceClient();
    await supabase.from('bookings').update({
      sendcloud_parcel_id: outParcel.id,
      tracking_number: outParcel.tracking_number ?? null,
      tracking_url: outParcel.tracking_url ?? null,
      label_url: outParcel.label?.label_printer ?? outParcel.label?.normal_printer?.[0] ?? null,
    }).eq('id', bookingId);

    await logAudit({
      action: 'sendcloud.create_label',
      entityType: 'booking',
      entityId: bookingId,
      changes: {
        parcelId: outParcel.id,
        trackingNumber: outParcel.tracking_number,
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      parcelId: outParcel.id,
      trackingNumber: outParcel.tracking_number,
      labelUrl: outParcel.label?.label_printer ?? outParcel.label?.normal_printer?.[0] ?? null,
    });

  } catch (err) {
    console.error('POST /api/admin/sendcloud error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
