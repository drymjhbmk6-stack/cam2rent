import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/anonymize-customer
 * Body: { customerId: string }
 *
 * Anonymisiert Kundenstammdaten (Name, Adresse, Telefon).
 * Buchungs- und Rechnungsdaten bleiben 10 Jahre erhalten.
 */
export async function POST(req: NextRequest) {
  // Admin-Auth prüfen
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { customerId } = await req.json();
  if (!customerId) {
    return NextResponse.json({ error: 'Kunden-ID fehlt.' }, { status: 400 });
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

  return NextResponse.json({ success: true });
}
