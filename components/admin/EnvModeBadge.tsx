'use client';

import { useEffect, useState } from 'react';

type Mode = 'test' | 'live' | null;

/**
 * Kleines Status-Badge im Admin-Header, das den aktiven Env-Modus anzeigt.
 * Wird in der Mobile- und Desktop-Sidebar eingeblendet.
 */
export default function EnvModeBadge() {
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    // Backoff-Sequenz wie NotificationDropdown — bei API-Fehler oder Tab im
    // Hintergrund seltener pollen, damit Outages nicht 60 unnoetige Requests/h
    // pro Admin-Tab erzeugen.
    const INTERVALS = [60_000, 120_000, 240_000, 480_000];
    let failures = 0;

    const schedule = () => {
      if (cancelled) return;
      const ms = INTERVALS[Math.min(failures, INTERVALS.length - 1)];
      timer = window.setTimeout(load, ms);
    };

    const load = async () => {
      if (cancelled) return;
      // Tab im Hintergrund: nicht pollen, neuer Trigger ueber visibilitychange.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      try {
        const res = await fetch('/api/admin/env-mode', { cache: 'no-store' });
        if (!res.ok) {
          failures++;
        } else {
          const data = await res.json();
          if (!cancelled && (data?.mode === 'test' || data?.mode === 'live')) {
            setMode(data.mode);
          }
          failures = 0;
        }
      } catch {
        failures++;
      }
      schedule();
    };

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        failures = 0;
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        load();
      }
    };

    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!mode) return null;

  const isLive = mode === 'live';
  return (
    <span
      title={isLive ? 'Live-Modus: echte Zahlungen' : 'Test-Modus: keine echten Kosten'}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase rounded-full ${
        isLive
          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
          : 'bg-amber-400/15 text-amber-400 border border-amber-400/40'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-rose-400' : 'bg-amber-400'}`} />
      {isLive ? 'Live' : 'Test'}
    </span>
  );
}
