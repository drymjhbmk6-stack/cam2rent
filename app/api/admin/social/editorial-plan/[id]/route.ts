import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    'topic', 'angle', 'prompt', 'keywords', 'category',
    'platforms', 'with_image',
    'scheduled_date', 'scheduled_time', 'sort_order',
    'status', 'reviewed', 'reviewed_at',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  // Wenn reviewed auf true gesetzt: automatisch Timestamp
  if (body.reviewed === true && !body.reviewed_at) {
    updates.reviewed_at = new Date().toISOString();
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_editorial_plan').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('social_editorial_plan').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
