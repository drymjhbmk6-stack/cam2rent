import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';

/**
 * GET /api/cron/dunning-check
 * Täglicher Cron (06:00 Uhr) — prüft fällige Mahnstufen und erstellt Entwürfe.
 * Versendet KEINE Mahnungen automatisch — Admin muss freigeben.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // Mahnstufen-Fristen laden
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', [
      'accounting_dunning_days_1', 'accounting_dunning_days_2', 'accounting_dunning_days_3',
      'accounting_dunning_fee_1', 'accounting_dunning_fee_2', 'accounting_dunning_fee_3',
    ]);

  const cfg: Record<string, string> = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });
  const days = [
    parseInt(cfg.accounting_dunning_days_1 || '14'),
    parseInt(cfg.accounting_dunning_days_2 || '28'),
    parseInt(cfg.accounting_dunning_days_3 || '42'),
  ];
  const fees = [
    parseFloat(cfg.accounting_dunning_fee_1 || '0'),
    parseFloat(cfg.accounting_dunning_fee_2 || '5'),
    parseFloat(cfg.accounting_dunning_fee_3 || '10'),
  ];

  // Offene Rechnungen laden — keine Test-Rechnungen mahnen
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, gross_amount, sent_to_email')
    .eq('is_test', false)
    .or('status.in.(open,overdue),payment_status.in.(open,overdue)')
    .limit(100);

  let draftsCreated = 0;

  // Bulk-Load aller bestehenden Mahnungen fuer die geprueften Rechnungen — ein Query
  // statt 2 SELECTs pro Invoice (war N+1).
  const invoiceIds = (invoices || []).map((i) => i.id);
  const { data: allDunnings } = invoiceIds.length
    ? await supabase
        .from('dunning_notices')
        .select('invoice_id, level')
        .in('invoice_id', invoiceIds)
    : { data: [] as Array<{ invoice_id: string; level: number }> };
  const dunningsByInvoice = new Map<string, number[]>();
  (allDunnings ?? []).forEach((d) => {
    const arr = dunningsByInvoice.get(d.invoice_id) ?? [];
    arr.push(d.level);
    dunningsByInvoice.set(d.invoice_id, arr);
  });

  for (const inv of invoices || []) {
    const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue < days[0]) continue; // Noch nicht fällig für Stufe 1

    const levels = dunningsByInvoice.get(inv.id) ?? [];
    const currentLevel = levels.length ? Math.max(...levels) : 0;

    // Nächste fällige Stufe bestimmen
    let nextLevel = 0;
    if (currentLevel === 0 && daysOverdue >= days[0]) nextLevel = 1;
    else if (currentLevel === 1 && daysOverdue >= days[1]) nextLevel = 2;
    else if (currentLevel === 2 && daysOverdue >= days[2]) nextLevel = 3;

    if (nextLevel === 0) continue;

    // Prüfe ob Entwurf für diese Stufe schon existiert (Memory-Lookup)
    if (levels.includes(nextLevel)) continue;

    // Entwurf erstellen — neues Faelligkeitsdatum in Berlin-Zeit
    const todayBerlin = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const [ny, nm, nd] = todayBerlin.split('-').map((n) => parseInt(n, 10));
    const newDueDate = new Date(Date.UTC(ny, nm - 1, nd + 7));

    await supabase
      .from('dunning_notices')
      .insert({
        invoice_id: inv.id,
        level: nextLevel,
        fee_amount: fees[nextLevel - 1] || 0,
        status: 'draft',
        new_due_date: newDueDate.toISOString().split('T')[0],
        sent_to_email: inv.sent_to_email,
      });

    // Rechnung auf overdue setzen
    await supabase
      .from('invoices')
      .update({ status: 'overdue', payment_status: 'overdue' })
      .eq('id', inv.id);

    draftsCreated++;
  }

  return NextResponse.json({
    ok: true,
    draftsCreated,
    checkedInvoices: (invoices || []).length,
    timestamp: now.toISOString(),
  });
}
