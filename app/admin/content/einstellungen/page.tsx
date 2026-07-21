'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Share2, ShieldCheck } from 'lucide-react';
import { PageHeader, Panel, Tabs } from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Content-KI-Einstellungen (Blog / Social, statisch). */

const TABS: TabDef[] = [
  { key: 'blog', label: 'Blog', icon: FileText },
  { key: 'social', label: 'Social', icon: Share2 },
];

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function Toggle({ label, defaultOn, hint }: { label: string; defaultOn?: boolean; hint?: string }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => setOn((v) => !v)}
        className={`mt-0.5 shrink-0 w-9 h-5 rounded-full transition-colors relative ${on ? 'bg-cyan-500' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </button>
      <div>
        <div className="text-[13px] font-medium text-slate-800">{label}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

function ContentSettings({ art }: { art: 'blog' | 'social' }) {
  const [modus, setModus] = useState<'semi' | 'voll'>('semi');
  const [tage, setTage] = useState<Record<string, boolean>>({ Mo: true, Mi: true, Fr: true });
  const einheit = art === 'blog' ? 'Artikel' : 'Posts';

  return (
    <div className="space-y-4">
      <Panel title="Automatische Generierung">
        <div className="space-y-4">
          <Toggle label="Automatische Generierung aktiv" defaultOn hint={`Die KI erstellt regelmäßig ${einheit} aus dem Redaktionsplan.`} />

          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Modus</span>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setModus('semi')}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${modus === 'semi' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 ${modus === 'semi' ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300'}`} />
                  Semi-Automatisch
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 ml-5">Entwurf erstellen, du gibst frei.</div>
              </button>
              <button
                onClick={() => setModus('voll')}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${modus === 'voll' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 ${modus === 'voll' ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300'}`} />
                  Voll-Automatisch
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 ml-5">Direkt veröffentlichen ohne Freigabe.</div>
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Wochentage</span>
            <div className="flex gap-1.5 mt-1.5">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Zeitfenster von</span>
              <input type="text" defaultValue="08:00" className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">bis</span>
              <input type="text" defaultValue="18:00" className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700" />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><ShieldCheck size={12} />Qualität</span>}>
        <Toggle label="Faktencheck aktiv" defaultOn hint="Dreistufige Prüfung (Marken-Wächter + Stil-Prüfer) vor der Freigabe." />
      </Panel>

      <Panel title="KI-Konfiguration">
        <div className="space-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Ton</span>
            <select className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700">
              <option>Locker &amp; freundlich</option>
              <option>Sachlich &amp; informativ</option>
              <option>Enthusiastisch</option>
            </select>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Zusatz-Kontext</span>
            <textarea
              rows={3}
              defaultValue="cam2rent verleiht Action-Cams (GoPro, DJI, Insta360) mit Zubehör. Zielgruppe: Outdoor- und Sport-Enthusiasten in Deutschland."
              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 resize-y"
            />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Standard-Hashtags</span>
            <input
              type="text"
              defaultValue={art === 'blog' ? '#actioncam #outdoor #reisen' : '#actioncam #gopro #insta360 #verleih'}
              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700"
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ContentEinstellungenInner() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab') === 'social' ? 'social' : 'blog';
  const [tab, setTab] = useState(initial);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Content-Einstellungen" subtitle="KI-Generierung für Blog und Social steuern." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <ContentSettings art={tab === 'social' ? 'social' : 'blog'} />
    </div>
  );
}

export default function ContentEinstellungenPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-[13px]">Lade…</div>}>
      <ContentEinstellungenInner />
    </Suspense>
  );
}
