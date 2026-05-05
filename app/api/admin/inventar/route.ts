import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { explainWBW, loadWbwConfig } from '@/lib/inventar/wiederbeschaffungswert';

/**
 * GET /api/admin/inventar?typ=&status=&beleg_status=&q=
 * POST /api/admin/inventar  → manuell anlegen
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const supabase = createServiceClient();
  let q = supabase
    .from('inventar_units')
    .select('*, produkt:produkte(id,name,marke,modell)')
    .order('bezeichnung');

  if (sp.get('typ')) q = q.eq('typ', sp.get('typ'));
  if (sp.get('status')) q = q.eq('status', sp.get('status'));
  if (sp.get('beleg_status')) q = q.eq('beleg_status', sp.get('beleg_status'));
  if (sp.get('tracking_mode')) q = q.eq('tracking_mode', sp.get('tracking_mode'));
  if (sp.get('produkt_id')) q = q.eq('produkt_id', sp.get('produkt_id'));
  const search = sp.get('q')?.trim();
  if (search) q = q.or(`bezeichnung.ilike.%${search}%,inventar_code.ilike.%${search}%,seriennummer.ilike.%${search}%`);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // WBW pro Unit anhaengen
  const config = await loadWbwConfig(supabase);
  const enriched = (data ?? []).map((u) => {
    const meta = explainWBW(u as Parameters<typeof explainWBW>[0], config);
    return { ...u, wbw_computed: meta.value, wbw_source: meta.source };
  });

  return NextResponse.json({ units: enriched, wbw_config: config });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const insert: Record<string, unknown> = {
    bezeichnung: String(body.bezeichnung ?? '').trim().slice(0, 200),
    typ: body.typ ?? 'zubehoer',
    tracking_mode: body.tracking_mode ?? 'individual',
    produkt_id: body.produkt_id ?? null,
    seriennummer: body.seriennummer ?? null,
    inventar_code: body.inventar_code ? String(body.inventar_code).trim().slice(0, 60) : null,
    bestand: body.tracking_mode === 'bulk' ? Math.max(0, parseInt(String(body.bestand ?? 0), 10)) : null,
    kaufpreis_netto: null,
    kaufdatum: null,
    wiederbeschaffungswert: null,
    wbw_manuell_gesetzt: false,
    status: 'verfuegbar',
    beleg_status: 'beleg_fehlt',
    notizen: body.notizen ?? null,
  };

  // Optionaler manueller WBW direkt beim Anlegen
  if (typeof body.wiederbeschaffungswert === 'number' && body.wiederbeschaffungswert > 0) {
    insert.wiederbeschaffungswert = body.wiederbeschaffungswert;
    insert.wbw_manuell_gesetzt = true;
  }

  if (!insert.bezeichnung) return NextResponse.json({ error: 'bezeichnung Pflicht' }, { status: 400 });
  if (insert.tracking_mode === 'individual' && !insert.inventar_code) {
    return NextResponse.json({ error: 'inventar_code Pflicht bei individual-Tracking' }, { status: 400 });
  }

  const { data, error } = await supabase.from('inventar_units').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'inventar.create',
    entityType: 'inventar_unit',
    entityId: data.id,
    entityLabel: data.bezeichnung,
    changes: { manual: true },
    request: req,
  });
  return NextResponse.json({ unit: data });
}
