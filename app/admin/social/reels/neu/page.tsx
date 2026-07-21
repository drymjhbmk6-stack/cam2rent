'use client';

import { useState } from 'react';
import { Lightbulb, Film, Send, CheckCircle2, Sparkles } from 'lucide-react';
import { PageHeader, Panel, Segmented, Button, StatusChip } from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Neues-Reel-Wizard (4 Schritte, statisch). */

const STEPS: TabDef[] = [
  { key: 'idee', label: 'Idee', icon: Lightbulb },
  { key: 'visuelles', label: 'Visuelles', icon: Film },
  { key: 'verteilung', label: 'Verteilung', icon: Send },
  { key: 'bestaetigen', label: 'Bestätigen', icon: CheckCircle2 },
];

const ORDER = ['idee', 'visuelles', 'verteilung', 'bestaetigen'];

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400';
const labelCls = 'block text-[12px] font-medium text-slate-700 mb-1.5';
const hintCls = 'text-[11px] text-slate-400 mt-1';

export default function NeuesReelPage() {
  const [step, setStep] = useState('idee');
  const idx = ORDER.indexOf(step);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="Neues Reel generieren"
        subtitle="Idee → Visuelles → Verteilung → Bestätigen. Claude schreibt das Skript, FFmpeg rendert."
      />

      <Segmented tabs={STEPS} active={step} onChange={setStep} />

      {step === 'idee' && (
        <Panel title="Idee — Vorlage &amp; Topic">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Vorlage</label>
              <select className={inputCls} defaultValue="stock">
                <option value="stock">Produkt-Spotlight (Stock-Footage, 20 s)</option>
                <option value="motion">Angebot (Motion-Graphics, 15 s)</option>
                <option value="tipp">Saison-Tipp (Stock-Footage, 25 s)</option>
              </select>
              <p className={hintCls}>Bestimmt Skript-Prompt, Standard-Dauer und Look.</p>
            </div>
            <div>
              <label className={labelCls}>Topic / Aussage</label>
              <input className={inputCls} placeholder="z. B. GoPro Hero 13 für Mountainbike-Touren im Frühling" />
              <p className={hintCls}>Konkrete Aussage funktioniert besser als generischer Marketing-Slogan.</p>
            </div>
            <div>
              <label className={labelCls}>Kamera (optional)</label>
              <input className={inputCls} placeholder="z. B. GoPro Hero 13 Black" />
              <p className={hintCls}>Passt ein Produktname, holt die KI das echte Shop-Bild als Referenz.</p>
            </div>
          </div>
        </Panel>
      )}

      {step === 'visuelles' && (
        <Panel title="Visuelles — Clips &amp; Musik">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Stock-Footage-Keywords (komma-getrennt)</label>
              <input className={inputCls} placeholder="mountainbiking, trail, action, adventure" />
              <p className={hintCls}>Englische Begriffe funktionieren bei Pexels/Pixabay deutlich besser.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-slate-700">Stock-Vorschau</span>
                <span className="text-[11px] text-slate-400">Pexels · Beispiel</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-[9/16] bg-slate-100 rounded grid place-items-center">
                    <Film size={16} className="text-slate-300" />
                  </div>
                ))}
              </div>
              <p className={hintCls}>Nur zur Orientierung — der echte Render holt die Clips beim Generieren.</p>
            </div>
            <div>
              <label className={labelCls}>Hintergrund-Musik</label>
              <select className={inputCls} defaultValue="upbeat">
                <option value="">— keine Musik —</option>
                <option value="upbeat">Upbeat Action (treibend) · Standard</option>
                <option value="cinematic">Cinematic (episch, filmisch)</option>
                <option value="calm">Calm (ruhig, Lifestyle)</option>
              </select>
            </div>
          </div>
        </Panel>
      )}

      {step === 'verteilung' && (
        <Panel title="Verteilung — Kanäle &amp; Timing">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Facebook-Seite</label>
              <select className={inputCls} defaultValue="c2r">
                <option value="c2r">cam2rent</option>
                <option value="">— keine —</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Instagram-Account</label>
              <select className={inputCls} defaultValue="c2r">
                <option value="c2r">@cam2rent</option>
                <option value="">— keiner —</option>
              </select>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <label className={labelCls}>Timing</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="timing" defaultChecked className="mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-medium text-slate-800">Sofort generieren</span>
                    <span className="block text-[11px] text-slate-400">Render läuft im Hintergrund, du landest auf der Detail-Seite.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="timing" className="mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-medium text-slate-800">In Redaktionsplan einreihen</span>
                    <span className="block text-[11px] text-slate-400">Reel wird zum gewählten Zeitpunkt generiert.</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {step === 'bestaetigen' && (
        <Panel title="Bestätigen — Zusammenfassung">
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <Row k="Vorlage" v="Produkt-Spotlight (Stock, 20 s)" />
              <Row k="Topic" v="GoPro Hero 13 für Mountainbike-Touren" />
              <Row k="Kamera" v="GoPro Hero 13 Black" />
              <Row k="Keywords" v="mountainbiking, trail, action" />
              <Row k="Plattformen" v="Facebook, Instagram" />
              <Row k="Musik" v="Upbeat Action" />
              <Row k="Timing" v="Sofort generieren" />
            </dl>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800 flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <span><strong>Kosten-Hinweis:</strong> Claude-Skript ~0,02 €. Voice-Over optional ~0,003 €. Pexels/Pixabay + FFmpeg + Meta-Posting kostenlos. Render-Dauer typisch 30–90 Sekunden.</span>
            </div>
          </div>
        </Panel>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setStep(ORDER[Math.max(0, idx - 1)])} disabled={idx === 0}>
          Zurück
        </Button>
        {idx < ORDER.length - 1 ? (
          <Button variant="primary" onClick={() => setStep(ORDER[idx + 1])}>Weiter</Button>
        ) : (
          <Button variant="primary" icon={Sparkles}>Reel generieren</Button>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <StatusChip tone="cyan">Schritt {idx + 1}/4</StatusChip>
        Prototyp — statische Vorschau, keine Generierung.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-400">{k}</dt>
      <dd className="text-slate-800 font-medium">{v}</dd>
    </div>
  );
}
