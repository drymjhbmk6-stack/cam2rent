import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist/i;

/**
 * POST /api/admin/nachrichten/bulk
 * Body: { action: 'delete', ids: string[] }
 *
 * Bulk-Soft-Delete von Konversationen (max 100 pro Call). Dieselbe Logik
 * wie der Einzel-DELETE: setzt `deleted_at = now()`, faellt bei fehlender
 * Migration auf Hard-Delete zurueck. Antwort: `{ deleted: N }`.
 *
 * Permission: `kunden` (siehe middleware API_PATH_PERMISSIONS).
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  let body: { action?: string; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body.' }, { status: 400 });
  }

  if (body.action !== 'delete') {
    return NextResponse.json({ error: 'action muss "delete" sein.' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 100)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids leer.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Soft-Delete versuchen
  const soft = await supabase
    .from('conversations')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null);

  const deleted = ids.length;
  if (soft.error && SCHEMA_ERROR.test(soft.error.message)) {
    // Migration fehlt → Hard-Delete (CASCADE auf messages/attachments).
    const hard = await supabase.from('conversations').delete().in('id', ids);
    if (hard.error) {
      return NextResponse.json({ error: 'Bulk-Loeschen fehlgeschlagen.' }, { status: 500 });
    }
  } else if (soft.error) {
    return NextResponse.json({ error: 'Bulk-Loeschen fehlgeschlagen.' }, { status: 500 });
  }

  await logAudit({
    action: 'nachricht.bulk_delete',
    entityType: 'nachricht',
    entityId: ids.join(','),
    changes: { count: deleted, ids: ids.slice(0, 20) },
    request: req,
  });

  return NextResponse.json({ deleted });
}
