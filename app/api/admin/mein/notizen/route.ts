import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 200;
const CONTENT_MAX = 50_000;

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
  const { data, error } = await supabase
    .from('employee_notes')
    .select('id, title, content, pinned, color, created_at, updated_at')
    .eq('admin_user_id', me.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ notes: [], migration_pending: true });
    }
    console.error('mein/notizen GET error:', error);
    return NextResponse.json({ error: 'Notizen konnten nicht geladen werden.' }, { status: 500 });
  }

  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({
      error: 'Persönliche Notizen brauchen ein Mitarbeiter-Konto. Bitte mit deinem persönlichen Login anmelden.',
    }, { status: 403 });
  }

  let body: { title?: string; content?: string; pinned?: boolean; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, TITLE_MAX);
  const content = String(body.content ?? '').slice(0, CONTENT_MAX);
  const pinned = !!body.pinned;
  const color = body.color ? String(body.color).slice(0, 32) : null;

  if (!title && !content) {
    return NextResponse.json({ error: 'Titel oder Inhalt erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('employee_notes')
    .insert({ admin_user_id: me.id, title, content, pinned, color })
    .select('id, title, content, pinned, color, created_at, updated_at')
    .single();

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

  return NextResponse.json({ note: data });
}
