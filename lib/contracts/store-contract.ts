import { createServiceClient } from '@/lib/supabase';

/**
 * Speichert das Vertrags-PDF in Supabase Storage und erstellt einen
 * unveraenderlichen Eintrag in der rental_agreements-Tabelle.
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
  const year = new Date().getUTCFullYear();
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

  // 2. Signierte URL generieren (7 Tage gueltig)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('contracts')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  if (urlError || !urlData?.signedUrl) {
    throw new Error(`Signierte URL konnte nicht erstellt werden: ${urlError?.message}`);
  }

  // Fuer die DB speichern wir den Storage-Pfad (nicht die signierte URL, da die ablaeuft)
  const pdfUrl = `contracts/${storagePath}`;

  // 3. Eintrag in rental_agreements (unveraenderlich)
  const { error: dbError } = await supabase
    .from('rental_agreements')
    .insert({
      booking_id: bookingId,
      pdf_url: pdfUrl,
      contract_hash: metadata.contractHash,
      signed_by_name: metadata.customerName,
      signed_at: metadata.signedAt,
      ip_address: metadata.ipAddress,
      signature_method: metadata.signatureMethod,
    });

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
