'use client';

import { useEffect, useState } from 'react';

// Schlichte Besucherzähler-Anzeige für die Startseite. Liest den cookielosen
// Gesamtzähler aus /api/visit (consent-unabhängig). Versteckt sich, solange
// keine Zahl geladen ist (oder Migration ausstehend → total 0).
export default function VisitorCounter() {
  const [total, setTotal] = useState<number | null>(null);
  const [today, setToday] = useState<number>(0);

  useEffect(() => {
    fetch('/api/visit')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.total === 'number') setTotal(d.total);
        if (typeof d?.today === 'number') setToday(d.today);
      })
      .catch(() => {});
  }, []);

  if (!total) return null;

  return (
    <section className="bg-white dark:bg-brand-dark py-8">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <div className="inline-flex flex-col items-center gap-1 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-8 py-5">
          <span className="text-3xl font-heading font-bold text-brand-primary">
            {total.toLocaleString('de-DE')}
          </span>
          <span className="text-sm font-body text-brand-steel dark:text-gray-300">
            Besucher auf cam2rent.de
          </span>
          {today > 0 && (
            <span className="text-xs font-body text-gray-400 dark:text-gray-500">
              {today.toLocaleString('de-DE')} davon heute
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
