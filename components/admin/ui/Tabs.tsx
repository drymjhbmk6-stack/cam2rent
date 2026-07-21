'use client';

import type { LucideIcon } from 'lucide-react';

/* cam2rent Admin 2.0 — Tabs & Segmented Control */

export type TabDef = { key: string; label: string; icon?: LucideIcon; count?: number };

/* Unterstrich-Tabs (Buchungsdetail, Kunden & Kommunikation, Katalog). */
export function Tabs({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`border-b border-slate-200 flex gap-1 overflow-x-auto ${className}`}>
      {tabs.map((t) => {
        const on = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              on ? 'border-cyan-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {Icon && <Icon size={14} />}
            {t.label}
            {t.count !== undefined && <span className="font-mono opacity-70">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

/* Segmented Control (Tagesgeschäft: Aufgaben/Belegung/Termine). */
export function Segmented({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden">
      {tabs.map((t, i) => {
        const on = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
              i > 0 ? 'border-l border-slate-200' : ''
            } ${on ? 'bg-cyan-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {Icon && <Icon size={14} />}
            {t.label}
            {t.count !== undefined && <span className="opacity-80">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
