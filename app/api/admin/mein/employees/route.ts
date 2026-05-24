import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/**
 * Liste aktiver Mitarbeiter (ohne dem eigenen User), zum Teilen von Terminen.
 * Nur ID + Name + Rolle — keine sensiblen Felder.
 */
export async function GET() {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, name, role, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('mein/employees GET error:', error);
    return NextResponse.json({ employees: [] });
  }

  const employees = (data ?? [])
    .filter((u) => u.id !== me.id)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
  return NextResponse.json({ employees });
}
