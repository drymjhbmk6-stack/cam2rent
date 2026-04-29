import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/booking/[id]
 * Gibt eine einzelne Buchung mit allen Feldern + Kundenprofil +
 * Vertragsdaten (rental_agreements) + E-Mail-Verlauf (email_log) zurück.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Seriennummer laden falls Unit zugeordnet
  let serialNumber: string | null = null;
  if (booking.unit_id) {
    const { data: unit } = await supabase
      .from('product_units')
      .select('serial_number')
      .eq('id', booking.unit_id)
      .maybeSingle();
    serialNumber = unit?.serial_number ?? null;
  }
  booking.serial_number = serialNumber;

  // Zubehoer + Sets aufloesen — fuer Packliste, Uebergabeprotokoll, Vertrag.
  // accessory_items hat Vorrang (qty-aware), sonst accessories[] mit qty=1.
  // Fuer jedes Element wird der Name aus accessories ODER sets aufgeloest.
  // Bei Sets werden zusaetzlich die enthaltenen accessory_items expandiert,
  // damit die Packliste das vollstaendige Inventar zeigt.
  type ResolvedItem = { id: string; name: string; qty: number; isFromSet?: boolean; setName?: string };
  const rawItems: { accessory_id: string; qty: number }[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? (booking.accessory_items as { accessory_id: string; qty: number }[])
    : (Array.isArray(booking.accessories) ? booking.accessories as string[] : []).map((aid) => ({ accessory_id: aid, qty: 1 }));

  const resolved: ResolvedItem[] = [];
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

    // Set-Sub-Item-Namen separat nachladen (wenn nicht schon im accNameMap)
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
        // Set-Container-Zeile zur Orientierung, dann Sub-Items expandiert
        resolved.push({ id: item.accessory_id, name: setInfo.name, qty: item.qty });
        for (const sub of setInfo.items) {
          resolved.push({
            id: sub.accessory_id,
            name: accNameMap[sub.accessory_id] ?? sub.accessory_id,
            qty: (sub.qty || 1) * item.qty,
            isFromSet: true,
            setName: setInfo.name,
          });
        }
      } else {
        resolved.push({
          id: item.accessory_id,
          name: accNameMap[item.accessory_id] ?? item.accessory_id,
          qty: item.qty,
        });
      }
    }
  }
  booking.resolved_items = resolved;

  // Kundenprofil laden
  let customer = null;
  if (booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, address_street, address_zip, address_city, blacklisted, verification_status')
      .eq('id', booking.user_id)
      .maybeSingle();
    customer = profile;
  }

  // Vertragsdaten laden (rental_agreements)
  let agreement = null;
  const { data: agreementData } = await supabase
    .from('rental_agreements')
    .select('id, pdf_url, contract_hash, signed_by_name, signed_at, ip_address, signature_method, created_at')
    .eq('booking_id', id)
    .maybeSingle();
  if (agreementData) agreement = agreementData;

  // Self-Heal Stufe 1: rental_agreements existiert, aber bookings.contract_signed
  // ist false (storeContract zwischen Step 3 und Step 4 abgebrochen, oder
  // after()-Race) → beide Datenpunkte synchronisieren.
  if (agreement && !booking.contract_signed) {
    await supabase
      .from('bookings')
      .update({
        contract_signed: true,
        contract_signed_at: agreement.signed_at,
      })
      .eq('id', id);
    booking.contract_signed = true;
    booking.contract_signed_at = agreement.signed_at;
  }

  // Self-Heal Stufe 2: Kein agreements-Eintrag, aber das PDF liegt schon im
  // Storage. Passiert wenn der after()-Block storeContract gestartet hat und
  // der Storage-Upload durchging, der DB-Insert in rental_agreements aber nicht
  // mehr (Container-Restart, RLS-Hiccup). Wir tragen den Eintrag nach und
  // synchronisieren contract_signed.
  if (!agreement && !booking.contract_signed) {
    // Berlin-Jahr berechnen — storeContract nutzt es ebenfalls. Plus Vorjahr
    // als Fallback für Buchungen rund um Silvester.
    const berlinYear = parseInt(
      new Date().toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Europe/Berlin' }),
      10,
    );
    for (const year of [berlinYear, berlinYear - 1]) {
      const path = `${year}/${id}.pdf`;
      const { data: file } = await supabase.storage.from('contracts').download(path);
      if (!file) continue;
      // PDF gefunden → agreements-Row + contract_signed nachtragen.
      const signedAt = booking.created_at || new Date().toISOString();
      const signerName = booking.contract_signer_name || booking.customer_name || 'Unbekannt';
      const { data: inserted } = await supabase
        .from('rental_agreements')
        .insert({
          booking_id: id,
          pdf_url: `contracts/${path}`,
          contract_hash: 'restored-from-storage',
          signed_by_name: signerName,
          signed_at: signedAt,
          ip_address: 'unknown',
          signature_method: 'canvas',
        })
        .select('id, pdf_url, contract_hash, signed_by_name, signed_at, ip_address, signature_method, created_at')
        .single();
      if (inserted) {
        agreement = inserted;
        await supabase
          .from('bookings')
          .update({ contract_signed: true, contract_signed_at: signedAt })
          .eq('id', id);
        booking.contract_signed = true;
        booking.contract_signed_at = signedAt;
        console.log('[booking-detail] Storage-Scan-Self-Heal erfolgreich für', id, path);
      }
      break;
    }
  }

  // E-Mail-Verlauf laden (email_log)
  const { data: emails } = await supabase
    .from('email_log')
    .select('id, email_type, subject, status, customer_email, resend_message_id, error_message, created_at')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ booking, customer, agreement, emails: emails ?? [] });
}

/**
 * PATCH /api/admin/booking/[id]
 * Body: { status?: string, customer_email?: string }
 * Aktualisiert den Buchungsstatus oder Kundendaten.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, cancellation_reason, customer_email, verification_gate } = body as {
    status?: string;
    cancellation_reason?: string;
    customer_email?: string;
    verification_gate?: 'approve' | 'revoke';
  };

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = {};

  // E-Mail aktualisieren
  if (customer_email !== undefined) {
    updates.customer_email = customer_email || null;
  }

  // Verification-Gate manuell freigeben / widerrufen
  // (idempotent; bei unbekannter Spalte ignoriert Supabase still den Wert nicht —
  //  daher wird die Migration `supabase-verification-deferred.sql` vorausgesetzt,
  //  sobald Admin das Gate explizit benutzt).
  if (verification_gate === 'approve') {
    updates.verification_gate_passed_at = new Date().toISOString();
  } else if (verification_gate === 'revoke') {
    updates.verification_gate_passed_at = null;
  }

  // Status aktualisieren
  if (status) {
    const allowed = ['pending_verification', 'awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed', 'cancelled', 'damaged'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
    }
    updates.status = status;

    // Bei Stornierung: Grund in Notizen speichern
    if (status === 'cancelled' && cancellation_reason) {
      const { data: existing } = await supabase
        .from('bookings')
        .select('notes')
        .eq('id', id)
        .maybeSingle();
      const existingNotes = existing?.notes ? `${existing.notes} | ` : '';
      updates.notes = `${existingNotes}Stornierungsgrund: ${cancellation_reason}`;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Booking update error:', error);
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen.' }, { status: 500 });
  }

  // Audit-Log mit passendem Action-Namen
  let action = 'booking.update';
  if (status === 'cancelled') action = 'booking.cancel';
  else if (verification_gate) action = 'booking.verification_gate';
  else if (customer_email !== undefined && !status) action = 'booking.email_updated';

  await logAudit({
    action,
    entityType: 'booking',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/booking/[id]
 * Löscht eine Buchung unwiderruflich aus der Datenbank.
 * Erfordert Admin-Passwort.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { password } = body as { password?: string };

  // Bestätigung durch Admin-Passwort (zusätzlich zur Middleware-Auth).
  // Verhindert versehentliches Löschen, z.B. wenn Admin-Tablet offen liegt.
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Falsches Passwort.' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Zugehörige Daten löschen (rental_agreements, email_log)
  await supabase.from('rental_agreements').delete().eq('booking_id', id);
  await supabase.from('email_log').delete().eq('booking_id', id);

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Booking delete error:', error);
    return NextResponse.json({ error: 'Buchung konnte nicht gelöscht werden.' }, { status: 500 });
  }

  await logAudit({
    action: 'booking.delete',
    entityType: 'booking',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
