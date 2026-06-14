import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { sendContractResignRequest } from '@/lib/email';

/**
 * POST /api/admin/booking/[id]/reset-contract
 *
 * Setzt den Mietvertrag einer Buchung komplett zurueck, damit der Kunde
 * neu unterschreiben muss. Typischer Fall: das erzeugte Vertrags-PDF
 * enthielt keine Unterschrift (PDF-/Signatur-Glitch).
 *
 * Wirkung:
 *  - Loescht die `rental_agreements`-Zeile(n) der Buchung (sonst blockiert
 *    der Idempotenz-Check in /api/contracts/sign ein erneutes Unterschreiben).
 *  - Loescht das gespeicherte PDF aus dem `contracts`-Bucket (best-effort).
 *  - Setzt `bookings.contract_signed=false`, `contract_signed_at=null` und
 *    leert die zwischengespeicherte Signatur (`contract_signature_url` +
 *    `contract_signer_name`) — damit NICHT automatisch aus der alten,
 *    fehlerhaften Signatur regeneriert wird, sondern frisch unterschrieben.
 *
 * Danach erscheint die Buchung wieder als „nicht unterschrieben": der Kunde
 * sieht in `/konto/buchungen` (Status confirmed/shipped) die
 * „Mietvertrag unterschreiben"-Maske, der Admin kann alternativ ueber das
 * Tablet (`/admin/buchungen/[id]/vertrag-unterschreiben`) unterschreiben lassen.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const baseCols = 'id, contract_signed, customer_name, customer_email, product_name, rental_from, rental_to';
  let booking: Record<string, unknown> | null = null;
  {
    const r = await supabase
      .from('bookings')
      .select(`${baseCols}, contract_locked`)
      .eq('id', id)
      .maybeSingle();
    if (r.error && /contract_locked|column/i.test(r.error.message || '')) {
      // Defensive: Migration noch nicht durch → ohne die Lock-Spalte laden.
      const r2 = await supabase.from('bookings').select(baseCols).eq('id', id).maybeSingle();
      booking = (r2.data as Record<string, unknown> | null) ?? null;
      if (r2.error || !booking) {
        return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
      }
    } else if (r.error || !r.data) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    } else {
      booking = r.data as Record<string, unknown>;
    }
  }

  // Gesperrte Vertraege ("Alles okay" gesetzt) duerfen nicht zurueckgesetzt werden.
  if ((booking as { contract_locked?: boolean }).contract_locked) {
    return NextResponse.json(
      { error: 'Dieser Vertrag wurde als geprüft freigegeben und ist gesperrt. Erst die Freigabe aufheben.' },
      { status: 409 },
    );
  }

  // E-Mail ist Pflicht: ohne Kunden-Adresse koennen wir den Kunden nicht zur
  // Neu-Unterschrift auffordern → Reset wird abgelehnt (Admin traegt erst eine
  // E-Mail in den Buchungsdetails nach).
  const customerEmail = (booking as { customer_email?: string | null }).customer_email?.trim() || '';
  if (!customerEmail) {
    return NextResponse.json(
      { error: 'Keine Kunden-E-Mail hinterlegt. Bitte zuerst eine E-Mail-Adresse bei der Buchung eintragen — der Kunde muss per E-Mail zur Neu-Unterschrift aufgefordert werden.' },
      { status: 422 },
    );
  }

  // 1. Storage-PDFs der vorhandenen Vertragsfassungen einsammeln + loeschen.
  const { data: agreements } = await supabase
    .from('rental_agreements')
    .select('pdf_url')
    .eq('booking_id', id);

  const storagePaths: string[] = [];
  for (const a of agreements ?? []) {
    const url = (a as { pdf_url?: string | null }).pdf_url;
    if (typeof url === 'string' && url.startsWith('contracts/')) {
      // gespeichert als "contracts/<year>/<bookingId>.pdf" → Bucket-relativer Pfad
      storagePaths.push(url.replace(/^contracts\//, ''));
    }
  }
  if (storagePaths.length > 0) {
    // best-effort — ein fehlendes File darf den Reset nicht blockieren
    await supabase.storage.from('contracts').remove(storagePaths).catch(() => {});
  }

  // 2. rental_agreements-Zeile(n) loeschen (service-role umgeht die
  //    Immutable-RLS). Ohne das blockt der Idempotenz-Check ein Neu-Signieren.
  const { error: delErr } = await supabase
    .from('rental_agreements')
    .delete()
    .eq('booking_id', id);
  if (delErr) {
    return NextResponse.json(
      { error: `Vertragszeile konnte nicht entfernt werden: ${delErr.message}` },
      { status: 500 },
    );
  }

  // 3. Buchung zuruecksetzen + zwischengespeicherte Signatur leeren.
  const resetPayload = {
    contract_signed: false,
    contract_signed_at: null,
    contract_signature_url: null,
    contract_signer_name: null,
  };
  let { error: updErr } = await supabase.from('bookings').update(resetPayload).eq('id', id);
  if (updErr && /contract_signature_url|contract_signer_name|column/i.test(updErr.message || '')) {
    // Defensive: aeltere Schemas ohne die zwischengespeicherten Signatur-Spalten
    const r = await supabase
      .from('bookings')
      .update({ contract_signed: false, contract_signed_at: null })
      .eq('id', id);
    updErr = r.error;
  }
  if (updErr) {
    return NextResponse.json(
      { error: `Buchung konnte nicht zurueckgesetzt werden: ${updErr.message}` },
      { status: 500 },
    );
  }

  // 4. Pflicht-E-Mail an den Kunden: bitte neu unterschreiben.
  let emailSent = true;
  let emailError: string | null = null;
  try {
    await sendContractResignRequest({
      customerName: String(booking.customer_name || '').trim() || 'Kunde',
      customerEmail,
      bookingNumber: id,
      productName: (booking.product_name as string) || undefined,
      rentalFrom: (booking.rental_from as string) || undefined,
      rentalTo: (booking.rental_to as string) || undefined,
    });
  } catch (err) {
    emailSent = false;
    emailError = err instanceof Error ? err.message : 'E-Mail-Versand fehlgeschlagen.';
    console.error('[reset-contract] resign email failed:', err);
  }

  await logAudit({
    action: 'booking.reset_contract',
    entityType: 'booking',
    entityId: id,
    changes: { removed_agreements: agreements?.length ?? 0, email_sent: emailSent },
    request: req,
  });

  return NextResponse.json({ success: true, emailSent, emailError });
}
