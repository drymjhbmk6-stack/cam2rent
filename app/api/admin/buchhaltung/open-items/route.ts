import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Offene Rechnungen laden — keine `select('*')` (manche Spalten sind grosse JSONBs).
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, booking_id, sent_to_email, gross_amount, invoice_date, due_date')
    .eq('is_test', false)
    .or('status.in.(open,overdue),payment_status.in.(open,overdue)')
    .order('invoice_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  let level1 = 0, level2 = 0, level3 = 0;
  const list = invoices ?? [];

  // Bulk-Lookup statt N+1 — eine Query pro Tabelle, dann Memory-Map.
  const bookingIds = list.map((i) => i.booking_id).filter((id): id is string => !!id);
  const invoiceIds = list.map((i) => i.id);

  const bookingMap = new Map<string, { customer_name: string | null; customer_email: string | null }>();
  if (bookingIds.length) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email')
      .in('id', bookingIds);
    (bookings ?? []).forEach((b) => bookingMap.set(b.id, b));
  }

  // Hoechste Mahnstufe + zugehoeriger Timestamp pro Rechnung
  const dunningMap = new Map<string, { level: number; sent_at: string | null; created_at: string | null }>();
  if (invoiceIds.length) {
    const { data: dunnings } = await supabase
      .from('dunning_notices')
      .select('invoice_id, level, sent_at, created_at')
      .in('invoice_id', invoiceIds)
      .order('level', { ascending: false });
    (dunnings ?? []).forEach((d) => {
      const existing = dunningMap.get(d.invoice_id);
      if (!existing || d.level > existing.level) {
        dunningMap.set(d.invoice_id, { level: d.level, sent_at: d.sent_at, created_at: d.created_at });
      }
    });
  }

  const items = list.map((inv) => {
    const booking = inv.booking_id ? bookingMap.get(inv.booking_id) : undefined;
    const lastDunning = dunningMap.get(inv.id);
    const dunningLevel = lastDunning?.level || 0;

    if (dunningLevel === 1) level1++;
    else if (dunningLevel === 2) level2++;
    else if (dunningLevel >= 3) level3++;

    const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: inv.id,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_name: booking?.customer_name || '',
      customer_email: inv.sent_to_email || booking?.customer_email || '',
      gross_amount: inv.gross_amount || 0,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      days_overdue: daysOverdue,
      dunning_level: dunningLevel,
      last_dunning_at: lastDunning?.sent_at || lastDunning?.created_at || null,
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.gross_amount, 0);

  return NextResponse.json({
    items,
    total: items.length,
    totalAmount,
    dunningStats: { level1, level2, level3 },
  });
}
