import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { sanitizeChecklist, isMissingChecklistColumn } from '../route';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;
const SELECT_COLS = 'id, title, content, pinned, color, checklist, created_at, updated_at';
const SELECT_COLS_NO_CHECKLIST = 'id, title, content, pinned, color, created_at, updated_at';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: { title?: string; content?: string; pinned?: boolean; color?: string | null; checklist?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const upd: Record<string, unknown> = {};
  if (typeof body.title === 'string') upd.title = body.title.trim().slice(0, TITLE_MAX);
  if (typeof body.content === 'string') upd.content = body.content.slice(0, CONTENT_MAX);
  if (typeof body.pinned === 'boolean') upd.pinned = body.pinned;
  if ('color' in body) upd.color = body.color ? String(body.color).slice(0, 32) : null;
  if ('checklist' in body) upd.checklist = sanitizeChecklist(body.checklist);

  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from('employee_notes')
    .update(upd)
    .eq('id', id)
    .eq('admin_user_id', me.id)
    .select(SELECT_COLS)
    .maybeSingle();

  // Defensiv: checklist-Spalte fehlt → ohne sie aktualisieren.
  if (error && isMissingChecklistColumn(error)) {
    const updNoChecklist = { ...upd };
    delete updNoChecklist.checklist;
    if (Object.keys(updNoChecklist).length === 0) {
      return NextResponse.json(
        { error: 'Migration supabase-employee-notes-checklist.sql ausstehend.' },
        { status: 503 },
      );
    }
    ({ data, error } = await supabase
      .from('employee_notes')
      .update(updNoChecklist)
      .eq('id', id)
      .eq('admin_user_id', me.id)
      .select(SELECT_COLS_NO_CHECKLIST)
      .maybeSingle() as unknown as { data: typeof data; error: typeof error });
  }

  if (error) {
    console.error('mein/notizen PATCH error:', error);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Notiz nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ note: { ...data, checklist: data.checklist ?? [] } });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('employee_notes')
    .delete()
    .eq('id', id)
    .eq('admin_user_id', me.id);

  if (error) {
    console.error('mein/notizen DELETE error:', error);
    return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
