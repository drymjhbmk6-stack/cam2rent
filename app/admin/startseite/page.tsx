'use client';

import { useState } from 'react';
import { FileText, ImagePlus, Megaphone, Sparkles, Star, Truck, Upload } from 'lucide-react';
import { PageHeader, Panel, Tabs, Button, StatusChip } from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Startseiten-Content (Inhalte / Hero-Bilder, statisch). */

const TABS: TabDef[] = [
  { key: 'inhalte', label: 'Inhalte' },
  { key: 'bilder', label: 'Hero-Bilder' },
];

const USPS = [
  { icon: Truck, titel: 'Kostenloser Versand ab 49 €', text: 'DHL & DPD, Rückversand inklusive.' },
  { icon: Star, titel: 'Top bewertet', text: '4,9 von 5 Sternen bei Google.' },
  { icon: Sparkles, titel: 'Immer aktuelle Modelle', text: 'GoPro, DJI & Insta360 der neuesten Generation.' },
];

const HERO_BILDER = [
  { saison: 'Frühling', aktiv: true },
  { saison: 'Sommer', aktiv: true },
  { saison: 'Herbst', aktiv: false },
  { saison: 'Winter', aktiv: false },
];

const inputCls = 'w-full px-3 py-2 rounded border border-slate-200 bg-white text-[13px] text-slate-800 placeholder:text-slate-400';
const labelCls = 'text-[10px] uppercase tracking-wider text-slate-400 mb-1 block';

export default function StartseitePage() {
  const [tab, setTab] = useState('inhalte');
  const [seo, setSeo] = useState(SEO_DEFAULT);
  const woerter = seo.trim().split(/\s+/).filter(Boolean).length;
  const seoTone = woerter >= 500 ? 'emerald' : woerter >= 300 ? 'amber' : 'rose';

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title="Startseite"
        subtitle="Inhalte &amp; Hero-Bilder der öffentlichen Startseite."
        actions={<Button variant="primary" size="sm">Speichern</Button>}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'inhalte' && (
        <div className="space-y-4">
          <Panel title="Hero">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Headline</label>
                <input className={inputCls} defaultValue="Action-Cams mieten statt kaufen" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Subline</label>
                <input className={inputCls} defaultValue="GoPro, DJI &amp; Insta360 — flexibel für dein nächstes Abenteuer." />
              </div>
              <div>
                <label className={labelCls}>CTA-Text</label>
                <input className={inputCls} defaultValue="Jetzt Kamera finden" />
              </div>
              <div>
                <label className={labelCls}>CTA-Ziel</label>
                <input className={`${inputCls} font-mono text-[11px]`} defaultValue="/kameras" />
              </div>
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-1.5"><Megaphone size={12} /> News-Banner</span>}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] text-slate-500">Schmaler Banner ganz oben auf der Startseite.</span>
              <ToggleField value={true} />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Text</label>
                <input className={inputCls} defaultValue="🌊 Sommer-Special: 10 % auf alle Wassersport-Sets" />
              </div>
              <div>
                <label className={labelCls}>Hintergrund</label>
                <select className={inputCls} defaultValue="cyan">
                  <option value="cyan">Cyan</option>
                  <option value="amber">Amber</option>
                  <option value="slate">Slate</option>
                </select>
              </div>
            </div>
          </Panel>

          <Panel title="USPs">
            <div className="space-y-2">
              {USPS.map((u, i) => {
                const Icon = u.icon;
                return (
                  <div key={i} className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-cyan-50 text-cyan-600 shrink-0">
                      <Icon size={16} />
                    </span>
                    <div className="grid sm:grid-cols-2 gap-2 flex-1">
                      <input className={inputCls} defaultValue={u.titel} />
                      <input className={inputCls} defaultValue={u.text} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={<span className="flex items-center gap-1.5"><FileText size={12} /> SEO-Text</span>}
            right={
              <StatusChip tone={seoTone}>
                {woerter} Wörter
              </StatusChip>
            }
          >
            <p className="text-[12px] text-slate-500 mb-2">
              Markdown-Fließtext am Seitenende — hebt die Wortanzahl für Suchmaschinen. Ziel: mindestens 500 Wörter.
            </p>
            <textarea
              className={`${inputCls} h-40 resize-y font-mono text-[12px] leading-relaxed`}
              value={seo}
              onChange={(e) => setSeo(e.target.value)}
            />
          </Panel>
        </div>
      )}

      {tab === 'bilder' && (
        <Panel title="Hero-Bilder je Saison">
          <p className="text-[12px] text-slate-500 mb-3">
            Das Hero-Bild wechselt automatisch mit der Jahreszeit. Nicht belegte Saisons fallen auf das Standardbild zurück.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {HERO_BILDER.map((b) => (
              <div key={b.saison} className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="aspect-video bg-slate-100 flex items-center justify-center text-slate-300">
                  {b.aktiv ? <ImagePlus size={26} /> : <span className="text-[12px] text-slate-400">Kein Bild</span>}
                </div>
                <div className="flex items-center justify-between px-3 h-10 border-t border-slate-200">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                    {b.saison}
                    {b.aktiv ? <StatusChip tone="emerald">belegt</StatusChip> : <StatusChip tone="slate">leer</StatusChip>}
                  </span>
                  <Button variant="secondary" size="sm" icon={Upload}>Hochladen</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ToggleField({ value }: { value: boolean }) {
  const [on, setOn] = useState(value);
  return (
    <button
      onClick={() => setOn((v) => !v)}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
        on ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200'
      }`}
    >
      {on ? 'An' : 'Aus'}
    </button>
  );
}

const SEO_DEFAULT = `## Action-Cam Verleih für dein nächstes Abenteuer

Bei cam2rent mietest du GoPro, DJI und Insta360 Action-Cams flexibel für Tage oder Wochen — statt sie teuer zu kaufen. Ob Tauchgang, Skitour, Mountainbike-Trail oder Familienurlaub: Du bekommst immer das aktuelle Modell inklusive passendem Zubehör.

Der Versand läuft kostenlos ab 49 € über DHL und DPD, der Rückversand ist bereits inklusive. Vor jeder Vermietung prüfen wir Kamera und Zubehör auf Vollständigkeit und Funktion.

Du bist dir nicht sicher, welche Kamera zu dir passt? Unser Kamera-Finder führt dich in fünf Fragen zum passenden Modell.`;
