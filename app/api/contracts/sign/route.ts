import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { sendContractEmail } from '@/lib/contracts/send-contract-email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, signatureDataUrl, customerName, agreedToTerms, signatureMethod } = body;

    // 1. Validierungen
    if (!bookingId || !customerName) {
      return NextResponse.json({ error: 'Buchungs-ID und Kundenname erforderlich.' }, { status: 400 });
    }
    if (!agreedToTerms) {
      return NextResponse.json({ error: 'Vertragsbedingungen muessen akzeptiert werden.' }, { status: 400 });
    }

    const method: 'canvas' | 'typed' = signatureMethod === 'typed' ? 'typed' : 'canvas';

    // Canvas-Signatur validieren
    if (method === 'canvas') {
      if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,')) {
        return NextResponse.json({ error: 'Ungueltige Unterschrift.' }, { status: 400 });
      }
      const base64Size = signatureDataUrl.length * 0.75;
      if (base64Size > 500_000) {
        return NextResponse.json({ error: 'Unterschrift ist zu gross (max. 500 KB).' }, { status: 400 });
      }
    }

    // Auth: Kunde (Supabase-Session) ODER Admin (Tablet-Übergabe vor Ort).
    const isAdmin = await checkAdminAuth();
    let userId: string | null = null;
    if (!isAdmin) {
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
      if (!user) {
        return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
      }
      userId = user.id;
    }

    const supabase = createServiceClient();

    // 2. Buchung laden — Nicht-Admins muessen Eigentuemer der Buchung sein.
    let bookingQuery = supabase.from('bookings').select('*').eq('id', bookingId);
    if (!isAdmin && userId) {
      bookingQuery = bookingQuery.eq('user_id', userId);
    }
    const { data: booking, error: bookingError } = await bookingQuery.single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    // 3. Idempotenz: Bereits unterschrieben?
    const { data: existing } = await supabase
      .from('rental_agreements')
      .select('pdf_url')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, contractUrl: existing.pdf_url, alreadySigned: true });
    }

    // 4. IP-Adresse aus Request-Header
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    // 5. Steuer-Konfiguration laden
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'tax_mode')
      .maybeSingle();
    const taxMode = (taxSettings?.value as string) === 'regelbesteuerung' ? 'regelbesteuerung' : 'kleinunternehmer';

    // Kundenprofil separat laden
    let profile: { full_name?: string; email?: string; address_street?: string; address_zip?: string; address_city?: string } | null = null;
    if (booking.user_id) {
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, email, address_street, address_zip, address_city')
        .eq('id', booking.user_id)
        .maybeSingle();
      profile = p;
    }

    // Datumsformatierung
    const fmtDate = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('T')[0].split('-');
      return `${d}.${m}.${y}`;
    };

    const rentalFrom = fmtDate(booking.rental_from);
    const rentalTo = fmtDate(booking.rental_to);

    const custName = customerName || profile?.full_name || booking.customer_name || '';
    const custEmail = profile?.email || booking.customer_email || '';

    // 6. PDF generieren
    const signedAtISO = new Date().toISOString();
    const { pdfBuffer, contractHash } = await generateContractPDF({
      bookingId,
      bookingNumber: bookingId,
      customerName: custName,
      customerEmail: custEmail,
      customerStreet: profile?.address_street,
      customerZip: profile?.address_zip,
      customerCity: profile?.address_city,
      productName: booking.product_name || '',
      accessories: Array.isArray(booking.accessories) ? booking.accessories : [],
      accessoryItems: Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
        ? booking.accessory_items as { accessory_id: string; qty: number }[]
        : undefined,
      rentalFrom,
      rentalTo,
      rentalDays: booking.days || 1,
      priceRental: booking.price_rental || 0,
      priceAccessories: booking.price_accessories || 0,
      priceHaftung: booking.price_haftung || 0,
      priceShipping: booking.shipping_price || 0,
      priceTotal: booking.price_total || 0,
      deposit: booking.deposit || 0,
      taxMode: taxMode as 'kleinunternehmer' | 'regelbesteuerung',
      taxRate: 19,
      signatureDataUrl: method === 'canvas' ? signatureDataUrl : null,
      signatureMethod: method,
      signerName: custName,
      ipAddress: ip,
      unitId: booking.unit_id ?? null,
    });

    // 7. Speichern
    const contractUrl = await storeContract(bookingId, pdfBuffer, {
      contractHash,
      customerName: custName,
      ipAddress: ip,
      signedAt: signedAtISO,
      signatureMethod: method,
    });

    // 8. E-Mail senden (fire-and-forget)
    sendContractEmail({
      to: custEmail,
      customerName: custName,
      bookingId,
      bookingNumber: bookingId,
      productName: booking.product_name || '',
      rentalFrom,
      rentalTo,
      pdfBuffer,
    }).catch(() => { /* Fehler beim Senden ignorieren */ });

    return NextResponse.json({ success: true, contractUrl });
  } catch (err) {
    console.error('[contracts/sign] Fehler:', err);
    return NextResponse.json(
      { error: 'Vertrag konnte nicht erstellt werden. Bitte versuche es erneut.' },
      { status: 500 }
    );
  }
}
