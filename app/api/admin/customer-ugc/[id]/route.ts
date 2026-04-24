import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * GET /api/admin/customer-ugc/[id]
 * Detail inkl. signierter Download-URLs fuer Vorschau (1h gueltig).
 */
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: submission, error } = await supabase
    .from('customer_ugc_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !submission) {
    return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
  }

  // Booking-Kontext
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, product_name, product_id, rental_from, rental_to, customer_name, customer_email')
    .eq('id', submission.booking_id)
    .maybeSingle();

  // Signed URLs
  let previews: { path: string; kind: string; url: string; size: number }[] = [];
  if (Array.isArray(submission.file_paths) && submission.file_paths.length > 0) {
    const paths: string[] = submission.file_paths;
    const kinds: string[] = submission.file_kinds ?? [];
    const sizes: number[] = submission.file_sizes ?? [];
    const signed = await Promise.all(
      paths.map((p) => supabase.storage.from('customer-ugc').createSignedUrl(p, 60 * 60)),
    );
    previews = paths.map((p, i) => ({
      path: p,
      kind: kinds[i] ?? 'image',
      url: signed[i].data?.signedUrl ?? '',
      size: sizes[i] ?? 0,
    }));
  }

  return NextResponse.json({ submission, booking, previews });
}

/**
 * PATCH /api/admin/customer-ugc/[id]
 * Body: { admin_note?: string }
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (typeof body.admin_note === 'string') {
    updates.admin_note = body.admin_note.slice(0, 2000);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('customer_ugc_submissions')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'ugc.update',
    entityType: 'customer_ugc',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/customer-ugc/[id]
 * Loescht Eintrag + Dateien endgueltig.
 */
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: submission } = await supabase
    .from('customer_ugc_submissions')
    .select('file_paths')
    .eq('id', id)
    .maybeSingle();

  if (Array.isArray(submission?.file_paths) && submission.file_paths.length > 0) {
    await supabase.storage.from('customer-ugc').remove(submission.file_paths);
  }

  const { error } = await supabase
    .from('customer_ugc_submissions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'ugc.delete',
    entityType: 'customer_ugc',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
