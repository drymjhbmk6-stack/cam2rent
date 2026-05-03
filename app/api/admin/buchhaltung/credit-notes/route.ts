import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') || '';
  const supabase = createServiceClient();

  let query = supabase
    .from('credit_notes')
    .select('*')
    .eq('is_test', false)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Rechnungs- und Kundendaten anreichern
  const creditNotes = await Promise.all((data || []).map(async (cn) => {
    let invoiceNumber = '';
    let customerName = '';
    let customerEmail = '';

    if (cn.invoice_id) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, booking_id, sent_to_email')
        .eq('id', cn.invoice_id)
        .maybeSingle();

      if (inv) {
        invoiceNumber = inv.invoice_number || '';
        customerEmail = inv.sent_to_email || '';

        if (inv.booking_id) {
          const { data: booking } = await supabase
            .from('bookings')
            .select('customer_name, customer_email')
            .eq('id', inv.booking_id)
            .maybeSingle();
          if (booking) {
            customerName = booking.customer_name || '';
            customerEmail = customerEmail || booking.customer_email || '';
          }
        }
      }
    }

    return {
      ...cn,
      invoice_number: invoiceNumber,
      customer_name: customerName,
      customer_email: customerEmail,
    };
  }));

  return NextResponse.json({ creditNotes, total: creditNotes.length });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { invoice_id, booking_id, reason, reason_category, gross_amount, notes } = body;

  if (!invoice_id || !reason) {
    return NextResponse.json({ error: 'invoice_id und reason erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Sweep 7 Vuln 18 — Cap gegen Originalrechnung.
  // Vorher konnte ein Mitarbeiter mit finanzen-Berechtigung (oder Tippfehler)
  // eine 5000-EUR-Gutschrift auf eine 100-EUR-Rechnung anlegen. Stripe lehnt
  // den Refund zwar ab, aber die Originalrechnung wird trotzdem auf 'cancelled'
  // gesetzt → die 5000 EUR landen in der USt-Voranmeldung als Vorsteuerkuerzung.
  const requestedGross = Number(gross_amount) || 0;
  if (requestedGross > 0) {
    const { data: invoiceRow } = await supabase
      .from('invoices')
      .select('gross_amount')
      .eq('id', invoice_id)
      .maybeSingle();
    if (!invoiceRow) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    const invoiceGross = Number(invoiceRow.gross_amount) || 0;
    // Bereits aktive/gesendete Gutschriften aufaddieren — eine Rechnung darf
    // nicht durch mehrere CNs gemeinsam ueber den Originalbetrag rutschen.
    const { data: existingCns } = await supabase
      .from('credit_notes')
      .select('gross_amount, status')
      .eq('invoice_id', invoice_id)
      .in('status', ['pending_review', 'approved', 'sent']);
    const existingSum = (existingCns ?? [])
      .reduce((sum, cn) => sum + (Number(cn.gross_amount) || 0), 0);
    const remaining = Math.max(0, invoiceGross - existingSum);
    if (requestedGross > remaining + 0.01) {
      return NextResponse.json(
        {
          error: `Gutschriftbetrag uebersteigt verbleibenden Rechnungsbetrag (${remaining.toFixed(2)} EUR).`,
        },
        { status: 400 }
      );
    }
  }

  // Steuermodus laden
  const { data: taxRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'tax_mode')
    .maybeSingle();
  const taxMode = (taxRow?.value || 'kleinunternehmer') as TaxMode;

  const { data: rateRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'tax_rate')
    .maybeSingle();
  const taxRate = parseFloat(rateRow?.value || '19');

  // Steuer berechnen
  const taxCalc = calculateTax(gross_amount || 0, taxMode, taxRate, 'gross');

  // Gutschriftnummer generieren — Jahr in Berlin-Zeit, damit eine Gutschrift
  // in der Silvester-Nacht zwischen 23-24 Uhr Berlin nicht schon ins
  // Folgejahr rutscht (UTC ist dann noch 22-23 = altes Jahr).
  // Test-Modus: separater Counter, `TEST-GS-...` Praefix
  const testMode = await isTestMode();
  const year = parseInt(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 4), 10);
  const prefix = testMode ? 'TEST-GS' : 'GS';
  const { data: lastCn } = await supabase
    .from('credit_notes')
    .select('credit_note_number')
    .like('credit_note_number', `${prefix}-${year}-%`)
    .eq('is_test', testMode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNum = 1;
  if (lastCn?.credit_note_number) {
    const match = lastCn.credit_note_number.match(new RegExp(`${prefix}-\\d{4}-(\\d+)`));
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  const creditNoteNumber = `${prefix}-${year}-${String(nextNum).padStart(6, '0')}`;

  const { data: creditNote, error } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_number: creditNoteNumber,
      invoice_id,
      booking_id: booking_id || '',
      net_amount: taxCalc.net,
      tax_amount: taxCalc.tax,
      gross_amount: taxCalc.gross,
      tax_mode: taxMode,
      tax_rate: taxCalc.taxRate,
      reason,
      reason_category: reason_category || 'cancellation',
      status: 'pending_review',
      refund_status: 'not_applicable',
      notes: notes || null,
      is_test: testMode,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'credit_note.create_draft',
    entityType: 'credit_note',
    entityId: creditNote.id,
    entityLabel: creditNote.credit_note_number,
    changes: { invoice_id, gross_amount: taxCalc.gross, reason },
    request: req,
  });

  return NextResponse.json({ creditNote });
}
