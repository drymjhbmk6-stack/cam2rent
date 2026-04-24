import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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
  const adminUserId = searchParams.get('adminUserId') || '';
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
  if (adminUserId) {
    // Sonderwert "legacy-env" = Master-Passwort-Logins (kein UUID, daher
    // separater Match auf den fixen ID-String).
    if (adminUserId === 'legacy-env') {
      query = query.eq('admin_user_id', 'legacy-env');
    } else {
      query = query.eq('admin_user_id', adminUserId);
    }
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

  // Liste aller bisher loggenden Admin-User fuer den Filter-Dropdown.
  // (Inkl. "legacy-env" fuer Master-Passwort-Logins.) Klein genug, damit der
  // einmalige SELECT DISTINCT pro Page-Request ok ist.
  const { data: adminsRaw } = await supabase
    .from('admin_audit_log')
    .select('admin_user_id, admin_user_name')
    .not('admin_user_id', 'is', null)
    .order('admin_user_name', { ascending: true });

  const adminMap = new Map<string, string>();
  for (const row of adminsRaw ?? []) {
    if (row.admin_user_id && !adminMap.has(row.admin_user_id)) {
      adminMap.set(row.admin_user_id, row.admin_user_name ?? row.admin_user_id);
    }
  }
  const availableAdmins = [...adminMap.entries()].map(([id, name]) => ({ id, name }));

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
    availableAdmins,
  });
}
