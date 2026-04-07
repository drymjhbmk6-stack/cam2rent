import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/settings?key=deposit_mode
 * Liest eine Einstellung aus admin_settings.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data?.value ?? null });
}

/**
 * POST /api/admin/settings
 * Speichert eine Einstellung in admin_settings.
 * Body: { key: string, value: string }
 */
export async function POST(req: NextRequest) {
  const { key, value } = (await req.json()) as { key?: string; value?: unknown };

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'Key und Value erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('admin_settings')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
