'use client';

import { useEffect, useState } from 'react';

const COOKIE_NAME = 'cam2rent_no_track';
const STORAGE_KEY = 'cam2rent_no_track';
const ONE_YEAR = 60 * 60 * 24 * 365;

function readState(): boolean {
  if (typeof document === 'undefined') return false;
  const ls = localStorage.getItem(STORAGE_KEY) === '1';
  const ck = document.cookie.split(';').some((c) => c.trim().startsWith(`${COOKIE_NAME}=1`));
  return ls || ck;
}

function setState(active: boolean) {
  if (typeof document === 'undefined') return;
  if (active) {
    localStorage.setItem(STORAGE_KEY, '1');
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  } else {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export default function AnalyticsOptOutSection() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(readState());
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setState(next);
    setEnabled(next);
  }

  return (
    <div className="bg-slate-800/60 dark:bg-slate-800/60 rounded-2xl border border-slate-700 p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-semibold text-base mb-1" style={{ color: '#e2e8f0' }}>
            Eigene Besuche aus Analytics ausschließen
          </h2>
          <p className="text-sm font-body text-slate-400">
            Aktiviere diesen Schalter auf jedem Gerät, mit dem du selbst die Live-Seite testest.
            Deine Besuche werden dann nicht mehr in den Analytics gezählt (weder Echtzeit-Ansicht
            noch Tagesreport). Funktioniert pro Browser und hält 1 Jahr.
          </p>
          <p className="text-xs font-body text-slate-500 mt-2">
            Hinweis: Wenn du den Browser-Cache oder Cookies löschst, musst du den Schalter erneut
            aktivieren. Auf einem neuen Gerät (z.B. Handy) musst du ihn dort einmalig setzen.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={toggle}
            disabled={!hydrated}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-40 ${
              enabled ? 'bg-accent-blue' : 'bg-slate-600'
            }`}
            aria-label={enabled ? 'Tracking ausschließen deaktivieren' : 'Tracking ausschließen aktivieren'}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-xs font-heading font-semibold ${enabled ? 'text-accent-blue' : 'text-slate-500'}`}>
            {hydrated ? (enabled ? '✓ Aktiv' : 'Aus') : '…'}
          </span>
        </div>
      </div>
    </div>
  );
}
