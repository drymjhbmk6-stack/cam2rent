'use client';

import { useState } from 'react';
import { Film, Plus, Clock } from 'lucide-react';
import { PageHeader, ButtonLink, FilterPills, StatusChip } from '@/components/admin/ui';
import type { PillDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Reels-Übersicht (9:16-Kurzvideos, statisch). */

const PILLS: PillDef[] = [
  { key: 'alle', label: 'Alle', count: 6 },
  { key: 'entwurf', label: 'Entwurf', count: 1, tone: 'slate' },
  { key: 'rendert', label: 'Rendert', count: 1, tone: 'blue' },
  { key: 'review', label: 'Review', count: 2, tone: 'amber' },
  { key: 'geplant', label: 'Geplant', count: 1, tone: 'cyan' },
  { key: 'veroeffentlicht', label: 'Veröffentlicht', count: 1, tone: 'emerald' },
];

type Reel = {
  id: string;
  titel: string;
  status: string;
  tone: ChipTone;
  typ: 'Stock' | 'Motion';
  datum: string;
};

const REELS: Reel[] = [
  { id: 'r1', titel: 'GoPro Hero 13 für Mountainbike-Touren im Frühling', status: 'Zur Freigabe', tone: 'amber', typ: 'Stock', datum: '21.07.2026' },
  { id: 'r2', titel: 'Sommer-Aktion: 15 % auf alle Wassersport-Sets', status: 'Rendert…', tone: 'blue', typ: 'Motion', datum: '21.07.2026' },
  { id: 'r3', titel: 'Insta360 X5 — 360°-Aufnahmen beim Surfen', status: 'Zur Freigabe', tone: 'amber', typ: 'Stock', datum: '20.07.2026' },
  { id: 'r4', titel: 'DJI Osmo Nano — die kleinste Action-Cam im Test', status: 'Geplant', tone: 'cyan', typ: 'Stock', datum: '27.07.2026' },
  { id: 'r5', titel: 'Neu im Verleih: OSMO Action 5 Pro', status: 'Veröffentlicht', tone: 'emerald', typ: 'Motion', datum: '18.07.2026' },
  { id: 'r6', titel: 'Welche Action-Cam passt zu dir? Kurz-Guide', status: 'Entwurf', tone: 'slate', typ: 'Motion', datum: '17.07.2026' },
];

export default function ReelsPage() {
  const [filter, setFilter] = useState('alle');
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Reels"
        subtitle="KI-generierte 9:16-Kurzvideos für Facebook &amp; Instagram — jedes wird vor der Veröffentlichung freigegeben."
        actions={<ButtonLink href="/admin/social/reels/neu" variant="primary" icon={Plus}>Neues Reel</ButtonLink>}
      />

      <FilterPills pills={PILLS} active={filter} onChange={setFilter} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {REELS.map((r) => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow cursor-pointer">
            <div className="relative aspect-[9/16] bg-slate-100 grid place-items-center">
              <Film size={26} className="text-slate-300" />
              <span className="absolute top-2 left-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/90 border border-slate-200 text-slate-500 uppercase tracking-wide">
                {r.typ}
              </span>
            </div>
            <div className="p-2.5 space-y-1.5">
              <p className="text-[12px] text-slate-800 leading-snug line-clamp-2">{r.titel}</p>
              <div className="flex items-center gap-2">
                <StatusChip tone={r.tone}>{r.status}</StatusChip>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock size={10} />{r.datum}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
