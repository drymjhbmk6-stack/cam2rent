import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

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
 * Body: { status: string }
 * Aktualisiert den Buchungsstatus.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, cancellation_reason } = body as { status?: string; cancellation_reason?: string };

  if (!status) {
    return NextResponse.json({ error: 'Status erforderlich.' }, { status: 400 });
  }

  const allowed = ['pending_verification', 'awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed', 'cancelled', 'damaged'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = { status };

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

  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Status update error:', error);
    return NextResponse.json({ error: 'Status konnte nicht aktualisiert werden.' }, { status: 500 });
  }

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

  if (password !== 'Admin') {
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

  return NextResponse.json({ success: true });
}
