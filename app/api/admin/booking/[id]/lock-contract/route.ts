import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/lock-contract
 *
 * „Alles okay"-Freigabe: markiert den geprueften Mietvertrag als gesperrt
 * (`bookings.contract_locked=true`), sodass er NICHT mehr ueber
 * /api/admin/booking/[id]/reset-contract zurueckgesetzt werden kann.
 *
 * **Endgueltig** — die Freigabe kann NICHT mehr rueckgaengig gemacht werden
 * (ein `{ locked: false }` im Body wird mit 409 abgelehnt).
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
  // Freigabe ist endgueltig: ein expliziter Unlock-Versuch wird abgelehnt.
  if (body?.locked === false) {
    return NextResponse.json(
      { error: 'Die Freigabe kann nicht rückgängig gemacht werden.' },
      { status: 409 },
    );
  }

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
  if (!booking.contract_signed) {
    return NextResponse.json(
      { error: 'Es liegt kein unterschriebener Vertrag zum Freigeben vor.' },
      { status: 409 },
    );
  }

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ contract_locked: true })
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
    action: 'booking.lock_contract',
    entityType: 'booking',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true, locked: true });
}
