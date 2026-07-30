import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { loadReviews } from '@/lib/admin/load-reviews';

/**
 * GET /api/admin/reviews?filter=all|pending|approved
 * Alle Reviews mit Buchungs-/Produktinfo.
 * Kernlogik in `lib/admin/load-reviews.ts` — geteilt mit der server-
 * gerenderten /admin/bewertungen-Page.
 */
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get('filter') || 'all';
  const { reviews, error } = await loadReviews(filter);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ reviews });
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
