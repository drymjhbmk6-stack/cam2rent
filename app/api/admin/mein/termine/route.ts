import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 200;
const TEXT_MAX = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_REMINDERS = new Set([5, 15, 30, 60, 120, 240, 1440, 2880]); // 5min … 2 Tage

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = err.message ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /employee_appointments|schema cache|does not exist/i.test(msg)
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
  let query = supabase
    .from('employee_appointments')
    .select('id, admin_user_id, title, description, location, starts_at, ends_at, all_day, color, reminder_minutes_before, reminder_push, reminder_email, reminder_sent_at, shared_with, created_at, updated_at')
    .or(`admin_user_id.eq.${me.id},shared_with.cs.{${me.id}}`)
    .order('starts_at', { ascending: true })
    .limit(500);

  if (fromStr && isValidIso(fromStr)) query = query.gte('starts_at', fromStr);
  if (toStr && isValidIso(toStr)) query = query.lte('starts_at', toStr);

  const { data, error } = await query;

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

  const insertPayload = {
    admin_user_id: me.id,
    title,
    description: body.description ? String(body.description).slice(0, TEXT_MAX) : null,
    location: body.location ? String(body.location).slice(0, 200) : null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: !!body.all_day,
    color: body.color ? String(body.color).slice(0, 32) : null,
    reminder_minutes_before: reminderMinutes,
    reminder_push: reminderMinutes !== null ? !!body.reminder_push : false,
    reminder_email: reminderMinutes !== null ? !!body.reminder_email : false,
    shared_with: shared,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('employee_appointments')
    .insert(insertPayload)
    .select('*')
    .single();

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

  return NextResponse.json({ appointment: { ...data, is_owner: true, owner_name: null } });
}
