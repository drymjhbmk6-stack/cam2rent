import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/lock-contract
 * Body: { locked?: boolean }  (default true)
 *
 * „Alles okay"-Freigabe: markiert den geprueften Mietvertrag als gesperrt
 * (`bookings.contract_locked=true`), sodass er NICHT mehr ueber
 * /api/admin/booking/[id]/reset-contract zurueckgesetzt werden kann.
 * `{ locked: false }` hebt die Freigabe wieder auf.
 *
 * Permission via Prefix /api/admin/booking → tagesgeschaeft.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const locked = body?.locked === undefined ? true : !!body.locked;

  const supabase = createServiceClient();

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, contract_signed')
    .eq('id', id)
    .maybeSingle();
  if (bErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  // Nur ein unterschriebener Vertrag kann freigegeben werden.
  if (locked && !booking.contract_signed) {
    return NextResponse.json(
      { error: 'Es liegt kein unterschriebener Vertrag zum Freigeben vor.' },
      { status: 409 },
    );
  }

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ contract_locked: locked })
    .eq('id', id);

  if (updErr) {
    if (/contract_locked|column|schema cache|PGRST/i.test(updErr.message || '')) {
      return NextResponse.json(
        { error: 'Migration ausstehend: Bitte supabase-bookings-contract-locked.sql ausführen.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${updErr.message}` }, { status: 500 });
  }

  await logAudit({
    action: locked ? 'booking.lock_contract' : 'booking.unlock_contract',
    entityType: 'booking',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true, locked });
}
