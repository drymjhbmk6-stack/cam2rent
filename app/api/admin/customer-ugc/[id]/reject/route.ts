import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendUgcRejectedEmail } from '@/lib/customer-ugc';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * POST /api/admin/customer-ugc/[id]/reject
 * Body: { reason: string, deleteFiles?: boolean, notifyCustomer?: boolean }
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;

  const body = await req.json();
  const reason = String(body?.reason ?? '').trim().slice(0, 1000);
  const deleteFiles = body?.deleteFiles !== false; // Standard: Dateien löschen
  const notifyCustomer = body?.notifyCustomer !== false;

  if (!reason) {
    return NextResponse.json({ error: 'Begründung ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: submission } = await supabase
    .from('customer_ugc_submissions')
    .select('id, status, customer_email, customer_name, file_paths')
    .eq('id', id)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: 'Einreichung nicht gefunden.' }, { status: 404 });
  }

  if (submission.status !== 'pending') {
    return NextResponse.json(
      { error: `Einreichung hat Status "${submission.status}" — Ablehnung nicht möglich.` },
      { status: 400 },
    );
  }

  // Dateien aus Storage entfernen (best effort)
  if (
    deleteFiles &&
    Array.isArray(submission.file_paths) &&
    submission.file_paths.length > 0
  ) {
    const { error: rmErr } = await supabase.storage
      .from('customer-ugc')
      .remove(submission.file_paths);
    if (rmErr) console.error('[ugc-reject] Storage-Remove-Fehler:', rmErr.message);
  }

  // Atomarer Status-Wechsel: nur wenn noch 'pending'. Ohne den Guard koennten
  // zwei parallele Reject-Klicks beide durchgehen → doppelter Storage-Remove,
  // doppelte Mail. (Selber Bug wie der UGC-Approve-Race, der schon gefixt ist.)
  const { data: updateRows, error: updateErr } = await supabase
    .from('customer_ugc_submissions')
    .update({
      status: 'rejected',
      rejected_reason: reason,
      reviewed_at: new Date().toISOString(),
      ...(deleteFiles ? { file_paths: [] } : {}),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updateRows || updateRows.length === 0) {
    return NextResponse.json(
      { error: 'Einreichung wurde parallel bearbeitet — bitte Liste neu laden.' },
      { status: 409 },
    );
  }

  if (notifyCustomer && submission.customer_email) {
    try {
      await sendUgcRejectedEmail({
        to: submission.customer_email,
        name: submission.customer_name ?? 'Kamera-Fan',
        reason,
      });
    } catch (e) {
      console.error('[ugc-reject] E-Mail-Fehler:', e);
    }
  }

  await logAudit({
    action: 'ugc.reject',
    entityType: 'customer_ugc',
    entityId: id,
    changes: { reason, deleteFiles, notifyCustomer },
    request: req,
  });

  return NextResponse.json({ success: true });
}
