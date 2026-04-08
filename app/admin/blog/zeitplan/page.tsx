'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };

interface ScheduleEntry {
  id: string; topic: string; keywords: string[]; category_id: string | null;
  tone: string; target_length: string; scheduled_date: string; scheduled_time: string;
  sort_order: number; status: string; reviewed: boolean; reviewed_at: string | null;
  post_id: string | null; generated_at: string | null;
  blog_categories?: { id: string; name: string; color: string } | null;
  blog_posts?: { id: string; title: string; slug: string; status: string; featured_image: string | null } | null;
}

interface Category { id: string; name: string; color: string; }

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: 'Geplant', color: '#94a3b8', bg: '#94a3b820' },
  generating: { label: 'Generiert...', color: '#f59e0b', bg: '#f59e0b20' },
  generated: { label: 'Fertig', color: '#06b6d4', bg: '#06b6d420' },
  reviewed: { label: 'Gesehen', color: '#22c55e', bg: '#22c55e20' },
  published: { label: 'Live', color: '#22c55e', bg: '#22c55e20' },
  skipped: { label: 'Uebersprungen', color: '#64748b', bg: '#64748b20' },
};

export default function BlogZeitplanPage() {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [postsPerWeek, setPostsPerWeek] = useState(2);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [schedRes, catRes] = await Promise.all([
      fetch('/api/admin/blog/schedule'),
      fetch('/api/admin/blog/categories'),
    ]);
    const schedData = await schedRes.json();
    const catData = await catRes.json();
    setSchedule(schedData.schedule ?? []);
    setCategories(catData.categories ?? []);
    setLoading(false);
  }

  async function generatePlan() {
    setGenerating(true);
    setMsg('');
    const res = await fetch('/api/admin/blog/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_plan', weeks, postsPerWeek }),
    });
    const data = await res.json();
    setGenerating(false);
    if (res.ok) {
      setMsg(`${data.count} Themen fuer ${weeks} Wochen erstellt!`);
      loadAll();
    } else {
      setMsg(data.error || 'Fehler bei der Plan-Generierung.');
    }
  }

  async function toggleReviewed(entry: ScheduleEntry) {
    const newReviewed = !entry.reviewed;
    await fetch('/api/admin/blog/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, reviewed: newReviewed, status: newReviewed ? 'reviewed' : entry.post_id ? 'generated' : 'planned' }),
    });
    loadAll();
  }

  async function updateDate(id: string, date: string) {
    await fetch('/api/admin/blog/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, scheduled_date: date }),
    });
    loadAll();
  }

  async function updateTime(id: string, time: string) {
    await fetch('/api/admin/blog/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, scheduled_time: time }),
    });
    loadAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag wirklich loeschen?')) return;
    await fetch(`/api/admin/blog/schedule?id=${id}`, { method: 'DELETE' });
    loadAll();
  }

  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index;
  }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...schedule];
    const dragged = items.splice(dragItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, dragged);

    // Sort-Order aktualisieren
    const updated = items.map((item, i) => ({ ...item, sort_order: i }));
    setSchedule(updated);

    // Alle sort_orders an API senden
    for (const item of updated) {
      await fetch('/api/admin/blog/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, sort_order: item.sort_order }),
      });
    }

    dragItem.current = null;
    dragOverItem.current = null;
  }

  const plannedCount = schedule.filter((s) => s.status === 'planned').length;
  const generatedCount = schedule.filter((s) => s.status === 'generated' || s.status === 'reviewed').length;
  const reviewedCount = schedule.filter((s) => s.reviewed).length;

  if (loading) return <div className="p-4 sm:p-8"><p style={{ color: '#64748b' }}>Laden...</p></div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Redaktionsplan</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>KI-generierter Zeitplan — Drag&Drop fuer Reihenfolge</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-heading" style={{ color: '#94a3b8' }}>
          <span>{plannedCount} geplant</span>
          <span style={{ color: '#06b6d4' }}>{generatedCount} fertig</span>
          <span style={{ color: '#22c55e' }}>{reviewedCount} gesehen</span>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: msg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>
          {msg}
        </div>
      )}

      {/* Plan generieren */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1e293b', border: '1px solid #334155' }}>
        <h2 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>Neuen Zeitplan erstellen</h2>
        <p className="text-xs mb-4" style={{ color: '#475569' }}>Die KI erstellt einen Redaktionsplan mit Themen und verteilt sie auf Werktage.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label style={labelStyle} className="block">Wochen</label>
            <select style={inputStyle} value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value))}>
              <option value={2}>2 Wochen</option>
              <option value={3}>3 Wochen</option>
              <option value={4}>4 Wochen</option>
              <option value={6}>6 Wochen</option>
              <option value={8}>8 Wochen</option>
            </select>
          </div>
          <div>
            <label style={labelStyle} className="block">Beitraege / Woche</label>
            <select style={inputStyle} value={postsPerWeek} onChange={(e) => setPostsPerWeek(parseInt(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} pro Woche</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-end">
            <button
              onClick={generatePlan}
              disabled={generating}
              className="w-full px-4 py-2.5 rounded-lg font-heading font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: '#8b5cf6', color: 'white', opacity: generating ? 0.6 : 1 }}
            >
              {generating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {generating ? 'KI plant...' : `${weeks * postsPerWeek} Themen planen`}
            </button>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: '#475569' }}>
          Bestehende Eintraege bleiben erhalten. Neue werden hinzugefuegt.
        </p>
      </div>

      {/* Zeitplan-Liste */}
      {schedule.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: '#475569' }}>Noch kein Zeitplan vorhanden. Klicke oben auf &quot;Themen planen&quot;.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedule.map((entry, index) => {
            const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
            const isPast = new Date(entry.scheduled_date) < new Date(new Date().toISOString().split('T')[0]);
            const isToday = entry.scheduled_date === new Date().toISOString().split('T')[0];

            return (
              <div
                key={entry.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="rounded-xl p-4 transition-colors cursor-grab active:cursor-grabbing"
                style={{
                  background: isToday ? '#06b6d408' : '#1e293b',
                  border: `1px solid ${isToday ? '#06b6d430' : '#334155'}`,
                  opacity: entry.status === 'skipped' ? 0.5 : 1,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Drag Handle + Reviewed Checkbox */}
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="#475569" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                    <button
                      onClick={() => toggleReviewed(entry)}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                      style={entry.reviewed
                        ? { background: '#22c55e', color: 'white' }
                        : { background: '#0f172a', border: '1.5px solid #475569' }}
                      title={entry.reviewed ? 'Als ungesehen markieren' : 'Als gesehen markieren'}
                    >
                      {entry.reviewed && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Inhalt */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{entry.topic}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      {entry.blog_categories && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: entry.blog_categories.color + '20', color: entry.blog_categories.color }}>{entry.blog_categories.name}</span>
                      )}
                      {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>HEUTE</span>}
                      {isPast && !isToday && entry.status === 'planned' && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#ef444420', color: '#ef4444' }}>UEBERFAELLIG</span>}
                    </div>

                    {/* Artikel-Link wenn generiert */}
                    {entry.blog_posts && (
                      <Link href={`/admin/blog/artikel/${entry.blog_posts.id}`} className="text-xs hover:underline block mb-1" style={{ color: '#06b6d4' }}>
                        → {entry.blog_posts.title}
                      </Link>
                    )}

                    {/* Datum + Zeit */}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="date"
                        value={entry.scheduled_date}
                        onChange={(e) => updateDate(entry.id, e.target.value)}
                        className="px-2 py-1 rounded text-xs font-body"
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
                      />
                      <input
                        type="time"
                        value={entry.scheduled_time}
                        onChange={(e) => updateTime(entry.id, e.target.value)}
                        className="px-2 py-1 rounded text-xs font-body"
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
                      />
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="px-2 py-1 rounded text-[11px] font-heading font-semibold ml-auto"
                        style={{ background: '#ef444420', color: '#ef4444' }}
                      >
                        Loeschen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
