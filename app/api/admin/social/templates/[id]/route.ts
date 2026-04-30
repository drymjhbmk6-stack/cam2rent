import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ['name', 'description', 'trigger_type', 'platforms', 'media_type', 'caption_prompt', 'image_prompt', 'default_hashtags', 'is_active'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_templates').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_template.update',
    entityType: 'social_template',
    entityId: id,
    entityLabel: data?.name,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('social_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_template.delete',
    entityType: 'social_template',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
