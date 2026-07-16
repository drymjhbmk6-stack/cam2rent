import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/kunden/reactivate
 * Body: { userId: string }
 *
 * Setzt ein wegen Inaktivitaet deaktiviertes Konto manuell wieder auf aktiv
 * (leert deactivated_at + inactive_warning_sent_at). Der Kunde erscheint danach
 * wieder in der aktiven Kundenliste. Permission `kunden` (via Middleware).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Kunden-ID fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('profiles')
    .update({ deactivated_at: null, inactive_warning_sent_at: null })
    .eq('id', userId);

  if (error) {
    if (/deactivated_at|column|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Migration fehlt: supabase/supabase-account-lifecycle.sql ausführen.' },
        { status: 503 },
      );
    }
    console.error('[reactivate] update error:', error);
    return NextResponse.json({ error: 'Reaktivierung fehlgeschlagen.' }, { status: 500 });
  }

  await logAudit({
    action: 'customer.reactivate',
    entityType: 'customer',
    entityId: userId,
    request: req,
  });

  return NextResponse.json({ success: true });
}
