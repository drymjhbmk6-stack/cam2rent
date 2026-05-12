'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};

interface PlanEntry {
  id: string; topic: string; angle?: string | null; prompt?: string | null;
  keywords: string[]; category?: string | null; platforms: string[]; with_image: boolean;
  scheduled_date: string; scheduled_time: string; sort_order: number;
  status: 'planned' | 'generating' | 'generated' | 'reviewed' | 'published' | 'skipped' | 'failed';
  reviewed: boolean; post_id?: string | null;
  post?: { id: string; caption: string; status: string } | null;
  series?: { id: string; title: string } | null;
  series_part?: { id: string; part_number: number; topic: string } | null;
  error_message?: string | null;
}

interface Topic {
  id: string; topic: string; angle?: string | null; keywords: string[];
  category?: string | null; platforms: string[]; with_image: boolean; used: boolean;
}

interface Series {
  id: string; title: string;
  parts: Array<{ id: string; part_number: number; topic: string; angle?: string | null; keywords: string[]; used: boolean }>;
}

interface JobStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  total: number; completed: number; failed: number;
  message?: string; error?: string;
  recent?: Array<{ ok: boolean; topic: string; error?: string }>;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  planned:   { label: 'Geplant',      color: '#94a3b8', bg: '#94a3b820' },
  generating:{ label: 'Generiert...', color: '#f59e0b', bg: '#f59e0b20' },
  generated: { label: 'Fertig',       color: '#8b5cf6', bg: '#8b5cf620' },
  reviewed:  { label: 'Gesehen',      color: '#22c55e', bg: '#22c55e20' },
  published: { label: 'Live',         color: '#22c55e', bg: '#22c55e20' },
  skipped:   { label: 'Übersprungen', color: '#64748b', bg: '#64748b20' },
  failed:    { label: 'Fehler',       color: '#ef4444', bg: '#ef444420' },
};

function chipColor(status: string): string {
  const m: Record<string, string> = {
    planned: '#475569', generating: '#f59e0b', generated: '#8b5cf6',
    reviewed: '#22c55e', published: '#22c55e', skipped: '#334155', failed: '#ef4444',
  };
  return m[status] ?? '#475569';
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SocialZeitplanPage() {
  const [tab, setTab] = useState<'einzelthemen' | 'serien'>('einzelthemen');
  const [schedule, setSchedule] = useState<PlanEntry[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [postsPerWeek, setPostsPerWeek] = useState(2);
  const [showImport, setShowImport] = useState(false);
  const [importDate, setImportDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<PlanEntry | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragCalEntry = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [planRes, topRes, serRes] = await Promise.all([
      fetch('/api/admin/social/editorial-plan'),
      fetch('/api/admin/social/topics'),
      fetch('/api/admin/social/series'),
    ]);
    const planData = await planRes.json();
    const topData = await topRes.json();
    const serData = await serRes.json();
    setSchedule(planData.plan ?? []);
    setTopics((topData.topics ?? []).filter((t: Topic) => !t.used));
    setSeriesList(serData.series ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (editEntry) {
      const fresh = schedule.find(s => s.id === editEntry.id);
      if (fresh) setEditEntry(fresh);
    }
  }, [schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll job status while generating
  useEffect(() => {
    if (!generating) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/social/generate-plan');
        const data = await res.json();
        if (data) {
          setJobStatus(data);
          if (data.status === 'completed') {
            clearInterval(pollRef.current!); pollRef.current = null;
            setGenerating(false);
            flash(`${data.completed ?? ''} Posts geplant!`);
            loadAll();
          } else if (data.status === 'error' || data.status === 'cancelled') {
            clearInterval(pollRef.current!); pollRef.current = null;
            setGenerating(false);
            flash(data.status === 'cancelled' ? 'Abgebrochen.' : `Fehler: ${data.error || '...'}`);
          }
        }
      } catch { /* weiter pollen */ }
    }, 2000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [generating, loadAll]);

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 4000); }

  async function generatePlan() {
    setGenerating(true);
    setJobStatus(null);
    const res = await fetch('/api/admin/social/generate-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: weeks * 7, posts_per_week: postsPerWeek }),
    });
    const data = await res.json();
    if (!res.ok) { setGenerating(false); flash(data.error || 'Fehler beim Starten'); return; }
    setJobStatus(data);
  }

  async function cancelGenerate() {
    await fetch('/api/admin/social/generate-plan', { method: 'DELETE' });
    setGenerating(false);
    setJobStatus(null);
    flash('Abgebrochen.');
  }

  async function importTopic(topic: Topic) {
    const res = await fetch('/api/admin/social/editorial-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic.topic, angle: topic.angle, keywords: topic.keywords,
        platforms: topic.platforms?.length ? topic.platforms : ['instagram', 'facebook'],
        with_image: topic.with_image ?? true, scheduled_date: importDate,
      }),
    });
    if (res.ok) {
      await fetch(`/api/admin/social/topics/${topic.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ used: true }) });
      flash(`"${topic.topic.slice(0, 40)}..." in Zeitplan eingefügt!`);
      loadAll();
    }
  }

  async function importSeriesPart(series: Series, part: { id: string; part_number: number; topic: string; angle?: string | null; keywords?: string[] }) {
    const res = await fetch('/api/admin/social/editorial-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: `${series.title} — Teil ${part.part_number}: ${part.topic}`,
        angle: part.angle || null, keywords: part.keywords ?? [],
        platforms: ['instagram', 'facebook'], with_image: true,
        scheduled_date: importDate,
      }),
    });
    if (res.ok) { flash(`Serie "${series.title}" Teil ${part.part_number} eingefügt!`); loadAll(); }
  }

  async function toggleReviewed(entry: PlanEntry) {
    const newReviewed = !entry.reviewed;
    await fetch(`/api/admin/social/editorial-plan/${entry.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: newReviewed, status: newReviewed ? 'reviewed' : entry.post_id ? 'generated' : 'planned' }),
    });
    loadAll();
  }

  async function updateField(id: string, field: string, value: unknown) {
    await fetch(`/api/admin/social/editorial-plan/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    loadAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await fetch(`/api/admin/social/editorial-plan/${id}`, { method: 'DELETE' });
    setEditEntry(null);
    loadAll();
  }

  function handleCalDragStart(entryId: string) { dragCalEntry.current = entryId; }

  function handleDropOnDay(dateStr: string) {
    const id = dragCalEntry.current;
    dragCalEntry.current = null;
    setDragOver(null);
    if (!id) return;
    const entry = schedule.find(e => e.id === id);
    if (!entry || entry.scheduled_date === dateStr) return;
    updateField(id, 'scheduled_date', dateStr);
  }

  const plannedCount = schedule.filter(s => s.status === 'planned').length;
  const generatedCount = schedule.filter(s => s.status === 'generated' || s.status === 'reviewed').length;
  const publishedCount = schedule.filter(s => s.status === 'published').length;

  if (loading) return <div className="p-4 sm:p-8"><p style={{ color: '#64748b' }}>Laden...</p></div>;

  function renderCalendar() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    const byDate: Record<string, PlanEntry[]> = {};
    for (const e of schedule) {
      if (!byDate[e.scheduled_date]) byDate[e.scheduled_date] = [];
      byDate[e.scheduled_date].push(e);
    }
    for (const d of Object.keys(byDate)) {
      byDate[d].sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
    }

    const months: React.ReactElement[] = [];

    for (let m = 0; m < 7; m++) {
      const baseDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const monthName = baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() + 6) % 7;
      const calStart = new Date(firstDay);
      calStart.setDate(calStart.getDate() - startOffset);

      const lastDay = new Date(year, month + 1, 0);
      const endOffset = (7 - lastDay.getDay()) % 7;
      const calEnd = new Date(lastDay);
      calEnd.setDate(calEnd.getDate() + (endOffset === 0 ? 0 : endOffset));

      const weekRows: { kw: number; days: Date[] }[] = [];
      const cur = new Date(calStart);
      while (cur <= calEnd) {
        const kw = getISOWeek(cur);
        const days: Date[] = [];
        for (let d = 0; d < 7; d++) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
        weekRows.push({ kw, days });
      }

      months.push(
        <div key={`${year}-${month}`} className="mb-8">
          <h3 className="font-heading font-bold text-sm mb-3" style={{ color: '#e2e8f0' }}>{monthName}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 44 }} />
                {[0,1,2,3,4,5,6].map(i => <col key={i} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ color: '#475569', fontSize: 10, fontWeight: 600, textAlign: 'center', paddingBottom: 4 }}>KW</th>
                  {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => (
                    <th key={d} style={{ color: '#475569', fontSize: 10, fontWeight: 600, textAlign: 'center', paddingBottom: 4 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekRows.map(({ kw, days }) => (
                  <tr key={kw}>
                    <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 4, paddingBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#334155', fontWeight: 600 }}>{kw}</span>
                    </td>
                    {days.map(day => {
                      const ds = toDateStr(day);
                      const isCurrentMonth = day.getMonth() === month;
                      const isToday = ds === todayStr;
                      const isPast = day < today;
                      const dayEntries = byDate[ds] ?? [];
                      const isDragTarget = dragOver === ds;
                      return (
                        <td
                          key={ds}
                          onDragOver={e => { e.preventDefault(); setDragOver(ds); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleDropOnDay(ds)}
                          style={{
                            verticalAlign: 'top', padding: '4px 3px', height: 180,
                            background: isDragTarget ? '#8b5cf615' : isToday ? '#8b5cf608' : 'transparent',
                            border: isDragTarget ? '1px dashed #8b5cf650' : isToday ? '1px solid #8b5cf630' : '1px solid #1e293b',
                            borderRadius: 4,
                          }}
                        >
                          <div style={{
                            fontSize: 11, fontWeight: isToday ? 700 : 400, textAlign: 'center', marginBottom: 3,
                            color: isToday ? '#8b5cf6' : isCurrentMonth ? (isPast ? '#475569' : '#94a3b8') : '#2d3f54',
                          }}>
                            {day.getDate()}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {dayEntries.map(entry => {
                              const color = chipColor(entry.status);
                              const timeStr = (entry.scheduled_time || '').slice(0, 5);
                              const shortTitle = entry.topic.length > 30 ? entry.topic.slice(0, 28) + '…' : entry.topic;
                              const fbIcon = entry.platforms?.includes('facebook');
                              const igIcon = entry.platforms?.includes('instagram');
                              return (
                                <div
                                  key={entry.id}
                                  draggable
                                  onDragStart={e => { e.stopPropagation(); handleCalDragStart(entry.id); }}
                                  onClick={() => setEditEntry(entry)}
                                  title={entry.topic}
                                  style={{
                                    display: 'flex', flexDirection: 'column', gap: 3, minHeight: 58,
                                    padding: '6px 7px', borderRadius: 4, background: color + '22',
                                    borderLeft: `2px solid ${color}`, cursor: 'pointer', userSelect: 'none', overflow: 'hidden',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                    {timeStr && <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.3, flexShrink: 0 }}>{timeStr}</div>}
                                    <div style={{ display: 'flex', gap: 2, fontSize: 8, lineHeight: 1 }}>
                                      {fbIcon && <span style={{ color: '#3b82f6' }}>FB</span>}
                                      {igIcon && <span style={{ color: '#ec4899' }}>IG</span>}
                                    </div>
                                  </div>
                                  <div style={{
                                    fontSize: 11, lineHeight: 1.4, color: isCurrentMonth ? '#e2e8f0' : '#475569',
                                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                  }}>{shortTitle}</div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    return <div>{months}</div>;
  }

  function renderEditModal() {
    if (!editEntry) return null;
    const entry = editEntry;
    const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
    const postIsPublished = entry.post?.status === 'published';

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px', overflowY: 'auto' }}
        onClick={() => setEditEntry(null)}
      >
        <div
          style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', width: '100%', maxWidth: 560, padding: 24, position: 'relative' }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => setEditEntry(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>

          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
            {postIsPublished && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#22c55e20', color: '#22c55e', fontWeight: 700 }}>Veröffentlicht</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Thema</label>
              <input type="text" defaultValue={entry.topic}
                onBlur={e => { if (e.target.value !== entry.topic) updateField(entry.id, 'topic', e.target.value); }}
                style={{ ...inputStyle }} />
            </div>

            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Blickwinkel / Angle</label>
              <input type="text" defaultValue={entry.angle || ''}
                onBlur={e => updateField(entry.id, 'angle', e.target.value || null)}
                placeholder="z.B. Produktvergleich, Tipps, Behind-the-Scenes…"
                style={{ ...inputStyle }} />
            </div>

            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>KI-Prompt</label>
              <textarea defaultValue={entry.prompt || ''}
                onBlur={e => updateField(entry.id, 'prompt', e.target.value || null)}
                rows={3}
                placeholder="Detaillierter Prompt für die KI-Generierung…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 72, border: '1px solid #f59e0b40' }} />
            </div>

            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Keywords (kommagetrennt)</label>
              <input type="text" defaultValue={(entry.keywords || []).join(', ')}
                onBlur={e => { const kw = e.target.value.split(',').map(k => k.trim()).filter(Boolean); updateField(entry.id, 'keywords', kw); }}
                style={{ ...inputStyle }} />
            </div>

            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Plattformen</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['facebook', 'instagram'].map(p => {
                  const active = (entry.platforms || []).includes(p);
                  return (
                    <button key={p} onClick={() => {
                      const current = entry.platforms || [];
                      const next = active ? current.filter(x => x !== p) : [...current, p];
                      if (next.length === 0) return;
                      updateField(entry.id, 'platforms', next);
                      setEditEntry({ ...entry, platforms: next });
                    }}
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: active ? (p === 'facebook' ? '#3b82f620' : '#ec489920') : '#334155', color: active ? (p === 'facebook' ? '#3b82f6' : '#ec4899') : '#64748b' }}>
                      {p === 'facebook' ? 'Facebook' : 'Instagram'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Datum</label>
                <input type="date" defaultValue={entry.scheduled_date}
                  onBlur={e => { if (e.target.value !== entry.scheduled_date) updateField(entry.id, 'scheduled_date', e.target.value); }}
                  style={{ ...inputStyle }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Uhrzeit</label>
                <input type="time" defaultValue={entry.scheduled_time}
                  onBlur={e => { if (e.target.value !== entry.scheduled_time) updateField(entry.id, 'scheduled_time', e.target.value); }}
                  style={{ ...inputStyle }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => toggleReviewed(entry)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: entry.reviewed ? '#22c55e20' : '#334155', color: entry.reviewed ? '#22c55e' : '#94a3b8', fontSize: 12, fontWeight: 600 }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 4, background: entry.reviewed ? '#22c55e' : 'transparent', border: entry.reviewed ? 'none' : '1.5px solid #475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {entry.reviewed && <svg width="10" height="10" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </span>
                {entry.reviewed ? 'Als gesehen markiert' : 'Als gesehen markieren'}
              </button>
              <button onClick={() => deleteEntry(entry.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#ef444420', color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                Löschen
              </button>
            </div>

            {entry.status === 'planned' && (
              <button
                onClick={async () => {
                  await fetch(`/api/admin/social/editorial-plan/${entry.id}/generate`, { method: 'POST' });
                  flash('Generierung gestartet…');
                  setEditEntry(null);
                  loadAll();
                }}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#8b5cf6', color: 'white', fontSize: 13, fontWeight: 700, textAlign: 'center' }}
              >
                ⚡ Jetzt generieren
              </button>
            )}

            {entry.post && (
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Generierter Post</p>
                  <p style={{ fontSize: 13, color: '#e2e8f0' }}>{entry.post.caption?.slice(0, 60)}…</p>
                </div>
                <Link href={`/admin/social/posts/${entry.post.id}`} style={{ padding: '6px 12px', borderRadius: 8, background: '#8b5cf6', color: 'white', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Bearbeiten
                </Link>
              </div>
            )}

            {entry.error_message && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#ef444415', border: '1px solid #ef444430' }}>
                <p style={{ fontSize: 11, color: '#ef4444' }}>{entry.error_message}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderSerienTab() {
    return (
      <>
        <div className="flex items-center gap-2 mb-4">
          <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Import-Datum:</label>
          <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
        </div>

        {seriesList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: '#475569' }}>Keine Serien vorhanden.</p>
            <Link href="/admin/social/themen" className="text-xs font-heading mt-2 inline-block" style={{ color: '#8b5cf6' }}>Serien unter Themen erstellen</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {seriesList.map(series => {
              const allParts = (series.parts ?? []).sort((a, b) => a.part_number - b.part_number);
              return (
                <div key={series.id} className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #8b5cf630' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{series.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-heading" style={{ background: '#8b5cf620', color: '#8b5cf6' }}>
                      {allParts.filter(p => p.used).length}/{allParts.length}
                    </span>
                  </div>
                  {allParts.length === 0 ? (
                    <p className="text-xs" style={{ color: '#475569' }}>Keine Teile vorhanden.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {allParts.map(part => {
                        const inSchedule = schedule.find(e =>
                          e.topic.includes(series.title) && e.topic.includes(`Teil ${part.part_number}`)
                        );
                        return (
                          <div key={part.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#0f172a', opacity: part.used && !inSchedule ? 0.5 : 1 }}>
                            <span className="text-xs font-body truncate flex-1" style={{ color: '#e2e8f0' }}>
                              <span className="font-heading font-bold mr-1.5" style={{ color: '#8b5cf6' }}>Teil {part.part_number}</span>
                              {part.topic}
                            </span>
                            {inSchedule ? (
                              <span className="text-[10px] font-heading px-2 py-0.5 rounded shrink-0 ml-2" style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640' }}>
                                Geplant: {inSchedule.scheduled_date.split('-').reverse().join('.')}
                              </span>
                            ) : part.used ? (
                              <span className="text-[10px] font-heading px-2 py-0.5 rounded shrink-0 ml-2" style={{ background: '#22c55e20', color: '#22c55e' }}>Generiert</span>
                            ) : (
                              <button onClick={() => importSeriesPart(series, part)} className="px-3 py-1 rounded text-[11px] font-heading font-semibold shrink-0 ml-2" style={{ background: '#8b5cf6', color: 'white' }}>
                                + In Zeitplan
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {schedule.filter(s => s.series_part).length > 0 && (
          <div className="mt-8">
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#8b5cf6' }}>Serien im Zeitplan</h3>
            <div className="space-y-2">
              {schedule.filter(s => s.series_part).map(entry => {
                const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer" style={{ background: '#1e293b', border: '1px solid #334155' }} onClick={() => setEditEntry(entry)}>
                    <span className="text-[10px] px-2 py-0.5 rounded font-heading font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <span className="text-sm font-semibold flex-1 truncate" style={{ color: '#e2e8f0' }}>{entry.topic}</span>
                    <span className="text-xs" style={{ color: '#475569' }}>{entry.scheduled_date.split('-').reverse().join('.')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <AdminBackLink href="/admin/social" label="Zurück zu Social" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Social Redaktionsplan</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Klick auf Eintrag zum Bearbeiten · Drag &amp; Drop auf anderen Tag zum Verschieben</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-heading" style={{ color: '#94a3b8' }}>
          <span>{plannedCount} geplant</span>
          <span style={{ color: '#8b5cf6' }}>{generatedCount} fertig</span>
          <span style={{ color: '#22c55e' }}>{publishedCount} live</span>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: msg.startsWith('Fehler') ? '#ef4444' : '#22c55e' }}>{msg}</div>}

      {/* Job-Status-Banner */}
      {generating && jobStatus && (
        <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: '#1e293b', border: '1px solid #8b5cf640' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: '#8b5cf630', borderTopColor: '#8b5cf6' }} />
              <span className="text-sm font-heading font-semibold" style={{ color: '#8b5cf6' }}>
                {jobStatus.message || `${jobStatus.completed ?? 0}/${jobStatus.total ?? '?'} Posts geplant…`}
              </span>
            </div>
            <button onClick={cancelGenerate} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#ef444420', color: '#ef4444' }}>Abbrechen</button>
          </div>
          {(jobStatus.total ?? 0) > 0 && (
            <div style={{ background: '#0f172a', borderRadius: 4, height: 6 }}>
              <div style={{ background: '#8b5cf6', height: 6, borderRadius: 4, width: `${Math.round(((jobStatus.completed ?? 0) / jobStatus.total) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        <button onClick={() => setTab('einzelthemen')} className="px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold" style={tab === 'einzelthemen' ? { background: '#8b5cf6', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}>
          Einzelthemen
        </button>
        <button onClick={() => setTab('serien')} className="px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold" style={tab === 'serien' ? { background: '#8b5cf6', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}>
          Serien
        </button>
      </div>

      {tab === 'einzelthemen' && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={generatePlan} disabled={generating} className="px-4 py-2 rounded-lg text-xs font-heading font-semibold flex items-center gap-2" style={{ background: '#8b5cf6', color: 'white', opacity: generating ? 0.6 : 1 }}>
              {generating && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {generating ? 'KI plant...' : `⚡ ${weeks * postsPerWeek} KI-Posts planen`}
            </button>
            <select style={{ ...inputStyle, width: 'auto' }} value={weeks} onChange={e => setWeeks(parseInt(e.target.value))}>
              <option value={2}>2 Wo.</option><option value={3}>3 Wo.</option><option value={4}>4 Wo.</option><option value={6}>6 Wo.</option><option value={8}>8 Wo.</option>
            </select>
            <select style={{ ...inputStyle, width: 'auto' }} value={postsPerWeek} onChange={e => setPostsPerWeek(parseInt(e.target.value))}>
              {[1,2,3,4,5,7].map(n => <option key={n} value={n}>{n}/Wo.</option>)}
            </select>
            <button onClick={() => setShowImport(!showImport)} className="px-4 py-2 rounded-lg text-xs font-heading font-semibold" style={{ background: showImport ? '#8b5cf6' : '#334155', color: showImport ? 'white' : '#e2e8f0' }}>
              {showImport ? 'Themen schließen' : `Themen anzeigen (${topics.length})`}
            </button>
          </div>

          {showImport && (
            <div className="rounded-xl p-4 mb-6" style={{ background: '#1e293b', border: '1px solid #8b5cf630' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm" style={{ color: '#8b5cf6' }}>Einzelthemen → in Zeitplan einfügen</h3>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Datum:</label>
                  <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                </div>
              </div>
              {topics.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Keine offenen Einzelthemen. <Link href="/admin/social/themen" style={{ color: '#8b5cf6' }}>Unter Themen erstellen</Link>.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {topics.map(t => {
                    const isOpen = expandedId === `topic-${t.id}`;
                    return (
                      <div key={t.id} className="rounded-lg overflow-hidden" style={{ background: '#0f172a', border: isOpen ? '1px solid #8b5cf640' : '1px solid #334155' }}>
                        <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : `topic-${t.id}`)}>
                          <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>Entwurf</span>
                          <span className="text-sm font-semibold truncate flex-1" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                          <svg className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ color: '#475569', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {isOpen && (
                          <div className="px-3 pb-3" style={{ borderTop: '1px solid #334155' }}>
                            {t.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-3">
                                {t.keywords.map((kw, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#1e293b', color: '#94a3b8' }}>{kw}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex justify-end mt-3">
                              <button onClick={() => importTopic(t)} className="px-4 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#8b5cf6', color: 'white' }}>
                                + In Zeitplan einfügen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {schedule.length === 0 ? (
            <div className="text-center py-16 rounded-xl" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <p className="text-sm" style={{ color: '#475569' }}>Noch keine Einträge im Zeitplan.</p>
              <p className="text-xs mt-1" style={{ color: '#334155' }}>Themen importieren oder per KI planen.</p>
            </div>
          ) : (
            renderCalendar()
          )}
        </>
      )}

      {tab === 'serien' && renderSerienTab()}

      {renderEditModal()}
    </div>
  );
}
