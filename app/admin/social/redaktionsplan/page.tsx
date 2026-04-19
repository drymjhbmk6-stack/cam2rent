'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface ScheduleEntry {
  id: string;
  name: string;
  template_id: string;
  template?: { name: string; trigger_type: string };
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number | null;
  day_of_month?: number | null;
  hour_of_day: number;
  minute: number;
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

interface Template {
  id: string;
  name: string;
}

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function RedaktionsplanPage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const [schedRes, tplRes] = await Promise.all([
      fetch('/api/admin/social/schedule').then((r) => r.json()),
      fetch('/api/admin/social/templates').then((r) => r.json()),
    ]);
    setEntries(schedRes.schedule ?? []);
    setTemplates(tplRes.templates ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(body: Partial<ScheduleEntry>) {
    const res = await fetch('/api/admin/social/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setCreating(false);
      load();
    } else {
      alert('Fehler');
    }
  }

  async function toggleActive(e: ScheduleEntry) {
    await fetch(`/api/admin/social/schedule/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !e.is_active }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await fetch(`/api/admin/social/schedule/${id}`, { method: 'DELETE' });
    load();
  }

  function formatRule(e: ScheduleEntry) {
    const time = `${String(e.hour_of_day).padStart(2, '0')}:${String(e.minute).padStart(2, '0')}`;
    if (e.frequency === 'daily') return `Täglich um ${time}`;
    if (e.frequency === 'weekly' && e.day_of_week !== null && e.day_of_week !== undefined) return `Jeden ${DAYS[e.day_of_week]} um ${time}`;
    if (e.frequency === 'monthly' && e.day_of_month) return `Jeden ${e.day_of_month}. im Monat um ${time}`;
    return time;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <div className="flex items-center justify-between mb-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Redaktionsplan</h1>
          <p className="text-sm text-slate-400">
            Wiederkehrende Posts (z.B. „Jeden Mittwoch 18:00 Produkt-Spotlight“).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500"
        >
          + Neuer Eintrag
        </button>
      </div>

      {loading && <p className="text-slate-400">Lade…</p>}

      {creating && <ScheduleForm templates={templates} onSave={handleCreate} onCancel={() => setCreating(false)} />}

      {!loading && entries.length === 0 && !creating && (
        <p className="text-slate-400">Noch keine Einträge.</p>
      )}

      {!creating && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white">{e.name}</h3>
                    {!e.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">Pausiert</span>}
                  </div>
                  <p className="text-sm text-slate-400">{formatRule(e)} • Vorlage: {e.template?.name ?? '?'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Nächster Lauf: {e.next_run_at ? fmtDateTime(e.next_run_at) : '—'}
                    {e.last_run_at && <span> • Zuletzt: {fmtDateTime(e.last_run_at)}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleActive(e)} className="text-xs text-slate-400 hover:text-slate-200">
                    {e.is_active ? 'Pausieren' : 'Aktivieren'}
                  </button>
                  <button type="button" onClick={() => handleDelete(e.id)} className="text-xs text-red-400 hover:text-red-300">
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleForm({
  templates,
  onSave,
  onCancel,
}: {
  templates: Template[];
  onSave: (body: Partial<ScheduleEntry>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-4">
      <h2 className="font-semibold text-white mb-3">Neuer Redaktionsplan-Eintrag</h2>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z.B. Wöchentlicher Produkt-Spotlight"
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Vorlage</label>
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Häufigkeit</label>
      <select
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      >
        <option value="daily">Täglich</option>
        <option value="weekly">Wöchentlich</option>
        <option value="monthly">Monatlich</option>
      </select>

      {frequency === 'weekly' && (
        <>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Wochentag</label>
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </>
      )}

      {frequency === 'monthly' && (
        <>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Tag im Monat (1-31)</label>
          <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
        </>
      )}

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Uhrzeit</label>
      <div className="flex gap-2 mb-4">
        <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-20 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
        <span className="text-slate-400 self-center">:</span>
        <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className="w-20 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onSave({
              name,
              template_id: templateId,
              frequency,
              day_of_week: frequency === 'weekly' ? dayOfWeek : null,
              day_of_month: frequency === 'monthly' ? dayOfMonth : null,
              hour_of_day: hour,
              minute,
              is_active: true,
            })
          }
          disabled={!name || !templateId}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          Speichern
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-semibold text-sm hover:bg-slate-600">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
