'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';

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
    if (!res.ok) { setGenerating(false); flash(data.error || 'Fehler'); return; }

    // Hintergrund-Status pollen
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
            flash(parsed.error || 'Fehler bei der Planung');
          }
        }
      } catch { /* weiter pollen */ }
    }, 2000);

    // Timeout nach 2 Minuten
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
              {showImport ? 'Themen schliessen' : `Themen anzeigen (${topics.length})`}
            </button>
          </div>

          {/* Einzelthemen mit Details */}
          {showImport && (
            <div className="rounded-xl p-4 mb-6" style={{ background: '#1e293b', border: '1px solid #06b6d430' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm" style={{ color: '#06b6d4' }}>Einzelthemen → in Zeitplan einfuegen</h3>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-heading" style={{ color: '#94a3b8' }}>Datum:</label>
                  <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                </div>
              </div>
              {topics.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Keine offenen Einzelthemen. Erstelle welche unter <Link href="/admin/blog/themen" style={{ color: '#06b6d4' }}>Themen → Einzelthemen</Link>.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {topics.map((t) => {
                    const isOpen = expandedId === `topic-${t.id}`;
                    const TONE_L: Record<string, string> = { informativ: 'Informativ', locker: 'Locker', professionell: 'Professionell' };
                    const LEN_L: Record<string, string> = { kurz: 'Kurz (~500)', mittel: 'Mittel (~1000)', lang: 'Lang (~1500)' };
                    return (
                      <div key={t.id} className="rounded-lg overflow-hidden" style={{ background: '#0f172a', border: isOpen ? '1px solid #06b6d440' : '1px solid #334155' }}>
                        {/* Header */}
                        <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : `topic-${t.id}`)}>
                          <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>Entwurf</span>
                          <span className="text-sm font-semibold truncate flex-1" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                          <svg className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ color: '#475569', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Details */}
                        {isOpen && (
                          <div className="px-3 pb-3" style={{ borderTop: '1px solid #334155' }}>
                            <div className="grid grid-cols-2 gap-2 pt-3">
                              <div className="col-span-2 rounded p-2.5" style={{ background: '#1e293b' }}>
                                <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#64748b' }}>KI-Prompt / Thema</p>
                                <p className="text-xs" style={{ color: '#e2e8f0' }}>{t.topic}</p>
                              </div>
                              <div className="col-span-2 rounded p-2.5" style={{ background: '#1e293b' }}>
                                <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#64748b' }}>Keywords / SEO</p>
                                {t.keywords?.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {t.keywords.map((kw, i) => (
                                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#0f172a', color: '#94a3b8' }}>{kw}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[10px]" style={{ color: '#475569' }}>KI generiert automatisch</p>
                                )}
                              </div>
                              <div className="rounded p-2.5" style={{ background: '#1e293b' }}>
                                <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#64748b' }}>Ton</p>
                                <p className="text-xs" style={{ color: '#e2e8f0' }}>{TONE_L[t.tone] || t.tone || 'Informativ'}</p>
                              </div>
                              <div className="rounded p-2.5" style={{ background: '#1e293b' }}>
                                <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#64748b' }}>Ziel-Laenge</p>
                                <p className="text-xs" style={{ color: '#e2e8f0' }}>{LEN_L[t.target_length] || t.target_length || 'Mittel'}</p>
                              </div>
                            </div>
                            <div className="flex justify-end mt-3">
                              <button onClick={() => importTopic(t)} className="px-4 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
                                + In Zeitplan einfuegen
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

    const TONE_LABELS: Record<string, string> = { informativ: 'Informativ', locker: 'Locker', professionell: 'Professionell' };
    const LENGTH_LABELS: Record<string, string> = { kurz: 'Kurz (~500 Wörter)', mittel: 'Mittel (~1000 Wörter)', lang: 'Lang (~1500 Wörter)' };

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

              {/* Header — klickbar */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
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
                  {/* Pfeil */}
                  <svg className="w-4 h-4 shrink-0 mt-1 transition-transform" style={{ color: '#475569', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Aufgeklappter Detailbereich — alles editierbar */}
              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid #334155' }} onClick={(e) => e.stopPropagation()}>
                  <div className="grid grid-cols-2 gap-3 pt-4">

                    {/* Titel */}
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Titel / Thema</label>
                      <input type="text" defaultValue={entry.topic}
                        onBlur={(e) => { if (e.target.value !== entry.topic) updateField(entry.id, 'topic', e.target.value); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    </div>

                    {/* Ausfuehrlicher Prompt */}
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#f59e0b' }}>Ausfuehrlicher KI-Prompt</label>
                      <p className="text-[10px] mb-1.5" style={{ color: '#475569' }}>Je detaillierter, desto besser der Artikel. Beschreibe Aufbau, Zielgruppe, Beispiele, was enthalten sein soll.</p>
                      <textarea defaultValue={entry.prompt || ''}
                        onBlur={(e) => updateField(entry.id, 'prompt', e.target.value || null)}
                        rows={5} placeholder="z.B.: Schreibe einen ausfuehrlichen Ratgeber fuer Wanderer die eine Action-Cam mieten moechten. Gehe auf die besten Spots in Deutschland ein (Alpen, Schwarzwald, Saechsische Schweiz). Erklaere welche Kamera-Einstellungen fuer Wandervideos ideal sind. Vergleiche GoPro Hero 13 vs. DJI Osmo Action 5. Erwaehne unsere Mietpreise und Haftungsschutz-Optionen..."
                        className="w-full px-3 py-2 rounded-lg text-sm resize-y" style={{ background: '#0f172a', border: '1px solid #f59e0b40', color: '#e2e8f0', minHeight: 100 }} />
                    </div>

                    {/* Keywords */}
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Keywords / SEO (kommagetrennt)</label>
                      <input type="text" defaultValue={(entry.keywords || []).join(', ')}
                        onBlur={(e) => { const kw = e.target.value.split(',').map((k) => k.trim()).filter(Boolean); updateField(entry.id, 'keywords', kw); }}
                        placeholder="z.B.: wandern action cam, outdoor filming, hiking kamera tipps"
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    </div>

                    {/* Ton */}
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Ton</label>
                      <select defaultValue={entry.tone || 'informativ'}
                        onChange={(e) => updateField(entry.id, 'tone', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}>
                        <option value="informativ">Informativ</option>
                        <option value="locker">Locker</option>
                        <option value="professionell">Professionell</option>
                      </select>
                    </div>

                    {/* Laenge */}
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: '#64748b' }}>Ziel-Laenge</label>
                      <select defaultValue={entry.target_length || 'mittel'}
                        onChange={(e) => updateField(entry.id, 'target_length', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}>
                        <option value="kurz">Kurz (~500 Woerter)</option>
                        <option value="mittel">Mittel (~1000 Woerter)</option>
                        <option value="lang">Lang (~1500 Woerter)</option>
                      </select>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 rounded-lg p-3" style={{ background: '#0f172a' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Status:</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          {postIsPublished && <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#22c55e20', color: '#22c55e' }}>Veröffentlicht</span>}
                        </div>
                        {entry.generated_at && <span className="text-[10px]" style={{ color: '#475569' }}>Generiert: {new Date(entry.generated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Generierter Artikel */}
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

                  {/* Datum/Uhrzeit + Aktionen */}
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #334155' }}>
                    <input type="date" value={entry.scheduled_date} onChange={(e) => updateDate(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <input type="time" value={entry.scheduled_time} onChange={(e) => updateTime(entry.id, e.target.value)} className="px-2 py-1 rounded text-xs font-body" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="px-2 py-1 rounded text-[11px] font-heading font-semibold ml-auto" style={{ background: '#ef444420', color: '#ef4444' }}>Loeschen</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
}
