import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { PacklistPDF, type PacklistData } from '@/lib/packlist-pdf';
import { ensureBusinessConfig } from '@/lib/load-business-config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  await ensureBusinessConfig();

  if (!bookingId) {
    return NextResponse.json({ error: 'Fehlende Buchungsnummer.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Auth-Check: Admin ODER Besitzer der Buchung. Packlisten enthalten
  // Kundenadressen — DSGVO-relevant.
  const isAdmin = await checkAdminAuth();
  if (!isAdmin) {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* no-op */ },
        },
      }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
    }
  }

  // Kundenadresse
  let customerAddress = booking.shipping_address ?? '';
  if (!customerAddress && booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', booking.user_id)
      .maybeSingle();
    if (profile?.address_street) {
      customerAddress = `${profile.address_street}, ${profile.address_zip} ${profile.address_city}`;
    }
  }

  // Seriennummer aus zugewiesener Unit
  let serialNumber: string | null = null;
  if (booking.unit_id) {
    const { data: unit } = await supabase
      .from('product_units')
      .select('serial_number')
      .eq('id', booking.unit_id)
      .maybeSingle();
    serialNumber = unit?.serial_number ?? null;
  }

  // Zubehoer + Sets aufloesen — gleiche Logik wie /api/admin/booking/[id],
  // damit Packliste auch Set-Inhalte expandiert anzeigt.
  type Resolved = { name: string; qty: number };
  const resolvedItems: Resolved[] = [];
  const rawItems: { accessory_id: string; qty: number }[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? booking.accessory_items as { accessory_id: string; qty: number }[]
    : (Array.isArray(booking.accessories) ? booking.accessories as string[] : []).map((aid) => ({ accessory_id: aid, qty: 1 }));

  if (rawItems.length > 0) {
    const allIds = [...new Set(rawItems.map((r) => r.accessory_id))];
    const [{ data: accs }, { data: sets }] = await Promise.all([
      supabase.from('accessories').select('id, name').in('id', allIds),
      supabase.from('sets').select('id, name, accessory_items').in('id', allIds),
    ]);
    const accNameMap = Object.fromEntries((accs ?? []).map((a) => [a.id, a.name as string]));
    const setMap: Record<string, { name: string; items: { accessory_id: string; qty: number }[] }> = {};
    for (const s of sets ?? []) {
      setMap[s.id] = {
        name: s.name as string,
        items: Array.isArray(s.accessory_items) ? (s.accessory_items as { accessory_id: string; qty: number }[]) : [],
      };
    }
    const setSubIds = new Set<string>();
    for (const setInfo of Object.values(setMap)) {
      for (const it of setInfo.items) {
        if (!accNameMap[it.accessory_id]) setSubIds.add(it.accessory_id);
      }
    }
    if (setSubIds.size > 0) {
      const { data: subAccs } = await supabase.from('accessories').select('id, name').in('id', [...setSubIds]);
      for (const a of subAccs ?? []) accNameMap[a.id] = a.name as string;
    }
    for (const item of rawItems) {
      const setInfo = setMap[item.accessory_id];
      if (setInfo) {
        for (const sub of setInfo.items) {
          resolvedItems.push({
            name: accNameMap[sub.accessory_id] ?? sub.accessory_id,
            qty: (sub.qty || 1) * item.qty,
          });
        }
      } else {
        resolvedItems.push({
          name: accNameMap[item.accessory_id] ?? item.accessory_id,
          qty: item.qty,
        });
      }
    }
  }

  const data: PacklistData = {
    bookingId: booking.id,
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? '',
    customerAddress,
    productName: booking.product_name ?? '',
    rentalFrom: booking.rental_from ?? '',
    rentalTo: booking.rental_to ?? '',
    days: booking.days ?? 1,
    deliveryMode: booking.delivery_mode ?? 'versand',
    shippingMethod: booking.shipping_method ?? 'standard',
    accessories: Array.isArray(booking.accessories) ? booking.accessories : [],
    resolvedItems,
    serialNumber,
    haftung: booking.haftung ?? 'none',
    // Pack-Workflow-Daten (Sektion 3 + 5: Haakchen aus dem digitalen Flow)
    packedBy: booking.pack_packed_by ?? null,
    packedAt: booking.pack_packed_at ?? null,
    packedSignatureDataUrl: booking.pack_packed_signature ?? null,
    packedItems: Array.isArray(booking.pack_packed_items) ? booking.pack_packed_items : null,
    packedCondition: booking.pack_packed_condition && typeof booking.pack_packed_condition === 'object'
      ? booking.pack_packed_condition : null,
    checkedBy: booking.pack_checked_by ?? null,
    checkedAt: booking.pack_checked_at ?? null,
    checkedSignatureDataUrl: booking.pack_checked_signature ?? null,
    checkedItems: Array.isArray(booking.pack_checked_items) ? booking.pack_checked_items : null,
    checkedNotes: booking.pack_checked_notes ?? null,
    photoStoragePath: booking.pack_photo_url ?? null,
  };

  const pdfBuffer = await renderToBuffer(
    createElement(PacklistPDF, { data }) as ReactElement<DocumentProps>
  );

  const pdfBytes = new Uint8Array(pdfBuffer);

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBytes.length),
      'Content-Disposition': `inline; filename="Packliste-${booking.id}.pdf"`,
    },
  });
}
