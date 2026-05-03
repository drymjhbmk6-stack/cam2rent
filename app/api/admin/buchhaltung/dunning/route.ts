import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { getResendFromEmail } from '@/lib/env-mode';
import { escapeHtml as h, stripSubject } from '@/lib/email';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { invoice_id, level, fee, custom_text, send } = body;

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

  // Mahngebühr: aus Body oder aus Einstellungen
  let feeAmount = fee !== undefined ? parseFloat(fee) : 0;
  if (fee === undefined) {
    const { data: feeSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', `accounting_dunning_fee_${level}`)
      .maybeSingle();
    feeAmount = parseFloat(feeSetting?.value || '0');
  }

  // Neue Zahlungsfrist (7 Tage ab jetzt)
  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + 7);

  const status = send ? 'sent' : 'draft';

  // Mahnung erstellen
  const { data: dunning, error } = await supabase
    .from('dunning_notices')
    .insert({
      invoice_id,
      level,
      fee_amount: feeAmount,
      custom_text: custom_text || null,
      new_due_date: newDueDate.toISOString().split('T')[0],
      status,
      sent_at: send ? new Date().toISOString() : null,
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
    .update({ status: 'overdue', payment_status: 'overdue' })
    .eq('id', invoice_id);

  // E-Mail senden wenn send=true
  if (send && invoice.sent_to_email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = await getResendFromEmail();
      // Sweep 7 Vuln 27 — vollstaendiges escapeHtml + Subject-Stripping.
      // Vorher: nur < und > escaped, kein & / " / ' → Entity-Injection moeglich.
      // custom_text ist admin-controlled (finanzen-Permission), aber inkonsistent
      // zur restlichen Mail-Surface — wir nutzen den zentralen Helper.
      await resend.emails.send({
        from: fromEmail,
        to: invoice.sent_to_email,
        subject: stripSubject(`Mahnung Stufe ${level} — Rechnung ${invoice.invoice_number}`),
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#0f172a;">Mahnung — Stufe ${level}</h2>
          <p style="white-space:pre-wrap;">${h(custom_text || '')}</p>
          <hr style="border:1px solid #e2e8f0;"/>
          <p style="color:#64748b;font-size:13px;">Rechnung: ${h(invoice.invoice_number)}<br/>
          Betrag: ${(invoice.gross_amount || 0).toFixed(2).replace('.', ',')} €${feeAmount > 0 ? `<br/>Mahngebühr: ${feeAmount.toFixed(2).replace('.', ',')} €` : ''}</p>
        </div>`,
      });
    } catch (err) {
      console.error('Mahn-E-Mail Fehler:', err);
    }
  }

  // Audit
  await logAudit({
    action: send ? 'dunning.send' : 'dunning.create_draft',
    entityType: 'dunning',
    entityId: dunning.id,
    entityLabel: `Mahnung Stufe ${level} für ${invoice.invoice_number}`,
    changes: { level, fee: feeAmount, send },
    request: req,
  });

  return NextResponse.json({ dunning });
}

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
