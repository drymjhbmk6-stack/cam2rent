'use client';

import { useState } from 'react';
import { Sparkles, Terminal } from 'lucide-react';
import { PageHeader, Panel, Button } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — KI-Bulk-Plan-Generator (statisch). */

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default function SocialPlanPage() {
  const [fb, setFb] = useState(true);
  const [ig, setIg] = useState(true);
  const [bilder, setBilder] = useState(true);
  const [tage, setTage] = useState<Record<string, boolean>>({ Mo: true, Mi: true, Fr: true });

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="KI-Plan (Bulk)" subtitle="Mehrere Posts im Voraus generieren lassen — Themen, Captions und Bilder automatisch." />

      <Panel title="Umfang">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Zeitraum (Tage)</span>
            <input type="number" defaultValue={30} className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Posts pro Woche</span>
            <input type="number" defaultValue={3} className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Uhrzeit</span>
            <input type="text" defaultValue="09:00" className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700" />
          </div>
        </div>
      </Panel>

      <Panel title="Wochentage">
        <div className="flex gap-1.5">
          {WOCHENTAGE.map((t) => {
            const on = tage[t];
            return (
              <button
                key={t}
                onClick={() => setTage((prev) => ({ ...prev, [t]: !prev[t] }))}
                className={`w-9 h-9 rounded-full border text-[12px] font-medium transition-colors ${on ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Kanäle &amp; Bilder">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFb((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${fb ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            <span className="font-semibold text-[11px]">FB</span>Facebook
          </button>
          <button
            onClick={() => setIg((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${ig ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            <span className="font-semibold text-[11px]">IG</span>Instagram
          </button>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={bilder} onChange={() => setBilder((v) => !v)} className="accent-cyan-500" />
            Bilder mit KI generieren
          </label>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" icon={Sparkles}>Plan generieren</Button>
      </div>

      <Panel title={<span className="flex items-center gap-1.5"><Terminal size={12} />Fortschritt</span>}>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
          <div className="h-full w-0 bg-cyan-500 rounded-full" />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 font-mono text-[11px] text-slate-400 space-y-1">
          <div>Noch kein Lauf gestartet.</div>
          <div className="text-slate-300">Der Job läuft im Hintergrund — du kannst die Seite verlassen. Fortschritt und Log erscheinen hier.</div>
        </div>
      </Panel>
    </div>
  );
}
