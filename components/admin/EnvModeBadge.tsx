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
    const load = async () => {
      try {
        const res = await fetch('/api/admin/env-mode', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data?.mode === 'test' || data?.mode === 'live')) {
          setMode(data.mode);
        }
      } catch { /* silent */ }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
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
