import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase';

async function checkAdminAuth(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (!token) return false;
  const expected = createHash('sha256')
    .update((process.env.ADMIN_PASSWORD ?? '') + '_cam2rent_admin')
    .digest('hex');
  return token === expected;
}

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const action = searchParams.get('action') || '';
  const entityType = searchParams.get('entityType') || '';
  const search = searchParams.get('search') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const supabase = createServiceClient();

  let query = supabase
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq('action', action);
  }
  if (entityType) {
    query = query.eq('entity_type', entityType);
  }
  if (search) {
    query = query.or(
      `entity_label.ilike.%${search}%,admin_user_name.ilike.%${search}%,entity_id.ilike.%${search}%`
    );
  }
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}
