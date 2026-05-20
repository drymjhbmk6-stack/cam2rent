import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/availability-alerts
 *   → Liste der offenen Verfuegbarkeits-Alerts (resolved_at IS NULL), je nach
 *     env-Modus auf is_test gefiltert. Maximal 100 Eintraege.
 *
 * POST /api/admin/availability-alerts
 *   Body: { id, action: 'resolve' | 'reopen', note?: string }
 *   → resolved_at setzen/zuruecknehmen. Audit-Log.
 *
 * Permissions: tagesgeschaeft (siehe middleware API_PATH_PERMISSIONS).
 */

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const testMode = await isTestMode();

  const onlyOpen = req.nextUrl.searchParams.get('open') !== 'false';

  let q = supabase
    .from('availability_alerts')
    .select('*')
    .eq('is_test', testMode)
    .order('last_seen_at', { ascending: false })
    .limit(100);
  if (onlyOpen) q = q.is('resolved_at', null);

  const { data, error } = await q;
  if (error) {
    if (/availability_alerts|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
      return NextResponse.json({ alerts: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { id, action, note } = body as { id?: string; action?: string; note?: string };
  if (!id || (action !== 'resolve' && action !== 'reopen')) {
    return NextResponse.json({ error: 'id + action erforderlich (resolve|reopen).' }, { status: 400 });
  }
  const supabase = createServiceClient();

  if (action === 'resolve') {
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : null;
    const { error } = await supabase
      .from('availability_alerts')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_note: cleanNote || null,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({
      action: 'availability_alert.resolve',
      entityType: 'availability_alert',
      entityId: id,
      changes: { note: cleanNote },
      request: req,
    });
  } else {
    const { error } = await supabase
      .from('availability_alerts')
      .update({ resolved_at: null, resolved_note: null })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({
      action: 'availability_alert.reopen',
      entityType: 'availability_alert',
      entityId: id,
      request: req,
    });
  }

  return NextResponse.json({ ok: true });
}
