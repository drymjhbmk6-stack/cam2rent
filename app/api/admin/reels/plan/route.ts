import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const fromDate = url.searchParams.get('from');
  const toDate = url.searchParams.get('to');

  const supabase = createServiceClient();
  let q = supabase
    .from('social_reel_plan')
    .select('*')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .order('created_at', { ascending: true });

  if (status) q = q.eq('status', status);
  if (fromDate) q = q.gte('scheduled_date', fromDate);
  if (toDate) q = q.lte('scheduled_date', toDate);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_reel_plan').insert({
    topic: body.topic,
    template_id: body.template_id ?? null,
    keywords: body.keywords ?? [],
    platforms: body.platforms ?? ['instagram', 'facebook'],
    scheduled_date: body.scheduled_date,
    scheduled_time: body.scheduled_time ?? '10:00',
    status: 'planned',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel_plan.create',
    entityType: 'social_reel_plan',
    entityId: data.id,
    changes: body,
    request: req,
  });

  return NextResponse.json({ entry: data }, { status: 201 });
}
