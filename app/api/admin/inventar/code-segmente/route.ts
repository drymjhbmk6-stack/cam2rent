import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET    /api/admin/inventar/code-segmente
 * POST   /api/admin/inventar/code-segmente
 * PATCH  /api/admin/inventar/code-segmente?id=...
 * DELETE /api/admin/inventar/code-segmente?id=...
 *
 * Verwaltet die Stammdaten fuer Inventar-Code-Segmente (Kategorie + Hersteller).
 * Code-Format: 2-5 Zeichen, Grossbuchstaben oder Ziffern. Wird DB-seitig
 * per CHECK-Constraint validiert.
 */

const CODE_PATTERN = /^[A-Z0-9]{2,5}$/;

export async function GET(_req: NextRequest) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('inventar_code_segmente')
    .select('*')
    .order('typ')
    .order('sort_order')
    .order('label');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ segmente: data ?? [] });
}

function validate(body: Record<string, unknown>): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const typ = String(body.typ ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();
  const label = String(body.label ?? '').trim();
  const sort = Number(body.sort_order ?? 0);

  if (typ !== 'kategorie' && typ !== 'hersteller') {
    return { ok: false, error: 'typ muss "kategorie" oder "hersteller" sein.' };
  }
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, error: 'Code muss 2-5 Grossbuchstaben oder Ziffern sein (z.B. STO, GPR, SAN).' };
  }
  if (!label || label.length > 60) {
    return { ok: false, error: 'Label ist Pflicht (max 60 Zeichen).' };
  }
  return { ok: true, row: { typ, code, label, sort_order: Number.isFinite(sort) ? sort : 0 } };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('inventar_code_segmente')
    .insert(v.row)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Dieser Code ist fuer den Typ bereits vergeben.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAudit({ action: 'inventar_code_segment.create', entityType: 'inventar_code_segment', entityId: data.id, changes: v.row, request: req });
  return NextResponse.json({ segment: data });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  // Patch erlaubt label, sort_order, code (mit Format-Check). typ ist
  // immutable, weil sonst Inventar-Codes ihre Bedeutung verlieren wuerden.
  const update: Record<string, unknown> = {};
  if (typeof body.label === 'string') {
    const label = body.label.trim();
    if (!label || label.length > 60) return NextResponse.json({ error: 'Label ungueltig.' }, { status: 400 });
    update.label = label;
  }
  if (typeof body.code === 'string') {
    const code = body.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) return NextResponse.json({ error: 'Code-Format ungueltig.' }, { status: 400 });
    update.code = code;
  }
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Keine Aenderungen.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('inventar_code_segmente')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Dieser Code ist fuer den Typ bereits vergeben.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAudit({ action: 'inventar_code_segment.update', entityType: 'inventar_code_segment', entityId: id, changes: update, request: req });
  return NextResponse.json({ segment: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const supabase = createServiceClient();
  const { error } = await supabase.from('inventar_code_segmente').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ action: 'inventar_code_segment.delete', entityType: 'inventar_code_segment', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}
