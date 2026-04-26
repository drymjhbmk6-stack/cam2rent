import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { RentalContractPDF, type RentalContractData } from '@/lib/contracts/contract-template';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { DEFAULT_HAFTUNG, getEigenbeteiligung, type HaftungConfig } from '@/lib/price-config';

/**
 * GET /api/rental-contract/[bookingId]
 * Mietvertrag-PDF generieren und herunterladen.
 * Nutzt die neue umfassende Vertragsvorlage (§1-§12).
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

  // Also check admin cookie (admin_token = SHA-256 Hash)
  const isAdmin = await checkAdminAuth();

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

  // Kundenprofil laden
  let customerStreet = '';
  let customerZip = '';
  let customerCity = '';
  if (booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', booking.user_id)
      .single();

    if (profile?.address_street) {
      customerStreet = profile.address_street;
      customerZip = profile.address_zip || '';
      customerCity = profile.address_city || '';
    }
  }

  // Signatur laden (aus rental_agreements oder altem signatures-Bucket)
  let signatureDataUrl: string | undefined;
  let signatureMethod: 'canvas' | 'typed' = 'canvas';
  let signerName = booking.contract_signer_name || booking.customer_name || 'Kunde';
  let signedAt = '';
  let ipAddress = '';
  let contractHash = '';

  // Zuerst in rental_agreements nachschauen (neues System)
  const { data: agreement } = await supabase
    .from('rental_agreements')
    .select('*')
    .eq('booking_id', bookingId)
    .single();

  if (agreement) {
    signerName = agreement.signed_by_name;
    signatureMethod = agreement.signature_method;
    ipAddress = agreement.ip_address;
    contractHash = agreement.contract_hash;
    signedAt = new Date(agreement.signed_at).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Berlin',
    });

    // PDF aus Storage laden wenn vorhanden
    if (agreement.pdf_url) {
      const storagePath = agreement.pdf_url.replace('contracts/', '');
      const { data: signedUrlData } = await supabase.storage
        .from('contracts')
        .createSignedUrl(storagePath, 60);
      if (signedUrlData?.signedUrl) {
        try {
          const pdfRes = await fetch(signedUrlData.signedUrl);
          if (!pdfRes.ok) throw new Error(`storage fetch HTTP ${pdfRes.status}`);
          const pdfBuffer = await pdfRes.arrayBuffer();
          const pdfBytes = new Uint8Array(pdfBuffer);
          const contractNumber = bookingId.replace('BK-', 'MV-');
          return new NextResponse(pdfBytes, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Length': String(pdfBytes.length),
              'Content-Disposition': `inline; filename="Mietvertrag-${contractNumber}.pdf"`,
            },
          });
        } catch {
          // Fallback: PDF neu generieren
        }
      }
    }
  } else if (booking.contract_signed && booking.contract_signature_url) {
    // Fallback: altes System (signatures-Bucket)
    try {
      const { data: signedUrlData } = await supabase.storage
        .from('signatures')
        .createSignedUrl(booking.contract_signature_url, 60);
      if (signedUrlData?.signedUrl) {
        const imgRes = await fetch(signedUrlData.signedUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString('base64');
        signatureDataUrl = `data:image/png;base64,${base64}`;
      }
    } catch {
      // Signatur-Ladefehler ignorieren
    }
    signedAt = booking.contract_signed_at
      ? new Date(booking.contract_signed_at).toLocaleString('de-DE', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          timeZone: 'Europe/Berlin',
        })
      : '';
  }

  // Steuer-Konfiguration
  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'haftung_config']);

  const taxMap: Record<string, string> = {};
  let haftungConfig: HaftungConfig = DEFAULT_HAFTUNG;
  for (const s of taxSettings ?? []) {
    if (s.key === 'haftung_config') {
      try {
        const parsed = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
        haftungConfig = { ...DEFAULT_HAFTUNG, ...parsed };
      } catch {
        // ignore – Default greift
      }
    } else {
      taxMap[s.key] = s.value;
    }
  }
  const taxMode = (taxMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';

  // Produkt-Kategorie für dynamische Eigenbeteiligung
  let productCategory: string | undefined;
  if (booking.product_id) {
    const { data: cfg } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .maybeSingle();
    try {
      const products = typeof cfg?.value === 'string' ? JSON.parse(cfg.value) : cfg?.value;
      productCategory = products?.[booking.product_id]?.category;
    } catch {
      // ignore
    }
  }
  const eigenbeteiligung = getEigenbeteiligung(haftungConfig, productCategory);

  // Datumsformatierung
  const fmtDate = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  };

  const contractDate = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Berlin',
  });

  const haftungLabel = booking.haftung === 'standard' ? 'Basis-Schadenspauschale'
    : booking.haftung === 'premium' ? 'Premium-Schadenspauschale'
    : 'Ohne Schadenspauschale';

  // Seriennummer laden falls Unit zugeordnet
  let serialNumber = '';
  if (booking.unit_id) {
    const { data: unit } = await supabase
      .from('product_units')
      .select('serial_number')
      .eq('id', booking.unit_id)
      .maybeSingle();
    serialNumber = unit?.serial_number ?? '';
  }

  const accs: string[] = Array.isArray(booking.accessories) ? booking.accessories : [];
  const items = [
    { position: 1, bezeichnung: booking.product_name || '', seriennr: serialNumber, tage: booking.days || 1, preis: booking.price_rental || 0, wiederbeschaffungswert: booking.deposit || 0 },
    ...accs.map((a: string, i: number) => ({ position: i + 2, bezeichnung: a, seriennr: '', tage: booking.days || 1, preis: 0, wiederbeschaffungswert: 0 })),
  ];

  const contractData: RentalContractData = {
    bookingId,
    bookingNumber: bookingId,
    contractDate,
    contractTime: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    customerName: booking.customer_name || 'Kunde',
    customerEmail: booking.customer_email || '',
    customerStreet,
    customerZip,
    customerCity,
    items,
    rentalFrom: fmtDate(booking.rental_from),
    rentalTo: fmtDate(booking.rental_to),
    rentalDays: booking.days || 1,
    deliveryMode: booking.delivery_mode === 'abholung' ? 'Abholung' : 'Versand',
    returnMode: booking.delivery_mode === 'abholung' ? 'Rückgabe vor Ort' : 'Rücksendung',
    deliveryAddress: booking.shipping_address || '',
    priceRental: booking.price_rental || 0,
    priceShipping: booking.shipping_price || 0,
    priceHaftung: booking.price_haftung || 0,
    priceTotal: booking.price_total || 0,
    haftungOption: haftungLabel,
    haftungDescription: haftungLabel === 'Ohne Schadenspauschale'
      ? 'Keine Schadenspauschale gewählt. Haftung bis zum Wiederbeschaffungswert.'
      : haftungLabel === 'Basis-Schadenspauschale'
      ? `Ersatzpflicht auf max. ${eigenbeteiligung} EUR je Schadensereignis begrenzt.`
      : 'Volle Haftungsfreistellung – keine Selbstbeteiligung.',
    eigenbeteiligung,
    stripePaymentIntentId: booking.payment_intent_id || '',
    signatureDataUrl,
    signatureMethod,
    signerName,
    signedAt: signedAt || contractDate,
    ipAddress: ipAddress || '',
    contractHash: contractHash || '',
    productName: booking.product_name,
    accessories: accs,
    priceAccessories: booking.price_accessories || 0,
    deposit: booking.deposit || 0,
    taxMode,
    taxRate: parseFloat(taxMap['tax_rate'] || '19'),
  };

  // PDF generieren
  const pdfBuffer = await renderToBuffer(
    createElement(RentalContractPDF, { data: contractData }) as ReactElement<DocumentProps>
  );

  const contractNumber = bookingId.replace('BK-', 'MV-');

  const pdfBytes = new Uint8Array(pdfBuffer);

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBytes.length),
      'Content-Disposition': `inline; filename="Mietvertrag-${contractNumber}.pdf"`,
    },
  });
}
