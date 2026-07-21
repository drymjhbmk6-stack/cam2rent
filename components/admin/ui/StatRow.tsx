import type { ReactNode } from 'react';

/* cam2rent Admin 2.0 — Stat-Zeilen (ersetzen KPI-Kachelwände)
   Nullwerte grau + ruhig, nur relevante Werte farbig. */

export type StatTone = 'default' | 'zero' | 'accent' | 'danger' | 'strong';

const VAL: Record<StatTone, string> = {
  default: 'text-slate-900 text-[16px]',
  zero: 'text-slate-300 text-[15px]',
  accent: 'text-cyan-600 text-[16px]',
  danger: 'text-rose-600 text-[16px]',
  strong: 'text-emerald-600 text-[17px]',
};

export type StatItem = { value: ReactNode; label: string; tone?: StatTone };
export type StatGroup = { label: string; items: StatItem[] };

/* Mehrere Gruppen als schlanke Zeilen in einem Panel. */
export function StatRows({ groups }: { groups: StatGroup[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
      {groups.map((row) => (
        <div key={row.label} className="px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">{row.label}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {row.items.map((it) => (
              <div key={it.label} className="flex items-baseline gap-1.5">
                <span className={`font-mono font-semibold ${VAL[it.tone ?? 'default']}`}>{it.value}</span>
                <span className={`text-[11px] ${it.tone === 'zero' ? 'text-slate-300' : 'text-slate-500'}`}>
                  {it.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* Einzelne kleine Stat-Karte (z.B. Inventar/Schäden-Kennzahlen). */
export function MiniStat({
  value,
  label,
  tone = 'default',
}: {
  value: ReactNode;
  label: string;
  tone?: 'default' | 'accent' | 'emerald' | 'amber' | 'rose';
}) {
  const color =
    tone === 'accent'
      ? 'text-cyan-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : tone === 'amber'
          ? 'text-amber-600'
          : tone === 'rose'
            ? 'text-rose-600'
            : 'text-slate-800';
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-baseline gap-2">
      <span className={`font-mono font-bold text-lg ${color}`}>{value}</span>
      <span className="text-slate-500 text-[11px]">{label}</span>
    </div>
  );
}
