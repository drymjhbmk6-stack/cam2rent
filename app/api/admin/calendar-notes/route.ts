import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Kalender-Notizen für den Auftragskalender.
 * GET    ?from=YYYY-MM-DD&to=YYYY-MM-DD  → Notizen im Zeitraum
 * POST   { date, text }                 → neue Notiz
 * PATCH  { id, text }                   → Notiz ändern
 * DELETE ?id=...                        → Notiz löschen
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /calendar_notes|schema cache|does not exist/i.test(msg)
  );
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: 'Parameter "from" und "to" (YYYY-MM-DD) erforderlich.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('calendar_notes')
    .select('id, note_date, text')
    .gte('note_date', from)
    .lte('note_date', to)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      // Migration noch nicht ausgeführt — Kalender funktioniert ohne Notizen weiter
      return NextResponse.json({ notes: [], migration_pending: true });
    }
    console.error('calendar-notes GET error:', error);
    return NextResponse.json({ error: 'Notizen konnten nicht geladen werden.' }, { status: 500 });
  }

  return NextResponse.json({
    notes: (data ?? []).map((n) => ({
      id: n.id,
      note_date: String(n.note_date).slice(0, 10),
      text: n.text,
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: { date?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const date = String(body.date ?? '').slice(0, 10);
  const text = String(body.text ?? '').trim().slice(0, 1000);
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Datum ungültig.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Notiztext fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('calendar_notes')
    .insert({ note_date: date, text })
    .select('id, note_date, text')
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Notiz-Funktion noch nicht aktiv — Migration supabase-calendar-notes.sql ausstehend.' },
        { status: 503 }
      );
    }
    console.error('calendar-notes POST error:', error);
    return NextResponse.json({ error: 'Notiz konnte nicht gespeichert werden.' }, { status: 500 });
  }

  return NextResponse.json({
    note: { id: data.id, note_date: String(data.note_date).slice(0, 10), text: data.text },
  });
}

export async function PATCH(req: NextRequest) {
  let body: { id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  const text = String(body.text ?? '').trim().slice(0, 1000);
  if (!id) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Notiztext fehlt.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('calendar_notes')
    .update({ text, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, note_date, text')
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
    }
    console.error('calendar-notes PATCH error:', error);
    return NextResponse.json({ error: 'Notiz konnte nicht geändert werden.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Notiz nicht gefunden.' }, { status: 404 });

  return NextResponse.json({
    note: { id: data.id, note_date: String(data.note_date).slice(0, 10), text: data.text },
  });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('calendar_notes').delete().eq('id', id);

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
    }
    console.error('calendar-notes DELETE error:', error);
    return NextResponse.json({ error: 'Notiz konnte nicht gelöscht werden.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
