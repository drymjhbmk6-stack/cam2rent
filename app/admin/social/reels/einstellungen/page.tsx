'use client';

import { useState } from 'react';
import { Play, KeyRound, Mic, Repeat } from 'lucide-react';
import { PageHeader, Panel, Button } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Reels-Einstellungen (statisch). */

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400';
const labelCls = 'block text-[12px] font-medium text-slate-700 mb-1.5';
const hintCls = 'text-[11px] text-slate-400 mt-1';

const WEEKDAYS = [
  { k: 'mo', l: 'Mo' }, { k: 'di', l: 'Di' }, { k: 'mi', l: 'Mi' },
  { k: 'do', l: 'Do' }, { k: 'fr', l: 'Fr' }, { k: 'sa', l: 'Sa' }, { k: 'so', l: 'So' },
];

export default function ReelsEinstellungenPage() {
  const [provider, setProvider] = useState<'openai' | 'elevenlabs'>('openai');
  const [autoOn, setAutoOn] = useState(true);
  const [days, setDays] = useState<string[]>(['mo', 'do']);

  function toggleDay(k: string) {
    setDays((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="Reel-Einstellungen"
        subtitle="API-Keys, Voice-Over und automatische Generierung für alle Reels."
      />

      <Panel title={<span className="flex items-center gap-1.5"><KeyRound size={12} />API-Keys</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Pexels API-Key</label>
            <input type="password" className={inputCls} placeholder="z. B. 5634abcd…" />
            <p className={hintCls}>Pflicht für Stock-Reels.</p>
          </div>
          <div>
            <label className={labelCls}>Pixabay API-Key</label>
            <input type="password" className={inputCls} placeholder="z. B. 12345678-abcdef…" />
            <p className={hintCls}>Optional — zweite Quelle gegen Wiederholungen.</p>
          </div>
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><Mic size={12} />Voice-Over</span>}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Anbieter</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setProvider('openai')}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${provider === 'openai' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="text-[13px] font-medium text-slate-800">OpenAI TTS</div>
                <div className="text-[11px] text-slate-400 mt-0.5">~0,003 € pro Reel · 6 fixe Stimmen</div>
              </button>
              <button
                onClick={() => setProvider('elevenlabs')}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${provider === 'elevenlabs' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="text-[13px] font-medium text-slate-800">ElevenLabs</div>
                <div className="text-[11px] text-slate-400 mt-0.5">~0,05 € pro Reel · natürlicher für Deutsch</div>
              </button>
            </div>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className={labelCls}>Stimme</label>
              <select className={inputCls} defaultValue="nova">
                {provider === 'openai' ? (
                  <>
                    <option value="nova">Nova (weiblich, jung, natürlich)</option>
                    <option value="shimmer">Shimmer (weiblich, warm)</option>
                    <option value="onyx">Onyx (männlich, tief)</option>
                  </>
                ) : (
                  <>
                    <option value="nova">Emma (DE, warm)</option>
                    <option value="max">Max (DE, sachlich)</option>
                  </>
                )}
              </select>
            </div>
            <Button variant="secondary" icon={Play}>Testen</Button>
          </div>
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><Repeat size={12} />Automatische Generierung</span>}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setAutoOn((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoOn ? 'bg-cyan-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${autoOn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className="text-[13px] text-slate-800">
              {autoOn ? 'Automatische Generierung aktiv' : 'Automatische Generierung deaktiviert'}
            </span>
          </label>

          {autoOn && (
            <>
              <div>
                <label className={labelCls}>Modus</label>
                <select className={inputCls} defaultValue="semi">
                  <option value="semi">Entwurf (Semi) — KI generiert, Admin gibt frei</option>
                  <option value="voll">Vollautomatisch — KI generiert + veröffentlicht direkt</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Wochentage</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = days.includes(d.k);
                    return (
                      <button
                        key={d.k}
                        onClick={() => toggleDay(d.k)}
                        className={`w-10 h-10 rounded-lg text-[12px] font-semibold border transition-colors ${on ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                        {d.l}
                      </button>
                    );
                  })}
                </div>
                <p className={hintCls}>→ {days.length} {days.length === 1 ? 'Reel' : 'Reels'} pro Woche</p>
              </div>
              <div>
                <label className={labelCls}>Vorlaufzeit</label>
                <select className={inputCls} defaultValue="3">
                  <option value="1">1 Tag vorher</option>
                  <option value="2">2 Tage vorher</option>
                  <option value="3">3 Tage vorher</option>
                  <option value="5">5 Tage vorher</option>
                </select>
                <p className={hintCls}>Reels werden N Tage vor dem Termin generiert — im Semi-Modus bleibt Zeit zum Reviewen.</p>
              </div>
            </>
          )}
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <Button variant="primary">Einstellungen speichern</Button>
        <span className="text-[11px] text-slate-400">Prototyp — statische Vorschau.</span>
      </div>
    </div>
  );
}
