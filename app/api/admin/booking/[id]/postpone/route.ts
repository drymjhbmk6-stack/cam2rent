import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { applyPostponeDateMove, archiveContractVersion, computePostponeTo } from '@/lib/booking-postpone';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { sendPostponementConfirmation, sendContractResignRequest } from '@/lib/email';
import { logAudit } from '@/lib/audit';

const TERMINAL = ['cancelled', 'completed', 'returned'];

/**
 * POST /api/admin/booking/[id]/postpone  (Admin)
 *
 * Verlegt eine Buchung auf einen neuen Termin (mode='date') ODER auf
 * unbestimmte Zeit (mode='indefinite', nur Admin — gibt das Inventar frei).
 * Der Admin unterliegt keinen Zeit-/Einmal-Limits.
 *
 * Body: { mode, rental_from?, reason, target_date?, notify? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === 'indefinite' ? 'indefinite' : 'date';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const notify = body.notify !== false;
  const targetDate = typeof body.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.target_date)
    ? body.target_date : null;

  if (reason.length < 3) {
    return NextResponse.json({ error: 'Bitte einen Grund angeben (min. 3 Zeichen).' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: booking, error: bErr } = await supabase
    .from('bookings').select('*').eq('id', id).single();
  if (bErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (TERMINAL.includes(booking.status)) {
    return NextResponse.json({ error: 'Stornierte/abgeschlossene Buchungen können nicht verlegt werden.' }, { status: 409 });
  }

  const oldFrom = String(booking.rental_from).slice(0, 10);
  const oldTo = String(booking.rental_to).slice(0, 10);
  const dateStr = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
  const existingNotes = booking.notes ? `${booking.notes} | ` : '';

  // ── Mode: neuer konkreter Termin ──────────────────────────────────────────
  if (mode === 'date') {
    const newFrom = typeof body.rental_from === 'string' ? body.rental_from.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newFrom)) {
      return NextResponse.json({ error: 'Neues Startdatum fehlt oder ist ungültig.' }, { status: 400 });
    }
    const newTo = computePostponeTo(newFrom, Number(booking.days) || 1);

    const moveRes = await applyPostponeDateMove(supabase, {
      booking, newFrom, source: 'admin', request: req,
    });
    if (!moveRes.ok) {
      return NextResponse.json({ error: moveRes.error }, { status: moveRes.status });
    }

    // Notiz anhaengen
    await supabase.from('bookings').update({
      notes: `${existingNotes}Verlegt (${dateStr}): ${oldFrom}–${oldTo} → ${newFrom}–${newTo}. ${reason}`,
    }).eq('id', id);

    // Vertrag: war er unterschrieben, muss der Kunde fuer den neuen Zeitraum
    // neu unterschreiben → Original archivieren, zuruecksetzen, Resign-Mail.
    let resignRequested = false;
    if (booking.contract_signed && !booking.contract_locked) {
      const customerEmail = (booking.customer_email as string | null)?.trim() || '';
      await archiveContractVersion(supabase, booking);
      await supabase.from('rental_agreements').delete().eq('booking_id', id);
      const resetPayload: Record<string, unknown> = {
        contract_signed: false, contract_signed_at: null,
        contract_signature_url: null, contract_signer_name: null,
      };
      let { error: rErr } = await supabase.from('bookings').update(resetPayload).eq('id', id);
      if (rErr && /contract_signature_url|contract_signer_name|column/i.test(rErr.message || '')) {
        const r = await supabase.from('bookings')
          .update({ contract_signed: false, contract_signed_at: null }).eq('id', id);
        rErr = r.error;
      }
      if (customerEmail) {
        resignRequested = true;
        sendContractResignRequest({
          customerName: String(booking.customer_name || '').trim() || 'Kunde',
          customerEmail,
          bookingNumber: id,
          productName: (booking.product_name as string) || undefined,
          rentalFrom: newFrom,
          rentalTo: newTo,
        }).catch((e) => console.error('[admin/postpone] resign mail failed:', e));
      }
    }

    // Bestaetigungs-Mail an den Kunden (neuer Termin).
    if (notify && booking.customer_email) {
      sendPostponementConfirmation({
        bookingId: id,
        customerName: (booking.customer_name as string) || 'Kunde',
        customerEmail: booking.customer_email as string,
        productName: (booking.product_name as string) || '',
        mode: 'date', oldFrom, oldTo, newFrom, newTo,
      }).catch((e) => console.error('[admin/postpone] confirmation mail failed:', e));
    }

    await logAudit({
      action: 'booking.postpone', entityType: 'booking', entityId: id,
      changes: { source: 'admin', mode: 'date', old: `${oldFrom}–${oldTo}`, neu: `${newFrom}–${newTo}`, reason, resign_requested: resignRequested },
      request: req,
    });

    return NextResponse.json({ success: true, mode: 'date', newRentalFrom: newFrom, newRentalTo: newTo, resignRequested });
  }

  // ── Mode: auf unbestimmte Zeit ────────────────────────────────────────────
  // Status 'postponed' → reserviert kein Inventar; Zubehoer-Exemplare freigeben.
  const upd: Record<string, unknown> = {
    status: 'postponed',
    postponed_at: new Date().toISOString(),
    postpone_reason: reason,
    postpone_target_date: targetDate,
    original_rental_from: (booking.original_rental_from as string | null) ?? oldFrom,
    original_rental_to: (booking.original_rental_to as string | null) ?? oldTo,
    cancellation_anchor_date: (() => {
      const ex = (booking.cancellation_anchor_date as string | null)?.slice(0, 10) ?? null;
      return ex ? (ex < oldFrom ? ex : oldFrom) : oldFrom;
    })(),
    notes: `${existingNotes}Auf unbestimmte Zeit verlegt (${dateStr}): ${reason}`,
  };

  // Defensiver Strip fehlender Spalten (Migration ausstehend) — Status + Notiz
  // laufen in jedem Fall durch, damit das Inventar freigegeben wird.
  const updTry: Record<string, unknown> = { ...upd };
  let updErr: { message?: string } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await supabase.from('bookings').update(updTry).eq('id', id);
    updErr = r.error;
    if (!updErr) break;
    const m = (updErr.message || '').match(/Could not find the '([^']+)' column/i);
    const col = m?.[1];
    if (col && col in updTry && col !== 'status') { delete updTry[col]; continue; }
    break;
  }
  if (updErr) {
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${updErr.message}` }, { status: 500 });
  }

  // Zubehoer-Exemplare freigeben (Kameras werden durch den nicht-reservierenden
  // Status 'postponed' implizit frei).
  await releaseAccessoryUnitsFromBooking(id).catch((e) => console.error('[admin/postpone] release accessories failed:', e));

  if (notify && booking.customer_email) {
    sendPostponementConfirmation({
      bookingId: id,
      customerName: (booking.customer_name as string) || 'Kunde',
      customerEmail: booking.customer_email as string,
      productName: (booking.product_name as string) || '',
      mode: 'indefinite', oldFrom, oldTo, targetDate,
    }).catch((e) => console.error('[admin/postpone] indefinite mail failed:', e));
  }

  await logAudit({
    action: 'booking.postpone', entityType: 'booking', entityId: id,
    changes: { source: 'admin', mode: 'indefinite', old: `${oldFrom}–${oldTo}`, reason, target_date: targetDate },
    request: req,
  });

  return NextResponse.json({ success: true, mode: 'indefinite' });
}
