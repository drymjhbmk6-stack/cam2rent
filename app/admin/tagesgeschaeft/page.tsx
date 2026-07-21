'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList, LayoutGrid, CalendarDays, Truck, ArrowLeftRight, Printer, Plus,
  Package, CheckCircle2, ArrowUp, ArrowDown,
} from 'lucide-react';
import { PageHeader, Panel, Segmented } from '@/components/admin/ui';
import { STATUS_GROUP, type StatusGroup } from '@/components/admin/ui';
import { QUEUE, type QueueTone } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Tagesgeschäft: Aufgaben · Belegung · Termine (statisch). */

const TTONE: Record<QueueTone, { bar: string; chip: string }> = {
  danger: { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  neutral: { bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const ICONS = { truck: Truck, return: ArrowLeftRight, open: ArrowLeftRight, label: Printer };

const AKTIONEN = [
  { label: 'Versand', icon: Truck, href: '/admin/versand', accent: true, badge: 2 },
  { label: 'Retouren', icon: ArrowLeftRight, href: '/admin/versand' },
  { label: 'Neue Buchung', icon: Plus, href: '/admin/buchungen/neu' },
  { label: 'Tracking', icon: Package, href: '/admin/sendungen' },
];

const TAGE = ['Sa 18', 'So 19', 'Mo 20', 'Di 21', 'Mi 22', 'Do 23', 'Fr 24', 'Sa 25', 'So 26', 'Mo 27', 'Di 28'];
const HEUTE = 3;
const BAR: Record<string, string> = {
  versand: 'bg-cyan-500 text-white border-cyan-600',
  draussen: 'bg-blue-500 text-white border-blue-600',
  rueck: 'bg-amber-400 text-amber-950 border-amber-500',
};
type GBar = { s: number; l: number; st: keyof typeof BAR; who?: string; ico?: 'up' | 'down' };
const GERAETE: { modell: string; sn: string; bars: GBar[] }[] = [
  { modell: 'GoPro Hero13', sn: '…615214', bars: [
    { s: 0, l: 1, st: 'draussen', who: 'Jungbluth' }, { s: 1, l: 1, st: 'rueck', ico: 'up' },
    { s: 2, l: 3, st: 'versand', ico: 'down' }, { s: 5, l: 4, st: 'draussen', who: 'Amreswar' }, { s: 9, l: 2, st: 'rueck', ico: 'up' }] },
  { modell: 'OSMO Action 5', sn: '…BRXRA', bars: [
    { s: 0, l: 3, st: 'draussen', who: 'Ostermann' }, { s: 3, l: 4, st: 'rueck', ico: 'up' }] },
  { modell: 'OSMO Action 5', sn: '…BG1DG', bars: [] },
  { modell: 'Insta360 X5', sn: '…E4UYH', bars: [] },
  { modell: 'DJI Osmo Nano', sn: '…C0U4Z', bars: [{ s: 0, l: 11, st: 'draussen', who: 'Vieler' }] },
];

const TERMINE: { tag: string; items: { t: string; g: StatusGroup; sub: string }[] }[] = [
  { tag: 'Di 21.07.', items: [{ t: 'OSMO Action 5 · J. Ostermann', g: 'draussen', sub: 'läuft' }, { t: 'DJI Osmo Nano · P. Vieler', g: 'draussen', sub: 'läuft' }] },
  { tag: 'Do 24.07.', items: [{ t: 'OSMO Action 5 · J. Ostermann', g: 'rueckweg', sub: 'Rückgabe' }] },
  { tag: 'So 27.07.', items: [{ t: 'GoPro Hero13 · Amreswar V.', g: 'versand', sub: 'Versand raus' }] },
];

export default function TagesgeschaeftPage() {
  const [view, setView] = useState('aufgaben');
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Tagesgeschäft" subtitle="4 Aufgaben offen · alles andere läuft." />

      <Segmented
        active={view}
        onChange={setView}
        tabs={[
          { key: 'aufgaben', label: 'Aufgaben', icon: ClipboardList },
          { key: 'belegung', label: 'Belegung', icon: LayoutGrid },
          { key: 'termine', label: 'Termine', icon: CalendarDays },
        ]}
      />

      {view === 'aufgaben' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {QUEUE.map((a, i) => {
              const t = TTONE[a.tone];
              const Ico = ICONS[a.icon];
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-lg overflow-hidden flex">
                  <span className={`w-1 ${t.bar}`} />
                  <div className="flex-1 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Ico size={13} className="text-slate-400" />
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.chip}`}>{a.when}</span>
                      <span className="ml-auto font-mono text-[11px] text-slate-400">{a.serial}</span>
                    </div>
                    <div className="font-medium text-slate-900">{a.modell}</div>
                    <div className="text-slate-500 text-[12px]">{a.kunde} · {a.zeit}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {a.checks.length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                          {a.checks.map((c) => (
                            <span key={c} className="flex items-center gap-0.5 text-[10px] text-emerald-600"><CheckCircle2 size={11} />{c}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Noch nicht geprüft</span>
                      )}
                      <Link
                        href={`/admin/buchungen/${a.id}`}
                        className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:border-cyan-400 hover:text-cyan-700 font-medium text-[12px]"
                        style={{ textDecoration: 'none' }}
                      >
                        <Ico size={12} />{a.action}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Panel title="Schnellaktionen" noBody>
            <div className="grid grid-cols-2 gap-2 p-2">
              {AKTIONEN.map((a) => {
                const I = a.icon;
                return (
                  <Link
                    key={a.label}
                    href={a.href}
                    className={`relative flex flex-col items-center gap-1.5 py-3 rounded border ${a.accent ? 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                    style={{ textDecoration: 'none' }}
                  >
                    {a.badge && <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold font-mono">{a.badge}</span>}
                    <I size={17} className={a.accent ? 'text-cyan-600' : 'text-slate-500'} />
                    <span className={`text-[11px] ${a.accent ? 'text-cyan-700' : 'text-slate-600'}`}>{a.label}</span>
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {view === 'belegung' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
            <Legend cls={BAR.versand} t="Versand" /><Legend cls={BAR.draussen} t="Kunde" /><Legend cls={BAR.rueck} t="Rückweg" />
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-emerald-300 bg-emerald-50" />Frei</span>
            <span className="ml-auto flex items-center gap-1"><ArrowDown size={12} className="text-cyan-600" />Hin<ArrowUp size={12} className="text-amber-600" />Rück</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="flex border-b border-slate-200">
                <div className="w-40 shrink-0 border-r border-slate-200" />
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${TAGE.length},minmax(0,1fr))` }}>
                  {TAGE.map((d, i) => (
                    <div key={d} className={`text-center py-2 font-mono text-[10px] border-r border-slate-100 last:border-0 ${i === HEUTE ? 'bg-cyan-50 text-cyan-800 font-semibold' : 'text-slate-400'}`}>{d}</div>
                  ))}
                </div>
              </div>
              {GERAETE.map((g, gi) => (
                <div key={gi} className="flex border-b border-slate-100 last:border-0">
                  <div className="w-40 shrink-0 px-3 py-2 border-r border-slate-200 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="truncate text-slate-700 text-[12px]">{g.modell}</span>
                    <span className="font-mono text-[9px] text-slate-400 ml-auto">{g.sn}</span>
                  </div>
                  <div className="flex-1 relative grid items-center py-1.5" style={{ gridTemplateColumns: `repeat(${TAGE.length},minmax(0,1fr))` }}>
                    {TAGE.map((_, i) => (
                      <div key={i} className={`h-full border-r border-slate-100 last:border-0 ${i === HEUTE ? 'bg-cyan-50/70' : ''}`} style={{ gridColumn: i + 1, gridRow: 1 }} />
                    ))}
                    {g.bars.map((b, bi) => (
                      <div key={bi} style={{ gridColumn: `${b.s + 1} / span ${b.l}`, gridRow: 1 }} className={`z-[1] mx-0.5 h-6 rounded border flex items-center justify-center gap-1 px-1.5 overflow-hidden ${BAR[b.st]}`}>
                        {b.ico === 'down' && <ArrowDown size={12} className="shrink-0" />}
                        {b.ico === 'up' && <ArrowUp size={12} className="shrink-0" />}
                        {b.who && <span className="text-[11px] font-medium truncate">{b.who}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-slate-500 text-[12px]">Die zweite OSMO (…BG1DG) und die X5 sind ab heute komplett frei.</p>
        </div>
      )}

      {view === 'termine' && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
            {(Object.keys(STATUS_GROUP) as StatusGroup[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${STATUS_GROUP[k].dot}`} />{STATUS_GROUP[k].label}</span>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TERMINE.map((d, i) => (
              <Panel key={i} title={<span className="flex items-center gap-2"><CalendarDays size={13} className="text-slate-500" /><span className="font-mono">{d.tag}</span></span>} noBody>
                <div className="divide-y divide-slate-100">
                  {d.items.map((it, j) => (
                    <div key={j} className="flex items-center gap-2.5 px-3 py-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_GROUP[it.g].dot}`} />
                      <span className="truncate flex-1 text-slate-700 text-[12px]">{it.t}</span>
                      <span className="text-slate-400 text-[10px] shrink-0">{it.sub}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ cls, t }: { cls: string; t: string }) {
  return <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm border ${cls}`} />{t}</span>;
}
