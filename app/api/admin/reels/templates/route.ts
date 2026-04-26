import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/** GET /api/admin/reels/templates */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_reel_templates')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

/** POST /api/admin/reels/templates — Template anlegen */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const script_prompt = typeof body.script_prompt === 'string' ? body.script_prompt.trim() : '';

  if (!name || !script_prompt) {
    return NextResponse.json({ error: 'name + script_prompt sind Pflicht' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_reel_templates')
    .insert({
      name,
      description: typeof body.description === 'string' ? body.description : null,
      template_type: body.template_type === 'motion_graphics' ? 'motion_graphics' : 'stock_footage',
      script_prompt,
      default_duration: Number(body.default_duration ?? 20),
      default_hashtags: Array.isArray(body.default_hashtags) ? body.default_hashtags : [],
      bg_color_from: typeof body.bg_color_from === 'string' ? body.bg_color_from : '#3B82F6',
      bg_color_to: typeof body.bg_color_to === 'string' ? body.bg_color_to : '#1E40AF',
      motion_style: ['static', 'kenburns', 'mixed'].includes(body.motion_style)
        ? body.motion_style
        : 'kenburns',
      trigger_type: typeof body.trigger_type === 'string' ? body.trigger_type : 'manual',
      is_active: body.is_active !== false,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
