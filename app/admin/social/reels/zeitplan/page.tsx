'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import ContentCalendar, { CalendarEvent } from '@/components/admin/ContentCalendar';
import { fmtDateTime } from '@/lib/format-utils';

interface ReelEntry {
  id: string;
  caption?: string | null;
  status: string;
  scheduled_at?: string | null;
  thumbnail_url?: string | null;
  template_type?: string | null;
  error_message?: string | null;
  created_at: string;
}

type ViewMode = 'kalender' | 'liste';

const STATUS_LABEL: Record<string, string> = {
  draft:          'Entwurf',
  rendering:      'Rendert…',
  rendered:       'Gerendert',
  pending_review: 'Wartet auf Freigabe',
  approved:       'Freigegeben',
  scheduled:      'Eingeplant',
  publishing:     'Wird veröffentlicht…',
  published:      'Veröffentlicht',
  partial:        'Teilweise veröffentlicht',
  failed:         'Fehler',
};

const STATUS_COLOR: Record<string, string> = {
  draft:          'bg-slate-800 text-slate-300',
  rendering:      'bg-purple-900/40 text-purple-300 animate-pulse',
  rendered:       'bg-cyan-900/40 text-cyan-300',
  pending_review: 'bg-amber-900/40 text-amber-300',
  approved:       'bg-emerald-900/40 text-emerald-300',
  scheduled:      'bg-blue-900/40 text-blue-300',
  publishing:     'bg-blue-900/60 text-blue-300 animate-pulse',
  published:      'bg-emerald-900/60 text-emerald-200',
  partial:        'bg-orange-900/40 text-orange-300',
  failed:         'bg-red-900/40 text-red-300',
};

export default function ReelsZeitplanPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('kalender');
  const [reels, setReels] = useState<ReelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().split('T')[0];
  });
  const [newTime, setNewTime] = useState('09:00');

  const loadReels = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/reels?limit=200').then(r => r.json());
    setReels(res.reels ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadReels(); }, [loadReels]);

  const scheduled = reels.filter(r => r.scheduled_at);
  const unscheduled = reels.filter(r =>
    !r.scheduled_at &&
    ['approved', 'rendered', 'pending_review'].includes(r.status)
  );

  const calendarEvents: CalendarEvent[] = scheduled.map((r): CalendarEvent => {
    const dt = new Date(r.scheduled_at!);
    return {
      id: `reel-${r.id}`,
      date: dt.toISOString().split('T')[0],
      time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
      title: r.caption ? r.caption.slice(0, 60) : 'Reel',
      status: r.status,
      type: 'reel',
      href: `/admin/social/reels/${r.id}`,
    };
  });

  function handleEventClick(ev: CalendarEvent) {
    if (ev.href) router.push(ev.href);
  }

  function handleDayClick(date: string) {
    setNewDate(date);
    setView('liste');
  }

  async function scheduleReel(reelId: string) {
    const scheduledAt = `${newDate}T${newTime}:00`;
    const res = await fetch(`/api/admin/reels/${reelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: scheduledAt, status: 'scheduled' }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert('Fehler: ' + (d?.error ?? 'Unbekannt'));
      return;
    }
    loadReels();
  }

  async function unscheduleReel(reelId: string) {
    if (!confirm('Einplanung aufheben?')) return;
    await fetch(`/api/admin/reels/${reelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: null, status: 'approved' }),
    });
    loadReels();
  }

  async function publishNow(reelId: string) {
    if (!confirm('Reel jetzt sofort veröffentlichen?')) return;
    const res = await fetch(`/api/admin/reels/${reelId}/publish`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) alert('Fehler: ' + (d?.error ?? 'Unbekannt'));
    loadReels();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <AdminBackLink />

      <div className="flex items-center justify-between mt-4 mb-2">
        <h1 className="text-2xl font-bold text-white">Reels-Zeitplan</h1>
        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
          <button
            onClick={() => setView('kalender')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'kalender' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            📅 Kalender
          </button>
          <button
            onClick={() => setView('liste')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-slate-700 ${
              view === 'liste' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            ☰ Liste
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-400 mb-6">
        Eingeplante Reels im Überblick. Klick auf ein Reel öffnet die Detailseite.
      </p>

      {loading && <p className="text-slate-400">Lade…</p>}

      {!loading && view === 'kalender' && (
        <div>
          {scheduled.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <p className="text-slate-400 mb-4">Noch keine Reels eingeplant.</p>
              <Link href="/admin/social/reels/neu" className="text-sm text-purple-400 hover:text-purple-300">
                → Neues Reel erstellen
              </Link>
            </div>
          ) : (
            <ContentCalendar
              events={calendarEvents}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          )}

          {unscheduled.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Freigegebene Reels ohne Zeitplan ({unscheduled.length})
              </h2>
              <div className="space-y-2">
                {unscheduled.map(r => (
                  <ReelQuickSchedule
                    key={r.id}
                    reel={r}
                    defaultDate={newDate}
                    defaultTime={newTime}
                    onSchedule={() => scheduleReel(r.id)}
                    onPublishNow={() => publishNow(r.id)}
                    onSetDate={setNewDate}
                    onSetTime={setNewTime}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600 mt-4 text-center">
            Klick auf einen leeren Tag → öffnet Listenansicht mit vorausgefülltem Datum
          </p>
        </div>
      )}

      {!loading && view === 'liste' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linke Spalte: Einplanen */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <h2 className="font-semibold text-white mb-3 text-sm">Einplanen am</h2>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
              />
              <input
                type="time"
                value={newTime}
                onChange={e => setNewTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                Wähle ein Reel unten aus und klicke „Einplanen“.
              </p>
            </div>

            {unscheduled.length > 0 && (
              <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
                <h2 className="font-semibold text-white mb-3 text-sm">Ohne Zeitplan ({unscheduled.length})</h2>
                <div className="space-y-2">
                  {unscheduled.map(r => (
                    <div key={r.id} className="p-2 rounded bg-slate-950/50 border border-slate-800">
                      <p className="text-xs text-slate-200 line-clamp-2 mb-1">
                        {r.caption ? r.caption.slice(0, 80) : 'Reel ohne Caption'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => scheduleReel(r.id)}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          📅 Einplanen
                        </button>
                        <Link href={`/admin/social/reels/${r.id}`} className="text-xs text-slate-400 hover:text-slate-200">
                          → Detail
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/admin/social/reels/neu"
              className="block w-full px-4 py-2 rounded-xl border border-purple-700 text-purple-400 hover:bg-purple-900/20 text-sm text-center transition-colors"
            >
              + Neues Reel erstellen
            </Link>
          </div>

          {/* Rechte Spalte: Eingeplante Reels */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Eingeplant ({scheduled.length})</h2>
            </div>

            {scheduled.length === 0 && (
              <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
                <p className="text-slate-400">Noch keine Reels eingeplant.</p>
              </div>
            )}

            <div className="space-y-2">
              {[...scheduled]
                .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
                .map(r => (
                  <ScheduledReelRow
                    key={r.id}
                    reel={r}
                    onUnschedule={() => unscheduleReel(r.id)}
                    onPublishNow={() => publishNow(r.id)}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduledReelRow({ reel, onUnschedule, onPublishNow }: {
  reel: ReelEntry;
  onUnschedule: () => void;
  onPublishNow: () => void;
}) {
  const dt = reel.scheduled_at ? new Date(reel.scheduled_at) : null;

  const statusLabel: Record<string, string> = STATUS_LABEL;
  const statusColor: Record<string, string> = STATUS_COLOR;

  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-shrink-0">
          {dt && (
            <div className="rounded-lg bg-slate-950/60 border border-purple-800/50 px-2 py-1 text-center min-w-[60px]">
              <p className="text-[10px] text-slate-500 uppercase">
                {dt.toLocaleDateString('de-DE', { month: 'short' })}
              </p>
              <p className="text-lg font-bold text-slate-200 leading-none">{dt.getDate()}</p>
              <p className="text-[10px] text-slate-500">
                {String(dt.getHours()).padStart(2, '0')}:{String(dt.getMinutes()).padStart(2, '0')}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor[reel.status] ?? 'bg-slate-800 text-slate-300'}`}>
              {statusLabel[reel.status] ?? reel.status}
            </span>
            {reel.template_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300">
                {reel.template_type === 'stock_footage' ? 'Stock' : 'Motion'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 line-clamp-2">
            {reel.caption ? reel.caption.slice(0, 120) : 'Kein Caption'}
          </p>
          {reel.error_message && (
            <p className="text-xs text-red-400 mt-1">⚠ {reel.error_message}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            Erstellt: {fmtDateTime(reel.created_at)}
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-1 items-end">
          <Link href={`/admin/social/reels/${reel.id}`} className="text-xs text-purple-400 hover:text-purple-300 font-semibold">
            → Detail
          </Link>
          {reel.status === 'scheduled' && (
            <button type="button" onClick={onPublishNow} className="text-xs text-emerald-400 hover:text-emerald-300">
              🚀 Jetzt posten
            </button>
          )}
          {reel.status !== 'published' && (
            <button type="button" onClick={onUnschedule} className="text-xs text-slate-400 hover:text-slate-200">
              Einplanung aufheben
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReelQuickSchedule({ reel, defaultDate, defaultTime, onSchedule, onPublishNow, onSetDate, onSetTime }: {
  reel: ReelEntry;
  defaultDate: string;
  defaultTime: string;
  onSchedule: () => void;
  onPublishNow: () => void;
  onSetDate: (d: string) => void;
  onSetTime: (t: string) => void;
}) {
  const statusColor: Record<string, string> = STATUS_COLOR;
  const statusLabel: Record<string, string> = STATUS_LABEL;

  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor[reel.status] ?? ''}`}>
          {statusLabel[reel.status] ?? reel.status}
        </span>
        <p className="text-sm text-slate-200 line-clamp-1 mt-0.5">
          {reel.caption ? reel.caption.slice(0, 80) : 'Reel ohne Caption'}
        </p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <input
          type="date"
          value={defaultDate}
          onChange={e => onSetDate(e.target.value)}
          className="text-xs px-1.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 w-28"
        />
        <input
          type="time"
          value={defaultTime}
          onChange={e => onSetTime(e.target.value)}
          className="text-xs px-1.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 w-20"
        />
        <button
          type="button"
          onClick={onSchedule}
          className="text-xs px-2 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white font-semibold"
        >
          📅 Einplanen
        </button>
        <button
          type="button"
          onClick={onPublishNow}
          className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
        >
          🚀 Jetzt
        </button>
        <Link
          href={`/admin/social/reels/${reel.id}`}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Detail →
        </Link>
      </div>
    </div>
  );
}
