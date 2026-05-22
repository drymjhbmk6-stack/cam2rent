import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { mapAngebotRow, type AngebotCameraOption, type AngebotAccessoryItem } from '@/data/angebote';

/** Erkennt, ob die `angebote`-Tabelle/Spalte noch fehlt (Migration ausstehend). */
function isMissingTable(msg: string | undefined): boolean {
  return !!msg && /angebote|offer_id|relation|does not exist|schema cache|PGRST/i.test(msg);
}

function sanitizeCameraOptions(input: unknown): AngebotCameraOption[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: AngebotCameraOption[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const pid = String((raw as { product_id?: unknown }).product_id ?? '').trim();
    if (!pid || seen.has(pid)) continue;
    const price = Number((raw as { price?: unknown }).price);
    if (!Number.isFinite(price) || price < 0) continue;
    seen.add(pid);
    out.push({ product_id: pid, price: Math.round(price * 100) / 100 });
    if (out.length >= 30) break;
  }
  return out;
}

function sanitizeAccessoryItems(input: unknown): AngebotAccessoryItem[] {
  if (!Array.isArray(input)) return [];
  const map = new Map<string, number>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const aid = String((raw as { accessory_id?: unknown }).accessory_id ?? '').trim();
    if (!aid) continue;
    const qty = Math.floor(Number((raw as { qty?: unknown }).qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map.set(aid, (map.get(aid) ?? 0) + qty);
  }
  return [...map.entries()].slice(0, 50).map(([accessory_id, qty]) => ({ accessory_id, qty }));
}

function sanitizeDate(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** GET /api/admin/angebote — alle Angebote (Admin). */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('angebote')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      if (isMissingTable(error.message)) return NextResponse.json({ angebote: [], migration_pending: true });
      throw error;
    }
    return NextResponse.json({ angebote: (data ?? []).map(mapAngebotRow) });
  } catch (err) {
    console.error('GET /api/admin/angebote error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden der Angebote.' }, { status: 500 });
  }
}

function buildRow(body: Record<string, unknown>) {
  const pricingMode = body.pricing_mode === 'perDay' ? 'perDay' : 'flat';
  const fixedDaysRaw = Math.floor(Number(body.fixed_days));
  return {
    name: String(body.name ?? '').trim(),
    description: typeof body.description === 'string' ? body.description.trim() : null,
    valid_from: sanitizeDate(body.valid_from),
    valid_until: sanitizeDate(body.valid_until),
    pricing_mode: pricingMode,
    fixed_days: pricingMode === 'flat' && Number.isFinite(fixedDaysRaw) && fixedDaysRaw > 0 ? fixedDaysRaw : null,
    camera_options: sanitizeCameraOptions(body.camera_options),
    accessory_items: sanitizeAccessoryItems(body.accessory_items),
    badge: typeof body.badge === 'string' && body.badge.trim() ? body.badge.trim() : null,
    badge_color: typeof body.badge_color === 'string' && body.badge_color.trim() ? body.badge_color.trim() : null,
    active: body.active !== false,
  };
}

/** POST /api/admin/angebote — neues Angebot anlegen. */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const row = buildRow(body);
    if (!row.name) return NextResponse.json({ error: 'Name erforderlich.' }, { status: 400 });
    if (row.camera_options.length === 0) {
      return NextResponse.json({ error: 'Mindestens eine Kamera mit Preis erforderlich.' }, { status: 400 });
    }
    if (row.pricing_mode === 'flat' && !row.fixed_days) {
      return NextResponse.json({ error: 'Bei Pauschalpreis ist eine feste Mietdauer (Tage) erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const id = row.name.toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      + '-' + Date.now().toString(36);

    const { data: last } = await supabase
      .from('angebote').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const sort_order = (last?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from('angebote')
      .insert({ id, ...row, sort_order, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ error: 'Migration ausstehend — bitte supabase-angebote.sql ausführen.' }, { status: 503 });
      }
      throw error;
    }
    await logAudit({ action: 'angebot.create', entityType: 'angebot', entityId: id, request: req });
    return NextResponse.json({ angebot: mapAngebotRow(data) });
  } catch (err) {
    console.error('POST /api/admin/angebote error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen des Angebots.' }, { status: 500 });
  }
}

/** PATCH /api/admin/angebote — Angebot aktualisieren. */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
    const row = buildRow(body);
    if (!row.name) return NextResponse.json({ error: 'Name erforderlich.' }, { status: 400 });
    if (row.camera_options.length === 0) {
      return NextResponse.json({ error: 'Mindestens eine Kamera mit Preis erforderlich.' }, { status: 400 });
    }
    if (row.pricing_mode === 'flat' && !row.fixed_days) {
      return NextResponse.json({ error: 'Bei Pauschalpreis ist eine feste Mietdauer (Tage) erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('angebote')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ error: 'Migration ausstehend — bitte supabase-angebote.sql ausführen.' }, { status: 503 });
      }
      throw error;
    }
    await logAudit({ action: 'angebot.update', entityType: 'angebot', entityId: id, request: req });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/angebote error:', err);
    return NextResponse.json({ error: 'Fehler beim Aktualisieren des Angebots.' }, { status: 500 });
  }
}

/** DELETE /api/admin/angebote — Angebot löschen. */
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
    const supabase = createServiceClient();
    const { error } = await supabase.from('angebote').delete().eq('id', id);
    if (error) throw error;
    await logAudit({ action: 'angebot.delete', entityType: 'angebot', entityId: id, request: req });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/angebote error:', err);
    return NextResponse.json({ error: 'Fehler beim Löschen des Angebots.' }, { status: 500 });
  }
}
