import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { date, method, note } = body;

  const supabase = createServiceClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, payment_status')
    .eq('id', id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
  }

  // Rechnung als bezahlt markieren
  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      payment_status: 'paid',
      payment_method: method || 'bank_transfer',
      payment_notes: note || null,
      paid_at: date ? `${date}T12:00:00Z` : new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Offene Mahnungen auf "paid" setzen
  await supabase
    .from('dunning_notices')
    .update({ status: 'paid' })
    .eq('invoice_id', id)
    .in('status', ['draft', 'sent']);

  // Audit
  await logAudit({
    action: 'invoice.mark_paid',
    entityType: 'invoice',
    entityId: id,
    entityLabel: invoice.invoice_number,
    changes: { method, date, note, previousStatus: invoice.payment_status },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
