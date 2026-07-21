'use client';

import { useState, Fragment } from 'react';
import { PageHeader, Segmented } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Verfügbarkeit (Gantt, statisch). */

const TAGE = ['Do 23', 'Fr 24', 'Sa 25', 'So 26', 'Mo 27', 'Di 28', 'Mi 29'];
const HEUTE = 1;

const SETS = [
  { cam: 'GoPro Hero13 Black', rows: [
    { name: 'Basic Set', badges: [] as string[], bel: [0, 0, 0, 0, 0, 0, 0] },
    { name: 'Motorrad Set', badges: ['Beliebt'], bel: [0, 1, 1, 1, 1, 0, 0] },
    { name: 'Taucher Set', badges: ['Wasserdicht'], bel: [0, 0, 0, 0, 0, 0, 0] },
    { name: 'Allrounder Set', badges: ['Komplett'], bel: [0, 0, 0, 0, 0, 0, 0] },
  ] },
  { cam: 'OSMO Action 5 Pro', rows: [
    { name: 'Basic Set', badges: [], bel: [1, 1, 0, 0, 0, 0, 0] },
    { name: 'Vlogging Set', badges: [], bel: [0, 0, 0, 0, 0, 0, 0] },
  ] },
  { cam: 'DJI Osmo Nano 128 GB', rows: [
    { name: 'Basic Set', badges: [], bel: [1, 1, 1, 1, 1, 1, 1] },
  ] },
];

export default function VerfuegbarkeitPage() {
  const [tab, setTab] = useState('sets');
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Verfügbarkeit" subtitle="Einzelkamera-Tracking mit Gantt-Kalender." />

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'kameras', label: 'Kameras', count: 4 },
            { key: 'sets', label: 'Sets', count: 18 },
            { key: 'zubehoer', label: 'Zubehör', count: 34 },
          ]}
        />
        <div className="flex items-center gap-3 text-[11px] text-slate-500 ml-auto">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/70" />Frei</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" />Gebucht</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" />Teilweise</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="flex border-b border-slate-200">
            <div className="w-52 shrink-0 px-3 py-2 border-r border-slate-200 text-[11px] uppercase tracking-wider text-cyan-700 font-semibold">
              {tab === 'sets' ? 'Set' : tab === 'kameras' ? 'Kamera' : 'Zubehör'}
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${TAGE.length},minmax(0,1fr))` }}>
              {TAGE.map((d, i) => (
                <div key={d} className={`text-center py-2 font-mono text-[11px] border-r border-slate-100 last:border-0 ${i === HEUTE ? 'text-cyan-700 font-semibold' : 'text-slate-400'}`}>{d}</div>
              ))}
            </div>
          </div>
          {SETS.map((grp, gi) => (
            <Fragment key={gi}>
              <div className="px-3 py-1.5 bg-slate-100 text-[12px] font-semibold text-slate-700 border-b border-slate-200">
                {grp.cam} <span className="text-slate-400 font-normal">({grp.rows.length} Sets)</span>
              </div>
              {grp.rows.map((r, ri) => (
                <div key={ri} className="flex border-b border-slate-100 last:border-0">
                  <div className="w-52 shrink-0 px-3 py-2 border-r border-slate-200">
                    <div className="text-[12px] font-medium text-slate-900">{r.name}</div>
                    {r.badges.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {r.badges.map((b) => <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{b}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${TAGE.length},minmax(0,1fr))` }}>
                    {r.bel.map((b, bi) => (
                      <div key={bi} className={`h-9 border-r border-white/40 last:border-0 grid place-items-center text-[10px] font-mono text-white ${b === 1 ? 'bg-blue-500' : 'bg-emerald-500/25'}`}>{b === 1 ? '1' : ''}</div>
                    ))}
                  </div>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-slate-500 text-[12px]">Grün = frei, Blau = gebucht. Auf einen Blick, welches Set wann buchbar ist.</p>
    </div>
  );
}
