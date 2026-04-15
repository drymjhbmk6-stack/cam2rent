import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { invoice_id, level } = body;

  if (!invoice_id || !level) {
    return NextResponse.json({ error: 'invoice_id und level erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Rechnung prüfen
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
  }

  // Prüfe ob bereits eine Mahnung dieser Stufe existiert
  const { data: existing } = await supabase
    .from('dunning_notices')
    .select('id')
    .eq('invoice_id', invoice_id)
    .eq('level', level)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: `Mahnung Stufe ${level} existiert bereits.` }, { status: 409 });
  }

  // Mahngebühr laden
  const { data: feeSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', `accounting_dunning_fee_${level}`)
    .maybeSingle();

  const feeAmount = parseFloat(feeSetting?.value || '0');

  // Mahnung erstellen
  const { data: dunning, error } = await supabase
    .from('dunning_notices')
    .insert({
      invoice_id,
      level,
      fee_amount: feeAmount,
      status: 'draft',
      sent_to_email: invoice.sent_to_email,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Rechnung-Status auf overdue setzen
  await supabase
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('id', invoice_id);

  return NextResponse.json({ dunning });
}

// GET: Mahnungen auflisten
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('dunning_notices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dunnings: data || [] });
}
