'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};

interface ReelPlanEntry {
  id: string;
  topic: string;
  template_id?: string | null;
  keywords: string[];
  platforms: string[];
  scheduled_date: string;
  scheduled_time: string;
  status: 'planned' | 'generating' | 'generated' | 'failed';
  generated_reel_id?: string | null;
  error_message?: string | null;
  created_at: string;
}

interface ReelTemplate {
  id: string;
  name: string;
}

interface JobStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  message?: string;
  error?: string;
  recent?: Array<{ ok: boolean; topic: string; error?: string }>;
}

// ── calendar helpers ──────────────────────────────────────────────────────────
function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function isoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCalendarWeeks(monthsAhead = 7): { kw: number; year: number; days: Date[] }[] {
  const today = new Date();
  const startMonday = new Date(today);
  startMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const endDate = new Date(today);
  endDate.setMonth(today.getMonth() + monthsAhead);

  const weeks: { kw: number; year: number; days: Date[] }[] = [];
  const cur = new Date(startMonday);
  while (cur <= endDate) {
    const kw = getISOWeek(cur);
    const year = cur.getFullYear();
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push({ kw, year, days });
  }
  return weeks;
}

function chipColor(status: ReelPlanEntry['status']): string {
  switch (status) {
    case 'planned':    return '#475569';
    case 'generating': return '#f59e0b';
    case 'generated':  return '#ec4899';
    case 'failed':     return '#ef4444';
    default:           return '#475569';
  }
}

function statusLabel(status: ReelPlanEntry['status']): string {
  switch (status) {
    case 'planned':    return 'Geplant';
    case 'generating': return 'Generiert…';
    case 'generated':  return 'Generiert';
    case 'failed':     return 'Fehler';
    default:           return status;
  }
}

const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const DAY_NAMES   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// ─────────────────────────────────────────────────────────────────────────────

export default function ReelsZeitplanPage() {
  const [entries, setEntries]       = useState<ReelPlanEntry[]>([]);
  const [templates, setTemplates]   = useState<ReelTemplate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [jobStatus, setJobStatus]   = useState<JobStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [weeks, setWeeks]           = useState(4);
  const [reelsPerWeek, setReelsPerWeek] = useState(2);
  const [reelHour, setReelHour]     = useState(10);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // edit modal
  const [editEntry, setEditEntry]   = useState<ReelPlanEntry | null>(null);
  const [editTopic, setEditTopic]   = useState('');
  const [editTemplate, setEditTemplate] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPlatforms, setEditPlatforms] = useState<string[]>(['instagram', 'facebook']);
  const [editDate, setEditDate]     = useState('');
  const [editTime, setEditTime]     = useState('10:00');
  const [editSaving, setEditSaving] = useState(false);
  const [editGenerating, setEditGenerating] = useState(false);

  // manual add
  const [newTopic, setNewTopic]     = useState('');
  const [newDate, setNewDate]       = useState('');
  const [newTime, setNewTime]       = useState('10:00');
  const [newTemplate, setNewTemplate] = useState('');
  const [newPlatforms, setNewPlatforms] = useState<string[]>(['instagram', 'facebook']);
  const [adding, setAdding]         = useState(false);

  // drag
  const dragEntry = useRef<ReelPlanEntry | null>(null);

  const calWeeks = buildCalendarWeeks(7);
  const today    = isoDateStr(new Date());
  const todayD   = new Date();

  // ── data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, tplRes] = await Promise.all([
        fetch('/api/admin/reels/plan'),
        fetch('/api/admin/reels/templates'),
      ]);
      const planData = await planRes.json();
      const tplData  = await tplRes.json();
      if (Array.isArray(planData.plan))       setEntries(planData.plan);
      if (Array.isArray(tplData.templates))   setTemplates(tplData.templates);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobStatus = useCallback(async () => {
    const res = await fetch('/api/admin/reels/generate-plan');
    if (res.ok) { const d = await res.json(); setJobStatus(d); }
  }, []);

  useEffect(() => { loadAll(); loadJobStatus(); }, [loadAll, loadJobStatus]);

  // ── polling while job running ─────────────────────────────────────────────
  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(async () => {
      const res = await fetch('/api/admin/reels/generate-plan');
      if (!res.ok) return;
      const d: JobStatus = await res.json();
      setJobStatus(d);
      if (d.status !== 'running') {
        setGenerating(false);
        if (d.status === 'completed') loadAll();
        clearInterval(iv);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [generating, loadAll]);

  // ── generate plan ─────────────────────────────────────────────────────────
  async function generatePlan() {
    setGenerating(true);
    setJobStatus({ status: 'running', total: weeks * reelsPerWeek, completed: 0, failed: 0 });
    const res = await fetch('/api/admin/reels/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days: weeks * 7,
        reels_per_week: reelsPerWeek,
        reel_hour: reelHour,
        template_id: selectedTemplate || null,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setJobStatus({ status: 'error', total: 0, completed: 0, failed: 0, error: d.error });
      setGenerating(false);
    }
  }

  async function cancelGenerate() {
    await fetch('/api/admin/reels/generate-plan', { method: 'DELETE' });
    setGenerating(false);
    await loadJobStatus();
  }

  async function resetJob() {
    await fetch('/api/admin/reels/generate-plan?reset=1', { method: 'DELETE' });
    setJobStatus(null);
  }

  // ── edit modal ────────────────────────────────────────────────────────────
  function openEdit(e: ReelPlanEntry) {
    setEditEntry(e);
    setEditTopic(e.topic);
    setEditTemplate(e.template_id ?? '');
    setEditKeywords((e.keywords ?? []).join(', '));
    setEditPlatforms(e.platforms ?? ['instagram', 'facebook']);
    setEditDate(e.scheduled_date);
    setEditTime(e.scheduled_time ?? '10:00');
  }

  function closeEdit() {
    if (editSaving || editGenerating) return;
    setEditEntry(null);
  }

  async function saveEdit() {
    if (!editEntry) return;
    setEditSaving(true);
    await fetch(`/api/admin/reels/plan/${editEntry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: editTopic.trim(),
        template_id: editTemplate || null,
        keywords: editKeywords.split(',').map(k => k.trim()).filter(Boolean),
        platforms: editPlatforms,
        scheduled_date: editDate,
        scheduled_time: editTime,
      }),
    });
    setEditSaving(false);
    closeEdit();
    loadAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag löschen?')) return;
    await fetch(`/api/admin/reels/plan/${id}`, { method: 'DELETE' });
    if (editEntry?.id === id) setEditEntry(null);
    loadAll();
  }

  async function generateNow(id: string) {
    setEditGenerating(true);
    const res = await fetch(`/api/admin/reels/plan/${id}/generate`, { method: 'POST' });
    setEditGenerating(false);
    if (res.ok) {
      const d = await res.json();
      if (d.reel_id) window.open(`/admin/social/reels/${d.reel_id}`, '_blank');
    }
    loadAll();
    closeEdit();
  }

  // ── manual add ────────────────────────────────────────────────────────────
  async function addEntry() {
    if (!newTopic.trim() || !newDate) return;
    setAdding(true);
    await fetch('/api/admin/reels/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: newTopic.trim(),
        template_id: newTemplate || null,
        platforms: newPlatforms,
        scheduled_date: newDate,
        scheduled_time: newTime,
      }),
    });
    setAdding(false);
    setNewTopic('');
    setNewDate('');
    setNewTime('10:00');
    setNewTemplate('');
    loadAll();
  }

  // ── drag & drop ───────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, entry: ReelPlanEntry) {
    dragEntry.current = entry;
    e.dataTransfer.effectAllowed = 'move';
  }

  async function onDropDay(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    if (!dragEntry.current) return;
    const entry = dragEntry.current;
    dragEntry.current = null;
    if (entry.scheduled_date === dateStr) return;
    await fetch(`/api/admin/reels/plan/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_date: dateStr }),
    });
    loadAll();
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function entriesOnDay(dateStr: string) {
    return entries.filter(e => e.scheduled_date === dateStr);
  }

  // progress
  const jobProgress = jobStatus
    ? jobStatus.total > 0 ? Math.round((jobStatus.completed / jobStatus.total) * 100) : 0
    : 0;
  const jobRunning = generating || jobStatus?.status === 'running';

  // month headers
  function buildMonthHeaders() {
    const headers: { label: string; span: number }[] = [];
    let lastLabel = '';
    for (const w of calWeeks) {
      const m = w.days[0];
      const label = `${MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}`;
      if (label === lastLabel) {
        headers[headers.length - 1].span++;
      } else {
        headers.push({ label, span: 1 });
        lastLabel = label;
      }
    }
    return headers;
  }

  const monthHeaders = buildMonthHeaders();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e2e8f0', fontFamily: 'DM Sans, sans-serif' }}>
      {/* header */}
      <div style={{ borderBottom: '1px solid #1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <AdminBackLink href="/admin/social/reels" label="Zurück zu Reels" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📅 Reels-Redaktionsplan</h1>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── KI-Plan-Generator ──────────────────────────────────────────── */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🤖 KI-Reel-Planung</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}
              style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
              {[2,3,4,6,8].map(n => <option key={n} value={n}>{n} Wochen</option>)}
            </select>
            <select value={reelsPerWeek} onChange={e => setReelsPerWeek(Number(e.target.value))}
              style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}/Woche</option>)}
            </select>
            <select value={reelHour} onChange={e => setReelHour(Number(e.target.value))}
              style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
              {[8,9,10,11,12,14,16,18].map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00 Uhr</option>)}
            </select>
            {templates.length > 0 && (
              <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
                <option value="">Vorlage wählen…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          <button
            onClick={generatePlan}
            disabled={jobRunning}
            style={{
              background: jobRunning ? '#334155' : '#ec4899',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 18px', fontWeight: 600, fontSize: 14,
              cursor: jobRunning ? 'not-allowed' : 'pointer',
            }}>
            ⚡ {weeks * reelsPerWeek} KI-Reels planen
          </button>
        </div>

        {/* ── Job Status Banner ──────────────────────────────────────────── */}
        {jobStatus && jobStatus.status !== 'idle' && (
          <div style={{
            background: jobStatus.status === 'error' ? '#1c1010' : jobStatus.status === 'completed' ? '#0f1f0f' : '#111827',
            border: `1px solid ${jobStatus.status === 'error' ? '#7f1d1d' : jobStatus.status === 'completed' ? '#14532d' : '#334155'}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                {jobStatus.status === 'running' && <span style={{ color: '#f59e0b', fontWeight: 600 }}>⏳ Generiere Reels… {jobStatus.completed}/{jobStatus.total}</span>}
                {jobStatus.status === 'completed' && <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ {jobStatus.message ?? `${jobStatus.completed} Reels geplant!`}</span>}
                {jobStatus.status === 'error' && <span style={{ color: '#ef4444', fontWeight: 600 }}>✗ Fehler: {jobStatus.error}</span>}
                {jobStatus.status === 'cancelled' && <span style={{ color: '#94a3b8' }}>Abgebrochen</span>}
                {jobStatus.message && jobStatus.status === 'running' && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{jobStatus.message}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {jobStatus.status === 'running' && (
                  <button onClick={cancelGenerate} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
                )}
                {(jobStatus.status === 'completed' || jobStatus.status === 'error' || jobStatus.status === 'cancelled') && (
                  <button onClick={resetJob} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}>✕ Schließen</button>
                )}
              </div>
            </div>
            {/* progress bar */}
            {jobStatus.status === 'running' && jobStatus.total > 0 && (
              <div style={{ marginTop: 8, background: '#1e293b', borderRadius: 4, height: 6 }}>
                <div style={{ background: '#ec4899', borderRadius: 4, height: 6, width: `${jobProgress}%`, transition: 'width .3s' }} />
              </div>
            )}
            {/* recent log */}
            {jobStatus.recent && jobStatus.recent.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {jobStatus.recent.slice(0, 5).map((r, i) => (
                  <span key={i} style={{ color: r.ok ? '#22c55e' : '#ef4444' }}>
                    {r.ok ? '✓' : '✗'} {r.topic}{r.error ? ` — ${r.error}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Manual Add Form ────────────────────────────────────────────── */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: '#94a3b8' }}>+ Manuell hinzufügen</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px' }}>
              <input placeholder="Reel-Thema *" value={newTopic} onChange={e => setNewTopic(e.target.value)}
                style={inputStyle} onKeyDown={e => e.key === 'Enter' && addEntry()} />
            </div>
            {templates.length > 0 && (
              <div style={{ flex: '1 1 160px' }}>
                <select value={newTemplate} onChange={e => setNewTemplate(e.target.value)} style={inputStyle}>
                  <option value="">Vorlage…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: '1 1 130px' }}>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: '0 1 90px' }}>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['instagram','facebook'] as const).map(p => (
                <button key={p} onClick={() => setNewPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                  style={{ background: newPlatforms.includes(p) ? (p === 'facebook' ? '#1d4ed8' : '#be185d') : '#1e293b', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  {p === 'facebook' ? 'FB' : 'IG'}
                </button>
              ))}
            </div>
            <button onClick={addEntry} disabled={adding || !newTopic.trim() || !newDate}
              style={{ background: adding || !newTopic.trim() || !newDate ? '#334155' : '#ec4899', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {adding ? '…' : '+ Hinzufügen'}
            </button>
          </div>
        </div>

        {/* ── Calendar ───────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Lade…</div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #1e293b' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, background: '#0f172a' }}>
              <thead>
                {/* month headers */}
                <tr>
                  <th style={{ width: 48, background: '#0f172a', position: 'sticky', left: 0, zIndex: 3 }} />
                  {monthHeaders.map((m, i) => (
                    <th key={i} colSpan={m.span * 7}
                      style={{ textAlign: 'center', fontSize: 11, color: '#64748b', padding: '6px 4px', fontWeight: 600, borderBottom: '1px solid #1e293b', background: '#0f172a', whiteSpace: 'nowrap' }}>
                      {m.label}
                    </th>
                  ))}
                </tr>
                {/* day-of-week row */}
                <tr>
                  <th style={{ width: 48, fontSize: 10, color: '#475569', padding: '4px 8px', textAlign: 'center', position: 'sticky', left: 0, background: '#0f172a', zIndex: 3 }}>KW</th>
                  {calWeeks.map(w => w.days.map((d, di) => {
                    const ds = isoDateStr(d);
                    const isToday = ds === today;
                    return (
                      <th key={`${w.kw}-${di}`}
                        style={{ width: 180, minWidth: 180, textAlign: 'center', fontSize: 11, color: isToday ? '#ec4899' : '#64748b', fontWeight: isToday ? 700 : 400, padding: '4px 2px', borderLeft: di === 0 ? '1px solid #1e293b' : undefined, background: '#0f172a' }}>
                        {DAY_NAMES[di]} {d.getDate()}.
                      </th>
                    );
                  }))}
                </tr>
              </thead>
              <tbody>
                {calWeeks.map((w, wi) => {
                  const rowBg = wi % 2 === 0 ? '#0f172a' : '#111827';
                  return (
                    <tr key={w.kw}>
                      {/* KW cell */}
                      <td style={{ textAlign: 'center', fontSize: 11, color: '#475569', fontWeight: 600, padding: '4px 6px', position: 'sticky', left: 0, background: rowBg, zIndex: 2, borderRight: '1px solid #1e293b', verticalAlign: 'top' }}>
                        {w.kw}
                      </td>
                      {/* day cells */}
                      {w.days.map((d, di) => {
                        const ds = isoDateStr(d);
                        const isToday = ds === today;
                        const isPast = d < todayD && !isToday;
                        const dayEntries = entriesOnDay(ds);

                        return (
                          <td key={di}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => onDropDay(e, ds)}
                            style={{
                              verticalAlign: 'top', padding: '4px 3px', minWidth: 180, width: 180,
                              borderLeft: di === 0 ? '1px solid #1e293b' : '1px solid #1a2332',
                              background: isToday ? '#1a0a12' : isPast ? '#0c1118' : rowBg,
                              borderTop: isToday ? '2px solid #ec4899' : undefined,
                            }}>
                            {dayEntries.map(entry => (
                              <div key={entry.id}
                                draggable
                                onDragStart={e => onDragStart(e, entry)}
                                onClick={() => openEdit(entry)}
                                title={entry.topic}
                                style={{
                                  background: chipColor(entry.status),
                                  color: '#fff', borderRadius: 5, padding: '3px 6px',
                                  fontSize: 11, marginBottom: 3, cursor: 'pointer',
                                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                  opacity: entry.status === 'failed' ? 0.7 : 1,
                                  border: entry.status === 'generating' ? '1px solid #fbbf24' : 'none',
                                }}>
                                {entry.status === 'generating' && '⏳ '}
                                {entry.status === 'generated' && '🎬 '}
                                {entry.status === 'failed' && '✗ '}
                                {entry.topic}
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Legend ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 12 }}>
          {(['planned','generating','generated','failed'] as const).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: chipColor(s) }} />
              <span style={{ color: '#64748b' }}>{statusLabel(s)}</span>
            </div>
          ))}
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            {(['planned','generating','generated','failed'] as const).map(s => {
              const cnt = entries.filter(e => e.status === s).length;
              if (cnt === 0) return null;
              return (
                <div key={s} style={{ background: '#111827', border: `1px solid ${chipColor(s)}40`, borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>
                  <span style={{ color: chipColor(s), fontWeight: 700 }}>{cnt}</span>
                  <span style={{ color: '#94a3b8', marginLeft: 6 }}>{statusLabel(s)}</span>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeEdit}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Reel bearbeiten</span>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {/* status badge */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ background: chipColor(editEntry.status), color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                {statusLabel(editEntry.status)}
              </span>
              {editEntry.error_message && (
                <div style={{ marginTop: 6, color: '#f87171', fontSize: 12 }}>✗ {editEntry.error_message}</div>
              )}
            </div>

            {/* topic */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Thema</label>
              <input value={editTopic} onChange={e => setEditTopic(e.target.value)} style={inputStyle} />
            </div>

            {/* template */}
            {templates.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Vorlage</label>
                <select value={editTemplate} onChange={e => setEditTemplate(e.target.value)} style={inputStyle}>
                  <option value="">Keine Vorlage</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* keywords */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Keywords (Komma-getrennt)</label>
              <input value={editKeywords} onChange={e => setEditKeywords(e.target.value)} style={inputStyle} placeholder="z.B. GoPro, Berge, Abenteuer" />
            </div>

            {/* platforms */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Plattformen</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['instagram','facebook'] as const).map(p => (
                  <button key={p}
                    onClick={() => setEditPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    style={{ background: editPlatforms.includes(p) ? (p === 'facebook' ? '#1d4ed8' : '#be185d') : '#1e293b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                    {p === 'facebook' ? '📘 Facebook' : '📷 Instagram'}
                  </button>
                ))}
              </div>
            </div>

            {/* date + time */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Datum</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '0 1 110px' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Uhrzeit</label>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {/* reel link */}
            {editEntry.generated_reel_id && (
              <div style={{ marginBottom: 14 }}>
                <Link href={`/admin/social/reels/${editEntry.generated_reel_id}`} target="_blank"
                  style={{ color: '#ec4899', fontSize: 13 }}>🎬 Reel ansehen →</Link>
              </div>
            )}

            {/* actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {editEntry.status === 'planned' && (
                <button onClick={() => generateNow(editEntry.id)} disabled={editGenerating}
                  style={{ background: editGenerating ? '#334155' : '#ec4899', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: editGenerating ? 'not-allowed' : 'pointer' }}>
                  {editGenerating ? '⏳ Generiert…' : '⚡ Jetzt generieren'}
                </button>
              )}
              <button onClick={saveEdit} disabled={editSaving}
                style={{ background: editSaving ? '#334155' : '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                {editSaving ? '…' : '💾 Speichern'}
              </button>
              <button onClick={() => deleteEntry(editEntry.id)}
                style={{ background: '#1c1010', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '9px 14px', fontSize: 14, cursor: 'pointer' }}>
                🗑 Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
