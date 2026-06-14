import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

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

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, contract_signed')
    .eq('id', id)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
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

  await logAudit({
    action: 'booking.reset_contract',
    entityType: 'booking',
    entityId: id,
    changes: { removed_agreements: agreements?.length ?? 0 },
    request: req,
  });

  return NextResponse.json({ success: true });
}
