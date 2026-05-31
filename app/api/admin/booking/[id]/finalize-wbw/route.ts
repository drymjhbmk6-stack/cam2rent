import { NextRequest, NextResponse } from 'next/server';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { sendWbwConfirmation } from '@/lib/email';
import { WbwConfirmationPdf, type WbwConfirmationItem } from '@/lib/wbw-confirmation-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ReqItem = { name?: string; serial?: string | null; value?: number };

function storagePath(bookingId: string) {
  // Buchungsnummer (C2R-YYWW-NNN) ist eindeutig → kein Jahres-Ordner noetig,
  // damit das Re-Download-GET den Pfad deterministisch rekonstruieren kann.
  const safe = bookingId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `wbw/${safe}.pdf`;
}

async function loadCustomer(supabase: ReturnType<typeof createServiceClient>, booking: Record<string, unknown>) {
  let full_name = (booking.customer_name as string) || '';
  let address_street = '';
  let address_zip = '';
  let address_city = '';
  if (booking.user_id) {
    const { data: p } = await supabase
      .from('profiles')
      .select('full_name, address_street, address_zip, address_city')
      .eq('id', booking.user_id as string)
      .maybeSingle();
    if (p) {
      full_name = full_name || (p.full_name as string) || '';
      address_street = (p.address_street as string) || '';
      address_zip = (p.address_zip as string) || '';
      address_city = (p.address_city as string) || '';
    }
  }
  return { full_name, address_street, address_zip, address_city };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resend = body?.resend === true;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, rental_from, rental_to, user_id, customer_name, customer_email, wbw_finalized, wbw_finalized_at, wbw_final')
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (!booking.customer_email) {
    return NextResponse.json({ error: 'Keine E-Mail-Adresse beim Mieter hinterlegt.' }, { status: 400 });
  }

  // Idempotenz: einmal finalisiert bleibt finalisiert. Nur expliziter
  // Nachversand (resend) darf danach erneut laufen.
  if (booking.wbw_finalized && !resend) {
    return NextResponse.json({ error: 'Wiederbeschaffungswerte sind bereits finalisiert.' }, { status: 409 });
  }

  // Positionen bestimmen: bei resend aus DB, sonst aus dem Request.
  let items: WbwConfirmationItem[];
  if (resend) {
    const stored = Array.isArray(booking.wbw_final) ? booking.wbw_final as ReqItem[] : [];
    if (stored.length === 0) {
      return NextResponse.json({ error: 'Keine finalisierten Werte zum Nachsenden vorhanden.' }, { status: 400 });
    }
    items = stored.map((it, i) => ({
      position: i + 1,
      name: String(it.name ?? ''),
      serial: it.serial ?? null,
      value: Number(it.value ?? 0),
    }));
  } else {
    const raw: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
    if (raw.length === 0) {
      return NextResponse.json({ error: 'Keine Positionen übergeben.' }, { status: 400 });
    }
    // Werte duerfen 0 sein (leeres Feld → 0 €). Negative Werte werden auf 0
    // geklemmt, NaN ebenfalls.
    items = raw.map((it, i) => ({
      position: i + 1,
      name: String(it.name ?? '').slice(0, 200),
      serial: it.serial ? String(it.serial).slice(0, 120) : null,
      value: Math.max(0, Math.round((Number(it.value) || 0) * 100) / 100),
    }));
  }

  const totalWbw = Math.round(items.reduce((s, it) => s + it.value, 0) * 100) / 100;
  const finalizedAtIso = (resend && booking.wbw_finalized_at)
    ? String(booking.wbw_finalized_at)
    : new Date().toISOString();

  // 1. Finalisieren persistieren (nicht bei resend — Werte stehen schon).
  if (!resend) {
    const persist = {
      wbw_final: items.map((it) => ({ name: it.name, serial: it.serial, value: it.value })),
      wbw_finalized: true,
      wbw_finalized_at: finalizedAtIso,
    };
    const { error: upErr } = await supabase.from('bookings').update(persist).eq('id', id);
    if (upErr) {
      if (/wbw_final|wbw_finalized/i.test(upErr.message || '')) {
        return NextResponse.json(
          { error: 'WBW-Finalisierung nicht möglich — DB-Migration steht noch aus.' },
          { status: 503 },
        );
      }
      console.error('[finalize-wbw] persist error:', upErr);
      return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
    }
  }

  // 2. PDF erzeugen
  const customer = await loadCustomer(supabase, booking);
  const pdfBuffer = Buffer.from(await renderToBuffer(
    createElement(WbwConfirmationPdf, {
      data: {
        bookingId: booking.id as string,
        rentalFrom: booking.rental_from as string,
        rentalTo: booking.rental_to as string,
        finalizedAt: finalizedAtIso,
        customerName: customer.full_name,
        customerStreet: customer.address_street,
        customerZipCity: `${customer.address_zip} ${customer.address_city}`.trim(),
        customerEmail: booking.customer_email as string,
        items,
        totalWbw,
      },
    }) as ReactElement<DocumentProps>,
  ));

  // 3. PDF in Storage (contracts-Bucket, eigener wbw/-Prefix), upsert
  const path = storagePath(booking.id as string);
  await supabase.storage.from('contracts').upload(path, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  const { data: signed } = await supabase.storage
    .from('contracts')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  const pdfUrl = signed?.signedUrl ?? null;

  await logAudit({
    action: resend ? 'booking.wbw_resend' : 'booking.wbw_finalize',
    entityType: 'booking',
    entityId: booking.id as string,
    changes: { total_wbw: totalWbw, positions: items.length },
    request: req,
  });

  // 4. E-Mail mit PDF-Anhang. Bei Fehler: WBW + PDF bleiben gespeichert.
  try {
    await sendWbwConfirmation({
      bookingId: booking.id as string,
      customerName: customer.full_name,
      customerEmail: booking.customer_email as string,
      rentalFrom: booking.rental_from as string,
      rentalTo: booking.rental_to as string,
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error('[finalize-wbw] E-Mail-Versand fehlgeschlagen:', mailErr);
    return NextResponse.json({
      success: false,
      error: 'WBW gespeichert, E-Mail fehlgeschlagen — bitte manuell nachsenden.',
      pdfUrl,
    }, { status: 200 });
  }

  await supabase.from('bookings').update({ wbw_email_sent_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json({ success: true, sentTo: booking.customer_email, pdfUrl });
}

// Frische signierte URL fuer den erneuten PDF-Download (Signed URLs laufen ab).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: signed } = await supabase.storage
    .from('contracts')
    .createSignedUrl(storagePath(id), 60 * 5);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'PDF nicht gefunden.' }, { status: 404 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
