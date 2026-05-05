import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/lieferanten?q=foo  → Liste/Suche
 * POST /api/admin/lieferanten       → neuen Lieferanten anlegen
 */

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const supabase = createServiceClient();
  let query = supabase.from('lieferanten').select('*').order('name');
  if (q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lieferanten: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !body.name) {
    return NextResponse.json({ error: 'name ist Pflicht' }, { status: 400 });
  }
  const supabase = createServiceClient();
  const insert = {
    name: String(body.name).trim().slice(0, 200),
    adresse: body.adresse ? String(body.adresse).trim().slice(0, 500) : null,
    ust_id: body.ust_id ? String(body.ust_id).trim().slice(0, 50) : null,
    email: body.email ? String(body.email).trim().slice(0, 200) : null,
    notizen: body.notizen ? String(body.notizen).slice(0, 2000) : null,
  };
  const { data, error } = await supabase.from('lieferanten').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ action: 'lieferant.create', entityType: 'lieferant', entityId: data.id, entityLabel: data.name, request: req });
  return NextResponse.json({ lieferant: data });
}
