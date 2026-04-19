'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface SocialAccount {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username?: string | null;
}

interface SocialPost {
  id: string;
  caption: string;
  status: string;
  platforms: string[];
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at: string;
}

interface GenStatus {
  status?: 'idle' | 'generating' | 'error';
  started_at?: string;
  last_success_at?: string;
  error?: string;
  entry_id?: string;
}

interface PlanCounts {
  planned: number;
  generated: number;
  reviewed: number;
  upcoming: Array<{ id: string; topic: string; scheduled_date: string; scheduled_time: string; status: string; reviewed: boolean }>;
}

export default function SocialDashboard() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<GenStatus>({});
  const [plan, setPlan] = useState<PlanCounts>({ planned: 0, generated: 0, reviewed: 0, upcoming: [] });
  const [autoEnabled, setAutoEnabled] = useState(true);

  async function loadStatus() {
    try {
      const [settingsRes, planRes] = await Promise.all([
        fetch('/api/admin/social/settings').then((r) => r.json()),
        fetch('/api/admin/social/editorial-plan').then((r) => r.json()),
      ]);
      const settings = settingsRes.settings ?? {};
      setAutoEnabled(settings.auto_generate !== false);

      // Gen-Status aus admin_settings laden (indirekt via API — einfacher: eigener endpoint waere besser, hier inline)
      // Vereinfacht: Wir holen nur das, was in editorial-plan sichtbar ist
      const planData = (planRes.plan ?? []) as Array<{ id: string; topic: string; scheduled_date: string; scheduled_time: string; status: string; reviewed: boolean; generated_at?: string }>;
      setPlan({
        planned: planData.filter((p) => p.status === 'planned').length,
        generated: planData.filter((p) => p.status === 'generated').length,
        reviewed: planData.filter((p) => p.status === 'reviewed' || (p.status === 'generated' && p.reviewed)).length,
        upcoming: planData.filter((p) => ['planned', 'generated', 'reviewed'].includes(p.status)).slice(0, 8),
      });

      // Check ob irgendein Eintrag in 'generating' ist — dann wird gerade generiert
      const isGenerating = planData.some((p) => p.status === 'generating');
      setGenStatus({ status: isGenerating ? 'generating' : 'idle' });
    } catch {
      // leer
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [accRes, postsRes] = await Promise.all([
        fetch('/api/admin/social/accounts').then((r) => r.json()),
        fetch('/api/admin/social/posts?limit=10').then((r) => r.json()),
      ]);
      setAccounts(accRes.accounts ?? []);
      setPosts(postsRes.posts ?? []);
      await loadStatus();
    } catch {
      // leer
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAccounts = accounts.length > 0;
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  const drafts = posts.filter((p) => p.status === 'draft');
  const published = posts.filter((p) => p.status === 'published');
  const failed = posts.filter((p) => p.status === 'failed');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <div className="flex items-start justify-between gap-3 mt-4 mb-1">
        <h1 className="text-2xl font-bold text-white">Social Media</h1>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-medium text-xs hover:bg-slate-700 border border-slate-700 disabled:opacity-50 flex items-center gap-1.5"
          title="Alle Daten neu laden"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Lädt…' : 'Neu laden'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Automatische Posts auf Facebook + Instagram.
      </p>

      {!loading && !hasAccounts && (
        <div className="mb-6 rounded-xl bg-amber-900/20 border border-amber-700/60 p-5">
          <h2 className="font-semibold text-amber-300 mb-1">Noch keine Konten verbunden</h2>
          <p className="text-sm text-amber-200/80 mb-3">
            Verbinde deine Facebook-Seite + Instagram Business Account, um loszulegen.
          </p>
          <Link
            href="/admin/social/einstellungen"
            className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500"
          >
            Jetzt verbinden
          </Link>
        </div>
      )}

      {/* Live-Ampel + KI-Bot-Status */}
      {hasAccounts && <KiBotStatus autoEnabled={autoEnabled} genStatus={genStatus} plan={plan} />}

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Veröffentlicht" value={published.length} color="emerald" />
        <KpiCard label="Geplant" value={scheduled.length} color="cyan" />
        <KpiCard label="Entwürfe" value={drafts.length} color="slate" />
        <KpiCard label="Fehlgeschlagen" value={failed.length} color="red" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Link href="/admin/social/neu" className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500">
          + Neuer Post
        </Link>
        <Link href="/admin/social/posts" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700 border border-slate-700">
          Alle Posts
        </Link>
        <Link href="/admin/social/redaktionsplan" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700 border border-slate-700">
          Redaktionsplan
        </Link>
      </div>

      {/* Verbundene Konten */}
      {hasAccounts && (
        <section className="mb-6">
          <h2 className="font-semibold text-white mb-3">Verbundene Konten</h2>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 text-sm text-slate-200">
                <span className="text-xs font-bold" style={{ color: a.platform === 'facebook' ? '#1877f2' : '#e4405f' }}>
                  {a.platform === 'facebook' ? 'FB' : 'IG'}
                </span>
                {a.name} {a.username && <span className="text-slate-500">@{a.username}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Letzte Posts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Letzte Posts</h2>
          <Link href="/admin/social/posts" className="text-sm text-cyan-400 hover:text-cyan-300">
            Alle anzeigen →
          </Link>
        </div>

        {loading && <p className="text-slate-400">Lade…</p>}

        {!loading && posts.length === 0 && (
          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
            <p className="text-slate-400">Noch keine Posts erstellt.</p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="space-y-2">
            {posts.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/admin/social/posts/${p.id}`}
                className="block p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 line-clamp-2">{p.caption || '(leer)'}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <StatusBadge status={p.status} />
                      <span>•</span>
                      <span>{(p.platforms ?? []).join(', ')}</span>
                      <span>•</span>
                      <span>
                        {p.published_at
                          ? fmtDateTime(p.published_at)
                          : p.scheduled_at
                          ? 'Geplant: ' + fmtDateTime(p.scheduled_at)
                          : fmtDateTime(p.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KiBotStatus({ autoEnabled, genStatus, plan }: { autoEnabled: boolean; genStatus: GenStatus; plan: PlanCounts }) {
  const generating = genStatus.status === 'generating';
  const error = genStatus.status === 'error';

  let light: 'green' | 'yellow' | 'red' = 'green';
  let label = 'KI-Bot aktiv';
  let detail = 'Wartet auf nächsten Plan-Eintrag';

  if (!autoEnabled) {
    light = 'red';
    label = 'Auto-Generierung deaktiviert';
    detail = 'Aktiviere unter Einstellungen → "Automatische Generierung aktiv"';
  } else if (error) {
    light = 'red';
    label = 'Fehler bei letzter Generierung';
    detail = genStatus.error ?? 'Unbekannt';
  } else if (generating) {
    light = 'yellow';
    label = 'KI generiert gerade';
    detail = 'Ein Post wird erstellt (3-stufiger Faktencheck läuft)';
  } else if (plan.planned > 0) {
    light = 'green';
    label = 'KI-Bot aktiv';
    detail = `${plan.planned} Einträge im Plan, nächste Generierung stündlich`;
  } else {
    light = 'yellow';
    label = 'Keine Einträge im Plan';
    detail = 'Leg Themen an oder importiere in den Redaktionsplan';
  }

  const colors = {
    green: { bg: 'rgba(22,163,74,0.1)', border: '#16a34a', dot: '#22c55e' },
    yellow: { bg: 'rgba(202,138,4,0.1)', border: '#ca8a04', dot: '#eab308' },
    red: { bg: 'rgba(220,38,38,0.1)', border: '#dc2626', dot: '#ef4444' },
  }[light];

  return (
    <section className="mb-6 rounded-xl p-4 border" style={{ background: colors.bg, borderColor: colors.border }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ background: colors.dot, animation: generating ? 'pulse 1.5s infinite' : undefined }} />
        <h2 className="font-semibold text-white">{label}</h2>
        <Link href="/admin/social/einstellungen" className="ml-auto text-xs text-slate-400 hover:text-slate-200">
          Einstellungen →
        </Link>
      </div>
      <p className="text-sm text-slate-300 mb-3">{detail}</p>

      {/* Mini-Stats Plan */}
      <div className="flex gap-4 text-xs">
        <span className="text-slate-400">Geplant: <strong className="text-slate-200">{plan.planned}</strong></span>
        <span className="text-slate-400">Generiert: <strong className="text-slate-200">{plan.generated}</strong></span>
        <span className="text-slate-400">Freigegeben: <strong className="text-slate-200">{plan.reviewed}</strong></span>
        <Link href="/admin/social/zeitplan" className="ml-auto text-cyan-400 hover:text-cyan-300">Zum Redaktionsplan →</Link>
      </div>

      {/* Upcoming */}
      {plan.upcoming.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Nächste Einträge</p>
          <ul className="space-y-1">
            {plan.upcoming.slice(0, 5).map((u) => (
              <li key={u.id} className="text-xs flex items-center gap-2">
                <span className="text-slate-500 w-24">{new Date(u.scheduled_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} {u.scheduled_time.slice(0, 5)}</span>
                <span className="text-slate-300 flex-1 truncate">{u.topic}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{u.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: 'emerald' | 'cyan' | 'slate' | 'red' }) {
  const colors = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    slate: 'text-slate-300',
    red: 'text-red-400',
  };
  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Entwurf', className: 'bg-slate-800 text-slate-300' },
    scheduled: { label: 'Geplant', className: 'bg-cyan-900/40 text-cyan-300' },
    publishing: { label: 'Wird veröffentlicht…', className: 'bg-amber-900/40 text-amber-300' },
    published: { label: 'Veröffentlicht', className: 'bg-emerald-900/40 text-emerald-300' },
    partial: { label: 'Teilweise', className: 'bg-amber-900/40 text-amber-300' },
    failed: { label: 'Fehler', className: 'bg-red-900/40 text-red-300' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-slate-800 text-slate-300' };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.className}`}>{cfg.label}</span>;
}
