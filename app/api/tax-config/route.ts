import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/tax-config
 * Returns the current tax configuration.
 * Public endpoint (no auth required) — only returns config data.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'ust_id']);

  const map: Record<string, string> = {};
  for (const s of settings ?? []) {
    map[s.key] = s.value;
  }

  return NextResponse.json({
    taxMode: map['tax_mode'] || 'kleinunternehmer',
    taxRate: parseFloat(map['tax_rate'] || '19'),
    ustId: map['ust_id'] || '',
  });
}
