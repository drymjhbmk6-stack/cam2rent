/**
 * Kern-Anonymisierung eines Kundenkontos (DSGVO Art. 17).
 *
 * Extrahiert aus /api/admin/anonymize-customer, damit sowohl der Admin-Button
 * als auch der Auto-Cleanup-Cron (/api/cron/account-cleanup) exakt dieselbe
 * Logik nutzen und nicht auseinanderlaufen.
 *
 * Diese Funktion enthaelt bewusst KEINE Auth-/Guard-/Audit-Log-Schritte — die
 * bleiben beim Aufrufer (Admin-Route prueft Owner + aktive Buchungen + logt;
 * der Cron filtert Kandidaten selbst und logt eine eigene Audit-Aktion).
 *
 * Was passiert:
 *  - Profil-Stammdaten anonymisieren (Name/Adresse/Telefon), anonymized=true.
 *  - email_log-Empfaengeradressen (PII) durch Anonym-Marker ersetzen.
 *  - Auth-User bannen + E-Mail umbenennen (Original-E-Mail wird wieder frei).
 *  - Storage-Dateien loeschen (Ausweis-Scans, UGC), Ausweis-URLs im Profil leeren.
 *  - admin_audit_log-details zu Buchungen + Kunde scrubben (PII raus).
 *
 * Buchungs-/Rechnungsdaten bleiben (GoBD-Aufbewahrung 10 Jahre).
 */

import type { createServiceClient } from '@/lib/supabase';

type SB = ReturnType<typeof createServiceClient>;

export async function anonymizeCustomerCore(
  supabase: SB,
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  // 1) Kundenstammdaten anonymisieren
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: 'Gelöschter Kunde',
      phone: null,
      address_street: null,
      address_zip: null,
      address_city: null,
      anonymized: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  if (error) {
    console.error('[anonymize-core] profile update error:', error);
    return { ok: false, error: error.message };
  }

  // 2) E-Mail-Logs anonymisieren (Empfaenger-Adresse + Subject koennen PII sein).
  //    Booking-Referenz bleibt (GoBD 10 Jahre), nur die Adresse wird ersetzt.
  try {
    const { data: customerBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', customerId);
    const bookingIds = (customerBookings ?? []).map((b) => b.id);

    if (bookingIds.length > 0) {
      await supabase
        .from('email_log')
        .update({ recipient_email: 'anonymisiert@anonymisiert.local' })
        .in('booking_id', bookingIds);
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(customerId);
    const oldEmail = authUser?.user?.email;
    if (oldEmail && !oldEmail.endsWith('@anonymisiert.local')) {
      await supabase
        .from('email_log')
        .update({ recipient_email: 'anonymisiert@anonymisiert.local' })
        .eq('recipient_email', oldEmail);
    }
  } catch (logErr) {
    console.error('[anonymize-core] email-log warning:', logErr);
  }

  // 3) Auth-Account deaktivieren + Original-E-Mail freigeben
  try {
    await supabase.auth.admin.updateUserById(customerId, {
      email: `deleted_${customerId}@anonymisiert.local`,
      user_metadata: { full_name: 'Gelöschter Kunde' },
      ban_duration: '876000h', // ~100 Jahre = effektiv permanent
    });
  } catch (authErr) {
    console.error('[anonymize-core] auth deactivation error:', authErr);
  }

  // 4) Storage-Files DSGVO-konform loeschen + Audit scrubben
  try {
    // 4a) Ausweis-Scans
    const { data: idFiles } = await supabase.storage.from('id-documents').list(customerId);
    if (idFiles && idFiles.length > 0) {
      const idPaths = idFiles.map((f) => `${customerId}/${f.name}`);
      await supabase.storage.from('id-documents').remove(idPaths);
    }
    await supabase
      .from('profiles')
      .update({ id_front_url: null, id_back_url: null })
      .eq('id', customerId);

    // 4b) Customer-UGC
    const { data: ugcRows } = await supabase
      .from('customer_ugc_submissions')
      .select('id, file_paths')
      .eq('user_id', customerId);
    for (const ugc of ugcRows ?? []) {
      const paths = (ugc.file_paths ?? []) as string[];
      if (paths.length > 0) {
        await supabase.storage.from('customer-ugc').remove(paths);
      }
    }
    await supabase
      .from('customer_ugc_submissions')
      .update({ status: 'withdrawn', file_paths: [], file_kinds: [] })
      .eq('user_id', customerId);

    // 4c) admin_audit_log-details scrubben (PII in details-JSONB)
    const { data: customerBookings2 } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', customerId);
    const bookingIds2 = (customerBookings2 ?? []).map((b) => b.id);
    if (bookingIds2.length > 0) {
      await supabase
        .from('admin_audit_log')
        .update({ details: { anonymized: true } })
        .in('entity_id', bookingIds2);
    }
    await supabase
      .from('admin_audit_log')
      .update({ details: { anonymized: true } })
      .eq('entity_type', 'customer')
      .eq('entity_id', customerId);
  } catch (storageErr) {
    console.error('[anonymize-core] storage/audit cleanup error:', storageErr);
  }

  return { ok: true };
}
