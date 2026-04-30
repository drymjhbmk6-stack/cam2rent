import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_templates')
    .select('*')
    .order('trigger_type')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_templates').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_template.create',
    entityType: 'social_template',
    entityId: data?.id,
    entityLabel: data?.name,
    request: req,
  });

  return NextResponse.json({ template: data });
}
