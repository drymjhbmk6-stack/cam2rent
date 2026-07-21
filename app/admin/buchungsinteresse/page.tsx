'use client';

import { useState } from 'react';
import { PageHeader, Panel, FilterPills, MiniStat } from '@/components/admin/ui';
import type { PillDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Buchungsinteresse (Nachfrage-Analyse, Design-Prototyp).
   Anonyme Auswertung: was Kunden im Buchungsprozess konfiguriert haben. */

const RANGE_PILLS: PillDef[] = [
  { key: '24h', label: '24 Stunden', tone: 'cyan' },
  { key: '7', label: '7 Tage', tone: 'cyan' },
  { key: '30', label: '30 Tage', tone: 'cyan' },
  { key: '90', label: '90 Tage', tone: 'cyan' },
];

type Rank = { name: string; count: number };

function RankPanel({ title, items, unit }: { title: string; items: Rank[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <Panel title={title}>
      <div className="space-y-2.5">
        {items.map((it, idx) => (
          <div key={it.name} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-right text-[11px] text-slate-400 font-mono">{idx + 1}</span>
            <span className="w-40 shrink-0 text-[12px] text-slate-700 truncate">{it.name}</span>
            <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
              <div className="h-2 rounded bg-cyan-500" style={{ width: `${(it.count / max) * 100}%` }} />
            </div>
            <span className="w-20 text-right font-mono text-[12px] text-slate-900 shrink-0">
              {it.count}
              {unit ? <span className="text-slate-400 ml-0.5">{unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const CAMERAS: Rank[] = [
  { name: 'GoPro Hero13 Black', count: 87 },
  { name: 'DJI Osmo Action 5 Pro', count: 64 },
  { name: 'Insta360 X4', count: 51 },
  { name: 'DJI Osmo Nano', count: 33 },
  { name: 'Insta360 Ace Pro 2', count: 28 },
  { name: 'GoPro Hero12 Black', count: 19 },
];

const ACCESSORIES: Rank[] = [
  { name: 'Zusatz-Akku', count: 142 },
  { name: '512 GB Speicherkarte', count: 96 },
  { name: 'Floating Hand Grip', count: 74 },
  { name: 'Tauchgehäuse', count: 41 },
  { name: 'Kopfband-Halterung', count: 29 },
];

const SETS: Rank[] = [
  { name: 'Basic Set', count: 58 },
  { name: 'Wassersport Set', count: 37 },
  { name: 'Vlog Set', count: 22 },
];

const DURATION: Rank[] = [
  { name: '1 Tag', count: 24 },
  { name: '2–3 Tage', count: 71 },
  { name: '4–7 Tage', count: 96 },
  { name: '8–14 Tage', count: 38 },
  { name: '15–30 Tage', count: 12 },
  { name: 'über 30 Tage', count: 3 },
];

const DELIVERY: Rank[] = [
  { name: 'Versand', count: 168 },
  { name: 'Abholung', count: 76 },
];

const HAFTUNG: Rank[] = [
  { name: 'Premium-Haftungsschutz', count: 121 },
  { name: 'Standard-Haftungsschutz', count: 89 },
  { name: 'Ohne Haftungsschutz', count: 34 },
];

export default function BuchungsinteressePage() {
  const [range, setRange] = useState('30');

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Buchungsinteresse"
        subtitle="Anonyme Nachfrage-Analyse — was Kunden im Buchungsprozess konfiguriert haben, auch ohne Abschluss."
      />

      <FilterPills pills={RANGE_PILLS} active={range} onChange={setRange} />

      <div className="flex gap-3 flex-wrap">
        <MiniStat value="244" label="Konfigurationen" tone="accent" />
        <MiniStat value="168" label="mit Versand" />
        <MiniStat value="41" label="daraus gebucht" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankPanel title="Top-Kameras" items={CAMERAS} unit="×" />
        <RankPanel title="Top-Zubehör" items={ACCESSORIES} unit="×" />
      </div>

      <RankPanel title="Mietdauer-Verteilung" items={DURATION} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankPanel title="Lieferart" items={DELIVERY} />
        <RankPanel title="Haftungsschutz" items={HAFTUNG} />
      </div>

      <RankPanel title="Top-Sets" items={SETS} />

      <p className="text-slate-400 text-[11px]">
        Signal statt Bauchgefühl: die Ace Pro 2 wird oft konfiguriert, aber selten gebucht — dort fehlt Bestand.
      </p>
    </div>
  );
}
