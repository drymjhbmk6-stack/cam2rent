import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { utcToBerlinLocalInput, berlinLocalInputToUTC } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 200;
const TEXT_MAX = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_REMINDERS = new Set([5, 15, 30, 60, 120, 240, 1440, 2880]); // 5min … 2 Tage
const RECURRENCES = new Set(['daily', 'weekly', 'biweekly', 'monthly']);
const MAX_OCCURRENCES = 52;

function isMissingSeriesColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return /series_id|column|schema cache/i.test(err.message ?? '');
}

// shared_with-Spalte fehlt (z.B. Tabelle aus einer aelteren Migration ohne
// die Spalte) → der .or(shared_with.cs.{…})-Filter scheitert. Wird defensiv
// abgefangen: GET laedt dann nur eigene Termine, POST fuegt ohne shared_with ein.
function isMissingSharedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return /shared_with/i.test(err.message ?? '');
}

// Wiederholung wall-clock-stabil: vom Berlin-Local-Start aus Kalendereinheiten
// addieren, dann zurück nach UTC. So bleibt 09:00 auch über die Sommer-/Winter-
// zeit-Umstellung 09:00 (kein ms-Offset-Drift).
function shiftStartUtc(baseUtcIso: string, recurrence: string, n: number): string | null {
  const local = utcToBerlinLocalInput(baseUtcIso); // "YYYY-MM-DDTHH:mm"
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  let d = Number(m[3]);
  const hh = m[4];
  const mi = m[5];
  if (recurrence === 'monthly') {
    // setUTCMonth-Logik manuell, damit Monatsüberlauf sauber rollt.
    const total = mo + n;
    y += Math.floor(total / 12);
    mo = ((total % 12) + 12) % 12;
    const ref = new Date(Date.UTC(y, mo, 1));
    ref.setUTCDate(d);
    y = ref.getUTCFullYear();
    mo = ref.getUTCMonth();
    d = ref.getUTCDate();
  } else {
    const days = recurrence === 'daily' ? n : recurrence === 'weekly' ? 7 * n : 14 * n; // biweekly
    const ref = new Date(Date.UTC(y, mo, d));
    ref.setUTCDate(ref.getUTCDate() + days);
    y = ref.getUTCFullYear();
    mo = ref.getUTCMonth();
    d = ref.getUTCDate();
  }
  const pad = (x: number) => String(x).padStart(2, '0');
  return berlinLocalInputToUTC(`${y}-${pad(mo + 1)}-${pad(d)}T${hh}:${mi}`);
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  // Bewusst TABELLEN-spezifisch: NICHT das generische /does not exist/ matchen,
  // sonst wird ein fehlender Spalten-Fehler (z.B. shared_with) faelschlich als
  // "Tabelle fehlt" → "Migration ausstehend" klassifiziert.
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /could not find the table|relation\s.*does not exist/i.test(msg)
  );
}

function isValidIso(s: unknown): s is string {
  if (typeof s !== 'string' || !s) return false;
  const d = new Date(s);
  return Number.isFinite(d.getTime());
}

function sanitizeShared(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === 'string' && UUID_RE.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= 50) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({ appointments: [], legacy: true });
  }

  const fromStr = req.nextUrl.searchParams.get('from');
  const toStr = req.nextUrl.searchParams.get('to');

  const supabase = createServiceClient();
  // eigene + mit mir geteilte Termine; Fallback (ohne shared_with) weiter unten.
  const buildQuery = (withShared: boolean) => {
    let q = supabase.from('employee_appointments').select('*');
    q = withShared
      ? q.or(`admin_user_id.eq.${me.id},shared_with.cs.{${me.id}}`)
      : q.eq('admin_user_id', me.id);
    q = q.order('starts_at', { ascending: true }).limit(500);
    if (fromStr && isValidIso(fromStr)) q = q.gte('starts_at', fromStr);
    if (toStr && isValidIso(toStr)) q = q.lte('starts_at', toStr);
    return q;
  };

  let { data, error } = await buildQuery(true);

  // Defensiv: shared_with-Spalte fehlt → nur eigene Termine laden (kein
  // faelschliches "Migration ausstehend", da der .or-Filter sonst die Tabelle
  // referenziert und isMissingTable greift).
  if (error && isMissingSharedColumn(error)) {
    ({ data, error } = await buildQuery(false) as unknown as { data: typeof data; error: typeof error });
  }

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ appointments: [], migration_pending: true });
    }
    console.error('mein/termine GET error:', error);
    return NextResponse.json({ error: 'Termine konnten nicht geladen werden.' }, { status: 500 });
  }

  // Owner-Namen für geshareed Termine bulk-nachladen
  const otherOwnerIds = Array.from(new Set((data ?? [])
    .filter((a) => a.admin_user_id !== me.id)
    .map((a) => a.admin_user_id))) as string[];
  const ownerNames = new Map<string, string>();
  if (otherOwnerIds.length > 0) {
    const { data: users } = await supabase
      .from('admin_users')
      .select('id, name')
      .in('id', otherOwnerIds);
    (users ?? []).forEach((u) => ownerNames.set(u.id, u.name));
  }

  const appointments = (data ?? []).map((a) => ({
    ...a,
    is_owner: a.admin_user_id === me.id,
    owner_name: a.admin_user_id === me.id ? null : ownerNames.get(a.admin_user_id) ?? 'Unbekannt',
  }));

  return NextResponse.json({ appointments });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({
      error: 'Persönlicher Kalender braucht ein Mitarbeiter-Konto.',
    }, { status: 403 });
  }

  let body: {
    title?: string;
    description?: string;
    location?: string;
    starts_at?: string;
    ends_at?: string | null;
    all_day?: boolean;
    color?: string | null;
    reminder_minutes_before?: number | null;
    reminder_push?: boolean;
    reminder_email?: boolean;
    shared_with?: string[];
    recurrence?: string;
    recurrence_count?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, TITLE_MAX);
  if (!title) return NextResponse.json({ error: 'Titel erforderlich.' }, { status: 400 });
  if (!isValidIso(body.starts_at)) return NextResponse.json({ error: 'Startzeit erforderlich.' }, { status: 400 });

  const startsAt = new Date(body.starts_at as string).toISOString();
  let endsAt: string | null = null;
  if (body.ends_at && isValidIso(body.ends_at)) {
    const end = new Date(body.ends_at);
    if (end.getTime() >= new Date(startsAt).getTime()) endsAt = end.toISOString();
  }

  const reminder = body.reminder_minutes_before;
  let reminderMinutes: number | null = null;
  if (typeof reminder === 'number' && ALLOWED_REMINDERS.has(reminder)) reminderMinutes = reminder;

  const shared = sanitizeShared(body.shared_with).filter((id) => id !== me.id);

  // Wiederholung: jede Instanz wird als eigene Zeile materialisiert (eigener
  // Reminder/Push). series_id gruppiert sie fürs Serien-Löschen.
  const recurrence = typeof body.recurrence === 'string' && RECURRENCES.has(body.recurrence)
    ? body.recurrence
    : null;
  let count = 1;
  if (recurrence) {
    const raw = Number(body.recurrence_count);
    count = Number.isFinite(raw) ? Math.min(MAX_OCCURRENCES, Math.max(2, Math.round(raw))) : 2;
  }

  const durationMs = endsAt ? new Date(endsAt).getTime() - new Date(startsAt).getTime() : null;
  const seriesId = recurrence ? randomUUID() : null;

  const common = {
    admin_user_id: me.id,
    title,
    description: body.description ? String(body.description).slice(0, TEXT_MAX) : null,
    location: body.location ? String(body.location).slice(0, 200) : null,
    all_day: !!body.all_day,
    color: body.color ? String(body.color).slice(0, 32) : null,
    reminder_minutes_before: reminderMinutes,
    reminder_push: reminderMinutes !== null ? !!body.reminder_push : false,
    reminder_email: reminderMinutes !== null ? !!body.reminder_email : false,
    shared_with: shared,
  };

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const occStart = i === 0 || !recurrence ? startsAt : shiftStartUtc(startsAt, recurrence, i);
    if (!occStart) continue;
    const occEnd = durationMs !== null ? new Date(new Date(occStart).getTime() + durationMs).toISOString() : null;
    rows.push({ ...common, starts_at: occStart, ends_at: occEnd, series_id: seriesId });
  }

  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from('employee_appointments')
    .insert(rows)
    .select('*');

  // Migration für series_id steht aus → Zeilen ohne die Spalte einfügen
  // (Serie wird dann als unabhängige Termine angelegt, ohne Gruppen-Löschen).
  if (error && isMissingSeriesColumn(error) && !isMissingTable(error)) {
    const fallbackRows = rows.map(({ series_id: _omit, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    ({ data, error } = await supabase
      .from('employee_appointments')
      .insert(fallbackRows)
      .select('*'));
  }

  // Defensiv: shared_with-Spalte fehlt → ohne sie einfügen (Termin wird dann
  // ohne Teilen angelegt). Greift auch, falls der series_id-Fallback noch lief.
  if (error && isMissingSharedColumn(error) && !isMissingTable(error)) {
    const fallbackRows = rows.map(({ shared_with: _s, series_id: _o, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    ({ data, error } = await supabase
      .from('employee_appointments')
      .insert(fallbackRows)
      .select('*'));
  }

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Migration supabase-employee-personal.sql ausstehend.' },
        { status: 503 },
      );
    }
    console.error('mein/termine POST error:', error);
    return NextResponse.json({ error: 'Termin konnte nicht gespeichert werden.' }, { status: 500 });
  }

  const created = data ?? [];
  return NextResponse.json({
    appointment: created[0] ? { ...created[0], is_owner: true, owner_name: null } : null,
    series_count: created.length,
  });
}
