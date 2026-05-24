'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { utcToBerlinLocalInput, berlinLocalInputToUTC } from '@/lib/timezone';

interface Appointment {
  id: string;
  admin_user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  color: string | null;
  reminder_minutes_before: number | null;
  reminder_push: boolean;
  reminder_email: boolean;
  reminder_sent_at: string | null;
  shared_with: string[];
  is_owner: boolean;
  owner_name: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: 'owner' | 'employee';
}

const REMINDER_OPTIONS = [
  { value: '', label: 'Keine Erinnerung' },
  { value: '5', label: '5 Minuten vorher' },
  { value: '15', label: '15 Minuten vorher' },
  { value: '30', label: '30 Minuten vorher' },
  { value: '60', label: '1 Stunde vorher' },
  { value: '120', label: '2 Stunden vorher' },
  { value: '240', label: '4 Stunden vorher' },
  { value: '1440', label: '1 Tag vorher' },
  { value: '2880', label: '2 Tage vorher' },
];

const COLOR_PRESETS: { value: string; label: string; bg: string }[] = [
  { value: 'default', label: 'Cyan', bg: '#06b6d4' },
  { value: 'amber', label: 'Gelb', bg: '#f59e0b' },
  { value: 'emerald', label: 'Grün', bg: '#10b981' },
  { value: 'pink', label: 'Pink', bg: '#ec4899' },
  { value: 'violet', label: 'Lila', bg: '#8b5cf6' },
  { value: 'red', label: 'Rot', bg: '#ef4444' },
];

function colorBg(color: string | null): string {
  if (!color || color === 'default') return '#06b6d4';
  return COLOR_PRESETS.find((c) => c.value === color)?.bg ?? '#06b6d4';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
}

function berlinDateKey(date: Date): string {
  // Verwendet Intl, um Berlin-Tag als YYYY-MM-DD zu bekommen
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(date);
}

export default function MeinKalenderPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState<string | null>(null);
  const [view, setView] = useState<'month' | 'list'>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creatingOnDate, setCreatingOnDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(); from.setDate(from.getDate() - 90);
      const to = new Date(); to.setMonth(to.getMonth() + 6);
      const [tRes, eRes] = await Promise.all([
        fetch(`/api/admin/mein/termine?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: 'no-store' }),
        fetch('/api/admin/mein/employees', { cache: 'no-store' }),
      ]);
      const tJson = await tRes.json();
      const eJson = await eRes.json();
      if (tJson.legacy) setWarn('Du bist mit dem Notfall-Login angemeldet. Bitte mit Mitarbeiter-Konto einloggen, um deinen persönlichen Kalender zu nutzen.');
      else if (tJson.migration_pending) setWarn('Die Migration supabase-employee-personal.sql ist noch nicht eingespielt — Termine können noch nicht gespeichert werden.');
      else setWarn(null);
      setAppointments(tJson.appointments ?? []);
      setEmployees(eJson.employees ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Map: YYYY-MM-DD -> Termine
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = berlinDateKey(new Date(a.starts_at));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return m;
  }, [appointments]);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    // Montag-Start
    const dow = (first.getDay() + 6) % 7; // 0=Mo
    start.setDate(first.getDate() - dow);
    const cells: { date: Date; key: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ date: d, key: berlinDateKey(d), inMonth: d.getMonth() === cursor.getMonth() });
    }
    return cells;
  }, [cursor]);

  const today = berlinDateKey(new Date());
  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => new Date(a.starts_at).getTime() >= now - 1800_000)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 50);
  }, [appointments]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 80px' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>📅 Mein Kalender</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 2 }}>
              <button onClick={() => setView('month')} style={{ background: view === 'month' ? '#06b6d4' : 'transparent', color: view === 'month' ? '#0a0a0a' : '#cbd5e1', border: 0, padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Monat</button>
              <button onClick={() => setView('list')} style={{ background: view === 'list' ? '#06b6d4' : 'transparent', color: view === 'list' ? '#0a0a0a' : '#cbd5e1', border: 0, padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Liste</button>
            </div>
            <button
              onClick={() => setCreatingOnDate(today)}
              disabled={!!warn && warn.startsWith('Du bist')}
              style={{ background: '#06b6d4', color: '#0a0a0a', border: 0, padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
            >
              + Neuer Termin
            </button>
          </div>
        </div>

        {warn && (
          <div style={{ background: '#78350f', color: '#fde68a', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            ⚠ {warn}
          </div>
        )}

        {view === 'month' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={navBtnStyle}>‹</button>
              <button onClick={() => setCursor(new Date())} style={{ ...navBtnStyle, padding: '6px 14px' }}>Heute</button>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={navBtnStyle}>›</button>
              <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc' }}>
                {cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 4 }}>
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
                <div key={d} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'center', textTransform: 'uppercase' }}>{d}</div>
              ))}
              {monthCells.map((cell) => {
                const dayAppts = byDay.get(cell.key) ?? [];
                const isToday = cell.key === today;
                return (
                  <div
                    key={cell.key}
                    onClick={() => setCreatingOnDate(cell.key)}
                    style={{
                      minHeight: 88,
                      background: cell.inMonth ? '#0f172a' : '#1e293b',
                      border: isToday ? '2px solid #facc15' : '1px solid #1e293b',
                      borderRadius: 6,
                      padding: 4,
                      cursor: 'pointer',
                      opacity: cell.inMonth ? 1 : 0.5,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? '#facc15' : '#94a3b8', marginBottom: 2, padding: '0 2px' }}>
                      {cell.date.getDate()}
                    </div>
                    {dayAppts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); setEditing(a); }}
                        style={{
                          background: colorBg(a.color),
                          color: 'white',
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 5px',
                          borderRadius: 3,
                          marginBottom: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          opacity: a.is_owner ? 1 : 0.85,
                          borderLeft: a.is_owner ? 'none' : '3px solid white',
                        }}
                        title={`${a.title}${a.is_owner ? '' : ' (von ' + a.owner_name + ')'}`}
                      >
                        {!a.all_day && <span style={{ opacity: 0.85 }}>{fmtTime(a.starts_at)} </span>}
                        {a.title}
                      </div>
                    ))}
                    {dayAppts.length > 3 && (
                      <div style={{ fontSize: 10, color: '#94a3b8', padding: '0 2px' }}>+{dayAppts.length - 3} weitere</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'list' && (
          <div>
            {loading ? (
              <p style={{ color: '#94a3b8' }}>Lädt…</p>
            ) : upcoming.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                <p style={{ fontSize: 48, margin: 0 }}>🗓</p>
                <p style={{ marginTop: 12 }}>Keine bevorstehenden Termine.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => a.is_owner && setEditing(a)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderLeft: `4px solid ${colorBg(a.color)}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      cursor: a.is_owner ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                          {fmtDateLong(a.starts_at)}{!a.all_day ? ` · ${fmtTime(a.starts_at)}` : ' · ganztägig'}
                        </div>
                        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#f8fafc' }}>
                          {a.title}
                          {!a.is_owner && <span style={{ marginLeft: 8, background: '#4c1d95', color: '#ddd6fe', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>von {a.owner_name}</span>}
                        </h3>
                        {a.location && <p style={{ margin: '0 0 4px', fontSize: 13, color: '#cbd5e1' }}>📍 {a.location}</p>}
                        {a.description && <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', whiteSpace: 'pre-wrap' }}>{a.description}</p>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {a.reminder_minutes_before != null && (
                          <span style={{ fontSize: 10, color: '#06b6d4' }}>
                            ⏰ {a.reminder_minutes_before < 60 ? `${a.reminder_minutes_before} min` : a.reminder_minutes_before < 1440 ? `${a.reminder_minutes_before / 60} h` : `${a.reminder_minutes_before / 1440} d`} vorher
                          </span>
                        )}
                        {a.shared_with.length > 0 && (
                          <span style={{ fontSize: 10, color: '#a78bfa' }}>👥 {a.shared_with.length} geteilt</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {(editing || creatingOnDate) && (
        <AppointmentEditModal
          appointment={editing}
          initialDate={creatingOnDate}
          employees={employees}
          onClose={() => { setEditing(null); setCreatingOnDate(null); }}
          onSaved={() => { setEditing(null); setCreatingOnDate(null); void load(); }}
        />
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#e2e8f0',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
};

function AppointmentEditModal({ appointment, initialDate, employees, onClose, onSaved }: {
  appointment: Appointment | null;
  initialDate: string | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultStart = appointment
    ? utcToBerlinLocalInput(appointment.starts_at)
    : initialDate
      ? `${initialDate}T09:00`
      : '';

  const [title, setTitle] = useState(appointment?.title ?? '');
  const [description, setDescription] = useState(appointment?.description ?? '');
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(appointment?.ends_at ? utcToBerlinLocalInput(appointment.ends_at) : '');
  const [allDay, setAllDay] = useState(appointment?.all_day ?? false);
  const [color, setColor] = useState(appointment?.color ?? 'default');
  const [reminder, setReminder] = useState<string>(appointment?.reminder_minutes_before?.toString() ?? '');
  const [reminderPush, setReminderPush] = useState(appointment?.reminder_push ?? true);
  const [reminderEmail, setReminderEmail] = useState(appointment?.reminder_email ?? false);
  const [shared, setShared] = useState<string[]>(appointment?.shared_with ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canEdit = appointment ? appointment.is_owner : true;
  const isNew = !appointment;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      if (!title.trim()) { setErr('Titel erforderlich.'); return; }
      if (!startsAt) { setErr('Startzeit erforderlich.'); return; }

      const payload = {
        title: title.trim(),
        description: description || null,
        location: location || null,
        starts_at: berlinLocalInputToUTC(startsAt),
        ends_at: endsAt ? berlinLocalInputToUTC(endsAt) : null,
        all_day: allDay,
        color,
        reminder_minutes_before: reminder ? parseInt(reminder, 10) : null,
        reminder_push: reminderPush,
        reminder_email: reminderEmail,
        shared_with: shared,
      };

      const url = appointment ? `/api/admin/mein/termine/${appointment.id}` : '/api/admin/mein/termine';
      const method = appointment ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? 'Fehler'); return; }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!appointment) return;
    if (!confirm(`Termin "${appointment.title}" wirklich löschen?`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/mein/termine/${appointment.id}`, { method: 'DELETE' });
    if (res.ok) onSaved();
    else { setErr('Löschen fehlgeschlagen.'); setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 20, width: '100%', maxWidth: 600, maxHeight: '90dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#f8fafc' }}>
          {isNew ? 'Neuer Termin' : (canEdit ? 'Termin bearbeiten' : 'Termin (geteilt)')}
        </h2>

        {!canEdit && appointment?.owner_name && (
          <div style={{ background: '#4c1d95', color: '#ddd6fe', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            📤 Geteilt von {appointment.owner_name} — nur Leseansicht.
          </div>
        )}

        <Field label="Titel *">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={!canEdit} style={inputStyle} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Beginn *">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={!canEdit} style={inputStyle} />
          </Field>
          <Field label="Ende (optional)">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={!canEdit} style={inputStyle} />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={!canEdit} />
          Ganztägig
        </label>

        <Field label="Ort (optional)">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} disabled={!canEdit} style={inputStyle} />
        </Field>

        <Field label="Beschreibung (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={!canEdit} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>

        <Field label="Farbe">
          <div style={{ display: 'flex', gap: 6 }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                disabled={!canEdit}
                title={c.label}
                style={{
                  width: 28, height: 28, borderRadius: 14, background: c.bg,
                  border: color === c.value ? '3px solid white' : '1px solid #475569',
                  cursor: canEdit ? 'pointer' : 'default',
                  opacity: canEdit ? 1 : 0.6,
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Erinnerung">
          <select value={reminder} onChange={(e) => setReminder(e.target.value)} disabled={!canEdit} style={inputStyle}>
            {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {reminder && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, paddingLeft: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 13 }}>
              <input type="checkbox" checked={reminderPush} onChange={(e) => setReminderPush(e.target.checked)} disabled={!canEdit} />
              📱 Push-Notification
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 13 }}>
              <input type="checkbox" checked={reminderEmail} onChange={(e) => setReminderEmail(e.target.checked)} disabled={!canEdit} />
              ✉ E-Mail
            </label>
          </div>
        )}

        {employees.length > 0 && (
          <Field label={`Teilen mit Kollegen (${shared.length} gewählt)`}>
            <div style={{ maxHeight: 140, overflowY: 'auto', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 8 }}>
              {employees.map((emp) => (
                <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', color: '#cbd5e1', fontSize: 13, cursor: canEdit ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox"
                    checked={shared.includes(emp.id)}
                    onChange={(e) => {
                      if (e.target.checked) setShared([...shared, emp.id]);
                      else setShared(shared.filter((id) => id !== emp.id));
                    }}
                    disabled={!canEdit}
                  />
                  {emp.name}
                  {emp.role === 'owner' && <span style={{ fontSize: 10, color: '#facc15' }}>OWNER</span>}
                </label>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>Geteilte Kollegen sehen den Termin (read-only) und bekommen die Erinnerung.</p>
          </Field>
        )}

        {err && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>⚠ {err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 12 }}>
          {canEdit && appointment && (
            <button onClick={del} disabled={saving} style={{ background: '#7f1d1d', color: '#fecaca', border: 0, padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
              🗑 Löschen
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={onClose} disabled={saving} style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
              {canEdit ? 'Abbrechen' : 'Schließen'}
            </button>
            {canEdit && (
              <button onClick={save} disabled={saving || !title.trim() || !startsAt} style={{ background: '#06b6d4', color: '#0a0a0a', border: 0, padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#e2e8f0',
  fontSize: 14,
};
