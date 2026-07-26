import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import {
  applyPostponeDateMove,
  archiveContractVersion,
  computePostponeTo,
} from '@/lib/booking-postpone';
import {
  loadBufferDays,
  computeShipDate,
  toIsoDate,
} from '@/lib/booking-buffer';
import { getBerlinDateString } from '@/lib/timezone';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { sendPostponementConfirmation } from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60_000 });

/**
 * POST /api/booking/[id]/postpone  (Kunden-Self-Service)
 *
 * Der Kunde verlegt seine Buchung auf einen neuen konkreten Termin (reine
 * Verschiebung, gleiche Dauer/gleicher Preis) und unterschreibt den Vertrag
 * fuer den neuen Zeitraum neu. „Auf unbestimmte Zeit" ist NICHT moeglich
 * (nur Admin).
 *
 * Gates: status='confirmed', bis spaetestens 1 Tag vor dem Versand-/Abholtag,
 * nur EINMAL pro Buchung (postpone_count===0), Vertrag nicht gesperrt.
 * Der Storno-Schutz laeuft ueber cancellation_anchor_date (siehe
 * lib/booking-postpone.ts) — Verlegen oeffnet das kostenlose Storno nicht neu.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte kurz warten.' }, { status: 429 });
  }

  const { id } = await params;

  // Auth: eingeloggter Kunde
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
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const newRentalFrom = typeof body.newRentalFrom === 'string' ? body.newRentalFrom.slice(0, 10) : '';
  const signatureDataUrl = typeof body.signatureDataUrl === 'string' ? body.signatureDataUrl : '';
  const signerName = typeof body.signerName === 'string' ? body.signerName.trim().slice(0, 200) : '';
  const agreedToTerms = body.agreedToTerms === true;
  const acknowledgeCancellation = body.acknowledgeCancellation === true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newRentalFrom)) {
    return NextResponse.json({ error: 'Neues Startdatum fehlt oder ist ungültig.' }, { status: 400 });
  }
  if (!agreedToTerms || !signerName) {
    return NextResponse.json({ error: 'Bitte Vertragsbedingungen bestätigen und unterschreiben.' }, { status: 400 });
  }
  if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Ungültige Unterschrift.' }, { status: 400 });
  }
  if (signatureDataUrl.length * 0.75 > 500_000) {
    return NextResponse.json({ error: 'Unterschrift ist zu groß (max. 500 KB).' }, { status: 400 });
  }
  if (!acknowledgeCancellation) {
    return NextResponse.json(
      { error: 'Bitte bestätige den Hinweis zur Stornierung, um fortzufahren.' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Buchung laden — Eigentuemer-Check.
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (bErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  if (booking.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Diese Buchung kann nicht mehr verlegt werden.' },
      { status: 409 },
    );
  }
  if ((booking.postpone_count ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'Du hast diese Buchung bereits einmal verlegt. Für eine weitere Verlegung kontaktiere uns bitte.' },
      { status: 409 },
    );
  }
  if (booking.contract_locked === true) {
    return NextResponse.json(
      { error: 'Diese Buchung ist freigegeben und kann nicht mehr selbst verlegt werden. Bitte kontaktiere uns.' },
      { status: 409 },
    );
  }

  // Zeit-Gate: nur bis zum Tag VOR dem Versand-/Abholtag.
  const buf = await loadBufferDays(supabase);
  const shipDate = computeShipDate(
    booking.rental_from,
    booking.delivery_mode,
    buf,
    (booking.ship_date_override as string | null) ?? null,
  );
  const todayIso = getBerlinDateString();
  const shipIso = toIsoDate(shipDate);
  if (shipIso <= todayIso) {
    return NextResponse.json(
      { error: 'Die Verlegung ist ab dem Versand-/Abholtag nicht mehr möglich. Bitte kontaktiere uns.' },
      { status: 409 },
    );
  }

  // Neues Datum muss in der Zukunft liegen (nicht in der Vergangenheit versenden).
  const newShipIso = toIsoDate(computeShipDate(newRentalFrom, booking.delivery_mode, buf, null));
  if (newShipIso < todayIso) {
    return NextResponse.json(
      { error: 'Der neue Termin liegt zu früh. Bitte einen späteren Termin wählen.' },
      { status: 400 },
    );
  }

  const oldFrom = String(booking.rental_from).slice(0, 10);
  const oldTo = String(booking.rental_to).slice(0, 10);
  const newTo = computePostponeTo(newRentalFrom, Number(booking.days) || 1);

  // ── Verschiebung (inkl. harter Ueberbuchungs-Pruefung wie echte Buchung) ──
  const moveRes = await applyPostponeDateMove(supabase, {
    booking,
    newFrom: newRentalFrom,
    source: 'customer',
    excludeUserId: user.id,
    request: req,
  });
  if (!moveRes.ok) {
    return NextResponse.json({ error: moveRes.error }, { status: moveRes.status });
  }

  // ── Vertrag: Original archivieren, alte Zeile loeschen, neu unterschreiben ──
  await archiveContractVersion(supabase, booking); // booking = Zustand VOR dem Move (alte Daten)
  await supabase.from('rental_agreements').delete().eq('booking_id', id);

  // Frische Buchung (neue Daten, neu zugewiesene unit_id) fuer die PDF-Erzeugung.
  const { data: fresh } = await supabase.from('bookings').select('*').eq('id', id).single();
  const b = fresh ?? booking;

  let contractError: string | null = null;
  try {
    const { data: taxSettings } = await supabase
      .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
    const taxMode = (taxSettings?.value as string) === 'regelbesteuerung' ? 'regelbesteuerung' : 'kleinunternehmer';

    let profile: { full_name?: string; email?: string; address_street?: string; address_zip?: string; address_city?: string } | null = null;
    if (b.user_id) {
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, email, address_street, address_zip, address_city')
        .eq('id', b.user_id).maybeSingle();
      profile = p;
    }
    const ipAddr = ip === '127.0.0.1' ? 'unknown' : ip;
    const custName = signerName || profile?.full_name || b.customer_name || '';
    const custEmail = profile?.email || b.customer_email || '';
    const fmtDE = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}.${m}.${y}`; };
    const signedAtISO = new Date().toISOString();

    const { pdfBuffer, contractHash } = await generateContractPDF({
      bookingId: id,
      bookingNumber: id,
      customerName: custName,
      customerEmail: custEmail,
      customerStreet: profile?.address_street,
      customerZip: profile?.address_zip,
      customerCity: profile?.address_city,
      productName: b.product_name || '',
      accessories: Array.isArray(b.accessories) ? b.accessories : [],
      accessoryItems: Array.isArray(b.accessory_items) && b.accessory_items.length > 0
        ? b.accessory_items as { accessory_id: string; qty: number }[]
        : undefined,
      rentalFrom: fmtDE(b.rental_from),
      rentalTo: fmtDE(b.rental_to),
      rentalDays: b.days || 1,
      priceRental: b.price_rental || 0,
      priceAccessories: b.price_accessories || 0,
      priceHaftung: b.price_haftung || 0,
      priceShipping: b.shipping_price || 0,
      priceTotal: b.price_total || 0,
      deposit: b.deposit || 0,
      taxMode: taxMode as 'kleinunternehmer' | 'regelbesteuerung',
      taxRate: 19,
      signatureDataUrl,
      signatureMethod: 'canvas',
      signerName: custName,
      ipAddress: ipAddr,
      unitId: b.unit_id ?? null,
    });
    await storeContract(id, pdfBuffer, {
      contractHash,
      customerName: custName,
      ipAddress: ipAddr,
      signedAt: signedAtISO,
      signatureMethod: 'canvas',
    });
  } catch (e) {
    // Der Termin ist bereits verschoben; nur die Neu-Signatur schlug fehl.
    contractError = e instanceof Error ? e.message : 'Vertrag konnte nicht erzeugt werden.';
    console.error('[booking/postpone] contract regeneration failed:', e);
  }

  // ── Bestaetigung an den Kunden + Admin-Notification (non-blocking) ─────────
  if (b.customer_email) {
    sendPostponementConfirmation({
      bookingId: id,
      customerName: (b.customer_name as string) || signerName || 'Kunde',
      customerEmail: b.customer_email as string,
      productName: (b.product_name as string) || '',
      mode: 'date',
      oldFrom, oldTo,
      newFrom: newRentalFrom, newTo,
    }).catch((err) => console.error('[booking/postpone] confirmation mail failed:', err));
  }
  createAdminNotification(supabase, {
    type: 'new_booking',
    title: `Kunde hat Buchung ${id} verlegt`,
    message: `Neuer Zeitraum: ${newRentalFrom} – ${newTo} (bisher ${oldFrom} – ${oldTo}).`,
    link: `/admin/buchungen/${id}`,
  }).catch(() => { /* best-effort */ });

  await logAudit({
    action: 'booking.postpone',
    entityType: 'booking',
    entityId: id,
    changes: { source: 'customer', old: `${oldFrom}–${oldTo}`, neu: `${newRentalFrom}–${newTo}`, contract_error: contractError },
    request: req,
  });

  return NextResponse.json({
    success: true,
    newRentalFrom,
    newRentalTo: newTo,
    contractError,
  });
}
