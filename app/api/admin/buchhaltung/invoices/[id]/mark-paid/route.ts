import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      payment_method: method || 'bank_transfer',
      notes: note || `Manuell als bezahlt markiert am ${date || new Date().toISOString().split('T')[0]}`,
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

  return NextResponse.json({ ok: true });
}
