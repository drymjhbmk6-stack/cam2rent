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
    haftung: booking.haftung ?? 'none',
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
