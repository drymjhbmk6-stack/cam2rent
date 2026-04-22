import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

// Transiente Status-Keys (Cron-Health, Job-Status, Polling-Caches) nicht
// ins Audit-Log schreiben — das würde das Protokoll fluten.
const NON_AUDITABLE_KEYS = new Set([
  'social_plan_job',
  'social_generation_status',
  'social_settings_touched',
]);

// Keys die öffentlich (ohne Admin-Auth) gelesen werden dürfen — werden
// von Shop-Seiten wie dem ProductCard (Markenfarben) oder der Startseite
// (Banner) konsumiert. Alle anderen Keys erfordern Admin-Auth, damit
// sensible Werte (totp_secret, business_config, api-keys, ...) nicht
// durchsickern.
const PUBLIC_SETTINGS_KEYS = new Set([
  'brand_colors',
  'camera_brands',
  'show_construction_banner',
  'construction_banner_message',
  'accessory_categories',
  'set_badges',
  'spec_definitions',
]);

/**
 * GET /api/admin/settings?key=deposit_mode
 * Liest eine Einstellung aus admin_settings.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key erforderlich.' }, { status: 400 });
  }

  if (!PUBLIC_SETTINGS_KEYS.has(key)) {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

  if (!NON_AUDITABLE_KEYS.has(key)) {
    await logAudit({
      action: 'settings.update',
      entityType: 'settings',
      entityId: key,
      entityLabel: key,
      request: req,
    });
  }

  return NextResponse.json({ success: true });
}
