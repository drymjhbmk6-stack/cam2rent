import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Offene Rechnungen laden
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .in('status', ['open', 'overdue'])
    .order('invoice_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();

  // Mahnungen pro Rechnung laden
  const items = await Promise.all((invoices || []).map(async (inv) => {
    // Kundenname aus Buchung
    let customerName = '';
    let customerEmail = inv.sent_to_email || '';
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

    // Letzte Mahnung
    const { data: dunnings } = await supabase
      .from('dunning_notices')
      .select('level, sent_at, created_at')
      .eq('invoice_id', inv.id)
      .order('level', { ascending: false })
      .limit(1);

    const lastDunning = dunnings?.[0];
    const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: inv.id,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_name: customerName,
      customer_email: customerEmail,
      gross_amount: inv.gross_amount || 0,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      days_overdue: daysOverdue,
      dunning_level: lastDunning?.level || 0,
      last_dunning_at: lastDunning?.sent_at || lastDunning?.created_at || null,
    };
  }));

  const totalAmount = items.reduce((sum, i) => sum + i.gross_amount, 0);

  return NextResponse.json({
    items,
    total: items.length,
    totalAmount,
  });
}
