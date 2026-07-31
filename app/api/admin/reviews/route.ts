import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/reviews?filter=all|pending|approved
 * Alle Reviews mit Buchungs-/Produktinfo.
 */
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get('filter') || 'all';
  const supabase = createServiceClient();

  let query = supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (filter === 'pending') {
    query = query.eq('approved', false);
  } else if (filter === 'approved') {
    query = query.eq('approved', true);
  }

  const { data: reviews, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Buchungsdaten für Kundennamen holen
  const bookingIds = [...new Set((reviews ?? []).map((r) => r.booking_id))];
  const bookingsMap: Record<string, { customer_name: string; customer_email: string; product_name: string }> = {};

  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, product_name')
      .in('id', bookingIds);
    for (const b of bookings ?? []) {
      bookingsMap[b.id] = {
        customer_name: b.customer_name || 'Unbekannt',
        customer_email: b.customer_email || '',
        product_name: b.product_name || '',
      };
    }
  }

  const enriched = (reviews ?? []).map((r) => ({
    ...r,
    customer_name: bookingsMap[r.booking_id]?.customer_name || 'Unbekannt',
    customer_email: bookingsMap[r.booking_id]?.customer_email || '',
    product_name: bookingsMap[r.booking_id]?.product_name || r.product_id,
  }));

  return NextResponse.json({ reviews: enriched });
}

/**
 * PATCH /api/admin/reviews
 * Body: { reviewId, action: 'approve'|'reject'|'reply', reply?: string }
 */
export async function PATCH(req: NextRequest) {
  const { reviewId, action, reply } = (await req.json()) as {
    reviewId?: string;
    action?: 'approve' | 'reject' | 'reply';
    reply?: string;
  };

  if (!reviewId || !action) {
    return NextResponse.json({ error: 'reviewId und action erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (action === 'approve') {
    const { error } = await supabase
      .from('reviews')
      .update({ approved: true })
      .eq('id', reviewId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === 'reject') {
    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === 'reply') {
    if (!reply?.trim()) {
      return NextResponse.json({ error: 'Antwort-Text erforderlich.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('reviews')
      .update({ admin_reply: reply.trim(), admin_reply_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: `review.${action}`,
    entityType: 'review',
    entityId: reviewId,
    request: req,
  });

  return NextResponse.json({ success: true });
}
