import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';
import { logAudit } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  // Nur pending_review darf bearbeitet werden
  const { data: existing } = await supabase
    .from('credit_notes')
    .select('status, tax_mode, tax_rate, invoice_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Gutschrift nicht gefunden.' }, { status: 404 });
  }

  if (existing.status !== 'pending_review') {
    return NextResponse.json({ error: 'Nur Entwürfe können bearbeitet werden.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.reason !== undefined) updates.reason = body.reason;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.reason_category !== undefined) updates.reason_category = body.reason_category;

  if (body.gross_amount !== undefined) {
    // Sweep 8 K15: Cap-Check gegen Originalrechnung. Sweep 7 #18 hat das
    // nur in POST eingebaut — PATCH liess Mitarbeiter beliebig hochsetzen.
    // Wir holen die Rechnung + alle anderen aktiven Gutschriften, damit die
    // Summe der CNs niemals den Rechnungs-Brutto uebersteigt.
    if (existing.invoice_id) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('gross_amount')
        .eq('id', existing.invoice_id)
        .maybeSingle();
      if (!invoice) {
        return NextResponse.json({ error: 'Originalrechnung nicht gefunden.' }, { status: 404 });
      }
      const { data: otherCns } = await supabase
        .from('credit_notes')
        .select('gross_amount, status')
        .eq('invoice_id', existing.invoice_id)
        .neq('id', id);
      const sumActiveOther = (otherCns ?? [])
        .filter((cn) => ['approved', 'sent', 'pending_review'].includes(cn.status))
        .reduce((acc, cn) => acc + Number(cn.gross_amount ?? 0), 0);
      const cap = Number(invoice.gross_amount ?? 0) - sumActiveOther;
      if (Number(body.gross_amount) > cap + 0.005) {
        return NextResponse.json(
          { error: `Gutschrift uebersteigt verbleibenden Rechnungs-Cap. Max: ${cap.toFixed(2)} EUR.` },
          { status: 400 },
        );
      }
    }

    const taxCalc = calculateTax(
      body.gross_amount,
      existing.tax_mode as TaxMode,
      existing.tax_rate || 19,
      'gross'
    );
    updates.net_amount = taxCalc.net;
    updates.tax_amount = taxCalc.tax;
    updates.gross_amount = taxCalc.gross;
  }

  const { error } = await supabase
    .from('credit_notes')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'credit_note.update',
    entityType: 'buchhaltung_credit_note',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ ok: true });
}
