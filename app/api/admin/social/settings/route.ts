import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * Social-Settings (admin_settings.social_settings):
 *   auto_post_mode: 'draft' | 'scheduled' | 'published'
 *     - draft: Auto-Trigger erstellen nur Entwurf, Admin muss freigeben
 *     - scheduled: Auto-Trigger planen Post N Minuten in der Zukunft
 *     - published: Auto-Trigger veroeffentlichen sofort
 *   auto_post_delay_minutes: Nur relevant bei 'scheduled'
 *   enabled_triggers: Pro Trigger aktivierbar/deaktivierbar
 */

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'social_settings').maybeSingle();
  const settings = data?.value
    ? typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    : { auto_post_mode: 'draft', auto_post_delay_minutes: 30, enabled_triggers: {} };
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();
  const { error } = await supabase.from('admin_settings').upsert({
    key: 'social_settings',
    value: body,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
