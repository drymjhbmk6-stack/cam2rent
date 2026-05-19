import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { InvoicePDF } from '@/lib/invoice-pdf';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { buildInvoiceData } from '@/lib/build-invoice-data';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  await ensureBusinessConfig();

  if (!bookingId) {
    return NextResponse.json({ error: 'Fehlende Buchungsnummer.' }, { status: 400 });
  }

  // Auth: Nur eingeloggter Besitzer der Buchung oder Admin darf die Rechnung sehen.
  // Ohne diesen Check wäre die Rechnungs-URL ein IDOR (DSGVO-Leak: Name, Adresse, Zahlungsdetails).
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const isAdmin = await checkAdminAuth();

  if (!user && !isAdmin) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  let query = supabase.from('bookings').select('*').eq('id', bookingId);
  if (user && !isAdmin) {
    query = query.eq('user_id', user.id);
  }
  const { data: booking, error } = await query.maybeSingle();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const data = await buildInvoiceData(supabase, booking);

  const pdfBuffer = await renderToBuffer(
    createElement(InvoicePDF, { data }) as ReactElement<DocumentProps>
  );

  const pdfBytes = new Uint8Array(pdfBuffer);
  const filename = `Rechnung-${booking.id}.pdf`;

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBytes.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      // Sweep 8 H4: Rechnungs-PDF enthaelt PII (Name, Adresse, Bankdaten, IBAN-QR).
      // Kein CDN-Cache, kein Browser-Cache auf Shared-Geraeten.
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
