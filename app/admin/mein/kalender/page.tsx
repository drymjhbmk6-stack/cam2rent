'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { PageHeader, Panel, Segmented, StatusChip, Button } from '@/components/admin/ui';
import type { ChipTone, TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Mein Kalender (privater Bereich, statisch, Juli 2026). */

const VIEWS: TabDef[] = [
  { key: 'monat', label: 'Monat', icon: CalendarDays },
  { key: 'liste', label: 'Liste', icon: List },
];

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HEUTE = 21;
const LEADING = 2; // Juli 2026 beginnt an einem Mittwoch (Mo-first)
const TAGE_IM_MONAT = 31;

type Termin = { tag: number; zeit?: string; titel: string; tone: ChipTone };

const TERMINE: Termin[] = [
  { tag: 3, zeit: '09:00', titel: 'Retoure C2R-2627-004 prüfen', tone: 'cyan' },
  { tag: 8, zeit: '11:30', titel: 'Übergabe Kai Röhlig', tone: 'emerald' },
  { tag: 15, titel: 'Wartung GoPro Hero 13', tone: 'amber' },
  { tag: 21, zeit: '14:00', titel: 'Team-Sync', tone: 'blue' },
  { tag: 24, titel: 'Firmware-Runde Q3', tone: 'rose' },
  { tag: 29, zeit: '10:00', titel: 'Telefonat Steuerberater', tone: 'cyan' },
];

const BAR: Record<ChipTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function MeinKalenderPage() {
  const [view, setView] = useState('monat');

  const cells: (number | null)[] = [
    ...Array.from({ length: LEADING }, () => null),
    ...Array.from({ length: TAGE_IM_MONAT }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const terminAm = (tag: number) => TERMINE.filter((t) => t.tag === tag);

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="Mein Kalender"
        subtitle="Deine persönlichen Termine mit Erinnerung."
        actions={<Button variant="primary" size="sm" icon={Plus}>Neuer Termin</Button>}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={ChevronLeft} />
          <span className="text-[13px] font-semibold text-slate-900 min-w-[110px] text-center">Juli 2026</span>
          <Button variant="ghost" size="sm" icon={ChevronRight} />
          <Button variant="secondary" size="sm" className="ml-1">Heute</Button>
        </div>
        <div className="ml-auto">
          <Segmented tabs={VIEWS} active={view} onChange={setView} />
        </div>
      </div>

      {view === 'monat' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200">
            {WOCHENTAGE.map((w) => (
              <div key={w} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-medium text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((tag, i) => {
              const heute = tag === HEUTE;
              const events = tag ? terminAm(tag) : [];
              return (
                <div
                  key={i}
                  className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 ${
                    tag === null ? 'bg-slate-50/40' : ''
                  } ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                >
                  {tag !== null && (
                    <div
                      className={`text-[11px] font-mono mb-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded ${
                        heute ? 'bg-white text-cyan-700 border border-cyan-400 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {tag}
                    </div>
                  )}
                  <div className="space-y-1">
                    {events.map((e, j) => (
                      <div
                        key={j}
                        className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${BAR[e.tone]}`}
                        title={`${e.zeit ? e.zeit + ' — ' : ''}${e.titel}`}
                      >
                        {e.zeit && <span className="font-mono opacity-70">{e.zeit} </span>}
                        {e.titel}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Panel title="Nächste Termine" noBody>
          <div className="divide-y divide-slate-100">
            {TERMINE.map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <div className="w-14 shrink-0 text-center">
                  <div className="text-[15px] font-mono font-semibold text-slate-900">{t.tag}.</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Juli</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-900 truncate">{t.titel}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{t.zeit ?? 'ganztägig'}</div>
                </div>
                <StatusChip tone={t.tone}>Termin</StatusChip>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
