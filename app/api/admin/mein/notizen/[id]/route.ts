import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import {
  sanitizeChecklist,
  sanitizeAttachments,
  sanitizePages,
  sanitizeColor,
  sanitizeShared,
  isMissingOptionalColumn,
  isMissingTable,
  stripOptionalColumns,
  normalizeNote,
} from '../route';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;
const BUCKET = 'employee-note-attachments';

interface NoteRow {
  id: string;
  admin_user_id: string;
  shared_with?: string[] | null;
  attachments?: { path: string }[] | null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: { title?: string; content?: string; pinned?: boolean; color?: string | null; checklist?: unknown; attachments?: unknown; pages?: unknown; shared_with?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Notiz laden + Berechtigung prüfen (Besitzer ODER mit mir geteilt).
  const { data: existing, error: loadErr } = await supabase
    .from('employee_notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    if (isMissingTable(loadErr)) {
      return NextResponse.json({ error: 'Migration supabase-employee-personal.sql ausstehend.' }, { status: 503 });
    }
    console.error('mein/notizen PATCH load error:', loadErr);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Notiz nicht gefunden.' }, { status: 404 });

  const note = existing as NoteRow;
  const isOwner = note.admin_user_id === me.id;
  const isShared = Array.isArray(note.shared_with) && note.shared_with.includes(me.id);
  if (!isOwner && !isShared) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  // Inhaltsfelder dürfen Besitzer UND geteilte Bearbeiter ändern.
  const upd: Record<string, unknown> = {};
  if (typeof body.title === 'string') upd.title = body.title.trim().slice(0, TITLE_MAX);
  if (typeof body.content === 'string') upd.content = body.content.slice(0, CONTENT_MAX);
  if (typeof body.pinned === 'boolean') upd.pinned = body.pinned;
  if ('color' in body) upd.color = sanitizeColor(body.color);
  if ('checklist' in body) upd.checklist = sanitizeChecklist(body.checklist);
  if ('attachments' in body) upd.attachments = sanitizeAttachments(body.attachments);
  if ('pages' in body) upd.pages = sanitizePages(body.pages);
  // Freigabe-Liste darf NUR der Besitzer ändern.
  if ('shared_with' in body && isOwner) upd.shared_with = sanitizeShared(body.shared_with, me.id);

  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern.' }, { status: 400 });
  }

  let { data, error } = await supabase
    .from('employee_notes')
    .update(upd)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  // Defensiv: optionale Spalte(n) fehlen → strippen und erneut.
  if (error && isMissingOptionalColumn(error)) {
    const reduced = stripOptionalColumns(upd, error.message ?? '');
    if (Object.keys(reduced).length === 0) {
      return NextResponse.json({ error: 'Migration ausstehend — Feld kann noch nicht gespeichert werden.' }, { status: 503 });
    }
    ({ data, error } = await supabase
      .from('employee_notes')
      .update(reduced)
      .eq('id', id)
      .select('*')
      .maybeSingle() as unknown as { data: typeof data; error: typeof error });
  }

  if (error) {
    console.error('mein/notizen PATCH error:', error);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Notiz nicht gefunden.' }, { status: 404 });

  // Besitzer-Name für geteilte Anzeige
  let ownerName: string | null = null;
  const row = data as NoteRow & { admin_user_id: string };
  if (row.admin_user_id !== me.id) {
    const { data: owner } = await supabase.from('admin_users').select('name').eq('id', row.admin_user_id).maybeSingle();
    ownerName = owner?.name ?? null;
  }

  return NextResponse.json({ note: normalizeNote(data as Parameters<typeof normalizeNote>[0], me.id, ownerName) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  // Löschen darf NUR der Besitzer. Anhänge vorher aus dem Storage räumen.
  const { data: existing } = await supabase
    .from('employee_notes')
    .select('id, admin_user_id, attachments')
    .eq('id', id)
    .eq('admin_user_id', me.id)
    .maybeSingle();

  if (existing) {
    const paths = Array.isArray((existing as NoteRow).attachments)
      ? (existing as NoteRow).attachments!.map((a) => a.path).filter((p): p is string => typeof p === 'string')
      : [];
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths); // best-effort
    }
  }

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
