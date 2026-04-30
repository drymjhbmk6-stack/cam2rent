import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET  /api/admin/config?key=shipping   → einzelnen Wert lesen
 * GET  /api/admin/config                → alle Werte lesen
 * PUT  /api/admin/config                → Wert speichern
 *      Body: { key: string; value: unknown }
 */

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const supabase = createServiceClient();

  const query = supabase.from('admin_config').select('key, value');
  if (key) query.eq('key', key);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (key) {
    return NextResponse.json(data?.[0]?.value ?? null);
  }
  return NextResponse.json(
    Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  );
}

export async function PUT(req: NextRequest) {
  const { key, value } = (await req.json()) as { key?: string; value?: unknown };

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key und value erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('admin_config')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'config.update',
    entityType: 'config',
    entityId: key,
    request: req,
  });

  return NextResponse.json({ success: true });
}
