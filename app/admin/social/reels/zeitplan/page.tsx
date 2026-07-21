'use client';

import { CalendarDays, Plus } from 'lucide-react';
import { PageHeader, Panel, Button, StatusChip } from '@/components/admin/ui';
import type { ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Reels-Redaktionsplan (statisch). */

type Entry = {
  tag: string;
  monat: string;
  zeit: string;
  topic: string;
  vorlage: string;
  status: string;
  tone: ChipTone;
};

const ENTRIES: Entry[] = [
  { tag: '22', monat: 'Jul', zeit: '10:00', topic: 'Wintersport-Vorschau: Action-Cams für Ski & Snowboard', vorlage: 'Saison-Tipp', status: 'Generiert', tone: 'emerald' },
  { tag: '24', monat: 'Jul', zeit: '11:00', topic: 'Insta360 X5 — 360°-Aufnahmen beim Surfen', vorlage: 'Produkt-Spotlight', status: 'Geplant', tone: 'slate' },
  { tag: '27', monat: 'Jul', zeit: '10:00', topic: 'Neu im Verleih: DJI Osmo Nano', vorlage: 'Produkt-Spotlight', status: 'Generiert…', tone: 'amber' },
  { tag: '29', monat: 'Jul', zeit: '14:00', topic: 'Sommer-Aktion: 15 % auf alle Wassersport-Sets', vorlage: 'Angebot', status: 'Geplant', tone: 'slate' },
  { tag: '02', monat: 'Aug', zeit: '10:00', topic: 'Welche Action-Cam passt zu dir? Kurz-Guide', vorlage: 'Saison-Tipp', status: 'Fehler', tone: 'rose' },
];

export default function ReelsZeitplanPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Reels-Redaktionsplan"
        subtitle="Geplante Reels — pro Termin ein Thema, das der Cron automatisch generiert."
        actions={<Button variant="primary" icon={Plus}>Eintrag hinzufügen</Button>}
      />

      <Panel title="Geplante Reels" noBody>
        <div className="divide-y divide-slate-100">
          {ENTRIES.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
              <div className="w-12 shrink-0 text-center rounded border border-slate-200 bg-slate-50 py-1">
                <div className="font-mono text-[15px] font-semibold text-slate-800 leading-none">{e.tag}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">{e.monat}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-slate-800 truncate">{e.topic}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><CalendarDays size={11} />{e.zeit} Uhr</span>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{e.vorlage}</span>
                </div>
              </div>
              <StatusChip tone={e.tone}>{e.status}</StatusChip>
            </div>
          ))}
        </div>
      </Panel>

      <p className="text-[12px] text-slate-500">
        Der Cron <code className="text-[11px] font-mono text-cyan-700">reels-generate</code> erstellt die Reels ~2 Tage vor dem Termin — im Semi-Modus zur Freigabe, im Voll-Modus direkt geplant.
      </p>
    </div>
  );
}
