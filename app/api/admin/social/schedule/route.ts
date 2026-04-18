import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

function computeNextRun(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, hour: number, minute: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  next.setHours(hour);

  if (frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly' && dayOfWeek !== null) {
    const currentDow = next.getDay();
    let diff = (dayOfWeek - currentDow + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
  } else if (frequency === 'monthly' && dayOfMonth !== null) {
    next.setDate(dayOfMonth);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_schedule')
    .select('*, template:social_templates(name, trigger_type)')
    .order('next_run_at', { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const next_run_at = computeNextRun(
    body.frequency,
    body.day_of_week ?? null,
    body.day_of_month ?? null,
    body.hour_of_day ?? 9,
    body.minute ?? 0
  );
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_schedule')
    .insert({ ...body, next_run_at })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
