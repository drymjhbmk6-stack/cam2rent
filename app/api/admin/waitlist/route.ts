import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { loadWaitlist } from '@/lib/admin/load-waitlist';

/**
 * GET    /api/admin/waitlist             → alle Warteliste-Einträge
 * DELETE /api/admin/waitlist?id=...      → einzelnen Eintrag löschen
 *
 * Die Route ist durch die Admin-Middleware geschützt (admin_token Cookie).
 * GET-Kernlogik in `lib/admin/load-waitlist.ts` — geteilt mit der
 * server-gerenderten /admin/warteliste-Page.
 */

export async function GET() {
  const { entries, error } = await loadWaitlist();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ entries });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('waitlist_subscriptions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'waitlist.delete',
    entityType: 'waitlist',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ ok: true });
}
