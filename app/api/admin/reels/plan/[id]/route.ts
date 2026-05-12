import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ['topic', 'template_id', 'keywords', 'platforms', 'scheduled_date', 'scheduled_time', 'status'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_reel_plan').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel_plan.update',
    entityType: 'social_reel_plan',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const supabase = createServiceClient();
  const { error } = await supabase.from('social_reel_plan').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel_plan.delete',
    entityType: 'social_reel_plan',
    entityId: id,
    changes: {},
    request: req,
  });

  return NextResponse.json({ deleted: true });
}
