import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const KEY = 'business_config';

/**
 * GET /api/admin/business-config
 * Gibt die gespeicherten Geschaeftsdaten zurueck.
 */
export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  return NextResponse.json({ config: data?.value ?? null });
}

/**
 * POST /api/admin/business-config
 * Speichert die Geschaeftsdaten.
 * Body: { config: Partial<BusinessConfig> }
 */
export async function POST(req: NextRequest) {
  const { config } = (await req.json()) as { config?: Record<string, string> };

  if (!config) {
    return NextResponse.json({ error: 'Config fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('admin_settings')
    .upsert({
      key: KEY,
      value: config,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
