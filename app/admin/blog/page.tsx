'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Stats {
  total: number; published: number; draft: number; scheduled: number;
  pendingComments: number; totalViews: number;
}

interface RecentPost {
  id: string; title: string; status: string; created_at: string; view_count: number;
}

interface GenerationStatus {
  status: 'generating' | 'idle';
  topic?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export default function BlogDashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, draft: 0, scheduled: 0, pendingComments: 0, totalViews: 0 });
  const [recent, setRecent] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<GenerationStatus>({ status: 'idle' });
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [openTopics, setOpenTopics] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      // Generierungs-Status
      const statusRes = await fetch('/api/admin/settings?key=blog_generation_status');
      const statusData = await statusRes.json();
      if (statusData.value) {
        const parsed = typeof statusData.value === 'string' ? JSON.parse(statusData.value) : statusData.value;
        setGenStatus(parsed);
      }

      // Auto-Generierung aktiv?
      const settingsRes = await fetch('/api/admin/settings?key=blog_settings');
      const settingsData = await settingsRes.json();
      if (settingsData.value) {
        const parsed = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
        setAutoEnabled(!!parsed.auto_generate);
      }

      // Offene Themen zaehlen
      const topicsRes = await fetch('/api/admin/blog/auto-topics');
      const topicsData = await topicsRes.json();
      const open = (topicsData.topics ?? []).filter((t: { used: boolean }) => !t.used).length;
      setOpenTopics(open);
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

  const statCards = [
    { label: 'Gesamt', value: stats.total, color: '#e2e8f0' },
    { label: 'Live', value: stats.published, color: '#22c55e' },
    { label: 'Entwuerfe', value: stats.draft, color: '#f59e0b' },
    { label: 'Geplant', value: stats.scheduled, color: '#06b6d4' },
    { label: 'Kommentare', value: stats.pendingComments, color: '#ef4444' },
    { label: 'Views', value: stats.totalViews, color: '#a78bfa' },
  ];

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>Blog-Dashboard</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Uebersicht ueber alle Blog-Aktivitaeten</p>
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
              style={{ background: isGenerating ? '#22c55e' : autoEnabled ? '#f59e0b' : '#ef4444' }}
            />
            {isGenerating && (
              <div className="absolute inset-0 w-4 h-4 rounded-full animate-ping" style={{ background: '#22c55e', opacity: 0.4 }} />
            )}
          </div>

          {/* Status-Text */}
          <div className="flex-1 min-w-0">
            {isGenerating ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm" style={{ color: '#22c55e' }}>Generiert gerade...</span>
                  <span className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                </div>
                {genStatus.topic && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>Thema: {genStatus.topic}</p>
                )}
                {elapsedSeconds > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>Laeuft seit {elapsedSeconds} Sekunden</p>
                )}
              </>
            ) : autoEnabled ? (
              <>
                <span className="font-heading font-semibold text-sm" style={{ color: '#f59e0b' }}>Wartet auf naechsten Slot</span>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs" style={{ color: '#475569' }}>{openTopics} offene Themen im Pool</span>
                  {genStatus.finished_at && (
                    <span className="text-xs" style={{ color: '#475569' }}>
                      Letzter Lauf: {new Date(genStatus.finished_at).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
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
                      <span className="text-xs" style={{ color: '#475569' }}>{post.view_count} Views</span>
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
