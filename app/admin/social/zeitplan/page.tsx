'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface PlanEntry {
  id: string;
  topic: string;
  angle?: string | null;
  prompt?: string | null;
  keywords: string[];
  category?: string | null;
  platforms: string[];
  with_image: boolean;
  scheduled_date: string;
  scheduled_time: string;
  sort_order: number;
  status: 'planned' | 'generating' | 'generated' | 'reviewed' | 'published' | 'skipped' | 'failed';
  reviewed: boolean;
  reviewed_at?: string | null;
  generated_at?: string | null;
  published_at?: string | null;
  post_id?: string | null;
  post?: { id: string; caption: string; status: string; published_at?: string | null } | null;
  series?: { id: string; title: string } | null;
  series_part?: { id: string; part_number: number; topic: string } | null;
  error_message?: string | null;
}

interface Topic {
  id: string;
  topic: string;
  angle?: string | null;
  keywords: string[];
  category?: string | null;
  platforms: string[];
  with_image: boolean;
  used: boolean;
}

interface Series {
  id: string;
  title: string;
  parts: Array<{ id: string; part_number: number; topic: string; angle?: string | null; keywords: string[]; used: boolean }>;
}

export default function ZeitplanPage() {
  const [plan, setPlan] = useState<PlanEntry[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [importDate, setImportDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().split('T')[0];
  });
  const [importTime, setImportTime] = useState('10:00');

  async function loadAll() {
    const [planRes, topicsRes, seriesRes] = await Promise.all([
      fetch('/api/admin/social/editorial-plan').then((r) => r.json()),
      fetch('/api/admin/social/topics').then((r) => r.json()),
      fetch('/api/admin/social/series').then((r) => r.json()),
    ]);
    setPlan(planRes.plan ?? []);
    setTopics((topicsRes.topics ?? []).filter((t: Topic) => !t.used));
    setSeries(seriesRes.series ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function importTopic(topic: Topic) {
    await fetch('/api/admin/social/editorial-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic.topic,
        angle: topic.angle,
        keywords: topic.keywords,
        category: topic.category,
        platforms: topic.platforms,
        with_image: topic.with_image,
        scheduled_date: importDate,
        scheduled_time: importTime,
        from_topic_id: topic.id,
      }),
    });
    // naechsten Tag erhöhen fuer schnelles Bulk-Importieren
    const d = new Date(importDate);
    d.setDate(d.getDate() + 1);
    setImportDate(d.toISOString().split('T')[0]);
    loadAll();
  }

  async function importSeriesPart(seriesId: string, seriesTitle: string, part: Series['parts'][0]) {
    await fetch('/api/admin/social/editorial-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: `${seriesTitle} — Teil ${part.part_number}: ${part.topic}`,
        angle: part.angle,
        keywords: part.keywords,
        platforms: ['facebook', 'instagram'],
        with_image: true,
        series_id: seriesId,
        series_part_id: part.id,
        scheduled_date: importDate,
        scheduled_time: importTime,
      }),
    });
    loadAll();
  }

  async function toggleReviewed(entry: PlanEntry) {
    await fetch(`/api/admin/social/editorial-plan/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: !entry.reviewed }),
    });
    loadAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Plan-Eintrag wirklich löschen?')) return;
    await fetch(`/api/admin/social/editorial-plan/${id}`, { method: 'DELETE' });
    loadAll();
  }

  async function skipEntry(id: string) {
    await fetch(`/api/admin/social/editorial-plan/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    loadAll();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mt-4 mb-4">Redaktionsplan</h1>
      <p className="text-sm text-slate-400 mb-6">
        Konkreter Plan mit Datum und Uhrzeit. Cron generiert Posts 2 Tage vorher, du gibst sie frei (im Semi-Modus), Cron veröffentlicht zur Uhrzeit.
      </p>

      {loading && <p className="text-slate-400">Lade…</p>}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linke Spalte: Pool + Serien */}
          <div className="lg:col-span-1 space-y-6">
            {/* Import-Datum */}
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <h2 className="font-semibold text-white mb-3 text-sm">Importieren am</h2>
              <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
                className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
              <input type="time" value={importTime} onChange={(e) => setImportTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
              <p className="text-xs text-slate-500 mt-2">
                Nach jedem Import zaehlt das Datum +1 Tag. Ideal fuer Bulk-Einplanen.
              </p>
            </div>

            {/* Offene Themen */}
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <h2 className="font-semibold text-white mb-3 text-sm">Offene Themen ({topics.length})</h2>
              {topics.length === 0 && <p className="text-xs text-slate-500">Keine offenen Themen im Pool.</p>}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {topics.map((t) => (
                  <div key={t.id} className="p-2 rounded bg-slate-950/50 border border-slate-800">
                    <p className="text-sm text-slate-200 line-clamp-2">{t.topic}</p>
                    <button type="button" onClick={() => importTopic(t)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 mt-1">+ In Plan</button>
                  </div>
                ))}
              </div>
              <Link href="/admin/social/themen" className="text-xs text-slate-400 hover:text-slate-200 mt-3 block">
                → Themen verwalten
              </Link>
            </div>

            {/* Serien */}
            {series.length > 0 && (
              <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
                <h2 className="font-semibold text-white mb-3 text-sm">Serien</h2>
                <div className="space-y-3">
                  {series.map((s) => {
                    const openParts = s.parts.filter((p) => !p.used);
                    if (openParts.length === 0) return null;
                    return (
                      <div key={s.id}>
                        <p className="text-xs text-slate-300 font-semibold mb-1">{s.title}</p>
                        {openParts.map((p) => (
                          <div key={p.id} className="p-2 rounded bg-slate-950/50 border border-slate-800 mb-1">
                            <p className="text-xs text-slate-200">Teil {p.part_number}: {p.topic}</p>
                            <button type="button" onClick={() => importSeriesPart(s.id, s.title, p)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 mt-0.5">+ In Plan</button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Rechte Spalte: Plan */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Geplante Posts ({plan.length})</h2>
            </div>

            {plan.length === 0 && (
              <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
                <p className="text-slate-400">Noch keine Einträge. Leg links Themen an oder importiere aus dem Pool.</p>
              </div>
            )}

            <div className="space-y-2">
              {plan.map((entry) => (
                <PlanRow key={entry.id} entry={entry}
                  onToggleReviewed={() => toggleReviewed(entry)}
                  onDelete={() => deleteEntry(entry.id)}
                  onSkip={() => skipEntry(entry.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanRow({ entry, onToggleReviewed, onDelete, onSkip }: {
  entry: PlanEntry;
  onToggleReviewed: () => void;
  onDelete: () => void;
  onSkip: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusColor: Record<string, string> = {
    planned: 'bg-slate-800 text-slate-300',
    generating: 'bg-amber-900/40 text-amber-300 animate-pulse',
    generated: 'bg-cyan-900/40 text-cyan-300',
    reviewed: 'bg-emerald-900/40 text-emerald-300',
    published: 'bg-emerald-900/60 text-emerald-200',
    skipped: 'bg-slate-800 text-slate-500',
    failed: 'bg-red-900/40 text-red-300',
  };
  const statusLabel: Record<string, string> = {
    planned: 'Geplant',
    generating: 'Wird generiert',
    generated: 'Generiert',
    reviewed: 'Freigegeben',
    published: 'Veröffentlicht',
    skipped: 'Übersprungen',
    failed: 'Fehler',
  };

  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 px-2 py-1 text-center min-w-[60px]">
            <p className="text-[10px] text-slate-500 uppercase">{new Date(entry.scheduled_date).toLocaleDateString('de-DE', { month: 'short' })}</p>
            <p className="text-lg font-bold text-slate-200 leading-none">{new Date(entry.scheduled_date).getDate()}</p>
            <p className="text-[10px] text-slate-500">{entry.scheduled_time.slice(0, 5)}</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor[entry.status]}`}>{statusLabel[entry.status]}</span>
            {entry.reviewed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300">✓ gesehen</span>}
            {entry.series && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">Serie</span>}
            <span className="text-[10px] text-slate-500">{entry.platforms.map((p) => (p === 'facebook' ? 'FB' : 'IG')).join(' + ')}</span>
          </div>
          <p className="text-sm text-slate-200 font-medium">{entry.topic}</p>
          {entry.angle && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{entry.angle}</p>}

          {/* Generierter Post-Preview */}
          {entry.post && (
            <div className="mt-2 p-2 rounded bg-slate-950/50 border border-slate-800">
              <p className="text-xs text-slate-400 mb-1">Generierter Post:</p>
              <p className="text-xs text-slate-300 line-clamp-2">{entry.post.caption}</p>
              <Link href={`/admin/social/posts/${entry.post.id}`} className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 inline-block">
                → Bearbeiten
              </Link>
            </div>
          )}

          {entry.error_message && (
            <p className="text-xs text-red-400 mt-1">⚠ {entry.error_message}</p>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col gap-1 items-end">
          {entry.status === 'generated' && (
            <button type="button" onClick={onToggleReviewed}
              className="text-xs text-emerald-400 hover:text-emerald-300" title="Als gesehen markieren — erst dann wird im Semi-Modus veröffentlicht">
              {entry.reviewed ? '✓ gesehen' : 'Als gesehen markieren'}
            </button>
          )}
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-xs text-slate-400 hover:text-slate-200">
            {expanded ? 'Weniger' : 'Mehr'}
          </button>
          {entry.status !== 'published' && entry.status !== 'skipped' && (
            <>
              <button type="button" onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-200">Überspringen</button>
              <button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">Löschen</button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-800 pt-2 text-xs text-slate-400 space-y-1">
          {entry.keywords.length > 0 && (
            <div><strong className="text-slate-500">Keywords:</strong> {entry.keywords.join(', ')}</div>
          )}
          {entry.category && <div><strong className="text-slate-500">Kategorie:</strong> {entry.category}</div>}
          {entry.prompt && <div><strong className="text-slate-500">KI-Prompt:</strong> <span className="text-slate-300 whitespace-pre-wrap">{entry.prompt}</span></div>}
          {entry.generated_at && <div>Generiert: {fmtDateTime(entry.generated_at)}</div>}
          {entry.published_at && <div>Veröffentlicht: {fmtDateTime(entry.published_at)}</div>}
        </div>
      )}
    </div>
  );
}
