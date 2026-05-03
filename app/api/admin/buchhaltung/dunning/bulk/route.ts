import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * Bulk-Mahnung-Entwuerfe.
 *
 * POST /api/admin/buchhaltung/dunning/bulk
 * Body: { invoice_ids: string[] }
 *
 * Fuer jede Rechnung wird die naechste passende Mahnstufe als Entwurf
 * (status='draft') angelegt. Stufe 1 falls noch keine Mahnung, sonst die
 * jeweils naechsthoehere bis max. Stufe 3.
 *
 * Es wird KEINE E-Mail verschickt — Admin muss die Entwuerfe einzeln freigeben.
 * Genau dasselbe Verhalten wie der taegliche Cron, nur explizit ausgeloest.
 */

const MAX_IDS = 100;

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  let body: { invoice_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body.invoice_ids) ? body.invoice_ids.filter((s) => typeof s === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Mindestens eine invoice_id erforderlich' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Maximal ${MAX_IDS} Rechnungen pro Aufruf` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Alle Rechnungen + bestehende Mahnungen laden
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, gross_amount, status, payment_status, sent_to_email')
    .in('id', ids);

  const list = invoices ?? [];
  if (list.length === 0) {
    return NextResponse.json({ created: 0, skipped: ids.length });
  }

  const { data: existingDunnings } = await supabase
    .from('dunning_notices')
    .select('invoice_id, level, status')
    .in('invoice_id', list.map((i) => i.id));

  const maxLevelByInvoice = new Map<string, number>();
  (existingDunnings ?? []).forEach((d) => {
    const current = maxLevelByInvoice.get(d.invoice_id) ?? 0;
    if (d.level > current) maxLevelByInvoice.set(d.invoice_id, d.level);
  });

  // Mahngebuehren-Settings laden
  const { data: feeSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['accounting_dunning_fee_1', 'accounting_dunning_fee_2', 'accounting_dunning_fee_3']);

  const fees: Record<number, number> = { 1: 0, 2: 5, 3: 10 };
  (feeSettings ?? []).forEach((s) => {
    const m = s.key.match(/_(\d)$/);
    if (m) fees[parseInt(m[1], 10)] = parseFloat(s.value || '0');
  });

  let created = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  for (const inv of list) {
    // Skip wenn schon bezahlt oder storniert
    if (inv.status === 'paid' || inv.status === 'cancelled' || inv.payment_status === 'paid') {
      skipped++;
      skippedReasons.push(`${inv.invoice_number}: bereits bezahlt/storniert`);
      continue;
    }

    const currentMax = maxLevelByInvoice.get(inv.id) ?? 0;
    const nextLevel = currentMax + 1;

    if (nextLevel > 3) {
      skipped++;
      skippedReasons.push(`${inv.invoice_number}: bereits Stufe 3`);
      continue;
    }

    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 7);

    const { error: insertError } = await supabase
      .from('dunning_notices')
      .insert({
        invoice_id: inv.id,
        level: nextLevel,
        fee_amount: fees[nextLevel] || 0,
        new_due_date: newDueDate.toISOString().split('T')[0],
        status: 'draft',
        sent_to_email: inv.sent_to_email,
      });

    if (insertError) {
      skipped++;
      skippedReasons.push(`${inv.invoice_number}: ${insertError.message}`);
      continue;
    }

    // Rechnung-Status auf overdue
    await supabase
      .from('invoices')
      .update({ status: 'overdue', payment_status: 'overdue' })
      .eq('id', inv.id);

    created++;
  }

  await logAudit({
    action: 'dunning.bulk_create_drafts',
    entityType: 'dunning',
    entityId: ids.join(','),
    entityLabel: `${created} Entwuerfe`,
    changes: { created, skipped, total: ids.length },
    request: req,
  });

  return NextResponse.json({
    created,
    skipped,
    skipped_reasons: skippedReasons.slice(0, 10),
  });
}
