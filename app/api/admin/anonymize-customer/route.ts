import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { anonymizeCustomerCore } from '@/lib/anonymize-customer';

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

  // Kern-Anonymisierung (geteilt mit dem Auto-Cleanup-Cron).
  const res = await anonymizeCustomerCore(supabase, customerId);
  if (!res.ok) {
    return NextResponse.json({ error: 'Anonymisierung fehlgeschlagen.' }, { status: 500 });
  }

  await logAudit({
    action: 'customer.anonymize',
    entityType: 'customer',
    entityId: customerId,
    request: req,
  });

  return NextResponse.json({ success: true });
}
