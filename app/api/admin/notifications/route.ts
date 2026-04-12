import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * GET /api/admin/notifications
 * Gibt die letzten 20 Benachrichtigungen + Anzahl ungelesener zurück.
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Letzte 20 Benachrichtigungen
  const { data: notifications, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ungelesene zählen
  const { count, error: countError } = await supabase
    .from('admin_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount: count || 0,
  });
}

/**
 * PATCH /api/admin/notifications
 * Markiert Benachrichtigungen als gelesen.
 * Body: { ids: string[] } oder { markAllRead: true }
 */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const body = await req.json();

  if (body.markAllRead) {
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .in('id', body.ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'ids oder markAllRead erforderlich.' }, { status: 400 });
}
