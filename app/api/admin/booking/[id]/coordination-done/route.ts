import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/coordination-done
 *
 * Markiert für eine Abhol-Buchung die Abhol- bzw. Rückgabe-Terminabsprache als
 * erledigt („Termin vereinbart"). Sobald der Marker gesetzt ist, verschwindet
 * die „📞 Abhol-/Rückgabetermin vereinbaren"-Aufgabe aus dem Dashboard-Widget
 * (das die Aufgabe sonst LIVE aus Status + 48h-Fenster berechnet).
 *
 * Body: { type: 'pickup' | 'return', done?: boolean }
 *   done=false → Marker wieder leeren (Aufgabe erscheint erneut).
 *
 * Permission via Prefix /api/admin/booking → tagesgeschaeft (Middleware).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;

  let body: { type?: unknown; done?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }

  const type = body.type === 'pickup' || body.type === 'return' ? body.type : null;
  if (!type) {
    return NextResponse.json(
      { error: "type muss 'pickup' oder 'return' sein." },
      { status: 400 },
    );
  }
  const done = body.done !== false; // Default: als vereinbart markieren

  const supabase = createServiceClient();

  const column =
    type === 'pickup' ? 'pickup_coordination_done_at' : 'return_coordination_done_at';
  const value = done ? new Date().toISOString() : null;

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ [column]: value })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    // Defensiv: Migration supabase-bookings-coordination-done.sql evtl. noch
    // nicht durch.
    if (/coordination_done|column|schema cache|PGRST/i.test(error.message || '')) {
      return NextResponse.json(
        { error: 'Migration ausstehend — supabase-bookings-coordination-done.sql ausführen.' },
        { status: 503 },
      );
    }
    console.error('[coordination-done] update error:', error);
    return NextResponse.json({ error: 'Konnte nicht gespeichert werden.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  await logAudit({
    action: 'booking.coordination_done',
    entityType: 'booking',
    entityId: id,
    changes: { type, done, source: 'dashboard_quick_action' },
    request: req,
  });

  return NextResponse.json({ success: true, type, done });
}
