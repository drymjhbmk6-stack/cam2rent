import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/anonymize-customer
 * Body: { customerId: string, password?: string }
 *
 * Anonymisiert Kundenstammdaten (Name, Adresse, Telefon).
 * Buchungs- und Rechnungsdaten bleiben 10 Jahre erhalten.
 *
 * NUR Owner — Mitarbeiter mit `kunden`-Permission koennten sonst Spuren in
 * `email_log` (recipient_email -> 'anonymisiert@anonymisiert.local') verwischen
 * oder Massen-Anonymisierungen ausloesen (Audit Sweep 6, Vuln 19).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me || me.role !== 'owner') {
    return NextResponse.json({ error: 'Nur Owner duerfen Kunden anonymisieren.' }, { status: 403 });
  }

  const { customerId } = await req.json();
  if (!customerId) {
    return NextResponse.json({ error: 'Kunden-ID fehlt.' }, { status: 400 });
  }

  // Selbst-Anonymisierung verbieten (Audit-Trail-Schutz)
  if (me.id !== 'legacy-env' && me.id === customerId) {
    return NextResponse.json({ error: 'Selbst-Anonymisierung nicht erlaubt.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Prüfe ob aktive Buchungen existieren
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', customerId)
    .in('status', ['confirmed', 'shipped'])
    .limit(1);

  if (activeBookings?.length) {
    return NextResponse.json({
      error: 'Kunde hat noch aktive Buchungen. Anonymisierung erst nach Abschluss möglich.',
    }, { status: 400 });
  }

  // Kundenstammdaten anonymisieren
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
    console.error('Anonymize customer error:', error);
    return NextResponse.json({ error: 'Anonymisierung fehlgeschlagen.' }, { status: 500 });
  }

  // E-Mail-Logs anonymisieren — die Resend-Empfänger-Adresse + Subject können
  // PII enthalten und müssen nach DSGVO-Löschanfrage ebenfalls anonymisiert
  // werden. Booking-Referenz bleibt erhalten (für GoBD-Aufbewahrung 10 Jahre),
  // aber identifizierbare Adresse wird durch Anonym-Marker ersetzt.
  try {
    // E-Mails über Buchungen des Kunden
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

    // Auth-User-E-Mail wird gleich überschrieben (deleted_${customerId}@anonymisiert.local).
    // Auch direkte E-Mail-Logs ohne booking_id, die zur ursprünglichen
    // Kunden-E-Mail gehörten, anonymisieren.
    const { data: authUser } = await supabase.auth.admin.getUserById(customerId);
    const oldEmail = authUser?.user?.email;
    if (oldEmail && !oldEmail.endsWith('@anonymisiert.local')) {
      await supabase
        .from('email_log')
        .update({ recipient_email: 'anonymisiert@anonymisiert.local' })
        .eq('recipient_email', oldEmail);
    }
  } catch (logErr) {
    // Anonymisierung des Hauptprofils gilt trotzdem als erfolgreich.
    console.error('Email-log anonymize warning:', logErr);
  }

  // Auth-Account deaktivieren
  try {
    await supabase.auth.admin.updateUserById(customerId, {
      email: `deleted_${customerId}@anonymisiert.local`,
      user_metadata: { full_name: 'Gelöschter Kunde' },
      ban_duration: '876000h', // ~100 Jahre = effektiv permanent
    });
  } catch (authErr) {
    console.error('Auth deactivation error:', authErr);
  }

  // Sweep 8 K12: Storage-Files DSGVO-konform loeschen.
  // Sweep 6 hat anonymize nur DB-Felder ueberschrieben — die Personalausweis-
  // Scans (id-documents/{userId}/) und UGC-Uploads (customer-ugc/{userId}/)
  // blieben fuer immer im Storage liegen. Art. 17 DSGVO verlangt vollstaendige
  // Loeschung. Damage-Photos haben booking_id-Pfade und bleiben fuer
  // GoBD-Aufbewahrung (10 Jahre) erhalten.
  try {
    // 1) Ausweis-Scans
    const { data: idFiles } = await supabase.storage
      .from('id-documents')
      .list(customerId);
    if (idFiles && idFiles.length > 0) {
      const idPaths = idFiles.map((f) => `${customerId}/${f.name}`);
      await supabase.storage.from('id-documents').remove(idPaths);
    }
    // ID-URLs auch im Profil leeren
    await supabase
      .from('profiles')
      .update({ id_front_url: null, id_back_url: null })
      .eq('id', customerId);

    // 2) Customer-UGC: pro Submission alle file_paths aus dem Bucket loeschen
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
    // UGC-DB-Rows als zurueckgezogen markieren (Coupons bleiben gueltig)
    await supabase
      .from('customer_ugc_submissions')
      .update({ status: 'withdrawn', file_paths: [], file_kinds: [] })
      .eq('user_id', customerId);

    // Sweep 9 DSGVO-H3: admin_audit_log enthaelt Customer-PII in details-JSONB
    // (z.B. customer_email, customer_name in booking.cancel/damage.create).
    // Bei Anonymisierung muessen die details-Inhalte zu Buchungen des
    // Kunden + zum Customer selbst gescrubbt werden — Eintrag bleibt
    // erhalten (Audit-Trail-Pflicht), nur PII-Inhalt verschwindet.
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
    console.error('[anonymize] Storage-Cleanup-Fehler:', storageErr);
  }

  await logAudit({
    action: 'customer.anonymize',
    entityType: 'customer',
    entityId: customerId,
    request: req,
  });

  return NextResponse.json({ success: true });
}
