'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Stats {
  total: number; published: number; draft: number; scheduled: number;
  pendingComments: number; totalViews: number;
}

interface RecentPost {
  id: string; title: string; status: string; created_at: string;
  view_count: number; bot_view_count?: number;
}

interface GenerationStatus {
  status: 'generating' | 'idle';
  topic?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

interface ScheduleEntry {
  id: string;
  topic: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  reviewed: boolean;
  tone?: string;
  target_length?: string;
  post_id?: string;
  generated_at?: string;
  category?: { name: string; color: string } | null;
}

export default function BlogDashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, draft: 0, scheduled: 0, pendingComments: 0, totalViews: 0 });
  const [recent, setRecent] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<GenerationStatus>({ status: 'idle' });
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoMode, setAutoMode] = useState<'semi' | 'voll'>('semi');
  const [autoInterval, setAutoInterval] = useState('weekly');
  const [autoWeekdays, setAutoWeekdays] = useState<string[]>([]);
  const [autoTimeFrom, setAutoTimeFrom] = useState('');
  const [autoTimeTo, setAutoTimeTo] = useState('');
  const [, setOpenTopics] = useState(0);
  const [plannedSchedule, setPlannedSchedule] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [recentAiPosts, setRecentAiPosts] = useState<RecentPost[]>([]);
  const [vorlaufzeit, setVorlaufzeit] = useState(3);

  const loadStatus = useCallback(async () => {
    try {
      // Generierungs-Status
      const statusRes = await fetch('/api/admin/settings?key=blog_generation_status');
      const statusData = await statusRes.json();
      if (statusData.value) {
        const parsed = typeof statusData.value === 'string' ? JSON.parse(statusData.value) : statusData.value;
        setGenStatus(parsed);
      }

      // Auto-Generierung Einstellungen
      const settingsRes = await fetch('/api/admin/settings?key=blog_settings');
      const settingsData = await settingsRes.json();
      if (settingsData.value) {
        const parsed = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
        setAutoEnabled(!!parsed.auto_generate);
        setAutoMode(parsed.auto_generate_mode || 'semi');
        setAutoInterval(parsed.auto_generate_interval || 'weekly');
        setAutoWeekdays(parsed.auto_generate_weekdays || []);
        setAutoTimeFrom(parsed.auto_generate_time_from || '');
        setAutoTimeTo(parsed.auto_generate_time_to || '');
        setVorlaufzeit(Number(parsed.schedule_days_before ?? parsed.auto_generate_days_before ?? 3));
      }

      // Offene Themen zaehlen
      const topicsRes = await fetch('/api/admin/blog/auto-topics');
      const topicsData = await topicsRes.json();
      const open = (topicsData.topics ?? []).filter((t: { used: boolean }) => !t.used).length;
      setOpenTopics(open);

      // Zeitplan laden (nächste 10 geplante Einträge)
      const schedRes = await fetch('/api/admin/blog/schedule');
      const schedData = await schedRes.json();
      const allEntries = (schedData.entries ?? schedData.schedule ?? [])
        .filter((e: ScheduleEntry) => ['planned', 'generating', 'generated', 'reviewed'].includes(e.status));
      setPlannedSchedule(allEntries.filter((e: ScheduleEntry) => e.status === 'planned').length);
      const entries = allEntries
        .sort((a: ScheduleEntry, b: ScheduleEntry) => {
          const dtA = `${a.scheduled_date}T${(a.scheduled_time || '00:00').slice(0, 5)}`;
          const dtB = `${b.scheduled_date}T${(b.scheduled_time || '00:00').slice(0, 5)}`;
          return dtA.localeCompare(dtB);
        })
        .slice(0, 8);
      setSchedule(entries);
    } catch { /* leer */ }
  }, []);

  useEffect(() => {
    async function load() {
      const [postsRes, commentsRes] = await Promise.all([
        fetch('/api/admin/blog/posts'),
        fetch('/api/admin/blog/comments?status=pending'),
      ]);
      const postsData = await postsRes.json();
      const commentsData = await commentsRes.json();
      const posts = postsData.posts ?? [];
      const comments = commentsData.comments ?? [];

      setStats({
        total: posts.length,
        published: posts.filter((p: RecentPost) => p.status === 'published').length,
        draft: posts.filter((p: RecentPost) => p.status === 'draft').length,
        scheduled: posts.filter((p: RecentPost) => p.status === 'scheduled').length,
        pendingComments: comments.length,
        totalViews: posts.reduce((sum: number, p: RecentPost) => sum + (p.view_count || 0), 0),
      });
      setRecent(posts.slice(0, 5));
      setRecentAiPosts(posts.filter((p: RecentPost & { ai_generated?: boolean }) => p.ai_generated).slice(0, 5));
      setLoading(false);
    }
    load();
    loadStatus();

    // Status alle 5 Sekunden aktualisieren
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const isGenerating = genStatus.status === 'generating';
  const elapsedSeconds = isGenerating && genStatus.started_at
    ? Math.floor((Date.now() - new Date(genStatus.started_at).getTime()) / 1000)
    : 0;
  // Generierung dauert normal 1-3 Min. Über 10 Min ist das ein Stale-Lock —
  // der Cron-Prozess wurde abgebrochen, ohne den Status auf idle zu setzen.
  const isStuck = isGenerating && elapsedSeconds > 600;
  // Einträge, die auf "Wird generiert" hängen, obwohl gerade nichts läuft —
  // ein abgebrochener früherer Lauf. Der Cron überspringt sie (nimmt nur
  // 'planned'), deshalb anbieten, sie manuell freizugeben.
  const orphanedCount = !isGenerating ? schedule.filter(e => e.status === 'generating').length : 0;
  const hasOrphanedGenerating = orphanedCount > 0;

  async function handleResetGeneration() {
    if (!confirm('Generator-Status zurücksetzen? Der nächste Cron-Lauf startet eine neue Generierung.')) return;
    try {
      const res = await fetch('/api/admin/blog/reset-generation-status', { method: 'POST' });
      if (!res.ok) throw new Error('Reset fehlgeschlagen');
      await loadStatus();
    } catch {
      alert('Reset fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  const statCards = [
    { label: 'Gesamt', value: stats.total, color: '#e2e8f0' },
    { label: 'Live', value: stats.published, color: '#22c55e' },
    { label: 'Entwürfe', value: stats.draft, color: '#f59e0b' },
    { label: 'Geplant', value: stats.scheduled, color: '#06b6d4' },
    { label: 'Kommentare', value: stats.pendingComments, color: '#ef4444' },
    { label: 'Views', value: stats.totalViews, color: '#a78bfa' },
  ];

  return (
    <div className="p-4 sm:p-8">
      <AdminBackLink label="Zurück" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Blog-Dashboard</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Übersicht über alle Blog-Aktivitäten</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/blog/artikel/neu" className="px-4 py-2 rounded-lg text-sm font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
            + Neuer Artikel
          </Link>
        </div>
      </div>

      {/* Live-Ampel */}
      <div className="rounded-xl p-4 sm:p-5 mb-6" style={{ background: isGenerating ? '#22c55e10' : '#1e293b', border: `1px solid ${isGenerating ? '#22c55e30' : '#1e293b'}` }}>
        <div className="flex items-center gap-4">
          {/* Ampel-Dot */}
          <div className="relative shrink-0">
            <div
              className="w-4 h-4 rounded-full"
              style={{ background: isStuck ? '#ef4444' : isGenerating ? '#22c55e' : autoEnabled ? '#f59e0b' : '#ef4444' }}
            />
            {isGenerating && !isStuck && (
              <div className="absolute inset-0 w-4 h-4 rounded-full animate-ping" style={{ background: '#22c55e', opacity: 0.4 }} />
            )}
          </div>

          {/* Status-Text */}
          <div className="flex-1 min-w-0">
            {isStuck ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-sm" style={{ color: '#ef4444' }}>
                    Generierung hängt fest
                  </span>
                  <button
                    onClick={handleResetGeneration}
                    className="text-xs px-2 py-1 rounded-md font-heading font-semibold transition-colors"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                  >
                    Zurücksetzen
                  </button>
                </div>
                {genStatus.topic && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>Thema: {genStatus.topic}</p>
                )}
                <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>
                  Läuft seit {Math.floor(elapsedSeconds / 60)} Min. — vermutlich Cron-Timeout, Status wurde nie auf idle gesetzt.
                </p>
              </>
            ) : isGenerating ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm" style={{ color: '#22c55e' }}>Generiert gerade...</span>
                  <span className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                </div>
                {genStatus.topic && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>Thema: {genStatus.topic}</p>
                )}
                {elapsedSeconds > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>Läuft seit {elapsedSeconds} Sekunden</p>
                )}
              </>
            ) : autoEnabled ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-sm" style={{ color: '#f59e0b' }}>Wartet auf nächsten Slot</span>
                  {hasOrphanedGenerating && (
                    <button
                      onClick={handleResetGeneration}
                      className="text-xs px-2 py-1 rounded-md font-heading font-semibold transition-colors"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                      title="Einträge hängen im Status „Wird generiert“ fest und werden vom Cron übersprungen. Zurücksetzen gibt sie wieder frei."
                    >
                      {orphanedCount} hängende{orphanedCount === 1 ? 'r' : ''} Eintrag zurücksetzen
                    </button>
                  )}
                </div>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs" style={{ color: '#475569' }}>{plannedSchedule} Artikel im Zeitplan</span>
                  {genStatus.finished_at && (
                    <span className="text-xs" style={{ color: '#475569' }}>
                      Letzter Lauf: {new Date(genStatus.finished_at).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                {(() => {
                  const planned = schedule.filter(e => e.status === 'planned');
                  const now = new Date();

                  const fromHour = autoTimeFrom ? parseInt(autoTimeFrom.split(':')[0]) : 6;
                  const toHour = autoTimeTo ? parseInt(autoTimeTo.split(':')[0]) : 22;
                  const dayNames = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
                  const allowedDays = autoInterval === 'daily'
                    ? dayNames
                    : autoWeekdays.length > 0 ? autoWeekdays : dayNames;

                  // Ersten Cron-Slot ab `notBefore` suchen (stündlicher Cron im konfigurierten Fenster)
                  function firstCronSlotFrom(notBefore: Date, pubDate: Date): Date | null {
                    const candidate = new Date(Math.max(notBefore.getTime(), now.getTime()));
                    candidate.setMinutes(0, 0, 0);
                    if (candidate <= now) candidate.setHours(candidate.getHours() + 1);
                    for (let i = 0; i < 30 * 24; i++) {
                      const dayName = dayNames[candidate.getDay()];
                      const hour = candidate.getHours();
                      if (candidate < pubDate && allowedDays.includes(dayName) && hour >= fromHour && hour < toHour) {
                        return new Date(candidate);
                      }
                      candidate.setHours(candidate.getHours() + 1);
                    }
                    return null;
                  }

                  // Für jeden geplanten Artikel den frühestmöglichen Cron-Slot finden
                  let bestSlot: Date | null = null;
                  let bestEntry: typeof planned[0] | null = null;

                  for (const entry of planned) {
                    const pub = new Date(`${entry.scheduled_date}T${(entry.scheduled_time || '09:00').slice(0, 5)}:00`);
                    const eligibleFrom = new Date(pub.getTime() - vorlaufzeit * 86400000);
                    const slot = firstCronSlotFrom(eligibleFrom, pub);
                    if (slot && (!bestSlot || slot < bestSlot)) {
                      bestSlot = slot;
                      bestEntry = entry;
                    }
                  }

                  // Nächster zu veröffentlichender Artikel (frühester generated/reviewed-Eintrag)
                  const nextToPub = schedule
                    .filter(e => e.status === 'generated' || e.status === 'reviewed')
                    .sort((a, b) => {
                      const dtA = `${a.scheduled_date}T${(a.scheduled_time || '09:00').slice(0, 5)}`;
                      const dtB = `${b.scheduled_date}T${(b.scheduled_time || '09:00').slice(0, 5)}`;
                      return dtA.localeCompare(dtB);
                    })[0] ?? null;

                  if (!bestEntry && !nextToPub) return null;

                  function dateFmt(d: Date) {
                    const isToday = d.toDateString() === now.toDateString();
                    const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
                    const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
                    const datePrefix = isToday ? 'heute' : isTomorrow ? 'morgen' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });
                    return `${datePrefix} ${timeStr} Uhr`;
                  }

                  return (
                    <div className="mt-1 space-y-0.5">
                      {bestEntry && bestSlot && (() => {
                        const title = bestEntry!.topic.length > 40 ? bestEntry!.topic.slice(0, 38) + '…' : bestEntry!.topic;
                        return (
                          <p className="text-xs" style={{ color: '#06b6d4' }}>
                            <span className="font-semibold">Generieren:</span> {dateFmt(bestSlot!)} — {title}
                          </p>
                        );
                      })()}
                      {nextToPub && (() => {
                        const pubDate = new Date(`${nextToPub.scheduled_date}T${(nextToPub.scheduled_time || '09:00').slice(0, 5)}:00`);
                        const title = nextToPub.topic.length > 40 ? nextToPub.topic.slice(0, 38) + '…' : nextToPub.topic;
                        return (
                          <p className="text-xs" style={{ color: '#94a3b8' }}>
                            <span className="font-semibold">Veröffentlichen:</span> {dateFmt(pubDate)} — {title}
                          </p>
                        );
                      })()}
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <span className="font-heading font-semibold text-sm" style={{ color: '#ef4444' }}>Auto-Generierung deaktiviert</span>
                <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                  Aktiviere sie unter <Link href="/admin/blog/einstellungen" className="underline" style={{ color: '#06b6d4' }}>Einstellungen</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      ) : (
        <>
          {/* Statistik-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl p-4" style={{ background: '#1e293b' }}>
                <p className="text-[11px] font-heading font-semibold uppercase mb-1" style={{ color: '#94a3b8' }}>{card.label}</p>
                <p className="text-2xl font-heading font-bold" style={{ color: card.color }}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* KI-Bot Übersicht */}
          <div className="rounded-xl p-4 sm:p-6 mb-6" style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>KI-Bot Status</h2>
              <Link href="/admin/blog/einstellungen" className="text-xs font-heading" style={{ color: '#06b6d4' }}>Einstellungen</Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg p-3" style={{ background: '#0f172a' }}>
                <p className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Modus</p>
                <p className="text-sm font-bold" style={{ color: autoMode === 'voll' ? '#22c55e' : '#f59e0b' }}>
                  {autoMode === 'voll' ? 'Vollautomatisch' : 'Halb-Automatisch'}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: '#0f172a' }}>
                <p className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Aktive Tage</p>
                <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                  {autoInterval === 'daily' ? 'Jeden Tag' : autoWeekdays.length > 0 ? autoWeekdays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ') : 'Keine'}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: '#0f172a' }}>
                <p className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Zeitfenster</p>
                <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                  {autoTimeFrom && autoTimeTo ? `${autoTimeFrom}–${autoTimeTo}` : 'Nicht gesetzt'}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: '#0f172a' }}>
                <p className="text-[10px] font-semibold uppercase" style={{ color: '#64748b' }}>Warteschlange</p>
                <p className="text-sm font-bold" style={{ color: plannedSchedule > 0 ? '#22c55e' : '#ef4444' }}>
                  {plannedSchedule} geplant
                </p>
              </div>
            </div>

            {/* Letzte KI-Artikel */}
            {recentAiPosts.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #334155' }}>
                <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: '#64748b' }}>Zuletzt von KI generiert</p>
                <div className="space-y-1.5">
                  {recentAiPosts.slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="text-xs truncate" style={{ color: '#94a3b8' }}>{p.title}</span>
                      <span className="text-[10px] shrink-0 ml-2" style={{ color: '#475569' }}>
                        {new Date(p.created_at).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Nächste geplante Artikel */}
          {schedule.length > 0 && (
            <div className="rounded-xl p-4 sm:p-6 mb-6" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>Nächste Artikel im Zeitplan</h2>
                <Link href="/admin/blog/zeitplan" className="text-xs font-heading" style={{ color: '#06b6d4' }}>Redaktionsplan</Link>
              </div>
              <div className="space-y-2">
                {schedule.map((entry, i) => {
                  const isNext = i === 0;
                  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                    planned: { bg: '#64748b20', text: '#94a3b8', label: 'Geplant' },
                    generating: { bg: '#22c55e20', text: '#22c55e', label: 'Wird generiert' },
                    generated: { bg: '#06b6d420', text: '#06b6d4', label: 'Generiert' },
                    reviewed: { bg: '#8b5cf620', text: '#8b5cf6', label: 'Geprüft' },
                  };
                  const sc = statusColors[entry.status] || statusColors.planned;
                  const dateStr = new Date(entry.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                  const isToday = entry.scheduled_date === new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                      style={{
                        background: isNext ? '#06b6d410' : '#0f172a',
                        border: isNext ? '1px solid #06b6d430' : '1px solid transparent',
                      }}
                    >
                      {/* Nummer / Nächster */}
                      <div className="shrink-0 mt-0.5">
                        {isNext ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ background: '#06b6d4', color: 'white' }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ background: '#1e293b', color: '#475569' }}>
                            {i + 1}
                          </span>
                        )}
                      </div>

                      {/* Inhalt */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: isNext ? '#e2e8f0' : '#94a3b8' }}>
                          {entry.topic}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: sc.bg, color: sc.text }}>
                            {sc.label}
                          </span>
                          <span className="text-[10px]" style={{ color: '#475569' }}>
                            {dateStr} {entry.scheduled_time?.slice(0, 5) || ''}
                          </span>
                          {isToday && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#22c55e20', color: '#22c55e' }}>
                              HEUTE
                            </span>
                          )}
                          {isNext && (
                            <span className="text-[10px] font-semibold" style={{ color: '#06b6d4' }}>
                              Nächster Artikel
                            </span>
                          )}
                          {entry.category?.name && (
                            <span className="text-[10px]" style={{ color: entry.category.color || '#475569' }}>
                              {entry.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Letzte Artikel */}
          <div className="rounded-xl p-4 sm:p-6" style={{ background: '#1e293b' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>Letzte Artikel</h2>
              <Link href="/admin/blog/artikel" className="text-xs font-heading" style={{ color: '#06b6d4' }}>Alle anzeigen</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm" style={{ color: '#475569' }}>Noch keine Artikel.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((post) => (
                  <Link key={post.id} href={`/admin/blog/artikel/${post.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="font-heading text-sm truncate" style={{ color: '#e2e8f0' }}>{post.title}</span>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-xs" style={{ color: '#475569' }} title="Menschen · Bots">
                        👤 {Math.max(0, (post.view_count ?? 0) - (post.bot_view_count ?? 0))} · 🤖 {post.bot_view_count ?? 0}
                      </span>
                      <span className="text-xs" style={{ color: '#475569' }}>{new Date(post.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
