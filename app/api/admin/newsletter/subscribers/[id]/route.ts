import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * DELETE /api/admin/newsletter/subscribers/[id]
 * Endgueltig loeschen (Admin-Aktion). Setzt nicht nur unsubscribed=true,
 * sondern entfernt den Eintrag komplett.
 */
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('newsletter_subscribers')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'newsletter.delete_subscriber',
    entityType: 'newsletter_subscriber',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/admin/newsletter/subscribers/[id]
 * Body: { unsubscribed?: boolean }
 * Manuell ab- oder wieder-anmelden.
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (typeof body.unsubscribed === 'boolean') {
    updates.unsubscribed = body.unsubscribed;
    updates.unsubscribed_at = body.unsubscribed ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'newsletter.update_subscriber',
    entityType: 'newsletter_subscriber',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ success: true });
}
