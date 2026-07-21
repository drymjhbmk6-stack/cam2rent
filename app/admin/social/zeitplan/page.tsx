'use client';

import { Sparkles, Rocket } from 'lucide-react';
import { PageHeader, Panel, Button, StatusChip } from '@/components/admin/ui';
import type { ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Redaktionsplan Social (statisch). */

type PlanStatus = 'planned' | 'generated' | 'published';

type PlanEntry = {
  id: string;
  tag: string;
  monat: string;
  zeit: string;
  thema: string;
  kategorie: string;
  status: PlanStatus;
};

const STATUS: Record<PlanStatus, { label: string; tone: ChipTone }> = {
  planned: { label: 'Geplant', tone: 'slate' },
  generated: { label: 'Generiert', tone: 'cyan' },
  published: { label: 'Veröffentlicht', tone: 'emerald' },
};

const PLAN: PlanEntry[] = [
  { id: 'p1', tag: '24', monat: 'Jul', zeit: '09:00', thema: 'Insta360 X4 fürs Wintersport-Wochenende', kategorie: 'Produkt', status: 'planned' },
  { id: 'p2', tag: '26', monat: 'Jul', zeit: '12:00', thema: '3 Zubehör-Tipps für Wassersport-Aufnahmen', kategorie: 'Tipp', status: 'planned' },
  { id: 'p3', tag: '28', monat: 'Jul', zeit: '18:00', thema: 'Kundenmaterial: MTB-Trail mit der GoPro Hero 13', kategorie: 'Community', status: 'generated' },
  { id: 'p4', tag: '30', monat: 'Jul', zeit: '09:00', thema: 'Sommer-Aktion läuft aus — letzte Chance', kategorie: 'Aktion', status: 'generated' },
  { id: 'p5', tag: '19', monat: 'Jul', zeit: '12:00', thema: 'Blog: 5 Tipps für Action-Cam am Strand', kategorie: 'Blog', status: 'published' },
  { id: 'p6', tag: '17', monat: 'Jul', zeit: '18:30', thema: 'Frage: Wassersport oder Bergtour?', kategorie: 'Community', status: 'published' },
];

const OFFENE_THEMEN = ['GoPro Hero 13 vs. Osmo Action 5 Pro', 'Herbst-Roadtrip mit der Action-Cam', 'Zubehör-Set für Vlogger', 'Speicherkarten richtig wählen'];

export default function SocialZeitplanPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Redaktionsplan"
        subtitle="Geplante Social-Beiträge — generieren, vorziehen, posten."
        actions={<Button variant="secondary" size="sm" icon={Sparkles}>Aus Themen füllen</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-4 items-start">
        <Panel title="Plan" noBody>
          <div className="divide-y divide-slate-100">
            {PLAN.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <div className="shrink-0 w-12 text-center rounded-lg border border-slate-200 bg-slate-50 py-1">
                  <div className="font-mono font-bold text-slate-800 leading-none">{p.tag}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">{p.monat}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-800 truncate">{p.thema}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-slate-400">{p.zeit}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{p.kategorie}</span>
                  </div>
                </div>
                <StatusChip tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusChip>
                {p.status === 'planned' && (
                  <Button variant="ghost" size="sm" icon={Sparkles} title="Jetzt generieren">Generieren</Button>
                )}
                {p.status === 'generated' && (
                  <Button variant="ghost" size="sm" icon={Rocket} title="Jetzt posten">Posten</Button>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Offene Themen" noBody>
          <div className="divide-y divide-slate-100">
            {OFFENE_THEMEN.map((t) => (
              <div key={t} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
                <span className="flex-1 text-[12px] text-slate-700">{t}</span>
                <button className="text-[11px] text-cyan-600 hover:text-cyan-700 font-medium">Einplanen</button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
