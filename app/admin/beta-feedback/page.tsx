'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Feedback {
  id: string;
  tester_name: string | null;
  tester_email: string | null;
  wants_gutschein: boolean;
  answers: Record<string, unknown>;
  user_agent: string | null;
  created_at: string;
}

const STAR_QUESTIONS = [
  { id: 'q_design', label: 'Design' },
  { id: 'q_trust', label: 'Vertrauen' },
  { id: 'q_nav_ease', label: 'Navigation' },
  { id: 'q_product_info', label: 'Produktinfos' },
  { id: 'q_booking_ease', label: 'Buchung' },
  { id: 'q_texts', label: 'Texte' },
];

export default function BetaFeedbackAdmin() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/beta-feedback')
      .then((r) => r.json())
      .then((d) => setFeedbacks(d.feedbacks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Durchschnitte berechnen
  function avgStar(qid: string): number {
    const vals = feedbacks.map((f) => f.answers?.[qid]).filter((v) => typeof v === 'number') as number[];
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  }

  // NPS berechnen
  function calcNPS(): { score: number; promoters: number; passives: number; detractors: number } {
    const vals = feedbacks.map((f) => f.answers?.q_recommend).filter((v) => typeof v === 'number') as number[];
    if (vals.length === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0 };
    const promoters = vals.filter((v) => v >= 9).length;
    const detractors = vals.filter((v) => v <= 6).length;
    const passives = vals.length - promoters - detractors;
    const score = Math.round(((promoters - detractors) / vals.length) * 100);
    return { score, promoters, passives, detractors };
  }

  // Choice-Auswertung
  function choiceStats(qid: string): { option: string; count: number; pct: number }[] {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const f of feedbacks) {
      const val = f.answers?.[qid];
      if (typeof val === 'string') { counts[val] = (counts[val] ?? 0) + 1; total++; }
      if (Array.isArray(val)) { for (const v of val) { counts[v] = (counts[v] ?? 0) + 1; total++; } }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([option, count]) => ({ option, count, pct: total > 0 ? Math.round((count / feedbacks.length) * 100) : 0 }));
  }

  const nps = calcNPS();

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <AdminBackLink label="Zurück" />
      <h1 className="font-heading font-bold text-2xl text-white mb-2">Beta-Feedback Auswertung</h1>
      <p className="text-sm text-slate-400 mb-8">{feedbacks.length} Feedback{feedbacks.length !== 1 ? 's' : ''} erhalten</p>

      {feedbacks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">Noch kein Feedback erhalten.</div>
      ) : (
        <>
          {/* Übersicht */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <p className="text-xs text-slate-400 font-heading uppercase tracking-wider mb-1">Feedbacks</p>
              <p className="text-2xl font-heading font-bold text-white">{feedbacks.length}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <p className="text-xs text-slate-400 font-heading uppercase tracking-wider mb-1">NPS Score</p>
              <p className={`text-2xl font-heading font-bold ${nps.score >= 50 ? 'text-green-400' : nps.score >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{nps.score}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <p className="text-xs text-slate-400 font-heading uppercase tracking-wider mb-1">Gutschein gewünscht</p>
              <p className="text-2xl font-heading font-bold text-cyan-400">{feedbacks.filter((f) => f.wants_gutschein).length}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <p className="text-xs text-slate-400 font-heading uppercase tracking-wider mb-1">Durchschn. Design</p>
              <p className="text-2xl font-heading font-bold text-white">{avgStar('q_design')} ★</p>
            </div>
          </div>

          {/* Sterne-Durchschnitte */}
          <div className="rounded-xl overflow-hidden mb-8" style={{ background: '#111827', border: '1px solid #1e293b' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
              <h2 className="font-heading font-bold text-sm text-white">Bewertungen (Durchschnitt)</h2>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {STAR_QUESTIONS.map((q) => {
                const avg = avgStar(q.id);
                return (
                  <div key={q.id}>
                    <p className="text-xs text-slate-400 mb-1">{q.label}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-heading font-bold text-white">{avg}</span>
                      <span className="text-amber-400">{'★'.repeat(Math.round(avg))}{'☆'.repeat(5 - Math.round(avg))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NPS Aufschlüsselung */}
          <div className="rounded-xl overflow-hidden mb-8" style={{ background: '#111827', border: '1px solid #1e293b' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
              <h2 className="font-heading font-bold text-sm text-white">NPS — Net Promoter Score</h2>
            </div>
            <div className="p-5 flex gap-6">
              <div className="text-center">
                <p className="text-xs text-green-400 mb-1">Promoter (9-10)</p>
                <p className="text-xl font-bold text-white">{nps.promoters}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-amber-400 mb-1">Passiv (7-8)</p>
                <p className="text-xl font-bold text-white">{nps.passives}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-red-400 mb-1">Kritiker (0-6)</p>
                <p className="text-xl font-bold text-white">{nps.detractors}</p>
              </div>
            </div>
          </div>

          {/* Choice-Fragen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {[
              { id: 'q_first_feeling', label: 'Erster Eindruck' },
              { id: 'q_pricing', label: 'Preisempfinden' },
              { id: 'q_mobile', label: 'Geräte' },
              { id: 'q_missing_info', label: 'Fehlende Infos' },
            ].map((q) => {
              const stats = choiceStats(q.id);
              return (
                <div key={q.id} className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
                  <p className="text-xs text-slate-400 font-heading uppercase tracking-wider mb-3">{q.label}</p>
                  <div className="space-y-2">
                    {stats.map((s) => (
                      <div key={s.option}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-slate-300 truncate">{s.option}</span>
                          <span className="text-slate-500">{s.pct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Einzelne Feedbacks */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#111827', border: '1px solid #1e293b' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
              <h2 className="font-heading font-bold text-sm text-white">Alle Feedbacks</h2>
            </div>
            <div className="divide-y divide-[#1e293b]">
              {feedbacks.map((f) => (
                <div key={f.id}>
                  <button onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-heading font-semibold text-white">{f.tester_name || 'Anonym'}</span>
                      {f.tester_email && <span className="text-xs text-slate-500">{f.tester_email}</span>}
                      {f.wants_gutschein && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400">Gutschein</span>}
                    </div>
                    <span className="text-xs text-slate-500">{new Date(f.created_at).toLocaleDateString('de-DE')}</span>
                  </button>
                  {expandedId === f.id && (
                    <div className="px-5 pb-4">
                      <pre className="text-xs text-slate-400 bg-black/30 rounded-lg p-3 overflow-auto max-h-60">
                        {JSON.stringify(f.answers, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
