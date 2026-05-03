import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * Bulk-Aktionen fuer Rechnungen.
 *
 * POST /api/admin/buchhaltung/invoices/bulk
 * Body: { action: 'mark_paid' | 'resend_email', ids: string[], options?: { method?, date?, note? } }
 *
 * Max 200 IDs pro Call.
 */

const MAX_IDS = 200;

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  let body: { action?: string; ids?: string[]; options?: { method?: string; date?: string; note?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 });
  }

  const action = body.action;
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === 'string') : [];

  if (!action || !['mark_paid', 'resend_email'].includes(action)) {
    return NextResponse.json({ error: 'action muss "mark_paid" oder "resend_email" sein' }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Mindestens eine ID erforderlich' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Maximal ${MAX_IDS} Rechnungen pro Aufruf` }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (action === 'mark_paid') {
    // Erst die Rechnungen laden, um zu sehen welche schon bezahlt sind
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, payment_status')
      .in('id', ids);

    const list = invoices ?? [];
    const eligible = list.filter((inv) => inv.payment_status !== 'paid' && inv.status !== 'cancelled');
    const skippedCount = list.length - eligible.length;

    if (eligible.length === 0) {
      return NextResponse.json({ paid: 0, skipped: skippedCount, error: 'Keine offenen Rechnungen in Auswahl' });
    }

    const eligibleIds = eligible.map((i) => i.id);
    const paidAt = body.options?.date ? `${body.options.date}T12:00:00Z` : new Date().toISOString();

    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        payment_status: 'paid',
        payment_method: body.options?.method || 'bank_transfer',
        payment_notes: body.options?.note || null,
        paid_at: paidAt,
      })
      .in('id', eligibleIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Offene Mahnungen mitziehen
    await supabase
      .from('dunning_notices')
      .update({ status: 'paid' })
      .in('invoice_id', eligibleIds)
      .in('status', ['draft', 'sent']);

    await logAudit({
      action: 'invoice.bulk_mark_paid',
      entityType: 'invoice',
      entityId: eligibleIds.join(','),
      entityLabel: `${eligible.length} Rechnungen`,
      changes: { count: eligible.length, method: body.options?.method, date: body.options?.date },
      request: req,
    });

    return NextResponse.json({ paid: eligible.length, skipped: skippedCount });
  }

  if (action === 'resend_email') {
    // Bulk-Resend: pro Rechnung den vorhandenen resend-Endpoint aufrufen.
    // Sequenziell, um Rate-Limit-Druck zu vermeiden.
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const res = await fetch(`${req.nextUrl.origin}/api/admin/buchhaltung/invoices/${id}/resend`, {
          method: 'POST',
          headers: { cookie: req.headers.get('cookie') || '' },
        });
        if (res.ok) sent++;
        else {
          failed++;
          errors.push(`${id}: HTTP ${res.status}`);
        }
      } catch (e) {
        failed++;
        errors.push(`${id}: ${e instanceof Error ? e.message : 'Fehler'}`);
      }
    }

    await logAudit({
      action: 'invoice.bulk_resend',
      entityType: 'invoice',
      entityId: ids.join(','),
      entityLabel: `${sent} Rechnungen`,
      changes: { sent, failed, total: ids.length },
      request: req,
    });

    return NextResponse.json({ sent, failed, errors: errors.slice(0, 5) });
  }

  return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 });
}
