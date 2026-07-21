'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader, Panel, Tabs, Button } from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Themen &amp; Serien (statisch). */

type Topic = { id: string; thema: string; kategorie: string; keywords: string[]; used: boolean };
type Serie = { id: string; name: string; teil: number; gesamt: number };

const TOPICS: Topic[] = [
  { id: 't1', thema: 'Die richtige Action-Cam für Wassersport', kategorie: 'Tipp', keywords: ['wassersport', 'wasserdicht', 'tauchen'], used: false },
  { id: 't2', thema: 'Wintersport-Aufnahmen: worauf achten?', kategorie: 'Tipp', keywords: ['ski', 'schnee', 'kälte'], used: false },
  { id: 't3', thema: 'GoPro Hero 13 im Praxis-Test', kategorie: 'Produkt', keywords: ['gopro', 'test', 'review'], used: true },
  { id: 't4', thema: 'Kundenstory: Roadtrip durch die Alpen', kategorie: 'Community', keywords: ['reisen', 'roadtrip', 'ugc'], used: false },
  { id: 't5', thema: 'Zubehör, das jeder Vlogger braucht', kategorie: 'Inspiration', keywords: ['vlog', 'zubehör', 'stativ'], used: false },
];

const KAT_TONE: Record<string, string> = {
  Tipp: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Produkt: 'bg-blue-50 text-blue-700 border-blue-200',
  Community: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Inspiration: 'bg-amber-50 text-amber-700 border-amber-200',
};

const SERIEN: Serie[] = [
  { id: 's1', name: 'Kamera-Kaufberatung', teil: 2, gesamt: 5 },
  { id: 's2', name: 'Zubehör-Guide', teil: 1, gesamt: 4 },
  { id: 's3', name: 'Reise-Inspiration 2026', teil: 4, gesamt: 6 },
];

const TABS: TabDef[] = [
  { key: 'themen', label: 'Einzelthemen', count: TOPICS.length },
  { key: 'serien', label: 'Serien', count: SERIEN.length },
];

export default function SocialThemenPage() {
  const [tab, setTab] = useState('themen');

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Themen &amp; Serien"
        subtitle="Themenpool für die KI-Generierung — Einzelthemen und mehrteilige Serien."
        actions={<Button variant="primary" size="sm" icon={Plus}>{tab === 'serien' ? 'Serie anlegen' : 'Thema hinzufügen'}</Button>}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'themen' && (
        <Panel noBody>
          <div className="divide-y divide-slate-100">
            {TOPICS.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-slate-800">{t.thema}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${KAT_TONE[t.kategorie] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{t.kategorie}</span>
                    {t.used && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">verwendet</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.keywords.map((k) => (
                      <span key={k} className="font-mono text-[10px] text-slate-400">#{k}</span>
                    ))}
                  </div>
                </div>
                <button className="text-[11px] text-slate-400 hover:text-rose-600">Löschen</button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'serien' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SERIEN.map((s) => {
            const pct = Math.round((s.teil / s.gesamt) * 100);
            return (
              <Panel key={s.id}>
                <div className="font-medium text-slate-800 text-[13px]">{s.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5 mb-2">Teil {s.teil} / {s.gesamt}</div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
