import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const TEXT_MAX = 5_000;
const ALLOWED_REMINDERS = new Set([5, 15, 30, 60, 120, 240, 1440, 2880]);

function isValidIso(s: unknown): s is string {
  if (typeof s !== 'string' || !s) return false;
  return Number.isFinite(new Date(s).getTime());
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ungültiger Request.' }, { status: 400 }); }

  const upd: Record<string, unknown> = {};
  let timingChanged = false;
  let reminderChanged = false;

  if (typeof body.title === 'string') {
    const t = body.title.trim().slice(0, TITLE_MAX);
    if (!t) return NextResponse.json({ error: 'Titel darf nicht leer sein.' }, { status: 400 });
    upd.title = t;
  }
  if ('description' in body) upd.description = body.description ? String(body.description).slice(0, TEXT_MAX) : null;
  if ('location' in body) upd.location = body.location ? String(body.location).slice(0, 200) : null;
  if ('starts_at' in body) {
    if (!isValidIso(body.starts_at)) return NextResponse.json({ error: 'Startzeit ungültig.' }, { status: 400 });
    upd.starts_at = new Date(body.starts_at as string).toISOString();
    timingChanged = true;
  }
  if ('ends_at' in body) {
    if (body.ends_at === null || body.ends_at === '') {
      upd.ends_at = null;
    } else if (isValidIso(body.ends_at)) {
      upd.ends_at = new Date(body.ends_at as string).toISOString();
    } else {
      return NextResponse.json({ error: 'Endzeit ungültig.' }, { status: 400 });
    }
  }
  if (typeof body.all_day === 'boolean') upd.all_day = body.all_day;
  if ('color' in body) upd.color = body.color ? String(body.color).slice(0, 32) : null;
  if ('reminder_minutes_before' in body) {
    const r = body.reminder_minutes_before;
    if (r === null) {
      upd.reminder_minutes_before = null;
      upd.reminder_push = false;
      upd.reminder_email = false;
    } else if (typeof r === 'number' && ALLOWED_REMINDERS.has(r)) {
      upd.reminder_minutes_before = r;
    } else {
      return NextResponse.json({ error: 'Erinnerungs-Vorlaufzeit ungültig.' }, { status: 400 });
    }
    reminderChanged = true;
  }
  if (typeof body.reminder_push === 'boolean') upd.reminder_push = body.reminder_push;
  if (typeof body.reminder_email === 'boolean') upd.reminder_email = body.reminder_email;
  if ('shared_with' in body) upd.shared_with = sanitizeShared(body.shared_with).filter((sid) => sid !== me.id);

  // Bei Zeit-Änderung oder Reminder-Änderung den `sent_at`-Marker zurücksetzen,
  // damit der Cron den (verschobenen) Termin neu feuert.
  if (timingChanged || reminderChanged) upd.reminder_sent_at = null;

  if (Object.keys(upd).length === 0) return NextResponse.json({ error: 'Nichts zu ändern.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('employee_appointments')
    .update(upd)
    .eq('id', id)
    .eq('admin_user_id', me.id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('mein/termine PATCH error:', error);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Termin nicht gefunden oder nicht von dir.' }, { status: 404 });
  return NextResponse.json({ appointment: { ...data, is_owner: true, owner_name: null } });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID ungültig.' }, { status: 400 });

  const supabase = createServiceClient();

  // ?scope=series → alle Termine der gleichen Serie löschen (nur eigene).
  if (req.nextUrl.searchParams.get('scope') === 'series') {
    const { data: row } = await supabase
      .from('employee_appointments')
      .select('series_id')
      .eq('id', id)
      .eq('admin_user_id', me.id)
      .maybeSingle();
    const seriesId = (row as { series_id?: string | null } | null)?.series_id ?? null;
    if (seriesId) {
      const { error } = await supabase
        .from('employee_appointments')
        .delete()
        .eq('series_id', seriesId)
        .eq('admin_user_id', me.id);
      if (error) {
        console.error('mein/termine DELETE series error:', error);
        return NextResponse.json({ error: 'Serie löschen fehlgeschlagen.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, scope: 'series' });
    }
    // keine series_id → wie Einzel-Löschen weiter unten
  }

  const { error } = await supabase
    .from('employee_appointments')
    .delete()
    .eq('id', id)
    .eq('admin_user_id', me.id);

  if (error) {
    console.error('mein/termine DELETE error:', error);
    return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
