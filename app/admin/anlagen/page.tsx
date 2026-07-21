'use client';

import { useState } from 'react';
import { Plus, Building2 } from 'lucide-react';
import {
  PageHeader, DataTable, MiniStat, FilterPills, Button,
} from '@/components/admin/ui';
import type { Column, PillDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Anlagenverzeichnis (statisch). */

type Art = 'Kamera' | 'Zubehör' | 'Büro' | 'Werkzeug';
type Methode = 'linear' | 'gwg' | 'keine';

type Asset = {
  name: string;
  art: Art;
  datum: string;
  kaufpreis: string;
  zeitwert: string;
  methode: Methode;
};

const ASSETS: Asset[] = [
  { name: 'DJI Osmo Action 5 Pro', art: 'Kamera', datum: '12.02.2026', kaufpreis: '399,00 €', zeitwert: '332,50 €', methode: 'linear' },
  { name: 'Insta360 X4', art: 'Kamera', datum: '03.11.2025', kaufpreis: '489,00 €', zeitwert: '380,80 €', methode: 'linear' },
  { name: 'GoPro HERO13 Black', art: 'Kamera', datum: '20.09.2025', kaufpreis: '449,00 €', zeitwert: '336,75 €', methode: 'linear' },
  { name: 'Ersatz-Akku Insta360 X4 (3 Stk.)', art: 'Zubehör', datum: '14.06.2026', kaufpreis: '89,70 €', zeitwert: '0,00 €', methode: 'gwg' },
  { name: 'DJI Mic 2 Funkmikrofon-Set', art: 'Zubehör', datum: '18.04.2026', kaufpreis: '279,00 €', zeitwert: '209,25 €', methode: 'linear' },
  { name: 'Etiketten-Drucker (Lager)', art: 'Büro', datum: '05.01.2026', kaufpreis: '129,00 €', zeitwert: '0,00 €', methode: 'gwg' },
];

const METHODE: Record<Methode, { label: string; cls: string }> = {
  linear: { label: 'Linear', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  gwg: { label: 'GWG', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  keine: { label: 'Keine', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
};

const ART: Record<Art, string> = {
  Kamera: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Zubehör: 'bg-blue-50 text-blue-700 border-blue-200',
  Büro: 'bg-slate-100 text-slate-600 border-slate-200',
  Werkzeug: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PILLS: PillDef[] = [
  { key: 'alle', label: 'Alle', count: 6 },
  { key: 'linear', label: 'Linear', count: 4, tone: 'cyan' },
  { key: 'gwg', label: 'GWG', count: 2, tone: 'amber' },
  { key: 'keine', label: 'Keine', count: 0 },
];

export default function AnlagenPage() {
  const [filter, setFilter] = useState('alle');
  const rows = filter === 'alle' ? ASSETS : ASSETS.filter((a) => a.methode === filter);

  const columns: Column<Asset>[] = [
    { key: 'name', header: 'Bezeichnung', cell: (a) => <span className="font-medium text-slate-900">{a.name}</span> },
    { key: 'art', header: 'Art', cell: (a) => <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ART[a.art]}`}>{a.art}</span>, className: 'hidden sm:table-cell' },
    { key: 'datum', header: 'Anschaffung', cell: (a) => <span className="text-slate-500 text-[12px]">{a.datum}</span>, className: 'hidden md:table-cell' },
    { key: 'kauf', header: 'Kaufpreis', align: 'right', cell: (a) => <span className="font-mono text-[12px] text-slate-500">{a.kaufpreis}</span> },
    { key: 'zeit', header: 'Zeitwert', align: 'right', cell: (a) => <span className={`font-mono font-semibold ${a.zeitwert === '0,00 €' ? 'text-slate-300' : 'text-slate-800'}`}>{a.zeitwert}</span> },
    { key: 'methode', header: 'AfA-Methode', align: 'right', cell: (a) => <span className={`text-[10px] px-1.5 py-0.5 rounded border ${METHODE[a.methode].cls}`}>{METHODE[a.methode].label}</span> },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Anlagenverzeichnis"
        subtitle="Steuersicht auf jedes Wirtschaftsgut — Buchwert und AfA, getrennt vom Wiederbeschaffungswert."
        actions={<Button variant="secondary" size="sm" icon={Plus}>Anlage nachtragen</Button>}
      />
      <div className="flex gap-3 flex-wrap">
        <MiniStat value="1.834,70 €" label="Anschaffungswert" />
        <MiniStat value="1.259,30 €" label="Zeitwert" tone="accent" />
        <MiniStat value="575,40 €" label="abgeschrieben" />
        <MiniStat value="218,70 €" label="davon GWG" tone="amber" />
      </div>
      <FilterPills pills={PILLS} active={filter} onChange={setFilter} />
      <DataTable columns={columns} rows={rows} rowKey={(a) => a.name} onRowClick={() => {}} empty="Keine Anlagen mit dieser AfA-Methode." />
      <p className="text-slate-500 text-[12px] flex items-center gap-1.5">
        <Building2 size={13} className="text-slate-400" />
        GWG (bis 800 € netto) wird sofort abgeschrieben — Zeitwert 0 €, bleibt aber zur Inventur im Verzeichnis. Lineare Anlagen schreibt der monatliche AfA-Lauf fort.
      </p>
    </div>
  );
}
