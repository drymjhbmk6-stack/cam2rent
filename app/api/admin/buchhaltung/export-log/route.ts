import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') || '';
  const supabase = createServiceClient();

  let query = supabase
    .from('export_log')
    .select('*')
    .order('exported_at', { ascending: false })
    .limit(20);

  if (type) query = query.eq('export_type', type);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { export_type, period_from, period_to, row_count, total_amount, file_name, exported_by } = body;

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('export_log')
    .insert({
      export_type,
      period_from,
      period_to,
      row_count: row_count || 0,
      total_amount: total_amount || 0,
      exported_by: exported_by || 'admin',
      file_name: file_name || null,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
