import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/belege/[id]/dismiss-duplicate
 *
 * Admin bestaetigt: kein Duplikat — Banner wegklicken, Festschreiben wieder
 * freigegeben. Wir leeren NICHT die verdacht_duplikat_beleg_id-Referenz, weil
 * wir den Hinweis fuer Audit-Trails behalten wollen, sondern setzen nur
 * verdacht_duplikat_dismissed_at. Festschreiben prueft beide Felder.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg, error: loadErr } = await supabase
    .from('belege').select('id, status, verdacht_duplikat_beleg_id, verdacht_duplikat_dismissed_at').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschriebener Beleg — keine Aenderung' }, { status: 409 });
  }
  if (!beleg.verdacht_duplikat_beleg_id) {
    return NextResponse.json({ error: 'Kein Duplikat-Verdacht aktiv' }, { status: 400 });
  }

  const { error } = await supabase
    .from('belege')
    .update({ verdacht_duplikat_dismissed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    if (/verdacht_duplikat/i.test(error.message)) {
      return NextResponse.json({ error: 'Duplikat-Pruefung nicht aktiv (Migration fehlt)' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'beleg.dismiss_duplicate',
    entityType: 'beleg',
    entityId: id,
    changes: { dismissed_existing: beleg.verdacht_duplikat_beleg_id },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
