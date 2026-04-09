'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};

interface ScheduleEntry {
  id: string; topic: string; keywords: string[]; category_id: string | null;
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
  skipped: { label: 'Uebersprungen', color: '#64748b', bg: '#64748b20' },
};

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

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 4000); }

  async function generatePlan() {
    setGenerating(true);
    const res = await fetch('/api/admin/blog/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_plan', weeks, postsPerWeek }),
    });
    const data = await res.json();
    setGenerating(false);
    if (res.ok) { flash(`${data.count} Themen fuer ${weeks} Wochen erstellt!`); loadAll(); }
    else flash(data.error || 'Fehler');
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
      // Thema als verwendet markieren
      await fetch(`/api/admin/blog/auto-topics?id=${topic.id}`, { method: 'DELETE' });
      flash(`"${topic.topic.slice(0, 40)}..." in Zeitplan eingefuegt!`);
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
    if (res.ok) { flash(`Serie "${series.title}" Teil ${part.part_number} eingefuegt!`); loadAll(); }
  }

  async function toggleReviewed(entry: ScheduleEntry) {
    const newReviewed = !entry.reviewed;
    await fetch('/api/admin/blog/schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, reviewed: newReviewed, status: newReviewed ? 'reviewed' : entry.post_id ? 'generated' : 'planned' }),
    });
    loadAll();
  }

  async function updateDate(id: string, date: string) {
    await fetch('/api/admin/blog/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, scheduled_date: date }) });
    loadAll();
  }

  async function updateTime(id: string, time: string) {
    await fetch('/api/admin/blog/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, scheduled_time: time }) });
    loadAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag wirklich loeschen?')) return;
    await fetch(`/api/admin/blog/schedule?id=${id}`, { method: 'DELETE' });
    loadAll();
  }

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

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Redaktionsplan</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Drag&Drop fuer Reihenfolge — Themen importieren oder per KI planen</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-heading" style={{ color: '#94a3b8' }}>
          <span>{plannedCount} geplant</span>
          <span style={{ color: '#06b6d4' }}>{generatedCount} fertig</span>
          <span style={{ color: '#22c55e' }}>{reviewedCount} gesehen</span>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: msg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>{msg}</div>}

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
              {showImport ? 'Import schliessen' : `Einzelthemen importieren (${topics.length})`}
            </button>
          </div>

          {/* Import aus Einzelthemen */}
          {showImport && (
            <div className="rounded-xl p-4 mb-6" style={{ background: '#1e293b', border: '1px solid #06b6d430' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm" style={{ color: '#06b6d4' }}>Einzelthemen in Zeitplan einfuegen</h3>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Datum:</label>
                  <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                </div>
              </div>
              {topics.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Keine offenen Einzelthemen. Erstelle welche unter Themen → Einzelthemen.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {topics.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#0f172a' }}>
                      <span className="text-xs font-body truncate flex-1" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                      <button onClick={() => importTopic(t)} className="px-3 py-1 rounded text-[11px] font-heading font-semibold shrink-0 ml-2" style={{ background: '#06b6d4', color: '#0f172a' }}>
                        + Einfuegen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Zeitplan-Liste */}
          {renderScheduleList()}
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

          {/* Serien-Eintraege im Zeitplan */}
          {schedule.some((s) => s.topic.includes('Teil')) && (
            <div className="mt-8">
              <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#8b5cf6' }}>Serien im Zeitplan</h3>
              {renderScheduleList(true)}
            </div>
          )}
        </>
      )}
    </div>
  );

  function renderScheduleList(seriesOnly?: boolean) {
    const filtered = seriesOnly ? schedule.filter((s) => s.topic.includes('Teil')) : schedule;
    if (filtered.length === 0) {
      return <div className="text-center py-12"><p className="text-sm" style={{ color: '#475569' }}>Noch keine Eintraege.</p></div>;
    }
    return (
      <div className="space-y-2">
        {filtered.map((entry, index) => {
          const st = STATUS_MAP[entry.status] ?? STATUS_MAP.planned;
          const todayStr = new Date().toISOString().split('T')[0];
          const isPast = entry.scheduled_date < todayStr;
          const isToday = entry.scheduled_date === todayStr;
          return (
            <div key={entry.id} draggable onDragStart={() => handleDragStart(index)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
              className="rounded-xl p-4 transition-colors cursor-grab active:cursor-grabbing"
              style={{ background: isToday ? '#06b6d408' : '#1e293b', border: `1px solid ${isToday ? '#06b6d430' : '#334155'}`, opacity: entry.status === 'skipped' ? 0.5 : 1 }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="#475569" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                  <button onClick={() => toggleReviewed(entry)} className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                    style={entry.reviewed ? { background: '#22c55e', color: 'white' } : { background: '#0f172a', border: '1.5px solid #475569' }}
                    title={entry.reviewed ? 'Als ungesehen markieren' : 'Als gesehen markieren'}>
                    {entry.reviewed && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1">
                    <span className="font-heading font-semibold text-sm block" style={{ color: '#e2e8f0' }}>{entry.topic}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    {entry.blog_categories && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: entry.blog_categories.color + '20', color: entry.blog_categories.color }}>{entry.blog_categories.name}</span>}
                    {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>HEUTE</span>}
                    {isPast && !isToday && entry.status === 'planned' && <span className="text-[10px] px-1.5 py-0.5 rounded font-heading font-bold" style={{ background: '#ef444420', color: '#ef4444' }}>UEBERFAELLIG</span>}
                  </div>
                  {entry.blog_posts && (
                    <Link href={`/admin/blog/artikel/${entry.blog_posts.id}`} className="text-xs hover:underline block mb-1" style={{ color: '#06b6d4' }}>→ {entry.blog_posts.title}</Link>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <input type="date" value={entry.scheduled_date} onChange={(e) => updateDate(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <input type="time" value={entry.scheduled_time} onChange={(e) => updateTime(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <button onClick={() => deleteEntry(entry.id)} className="px-2 py-1 rounded text-[11px] font-heading font-semibold ml-auto" style={{ background: '#ef444420', color: '#ef4444' }}>Loeschen</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
