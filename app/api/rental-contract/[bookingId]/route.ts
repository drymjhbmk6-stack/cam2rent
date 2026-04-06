import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { ContractPDF, type ContractData } from '@/lib/contract-pdf';
import { ensureBusinessConfig } from '@/lib/load-business-config';

/**
 * GET /api/rental-contract/[bookingId]
 * Generate and download rental contract PDF.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  await ensureBusinessConfig();

  // Auth check
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

  // Also check admin cookie
  const adminCookie = cookieStore.get('admin_session');
  const isAdmin = adminCookie?.value === process.env.ADMIN_PASSWORD;

  if (!user && !isAdmin) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch booking (user must own it, or be admin)
  let query = supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId);

  if (user && !isAdmin) {
    query = query.eq('user_id', user.id);
  }

  const { data: booking, error } = await query.single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Build contract data
  const contractDate = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Get customer profile for address
  let customerAddress = '';
  if (booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', booking.user_id)
      .single();

    if (profile?.address_street) {
      customerAddress = `${profile.address_street}, ${profile.address_zip} ${profile.address_city}`;
    }
  }

  // Get signature if signed
  let signatureDataUrl: string | undefined;
  if (booking.contract_signed && booking.contract_signature_url) {
    try {
      const { data: signedUrlData } = await supabase.storage
        .from('signatures')
        .createSignedUrl(booking.contract_signature_url, 60);
      if (signedUrlData?.signedUrl) {
        // Fetch the image and convert to base64 for PDF embedding
        const imgRes = await fetch(signedUrlData.signedUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString('base64');
        signatureDataUrl = `data:image/png;base64,${base64}`;
      }
    } catch {
      // Ignore signature loading errors
    }
  }

  // Fetch tax config
  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'ust_id']);

  const taxMap: Record<string, string> = {};
  for (const s of taxSettings ?? []) taxMap[s.key] = s.value;

  const contractData: ContractData = {
    bookingId,
    contractDate,
    customerName: booking.customer_name || 'Kunde',
    customerEmail: booking.customer_email || '',
    customerAddress,
    productName: booking.product_name,
    rentalFrom: booking.rental_from,
    rentalTo: booking.rental_to,
    days: booking.days,
    priceTotal: booking.price_total,
    deposit: booking.deposit || 0,
    haftung: booking.haftung || 'none',
    signatureDataUrl,
    signedAt: booking.contract_signed_at
      ? new Date(booking.contract_signed_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : undefined,
    signerName: booking.contract_signer_name,
    taxMode: (taxMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
    taxRate: parseFloat(taxMap['tax_rate'] || '19'),
    ustId: taxMap['ust_id'] || '',
  };

  // Generate PDF
  const pdfBuffer = await renderToBuffer(
    createElement(ContractPDF, { data: contractData }) as ReactElement<DocumentProps>
  );

  const contractNumber = bookingId.replace('BK-', 'MV-');

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Mietvertrag-${contractNumber}.pdf"`,
    },
  });
}
