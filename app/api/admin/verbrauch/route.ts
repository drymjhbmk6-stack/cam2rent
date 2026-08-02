import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizeLinkedIds, sanitizeNotiz, MISSING_NEW_COL_RE, NEW_COL_WARNING, stripNewCols } from '@/lib/verbrauch-sanitize';

/**
 * GET  /api/admin/verbrauch  → alle Verbrauchsartikel (interner Zähler)
 * POST /api/admin/verbrauch  → neuen Verbrauchsartikel anlegen
 *
 * Auth/Permission (`katalog`) läuft rein über middleware.ts.
 */

const MIGRATION_HINT =
  'Migration `supabase-verbrauchsartikel.sql` fehlt in der Datenbank.';

function isMissingTable(msg: string | undefined): boolean {
  return /verbrauchsartikel|relation|does not exist|schema cache|PGRST/i.test(msg || '');
}

function toInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('verbrauchsartikel')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    // Migration noch nicht durch → leere Liste statt 500, damit die Seite lädt.
    if (isMissingTable(error.message)) {
      return NextResponse.json({ items: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body?.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Name erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: last } = await supabase
    .from('verbrauchsartikel')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? 0) + 1;

  const bestand = Math.max(0, toInt(body?.bestand, 0));
  const deduct_qty = Math.max(1, toInt(body?.deduct_qty, 1));
  const warnRaw = body?.warn_threshold;
  const warn_threshold =
    warnRaw === null || warnRaw === '' || warnRaw === undefined
      ? null
      : Math.max(0, toInt(warnRaw, 0));

  const payload: Record<string, unknown> = {
    name: name.slice(0, 200),
    bestand,
    auto_deduct: !!body?.auto_deduct,
    deduct_qty,
    warn_threshold,
    deduct_trigger: body?.deduct_trigger === 'return' ? 'return' : 'shipment',
    linked_accessory_ids: sanitizeLinkedIds(body?.linked_accessory_ids),
    linked_accessory_id: null, // Legacy-Feld: neue Datensätze nutzen nur das Array.
    image_url: typeof body?.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null,
    notiz: sanitizeNotiz(body?.notiz),
    sort_order,
  };

  const warnings: string[] = [];
  let { data, error } = await supabase.from('verbrauchsartikel').insert(payload).select().single();

  // Defensiv: neue Spalten fehlen (Migration nicht erneut ausgeführt) → droppen +
  // Retry, aber mit sichtbarer Warnung (sonst verschwinden Foto/Notiz still).
  if (error && MISSING_NEW_COL_RE.test(error.message || '')) {
    stripNewCols(payload);
    warnings.push(NEW_COL_WARNING);
    ({ data, error } = await supabase.from('verbrauchsartikel').insert(payload).select().single());
  }

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'verbrauch.create',
    entityType: 'verbrauchsartikel',
    entityId: data?.id,
    entityLabel: data?.name,
    request: req,
  });

  return NextResponse.json({ item: data, warnings: warnings.length ? warnings : undefined });
}
