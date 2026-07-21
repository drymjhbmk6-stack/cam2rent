'use client';

import { useState } from 'react';
import { PackageX } from 'lucide-react';
import { PageHeader, FilterPills, Panel, StatusChip, Button } from '@/components/admin/ui';
import type { PillDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Verfügbarkeits-Alerts (Design-Prototyp, statisch).
   Signalisiert, wo Kunden buchen wollten, aber Bestand fehlte. */

type MissingItem = { name: string; needed: number; remaining: number };

type Alert = {
  id: string;
  type: string;
  typeTone: ChipTone;
  subject: string;
  range: string;
  count: number;
  status: 'offen' | 'erledigt';
  missing?: MissingItem[];
};

const ALERTS: Alert[] = [
  {
    id: 'v1',
    type: 'Basis-Set ausgebucht',
    typeTone: 'rose',
    subject: 'GoPro Hero13 Black · Wassersport Set',
    range: '24.07. – 28.07.2026',
    count: 6,
    status: 'offen',
    missing: [
      { name: 'Tauchgehäuse', needed: 1, remaining: 0 },
      { name: 'Zusatz-Akku', needed: 3, remaining: 1 },
    ],
  },
  {
    id: 'v2',
    type: 'Basis-Set fehlt',
    typeTone: 'amber',
    subject: 'Insta360 Ace Pro 2',
    range: '—',
    count: 3,
    status: 'offen',
  },
  {
    id: 'v3',
    type: 'Zubehör ausgebucht',
    typeTone: 'amber',
    subject: '512 GB Speicherkarte',
    range: '22.07. – 25.07.2026',
    count: 2,
    status: 'offen',
  },
  {
    id: 'v4',
    type: 'Set ausgebucht',
    typeTone: 'amber',
    subject: 'DJI Osmo Action 5 Pro · Vlog Set',
    range: '14.07. – 18.07.2026',
    count: 4,
    status: 'erledigt',
  },
];

const STATUS_PILLS: PillDef[] = [
  { key: 'offen', label: 'Offen', tone: 'rose', count: ALERTS.filter((a) => a.status === 'offen').length },
  { key: 'erledigt', label: 'Erledigt', tone: 'emerald', count: ALERTS.filter((a) => a.status === 'erledigt').length },
];

export default function VerfuegbarkeitAlertsPage() {
  const [filter, setFilter] = useState('offen');
  const rows = ALERTS.filter((a) => a.status === filter);

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Verfügbarkeits-Alerts"
        subtitle="Wo Kunden buchen wollten, aber Bestand fehlte — Nachfrage-Signal für den Einkauf."
      />

      <FilterPills pills={STATUS_PILLS} active={filter} onChange={setFilter} />

      {rows.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center">
          <PackageX size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="font-medium text-slate-700">Keine Alerts</p>
          <p className="text-slate-400 mt-1 text-[12px]">In dieser Ansicht ist gerade nichts offen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Panel key={a.id}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip tone={a.typeTone}>{a.type}</StatusChip>
                    <span className="font-medium text-slate-900">{a.subject}</span>
                  </div>
                  <div className="text-[12px] text-slate-500 flex items-center gap-3 flex-wrap">
                    <span>Zeitraum: {a.range}</span>
                    <span className="font-mono">{a.count}× aufgetreten</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip tone={a.status === 'offen' ? 'rose' : 'emerald'}>
                    {a.status === 'offen' ? 'Offen' : 'Erledigt'}
                  </StatusChip>
                  {a.status === 'offen' && <Button size="sm" variant="secondary">Erledigt</Button>}
                </div>
              </div>

              {a.missing && a.missing.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1.5">Fehlende Bestandteile</div>
                  <ul className="space-y-1">
                    {a.missing.map((m) => (
                      <li key={m.name} className="flex items-center justify-between text-[12px] text-amber-900">
                        <span>{m.name}</span>
                        <span className="font-mono">
                          benötigt {m.needed}, frei {m.remaining}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <p className="text-slate-400 text-[11px]">Design-Prototyp · Beispieldaten.</p>
    </div>
  );
}
