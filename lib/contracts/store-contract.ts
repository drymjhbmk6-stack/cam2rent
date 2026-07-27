import { createServiceClient } from '@/lib/supabase';
import { sha256Hex } from '@/lib/contracts/pdf-hash';

/**
 * Speichert das Vertrags-PDF in Supabase Storage und erstellt einen
 * unveränderlichen Eintrag in der rental_agreements-Tabelle.
 *
 * Bucket: contracts (privat, nur signierte URLs)
 * Pfad: contracts/{year}/{bookingId}.pdf
 */
export async function storeContract(
  bookingId: string,
  pdfBuffer: Buffer,
  metadata: {
    contractHash: string;
    customerName: string;
    ipAddress: string;
    signedAt: string;            // ISO UTC-Timestamp
    signatureMethod: 'canvas' | 'typed';
  }
): Promise<string> {
  const supabase = createServiceClient();
  // Jahr in Berlin-Zeit, damit Vertraege rund um Silvester (z.B. 01.01. 00:30
  // Berlin = 31.12. 23:30 UTC) im richtigen Jahres-Ordner landen.
  const year = parseInt(
    new Date().toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Europe/Berlin' }),
    10,
  );
  const storagePath = `${year}/${bookingId}.pdf`;

  // 1. PDF in Supabase Storage hochladen
  const { error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Vertrag konnte nicht hochgeladen werden: ${uploadError.message}`);
  }

  // 2. Signierte URL generieren (7 Tage gültig)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('contracts')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  if (urlError || !urlData?.signedUrl) {
    throw new Error(`Signierte URL konnte nicht erstellt werden: ${urlError?.message}`);
  }

  // Für die DB speichern wir den Storage-Pfad (nicht die signierte URL, da die abläuft)
  const pdfUrl = `contracts/${storagePath}`;

  // Integritäts-Hash der konkreten PDF-Datei-Bytes (unabhängig vom
  // logischen contract_hash) — ermöglicht die Byte-Verifikation beim Ausliefern.
  const pdfSha256 = sha256Hex(pdfBuffer);

  // 3. Eintrag in rental_agreements (unveränderlich)
  const insertRow = {
    booking_id: bookingId,
    pdf_url: pdfUrl,
    contract_hash: metadata.contractHash,
    pdf_sha256: pdfSha256,
    signed_by_name: metadata.customerName,
    signed_at: metadata.signedAt,
    ip_address: metadata.ipAddress,
    signature_method: metadata.signatureMethod,
  };
  let { error: dbError } = await supabase.from('rental_agreements').insert(insertRow);

  // Defensiv: fehlt die pdf_sha256-Spalte (Migration noch nicht ausgeführt),
  // ohne den Hash erneut versuchen.
  if (dbError && /pdf_sha256|column|schema cache|PGRST/i.test(dbError.message || '')) {
    const { pdf_sha256: _omit, ...withoutHash } = insertRow;
    void _omit;
    ({ error: dbError } = await supabase.from('rental_agreements').insert(withoutHash));
  }

  if (dbError) {
    // Idempotenz: Wenn bereits vorhanden, kein Fehler
    if (dbError.code === '23505') {
      // Unique violation — Vertrag existiert bereits
      const { data: existing } = await supabase
        .from('rental_agreements')
        .select('pdf_url')
        .eq('booking_id', bookingId)
        .single();
      return existing?.pdf_url ?? pdfUrl;
    }
    throw new Error(`Vertragsdaten konnten nicht gespeichert werden: ${dbError.message}`);
  }

  // 4. Buchung als contract_signed markieren
  await supabase
    .from('bookings')
    .update({
      contract_signed: true,
      contract_signed_at: metadata.signedAt,
    })
    .eq('id', bookingId);

  return pdfUrl;
}
