import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;
const CHECKLIST_MAX_ITEMS = 200;
const CHECKLIST_TEXT_MAX = 500;

const SELECT_COLS = 'id, title, content, pinned, color, checklist, created_at, updated_at';
const SELECT_COLS_NO_CHECKLIST = 'id, title, content, pinned, color, created_at, updated_at';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
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

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /employee_notes|schema cache|does not exist/i.test(msg)
  );
}

export function isMissingChecklistColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return code === '42703' || code === 'PGRST204' || /checklist|column|schema cache/i.test(msg);
}

export async function GET() {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({
      notes: [],
      legacy: true,
    });
  }

  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from('employee_notes')
    .select(SELECT_COLS)
    .eq('admin_user_id', me.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  // Defensiv: checklist-Spalte fehlt (Migration ausstehend) → ohne sie laden.
  if (error && isMissingChecklistColumn(error)) {
    ({ data, error } = await supabase
      .from('employee_notes')
      .select(SELECT_COLS_NO_CHECKLIST)
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

  return NextResponse.json({ notes: (data ?? []).map((n) => ({ ...n, checklist: n.checklist ?? [] })) });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({
      error: 'Persönliche Notizen brauchen ein Mitarbeiter-Konto. Bitte mit deinem persönlichen Login anmelden.',
    }, { status: 403 });
  }

  let body: { title?: string; content?: string; pinned?: boolean; color?: string; checklist?: unknown };
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

  if (!title && !content && checklist.length === 0) {
    return NextResponse.json({ error: 'Titel, Inhalt oder To-do erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from('employee_notes')
    .insert({ admin_user_id: me.id, title, content, pinned, color, checklist })
    .select(SELECT_COLS)
    .single();

  // Defensiv: checklist-Spalte fehlt → ohne sie speichern.
  if (error && isMissingChecklistColumn(error)) {
    ({ data, error } = await supabase
      .from('employee_notes')
      .insert({ admin_user_id: me.id, title, content, pinned, color })
      .select(SELECT_COLS_NO_CHECKLIST)
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

  return NextResponse.json({ note: { ...data, checklist: data?.checklist ?? [] } });
}
