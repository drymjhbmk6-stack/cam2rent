import React from 'react';

/**
 * Geteilte Skeleton-Bausteine für Admin-Ladezustände (Schritt 3 der
 * Admin-Modernisierung). Ersetzen das bisherige „Lädt…"/Spinner-Rendering durch
 * strukturierte Platzhalter → wirkt schneller/ruhiger.
 *
 * Rein präsentational. Nutzt die theme-aware `.animate-shimmer`-Klasse
 * (app/globals.css → `.admin-dark .animate-shimmer` folgt Light/Dark) sowie die
 * `brand-*`/`bg-white`-Klassen, die der `.admin-dark`-Layer auf die Admin-Tokens
 * mappt. Wird ausschließlich innerhalb des Admin-Shells (`.admin-dark`) genutzt.
 */

/** Ein einzelner Shimmer-Block. */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-shimmer rounded ${className}`} style={style} aria-hidden="true" />;
}

/**
 * Tabellen-Skeleton in derselben Karten-Optik wie die echten Admin-Listen.
 * `rows` = Anzahl Platzhalter-Zeilen. `a11y`: als Live-Region ausgezeichnet.
 * `bare` = ohne eigene Karte/Kopfzeile rendern — für Einsatz INNERHALB einer
 * schon vorhandenen Karte (z.B. inline-gestylte Seiten wie /admin/kunden).
 */
export function TableSkeleton({
  rows = 8,
  className = '',
  bare = false,
}: {
  rows?: number;
  className?: string;
  bare?: boolean;
}) {
  const body = (
    <div className="divide-y divide-brand-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: 220 }} />
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-20 hidden lg:block" />
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );

  if (bare) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className={className}>
        <span className="sr-only">Wird geladen…</span>
        {body}
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-brand-border overflow-hidden ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Wird geladen…</span>
      <div className="px-5 py-3 border-b border-brand-border">
        <Skeleton className="h-3 w-32" />
      </div>
      {body}
    </div>
  );
}
