import type { ReactNode } from 'react';

/* cam2rent Admin 2.0 — Panel & Layout-Primitive
   Weiße Box, slate-200 Rand, rounded-lg. Header-Zeile mit Uppercase-Label. */

export function Panel({
  title,
  right,
  children,
  className = '',
  bodyClassName,
  noBody,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  noBody?: boolean;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${className}`}>
      {title !== undefined && (
        <div className="flex items-center gap-2 px-3 h-9 border-b border-slate-200">
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{title}</h2>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </div>
      )}
      {noBody ? children : <div className={bodyClassName ?? 'p-3'}>{children}</div>}
    </section>
  );
}

/* Seitenkopf: H1 + Untertitel + optionale Aktion rechts. Auf jedem Screen. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <div className="flex items-baseline gap-3 flex-wrap min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 text-[13px]">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* Kleiner Key/Value-Block (Label oben, Wert unten) für Datenraster. */
export function KVBlock({
  k,
  v,
  accent,
  mono,
}: {
  k: string;
  v: ReactNode;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">{k}</div>
      <div className={`${accent ? 'text-cyan-700' : 'text-slate-800'} ${mono ? 'font-mono text-[11px]' : ''}`}>{v}</div>
    </div>
  );
}
