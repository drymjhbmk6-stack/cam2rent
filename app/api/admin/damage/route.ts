import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendDamageResolution } from '@/lib/email';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/damage
 * Alle Schadensmeldungen laden (mit Buchungs-Info).
 * Optional: ?status=open|confirmed|resolved
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const status = req.nextUrl.searchParams.get('status');

    let query = supabase
      .from('damage_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && ['open', 'confirmed', 'resolved'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    // Buchungs-Details dazuladen
    const bookingIds = [...new Set((reports || []).map((r) => r.booking_id))];
    const bookingsMap: Record<string, { product_name: string; customer_name: string; customer_email: string; deposit: number; product_id: string }> = {};

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, product_name, product_id, customer_name, customer_email, deposit')
        .in('id', bookingIds);

      if (bookings) {
        for (const b of bookings) {
          bookingsMap[b.id] = {
            product_name: b.product_name,
            customer_name: b.customer_name,
            customer_email: b.customer_email,
            deposit: b.deposit,
            product_id: b.product_id,
          };
        }
      }
    }

    const enriched = (reports || []).map((r) => ({
      ...r,
      booking: bookingsMap[r.booking_id] || null,
    }));

    return NextResponse.json({ reports: enriched });
  } catch (err) {
    console.error('GET /api/admin/damage error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/damage
 * Schadensmeldung aktualisieren.
 * Body: { reportId, status?, damage_amount?, deposit_retained?, admin_notes?, repair_until? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportId, status, damage_amount, deposit_retained, admin_notes, repair_until } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'reportId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Report laden
    const { data: report, error: fetchErr } = await supabase
      .from('damage_reports')
      .select('*, booking_id')
      .eq('id', reportId)
      .single();

    if (fetchErr || !report) {
      return NextResponse.json({ error: 'Schadensmeldung nicht gefunden.' }, { status: 404 });
    }

    // Update-Objekt bauen
    const updates: Record<string, unknown> = {};
    if (status && ['open', 'confirmed', 'resolved'].includes(status)) {
      updates.status = status;
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (damage_amount !== undefined) updates.damage_amount = damage_amount;
    if (deposit_retained !== undefined) updates.deposit_retained = deposit_retained;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;

    const { error: updateErr } = await supabase
      .from('damage_reports')
      .update(updates)
      .eq('id', reportId);

    if (updateErr) throw updateErr;

    // Bei "damaged" Status → Buchung aktualisieren
    if (status === 'confirmed') {
      const bookingUpdates: Record<string, unknown> = { status: 'damaged' };
      if (repair_until) {
        bookingUpdates.repair_until = repair_until;
      }
      await supabase
        .from('bookings')
        .update(bookingUpdates)
        .eq('id', report.booking_id);
    }

    // Bei "resolved" → Kunde benachrichtigen
    if (status === 'resolved') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_name, customer_email, product_name')
        .eq('id', report.booking_id)
        .single();

      if (booking?.customer_email) {
        sendDamageResolution({
          bookingId: report.booking_id,
          customerName: booking.customer_name || '',
          customerEmail: booking.customer_email,
          productName: booking.product_name || '',
          damageAmount: damage_amount ?? report.damage_amount ?? 0,
          depositRetained: deposit_retained ?? report.deposit_retained ?? 0,
          adminNotes: admin_notes ?? report.admin_notes ?? '',
        }).catch((e) => console.error('Damage resolution email error:', e));
      }
    }

    const auditAction = status === 'resolved'
      ? 'damage.resolve'
      : status === 'confirmed'
        ? 'damage.confirm'
        : 'damage.update';

    await logAudit({
      action: auditAction,
      entityType: 'damage',
      entityId: reportId,
      changes: updates,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/damage error:', err);
    return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
  }
}
