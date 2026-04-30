import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ['name', 'template_id', 'frequency', 'day_of_week', 'day_of_month', 'hour_of_day', 'minute', 'context_json', 'is_active', 'next_run_at'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_schedule').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_schedule.update',
    entityType: 'social_schedule',
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
  const { error } = await supabase.from('social_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_schedule.delete',
    entityType: 'social_schedule',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
