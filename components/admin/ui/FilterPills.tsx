'use client';

/* cam2rent Admin 2.0 — Filter-Pills (ersetzen Status-Kachelwände)
   Kompakte, umschaltbare Pills mit optionalem Count. Aktiv = dunkel/cyan. */

export type PillTone = 'slate' | 'cyan' | 'blue' | 'rose' | 'emerald' | 'amber';

const ON: Record<PillTone, string> = {
  slate: 'bg-slate-800 text-white border-slate-800',
  cyan: 'bg-cyan-500 text-white border-cyan-500',
  blue: 'bg-blue-500 text-white border-blue-500',
  rose: 'bg-rose-500 text-white border-rose-500',
  emerald: 'bg-emerald-500 text-white border-emerald-500',
  amber: 'bg-amber-500 text-white border-amber-500',
};
const OFF: Record<PillTone, string> = {
  slate: 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:border-cyan-300',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-300',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-300',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300',
};

export type PillDef = {
  key: string;
  label: string;
  count?: number;
  tone?: PillTone;
};

export function FilterPills({
  pills,
  active,
  onChange,
  className = '',
}: {
  pills: PillDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      {pills.map((p) => {
        const tone = p.tone ?? 'slate';
        const on = active === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              on ? ON[tone] : OFF[tone]
            }`}
          >
            {p.label}
            {p.count !== undefined && <span className="font-mono opacity-70">{p.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
