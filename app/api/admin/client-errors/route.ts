import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;
  const search = searchParams.get('search') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const onlyAdmin = searchParams.get('onlyAdmin') === '1';

  const supabase = createServiceClient();

  let query = supabase
    .from('client_errors')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (search) {
    const safe = sanitizeSearchInput(search);
    if (safe) {
      query = query.or(
        `message.ilike.%${safe}%,url.ilike.%${safe}%,digest.ilike.%${safe}%`
      );
    }
  }

  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  if (onlyAdmin) query = query.eq('is_admin', true);

  const { data, count, error } = await query;

  if (error) {
    // Tabelle existiert moeglicherweise noch nicht (Migration nicht durch)
    if (error.code === '42P01') {
      return NextResponse.json({
        entries: [],
        total: 0,
        totalPages: 1,
        migrationPending: true,
      });
    }
    console.error('[client-errors] list failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    entries: data ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const all = searchParams.get('all') === '1';
  const olderThanDays = searchParams.get('olderThanDays');

  const supabase = createServiceClient();

  if (id) {
    const { error } = await supabase.from('client_errors').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  if (olderThanDays) {
    const days = Math.max(1, parseInt(olderThanDays, 10));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from('client_errors')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  if (all) {
    const { error, count } = await supabase
      .from('client_errors')
      .delete({ count: 'exact' })
      .gte('created_at', '1970-01-01');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  return NextResponse.json({ error: 'id, all=1 oder olderThanDays erforderlich' }, { status: 400 });
}
