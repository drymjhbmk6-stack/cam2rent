'use client';

import { useState } from 'react';
import { Sparkles, Wand2, Image as ImageIcon, LibraryBig, Upload, Clock } from 'lucide-react';
import { PageHeader, Panel, Button } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Neuer Social Post (Composer, statisch). */

const VORLAGEN = ['Keine Vorlage (Freitext)', 'Produkt-Spotlight', 'Aktion / Gutschein', 'Community / Kundenmaterial', 'Frage an die Community', 'Blog-Ankündigung'];

export default function SocialNeuPage() {
  const [fb, setFb] = useState(true);
  const [ig, setIg] = useState(true);
  const [zeit, setZeit] = useState<'sofort' | 'planen'>('sofort');

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Neuer Post" subtitle="Caption, Bild und Kanäle festlegen — oder von der KI schreiben lassen." />

      <Panel title="Vorlage">
        <select className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700">
          {VORLAGEN.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <p className="text-[11px] text-slate-400 mt-2">Vorlage füllt Caption-Prompt und Standard-Hashtags vor. Ohne Vorlage schreibst du frei.</p>
      </Panel>

      <Panel title="Caption">
        <textarea
          rows={5}
          placeholder="Was möchtest du posten? Beschreibe die Idee oder schreibe die Caption direkt…"
          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 resize-y"
        />
        <div className="mt-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Hashtags</span>
          <input
            type="text"
            placeholder="#actioncam #gopro #insta360 #verleih"
            className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700"
          />
        </div>
      </Panel>

      <Panel title="Bild">
        <div className="flex items-center gap-3">
          <div className="w-24 h-24 shrink-0 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-300">
            <ImageIcon size={22} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" icon={Wand2}>KI generieren</Button>
            <Button variant="secondary" size="sm" icon={LibraryBig}>Bibliothek</Button>
            <Button variant="secondary" size="sm" icon={Upload}>Hochladen</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Kanäle">
        <div className="flex gap-2">
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
        </div>
      </Panel>

      <Panel title="Zeitplan">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={() => setZeit('sofort')}
              className={`px-3 py-1.5 text-[12px] font-medium ${zeit === 'sofort' ? 'bg-cyan-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Sofort
            </button>
            <button
              onClick={() => setZeit('planen')}
              className={`px-3 py-1.5 text-[12px] font-medium border-l border-slate-200 ${zeit === 'planen' ? 'bg-cyan-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Planen
            </button>
          </div>
          {zeit === 'planen' && (
            <div className="flex items-center gap-1.5 text-[12px] text-slate-400 px-2.5 py-1.5 rounded border border-slate-200 bg-white">
              <Clock size={13} />24.07.2026, 09:00 Uhr
            </div>
          )}
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" icon={Sparkles}>KI-Post erstellen</Button>
      </div>
    </div>
  );
}
