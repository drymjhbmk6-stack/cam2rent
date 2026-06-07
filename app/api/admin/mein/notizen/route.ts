import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;
const CHECKLIST_MAX_ITEMS = 200;
const CHECKLIST_TEXT_MAX = 500;
const ATTACH_MAX = 30;
const SHARE_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACH_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteAttachment {
  id: string;
  path: string;
  filename: string;
  mime: string;
  size: number;
}

export function sanitizeChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  const out: ChecklistItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const text = String(item.text ?? '').slice(0, CHECKLIST_TEXT_MAX);
    if (!text.trim()) continue;
    const id = typeof item.id === 'string' && item.id.length <= 64
      ? item.id
      : `${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 8)}`;
    out.push({ id, text, done: !!item.done });
    if (out.length >= CHECKLIST_MAX_ITEMS) break;
  }
  return out;
}

export function sanitizeAttachments(input: unknown): NoteAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: NoteAttachment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const path = String(a.path ?? '');
    if (!ATTACH_PATH_RE.test(path)) continue;
    const fallbackId = path.split('/')[1]?.split('.')[0] ?? `${out.length}`;
    const id = typeof a.id === 'string' && a.id.length <= 64 ? a.id : fallbackId;
    const filename = String(a.filename ?? 'Datei').slice(0, 200);
    const mime = String(a.mime ?? '').slice(0, 100);
    const sizeNum = Number(a.size);
    const size = Number.isFinite(sizeNum) ? Math.max(0, Math.floor(sizeNum)) : 0;
    out.push({ id, path, filename, mime, size });
    if (out.length >= ATTACH_MAX) break;
  }
  return out;
}

export function sanitizeShared(input: unknown, excludeId: string): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === 'string' && UUID_RE.test(v) && v !== excludeId && !out.includes(v)) out.push(v);
    if (out.length >= SHARE_MAX) break;
  }
  return out;
}

export function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /employee_notes|schema cache|does not exist/i.test(msg)
  );
}

// Eine der optionalen Spalten (checklist / shared_with / attachments) fehlt —
// Migration ausstehend. Wird beim Schreiben abgefangen, Felder werden gestript.
export function isMissingOptionalColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return code === '42703' || code === 'PGRST204' ||
    /checklist|shared_with|attachments|column|schema cache/i.test(msg);
}

export function isMissingSharedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return /shared_with/i.test(err.message ?? '');
}

/** Entfernt die optionalen Spalten aus dem Payload, die der Fehler referenziert. */
export function stripOptionalColumns<T extends Record<string, unknown>>(payload: T, errMsg: string): T {
  const out = { ...payload };
  const msg = (errMsg || '').toLowerCase();
  let stripped = false;
  for (const k of ['checklist', 'shared_with', 'attachments'] as const) {
    if (msg.includes(k)) { delete out[k]; stripped = true; }
  }
  if (!stripped) {
    delete out.checklist; delete out.shared_with; delete out.attachments;
  }
  return out;
}

interface NoteRow {
  id: string;
  admin_user_id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  checklist?: ChecklistItem[] | null;
  shared_with?: string[] | null;
  attachments?: NoteAttachment[] | null;
  created_at: string;
  updated_at: string;
}

export function normalizeNote(n: NoteRow, meId: string, ownerName: string | null) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    pinned: n.pinned,
    color: n.color,
    checklist: Array.isArray(n.checklist) ? n.checklist : [],
    attachments: Array.isArray(n.attachments) ? n.attachments : [],
    shared_with: Array.isArray(n.shared_with) ? n.shared_with : [],
    is_owner: n.admin_user_id === meId,
    owner_name: n.admin_user_id === meId ? null : ownerName,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

export async function GET() {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({ notes: [], legacy: true });
  }

  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from('employee_notes')
    .select('*')
    .or(`admin_user_id.eq.${me.id},shared_with.cs.{${me.id}}`)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  // Defensiv: shared_with-Spalte fehlt (Migration ausstehend) → nur eigene laden.
  if (error && isMissingSharedColumn(error)) {
    ({ data, error } = await supabase
      .from('employee_notes')
      .select('*')
      .eq('admin_user_id', me.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false }) as unknown as { data: typeof data; error: typeof error });
  }

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ notes: [], migration_pending: true });
    }
    console.error('mein/notizen GET error:', error);
    return NextResponse.json({ error: 'Notizen konnten nicht geladen werden.' }, { status: 500 });
  }

  const rows = (data ?? []) as NoteRow[];

  // Besitzer-Namen für mit mir geteilte Notizen bulk-nachladen
  const otherOwnerIds = Array.from(new Set(
    rows.filter((n) => n.admin_user_id !== me.id).map((n) => n.admin_user_id),
  ));
  const ownerNames = new Map<string, string>();
  if (otherOwnerIds.length > 0) {
    const { data: users } = await supabase
      .from('admin_users')
      .select('id, name')
      .in('id', otherOwnerIds);
    for (const u of users ?? []) ownerNames.set(u.id, u.name);
  }

  return NextResponse.json({
    notes: rows.map((n) => normalizeNote(n, me.id, ownerNames.get(n.admin_user_id) ?? null)),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({
      error: 'Persönliche Notizen brauchen ein Mitarbeiter-Konto. Bitte mit deinem persönlichen Login anmelden.',
    }, { status: 403 });
  }

  let body: { title?: string; content?: string; pinned?: boolean; color?: string; checklist?: unknown; attachments?: unknown; shared_with?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, TITLE_MAX);
  const content = String(body.content ?? '').slice(0, CONTENT_MAX);
  const pinned = !!body.pinned;
  const color = body.color ? String(body.color).slice(0, 32) : null;
  const checklist = sanitizeChecklist(body.checklist);
  const attachments = sanitizeAttachments(body.attachments);
  const shared_with = sanitizeShared(body.shared_with, me.id);

  if (!title && !content && checklist.length === 0 && attachments.length === 0) {
    return NextResponse.json({ error: 'Titel, Inhalt, To-do oder Anhang erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const payload: Record<string, unknown> = { admin_user_id: me.id, title, content, pinned, color, checklist, attachments, shared_with };
  let { data, error } = await supabase
    .from('employee_notes')
    .insert(payload)
    .select('*')
    .single();

  // Defensiv: optionale Spalte(n) fehlen → strippen und erneut versuchen.
  if (error && isMissingOptionalColumn(error)) {
    ({ data, error } = await supabase
      .from('employee_notes')
      .insert(stripOptionalColumns(payload, error.message ?? ''))
      .select('*')
      .single() as unknown as { data: typeof data; error: typeof error });
  }

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Migration supabase-employee-personal.sql ausstehend.' },
        { status: 503 },
      );
    }
    console.error('mein/notizen POST error:', error);
    return NextResponse.json({ error: 'Notiz konnte nicht gespeichert werden.' }, { status: 500 });
  }

  return NextResponse.json({ note: normalizeNote(data as NoteRow, me.id, null) });
}
