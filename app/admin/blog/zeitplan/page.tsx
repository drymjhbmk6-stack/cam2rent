'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};

interface ScheduleEntry {
  id: string; topic: string; prompt: string | null; keywords: string[]; category_id: string | null;
  tone: string; target_length: string; scheduled_date: string; scheduled_time: string;
  sort_order: number; status: string; reviewed: boolean; post_id: string | null;
  generated_at: string | null;
  blog_categories?: { id: string; name: string; color: string } | null;
  blog_posts?: { id: string; title: string; slug: string; status: string } | null;
}

interface AutoTopic { id: string; topic: string; keywords: string[]; used: boolean; category_id: string | null; tone: string; target_length: string; }
interface Series { id: string; title: string; description: string; total_parts: number; generated_parts: number; status: string; blog_series_parts?: { id: string; part_number: number; topic: string; used: boolean }[]; }

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: 'Geplant', color: '#94a3b8', bg: '#94a3b820' },
  generating: { label: 'Generiert...', color: '#f59e0b', bg: '#f59e0b20' },
  generated: { label: 'Fertig', color: '#06b6d4', bg: '#06b6d420' },
  reviewed: { label: 'Gesehen', color: '#22c55e', bg: '#22c55e20' },
  published: { label: 'Live', color: '#22c55e', bg: '#22c55e20' },
  skipped: { label: 'Übersprungen', color: '#64748b', bg: '#64748b20' },
};

// Farbe für Statuschip im Kalender (kompakter)
function chipColor(status: string): string {
  const m: Record<string, string> = {
    planned: '#475569',
    generating: '#f59e0b',
    generated: '#06b6d4',
    reviewed: '#22c55e',
    published: '#22c55e',
    skipped: '#334155',
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

export default function BlogZeitplanPage() {
  const [tab, setTab] = useState<'einzelthemen' | 'serien'>('einzelthemen');
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [topics, setTopics] = useState<AutoTopic[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [postsPerWeek, setPostsPerWeek] = useState(2);
  const [showImport, setShowImport] = useState(false);
  const [importDate, setImportDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<ScheduleEntry | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragCalEntry = useRef<string | null>(null);

  // Legacy list drag refs (Serien-Tab)
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [schedRes, topRes, serRes] = await Promise.all([
      fetch('/api/admin/blog/schedule'),
      fetch('/api/admin/blog/auto-topics'),
      fetch('/api/admin/blog/series'),
    ]);
    const schedData = await schedRes.json();
    const topData = await topRes.json();
    const serData = await serRes.json();
    setSchedule(schedData.schedule ?? []);
    setTopics((topData.topics ?? []).filter((t: AutoTopic) => !t.used));
    setSeriesList(serData.series ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Keep editEntry in sync after refresh
  useEffect(() => {
    if (editEntry) {
      const fresh = schedule.find(s => s.id === editEntry.id);
      if (fresh) setEditEntry(fresh);
    }
  }, [schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 4000); }

  async function generatePlan() {
    setGenerating(true);
    const res = await fetch('/api/admin/blog/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_plan', weeks, postsPerWeek }),
    });
    const data = await res.json();
    if (!res.ok) { setGenerating(false); flash(data.error || 'Fehler'); return; }

    const poll = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/admin/settings?key=blog_plan_status');
        const statusData = await statusRes.json();
        if (statusData.value) {
          const parsed = typeof statusData.value === 'string' ? JSON.parse(statusData.value) : statusData.value;
          if (parsed.status === 'done') {
            clearInterval(poll);
            setGenerating(false);
            flash(`${parsed.created} Themen erstellt!`);
            loadAll();
          } else if (parsed.status === 'error') {
            clearInterval(poll);
            setGenerating(false);
            flash(`Fehler: ${parsed.error || 'Unbekannter Fehler bei der Planung'}`);
          }
        }
      } catch { /* weiter pollen */ }
    }, 2000);

    setTimeout(() => { clearInterval(poll); setGenerating(false); loadAll(); }, 120000);
  }

  async function importTopic(topic: AutoTopic) {
    const res = await fetch('/api/admin/blog/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic.topic, keywords: topic.keywords, category_id: topic.category_id,
        tone: topic.tone, target_length: topic.target_length, scheduled_date: importDate,
      }),
    });
    if (res.ok) {
      await fetch(`/api/admin/blog/auto-topics?id=${topic.id}`, { method: 'DELETE' });
      flash(`"${topic.topic.slice(0, 40)}..." in Zeitplan eingefügt!`);
      loadAll();
    }
  }

  async function importSeriesPart(series: Series, part: { id: string; part_number: number; topic: string }) {
    const res = await fetch('/api/admin/blog/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: `${series.title} — Teil ${part.part_number}: ${part.topic}`,
        keywords: [], category_id: null,
        tone: 'informativ', target_length: 'mittel', scheduled_date: importDate,
      }),
    });
    if (res.ok) { flash(`Serie "${series.title}" Teil ${part.part_number} eingefügt!`); loadAll(); }
  }

  async function toggleReviewed(entry: ScheduleEntry) {
    const newReviewed = !entry.reviewed;
    await fetch('/api/admin/blog/schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, reviewed: newReviewed, status: newReviewed ? 'reviewed' : entry.post_id ? 'generated' : 'planned' }),
    });
    loadAll();
  }

  async function updateField(id: string, field: string, value: unknown) {
    await fetch('/api/admin/blog/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, [field]: value }) });
    loadAll();
  }

  async function updateDate(id: string, date: string) {
    await updateField(id, 'scheduled_date', date);
  }

  async function updateTime(id: string, time: string) {
    await updateField(id, 'scheduled_time', time);
  }

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await fetch(`/api/admin/blog/schedule?id=${id}`, { method: 'DELETE' });
    setEditEntry(null);
    loadAll();
  }

  // ── Kalender Drag & Drop ──────────────────────────────────────────────────
  function handleCalDragStart(entryId: string) {
    dragCalEntry.current = entryId;
  }

  function handleDropOnDay(dateStr: string) {
    const id = dragCalEntry.current;
    dragCalEntry.current = null;
    setDragOver(null);
    if (!id) return;
    const entry = schedule.find(e => e.id === id);
    if (!entry || entry.scheduled_date === dateStr) return;
    updateDate(id, dateStr);
  }

  // ── Serien-Tab list drag ─────────────────────────────────────────────────
  function handleDragStart(i: number) { dragItem.current = i; }
  function handleDragEnter(i: number) { dragOverItem.current = i; }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...schedule];
    const dragged = items.splice(dragItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, dragged);
    const updated = items.map((item, i) => ({ ...item, sort_order: i }));
    setSchedule(updated);
    for (const item of updated) {
      await fetch('/api/admin/blog/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, sort_order: item.sort_order }) });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  }

  const plannedCount = schedule.filter((s) => s.status === 'planned').length;
  const generatedCount = schedule.filter((s) => s.status === 'generated' || s.status === 'reviewed').length;
  const reviewedCount = schedule.filter((s) => s.reviewed).length;

  if (loading) return <div className="p-4 sm:p-8"><p style={{ color: '#64748b' }}>Laden...</p></div>;

  // ── Kalender rendern ──────────────────────────────────────────────────────
  function renderCalendar() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    // Eintraege nach Datum gruppieren
    const byDate: Record<string, ScheduleEntry[]> = {};
    for (const e of schedule) {
      if (!byDate[e.scheduled_date]) byDate[e.scheduled_date] = [];
      byDate[e.scheduled_date].push(e);
    }
    // Innerhalb jedes Tages nach Zeit sortieren
    for (const d of Object.keys(byDate)) {
      byDate[d].sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
    }

    const months: React.ReactElement[] = [];

    for (let m = 0; m < 7; m++) {
      const baseDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();

      const monthName = baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

      // Erster Montag der Kalenderanzeige (kann im Vormonat liegen)
      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() + 6) % 7; // 0=Mo
      const calStart = new Date(firstDay);
      calStart.setDate(calStart.getDate() - startOffset);

      // Letzter Sonntag der Kalenderanzeige
      const lastDay = new Date(year, month + 1, 0);
      const endOffset = (7 - lastDay.getDay()) % 7;
      const calEnd = new Date(lastDay);
      calEnd.setDate(calEnd.getDate() + (endOffset === 0 ? 0 : endOffset));

      // Wochen aufbauen
      const weeks: { kw: number; days: Date[] }[] = [];
      const cur = new Date(calStart);
      while (cur <= calEnd) {
        const kw = getISOWeek(cur);
        const days: Date[] = [];
        for (let d = 0; d < 7; d++) {
          days.push(new Date(cur));
          cur.setDate(cur.getDate() + 1);
        }
        weeks.push({ kw, days });
      }

      months.push(
        <div key={`${year}-${month}`} className="mb-8">
          {/* Monats-Header */}
          <h3 className="font-heading font-bold text-sm mb-3" style={{ color: '#e2e8f0' }}>{monthName}</h3>

          {/* Tabelle */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 44 }} />
                {[0,1,2,3,4,5,6].map(i => <col key={i} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ color: '#475569', fontSize: 10, fontWeight: 600, textAlign: 'center', paddingBottom: 4 }}>KW</th>
                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                    <th key={d} style={{ color: '#475569', fontSize: 10, fontWeight: 600, textAlign: 'center', paddingBottom: 4 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map(({ kw, days }) => (
                  <tr key={kw}>
                    {/* KW-Spalte */}
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
                            verticalAlign: 'top',
                            padding: '4px 3px',
                            height: 270,
                            background: isDragTarget ? '#06b6d415' : isToday ? '#06b6d408' : 'transparent',
                            border: isDragTarget ? '1px dashed #06b6d450' : isToday ? '1px solid #06b6d430' : '1px solid #1e293b',
                            borderRadius: 4,
                          }}
                        >
                          {/* Tagzahl */}
                          <div style={{
                            fontSize: 11,
                            fontWeight: isToday ? 700 : 400,
                            textAlign: 'center',
                            marginBottom: 3,
                            color: isToday ? '#06b6d4' : isCurrentMonth ? (isPast ? '#475569' : '#94a3b8') : '#2d3f54',
                          }}>
                            {day.getDate()}
                          </div>
                          {/* Eintrags-Chips */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {dayEntries.map(entry => {
                              const color = chipColor(entry.status);
                              const timeStr = (entry.scheduled_time || '').slice(0, 5);
                              const shortTitle = entry.topic.length > 30 ? entry.topic.slice(0, 28) + '…' : entry.topic;
                              return (
                                <div
                                  key={entry.id}
                                  draggable
                                  onDragStart={e => { e.stopPropagation(); handleCalDragStart(entry.id); }}
                                  onClick={() => setEditEntry(entry)}
                                  title={entry.topic}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3,
                                    minHeight: 58,
                                    padding: '6px 7px',
                                    borderRadius: 4,
                                    background: color + '22',
                                    borderLeft: `2px solid ${color}`,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {timeStr && (
                                    <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.3 }}>{timeStr}</div>
                                  )}
                                  <div style={{
                                    fontSize: 11,
                                    lineHeight: 1.4,
                                    color: isCurrentMonth ? '#e2e8f0' : '#475569',
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
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

  // ── Edit-Modal (festes Overlay) ───────────────────────────────────────────
  function renderEditModal() {
    if (!editEntry) return null;
    const entry = editEntry;
    const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
    const postIsPublished = entry.blog_posts?.status === 'published';

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px', overflowY: 'auto' }}
        onClick={() => setEditEntry(null)}
      >
        <div
          style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', width: '100%', maxWidth: 560, padding: 24, position: 'relative' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button onClick={() => setEditEntry(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>

          <div className="flex items-center gap-2 mb-4">
            <span style={{ ...st, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
            {postIsPublished && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#22c55e20', color: '#22c55e', fontWeight: 700 }}>Veröffentlicht</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Titel */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Titel / Thema</label>
              <input type="text" defaultValue={entry.topic}
                onBlur={e => { if (e.target.value !== entry.topic) updateField(entry.id, 'topic', e.target.value); }}
                style={{ ...inputStyle }} />
            </div>

            {/* Prompt */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ausführlicher KI-Prompt</label>
              <textarea defaultValue={entry.prompt || ''}
                onBlur={e => updateField(entry.id, 'prompt', e.target.value || null)}
                rows={4}
                placeholder="Je detaillierter, desto besser der Artikel…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80, border: '1px solid #f59e0b40' }} />
            </div>

            {/* Keywords */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Keywords (kommagetrennt)</label>
              <input type="text" defaultValue={(entry.keywords || []).join(', ')}
                onBlur={e => { const kw = e.target.value.split(',').map(k => k.trim()).filter(Boolean); updateField(entry.id, 'keywords', kw); }}
                style={{ ...inputStyle }} />
            </div>

            {/* Ton + Länge */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ton</label>
                <select defaultValue={entry.tone || 'informativ'} onChange={e => updateField(entry.id, 'tone', e.target.value)} style={{ ...inputStyle }}>
                  <option value="informativ">Informativ</option>
                  <option value="locker">Locker</option>
                  <option value="professionell">Professionell</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ziel-Länge</label>
                <select defaultValue={entry.target_length || 'mittel'} onChange={e => updateField(entry.id, 'target_length', e.target.value)} style={{ ...inputStyle }}>
                  <option value="kurz">Kurz (~500)</option>
                  <option value="mittel">Mittel (~1000)</option>
                  <option value="lang">Lang (~1500)</option>
                </select>
              </div>
            </div>

            {/* Datum + Uhrzeit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Datum</label>
                <input type="date" defaultValue={entry.scheduled_date}
                  onBlur={e => { if (e.target.value !== entry.scheduled_date) updateDate(entry.id, e.target.value); }}
                  style={{ ...inputStyle }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Uhrzeit</label>
                <input type="time" defaultValue={entry.scheduled_time}
                  onBlur={e => { if (e.target.value !== entry.scheduled_time) updateTime(entry.id, e.target.value); }}
                  style={{ ...inputStyle }} />
              </div>
            </div>

            {/* Gesehen-Toggle */}
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

            {/* Verlinkter Artikel */}
            {entry.blog_posts && (
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', marginBottom: 2 }}>Generierter Artikel</p>
                  <p style={{ fontSize: 13, color: '#e2e8f0' }}>{entry.blog_posts.title}</p>
                </div>
                <Link href={`/admin/blog/artikel/${entry.blog_posts.id}`} style={{ padding: '6px 12px', borderRadius: 8, background: '#06b6d4', color: 'white', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Bearbeiten
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Serien-Tab: Listenansicht ─────────────────────────────────────────────
  function renderScheduleList(seriesOnly?: boolean) {
    const filtered = seriesOnly ? schedule.filter((s) => s.topic.includes('Teil')) : schedule;
    if (filtered.length === 0) {
      return <div className="text-center py-12"><p className="text-sm" style={{ color: '#475569' }}>Noch keine Einträge.</p></div>;
    }

    return (
      <div className="space-y-2">
        {filtered.map((entry, index) => {
          const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
          const todayStr = new Date().toISOString().split('T')[0];
          const isPast = entry.scheduled_date < todayStr;
          const isToday = entry.scheduled_date === todayStr;
          const isExpanded = expandedId === entry.id;
          const postIsPublished = entry.blog_posts?.status === 'published';

          return (
            <div key={entry.id} draggable onDragStart={() => handleDragStart(index)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
              className="rounded-xl transition-colors"
              style={{ background: isToday ? '#06b6d408' : '#1e293b', border: `1px solid ${isToday ? '#06b6d430' : isExpanded ? '#06b6d450' : '#334155'}`, opacity: entry.status === 'skipped' ? 0.5 : 1 }}>

              <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <svg className="w-4 h-4 cursor-grab active:cursor-grabbing" fill="none" stroke="#475569" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                    <button onClick={(e) => { e.stopPropagation(); toggleReviewed(entry); }} className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                      style={entry.reviewed ? { background: '#22c55e', color: 'white' } : { background: '#0f172a', border: '1.5px solid #475569' }}
                      title={entry.reviewed ? 'Als ungesehen markieren' : 'Als gesehen markieren'}>
                      {entry.reviewed && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-heading font-semibold text-sm block" style={{ color: '#e2e8f0' }}>{entry.topic}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      {postIsPublished && <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: '#22c55e20', color: '#22c55e' }}>Veröffentlicht</span>}
                      {entry.blog_categories && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: entry.blog_categories.color + '20', color: entry.blog_categories.color }}>{entry.blog_categories.name}</span>}
                      {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>HEUTE</span>}
                      {isPast && !isToday && entry.status === 'planned' && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#ef444420', color: '#ef4444' }}>ÜBERFÄLLIG</span>}
                    </div>
                  </div>
                  <svg className="w-4 h-4 shrink-0 mt-1 transition-transform" style={{ color: '#475569', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid #334155' }} onClick={(e) => e.stopPropagation()}>
                  <div className="grid grid-cols-2 gap-3 pt-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Titel / Thema</label>
                      <input type="text" defaultValue={entry.topic}
                        onBlur={(e) => { if (e.target.value !== entry.topic) updateField(entry.id, 'topic', e.target.value); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#f59e0b' }}>Ausführlicher KI-Prompt</label>
                      <textarea defaultValue={entry.prompt || ''}
                        onBlur={(e) => updateField(entry.id, 'prompt', e.target.value || null)}
                        rows={4} className="w-full px-3 py-2 rounded-lg text-sm resize-y" style={{ background: '#0f172a', border: '1px solid #f59e0b40', color: '#e2e8f0', minHeight: 80 }} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Keywords (kommagetrennt)</label>
                      <input type="text" defaultValue={(entry.keywords || []).join(', ')}
                        onBlur={(e) => { const kw = e.target.value.split(',').map((k) => k.trim()).filter(Boolean); updateField(entry.id, 'keywords', kw); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Ton</label>
                      <select defaultValue={entry.tone || 'informativ'} onChange={(e) => updateField(entry.id, 'tone', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}>
                        <option value="informativ">Informativ</option>
                        <option value="locker">Locker</option>
                        <option value="professionell">Professionell</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Ziel-Länge</label>
                      <select defaultValue={entry.target_length || 'mittel'} onChange={(e) => updateField(entry.id, 'target_length', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}>
                        <option value="kurz">Kurz (~500)</option>
                        <option value="mittel">Mittel (~1000)</option>
                        <option value="lang">Lang (~1500)</option>
                      </select>
                    </div>
                    <div className="col-span-2 rounded-lg p-3" style={{ background: '#0f172a' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Status:</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        </div>
                        {entry.generated_at && <span className="text-[10px]" style={{ color: '#475569' }}>Generiert: {new Date(entry.generated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                    </div>
                  </div>
                  {entry.blog_posts && (
                    <div className="mt-3 rounded-lg p-3 flex items-center justify-between" style={{ background: '#06b6d410', border: '1px solid #06b6d430' }}>
                      <div>
                        <p className="text-[10px] font-semibold uppercase" style={{ color: '#06b6d4' }}>Generierter Artikel</p>
                        <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{entry.blog_posts.title}</p>
                      </div>
                      <Link href={`/admin/blog/artikel/${entry.blog_posts.id}`} className="px-3 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
                        Bearbeiten
                      </Link>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #334155' }}>
                    <input type="date" value={entry.scheduled_date} onChange={(e) => updateDate(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <input type="time" value={entry.scheduled_time} onChange={(e) => updateTime(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="px-2 py-1 rounded text-[11px] font-heading font-semibold ml-auto" style={{ background: '#ef444420', color: '#ef4444' }}>Löschen</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <AdminBackLink href="/admin/blog" label="Zurück zum Blog" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Redaktionsplan</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Klick auf Eintrag zum Bearbeiten · Drag &amp; Drop auf anderen Tag zum Verschieben</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-heading" style={{ color: '#94a3b8' }}>
          <span>{plannedCount} geplant</span>
          <span style={{ color: '#06b6d4' }}>{generatedCount} fertig</span>
          <span style={{ color: '#22c55e' }}>{reviewedCount} gesehen</span>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: (msg.startsWith('Fehler') || msg.includes('Error')) ? '#ef4444' : '#22c55e' }}>{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        <button onClick={() => setTab('einzelthemen')} className="px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold" style={tab === 'einzelthemen' ? { background: '#06b6d4', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}>
          Einzelthemen
        </button>
        <button onClick={() => setTab('serien')} className="px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold" style={tab === 'serien' ? { background: '#8b5cf6', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}>
          Serien
        </button>
      </div>

      {/* ═══ TAB: EINZELTHEMEN ═══ */}
      {tab === 'einzelthemen' && (
        <>
          {/* Aktionen */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={generatePlan} disabled={generating} className="px-4 py-2 rounded-lg text-xs font-heading font-semibold flex items-center gap-2" style={{ background: '#8b5cf6', color: 'white', opacity: generating ? 0.6 : 1 }}>
              {generating && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {generating ? 'KI plant...' : `${weeks * postsPerWeek} KI-Themen planen`}
            </button>
            <select style={{ ...inputStyle, width: 'auto' }} value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value))}>
              <option value={2}>2 Wo.</option><option value={3}>3 Wo.</option><option value={4}>4 Wo.</option><option value={6}>6 Wo.</option><option value={8}>8 Wo.</option>
            </select>
            <select style={{ ...inputStyle, width: 'auto' }} value={postsPerWeek} onChange={(e) => setPostsPerWeek(parseInt(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/Wo.</option>)}
            </select>
            <button onClick={() => setShowImport(!showImport)} className="px-4 py-2 rounded-lg text-xs font-heading font-semibold" style={{ background: showImport ? '#06b6d4' : '#334155', color: showImport ? 'white' : '#e2e8f0' }}>
              {showImport ? 'Themen schließen' : `Themen anzeigen (${topics.length})`}
            </button>
          </div>

          {/* Einzelthemen-Import */}
          {showImport && (
            <div className="rounded-xl p-4 mb-6" style={{ background: '#1e293b', border: '1px solid #06b6d430' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm" style={{ color: '#06b6d4' }}>Einzelthemen → in Zeitplan einfügen</h3>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Datum:</label>
                  <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                </div>
              </div>
              {topics.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Keine offenen Einzelthemen. Erstelle welche unter <Link href="/admin/blog/themen" style={{ color: '#06b6d4' }}>Themen → Einzelthemen</Link>.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {topics.map((t) => {
                    const isOpen = expandedId === `topic-${t.id}`;
                    return (
                      <div key={t.id} className="rounded-lg overflow-hidden" style={{ background: '#0f172a', border: isOpen ? '1px solid #06b6d440' : '1px solid #334155' }}>
                        <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : `topic-${t.id}`)}>
                          <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>Entwurf</span>
                          <span className="text-sm font-semibold truncate flex-1" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                          <svg className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ color: '#475569', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {isOpen && (
                          <div className="px-3 pb-3" style={{ borderTop: '1px solid #334155' }}>
                            <div className="pt-3 space-y-2">
                              {t.keywords?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {t.keywords.map((kw, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#1e293b', color: '#94a3b8' }}>{kw}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end mt-3">
                              <button onClick={() => importTopic(t)} className="px-4 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
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

          {/* Kalender */}
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

      {/* ═══ TAB: SERIEN ═══ */}
      {tab === 'serien' && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Import-Datum:</label>
            <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
          </div>

          {seriesList.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: '#475569' }}>Keine Serien vorhanden.</p>
              <Link href="/admin/blog/themen" className="text-xs font-heading mt-2 inline-block" style={{ color: '#06b6d4' }}>Serien unter Themen erstellen</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {seriesList.map((series) => {
                const openParts = (series.blog_series_parts ?? []).filter((p) => !p.used).sort((a, b) => a.part_number - b.part_number);
                return (
                  <div key={series.id} className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #8b5cf630' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{series.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-heading" style={{ background: series.status === 'completed' ? '#22c55e20' : '#8b5cf620', color: series.status === 'completed' ? '#22c55e' : '#8b5cf6' }}>
                        {series.generated_parts}/{series.total_parts}
                      </span>
                    </div>
                    {series.description && <p className="text-xs mb-3" style={{ color: '#475569' }}>{series.description}</p>}
                    {openParts.length === 0 ? (
                      <p className="text-xs" style={{ color: '#22c55e' }}>Alle Teile abgeschlossen oder eingeplant.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {openParts.map((part) => (
                          <div key={part.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#0f172a' }}>
                            <span className="text-xs font-body truncate flex-1" style={{ color: '#e2e8f0' }}>
                              <span className="font-heading font-bold mr-1.5" style={{ color: '#8b5cf6' }}>Teil {part.part_number}</span>
                              {part.topic}
                            </span>
                            <button onClick={() => importSeriesPart(series, part)} className="px-3 py-1 rounded text-[11px] font-heading font-semibold shrink-0 ml-2" style={{ background: '#8b5cf6', color: 'white' }}>
                              + In Zeitplan
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {schedule.some((s) => s.topic.includes('Teil')) && (
            <div className="mt-8">
              <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#8b5cf6' }}>Serien im Zeitplan</h3>
              {renderScheduleList(true)}
            </div>
          )}
        </>
      )}

      {/* Edit-Modal */}
      {renderEditModal()}
    </div>
  );
}
