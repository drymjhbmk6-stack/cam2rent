'use client';

import { FileUp, Plus, Sparkles } from 'lucide-react';
import {
  PageHeader, DataTable, StatusChip, MiniStat, Button,
} from '@/components/admin/ui';
import type { Column, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Einkauf / Lieferantenrechnungen (statisch). */

type Purchase = {
  lieferant: string;
  datum: string;
  netto: string;
  mwst: string;
  brutto: string;
  positionen: number;
  status: 'klassifiziert' | 'offen';
};

const PURCHASES: Purchase[] = [
  { lieferant: 'DJI Store Europe', datum: '14.06.2026', netto: '332,77 €', mwst: '63,23 €', brutto: '396,00 €', positionen: 2, status: 'klassifiziert' },
  { lieferant: 'Amazon Business', datum: '11.06.2026', netto: '75,38 €', mwst: '14,32 €', brutto: '89,70 €', positionen: 3, status: 'offen' },
  { lieferant: 'Rode Microphones', datum: '18.04.2026', netto: '234,45 €', mwst: '44,55 €', brutto: '279,00 €', positionen: 1, status: 'klassifiziert' },
  { lieferant: 'Brother Deutschland', datum: '05.01.2026', netto: '108,40 €', mwst: '20,60 €', brutto: '129,00 €', positionen: 1, status: 'klassifiziert' },
  { lieferant: 'Verpackungsmarkt24', datum: '04.06.2026', netto: '26,72 €', mwst: '5,08 €', brutto: '31,80 €', positionen: 4, status: 'offen' },
];

const STATUS: Record<Purchase['status'], { tone: ChipTone; label: string }> = {
  klassifiziert: { tone: 'emerald', label: 'Klassifiziert' },
  offen: { tone: 'amber', label: 'Offen' },
};

export default function EinkaufPage() {
  const columns: Column<Purchase>[] = [
    { key: 'lieferant', header: 'Lieferant', cell: (p) => <span className="font-medium text-slate-900">{p.lieferant}</span> },
    { key: 'datum', header: 'Datum', cell: (p) => <span className="text-slate-500 text-[12px]">{p.datum}</span>, className: 'hidden md:table-cell' },
    { key: 'netto', header: 'Netto', align: 'right', cell: (p) => <span className="font-mono text-[12px] text-slate-500">{p.netto}</span>, className: 'hidden sm:table-cell' },
    { key: 'mwst', header: 'MwSt', align: 'right', cell: (p) => <span className="font-mono text-[12px] text-slate-400">{p.mwst}</span>, className: 'hidden lg:table-cell' },
    { key: 'brutto', header: 'Brutto', align: 'right', cell: (p) => <span className="font-mono font-semibold">{p.brutto}</span> },
    { key: 'pos', header: 'Positionen', align: 'right', cell: (p) => <span className="font-mono text-[12px] text-slate-500">{p.positionen}</span>, className: 'hidden sm:table-cell' },
    { key: 'status', header: 'Status', align: 'right', cell: (p) => <StatusChip tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusChip> },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Einkauf"
        subtitle="Lieferantenrechnungen — KI liest Positionen aus und schlägt Anlage / GWG / Ausgabe vor."
        actions={
          <>
            <Button variant="primary" size="sm" icon={FileUp}>Rechnung hochladen (KI)</Button>
            <Button variant="secondary" size="sm" icon={Plus}>Manuell</Button>
          </>
        }
      />
      <div className="flex gap-3 flex-wrap">
        <MiniStat value="5" label="Einkäufe" />
        <MiniStat value="925,50 €" label="Brutto Juni" />
        <MiniStat value="3" label="klassifiziert" tone="emerald" />
        <MiniStat value="2" label="offen" tone="amber" />
      </div>
      <DataTable columns={columns} rows={PURCHASES} rowKey={(p) => p.lieferant + p.datum} onRowClick={() => {}} />
      <p className="text-slate-500 text-[12px] flex items-center gap-1.5">
        <Sparkles size={13} className="text-cyan-400" />
        Claude Vision extrahiert Lieferant, Positionen und Summen aus PDF/Foto — du bestätigst nur noch die Klassifizierung pro Position.
      </p>
    </div>
  );
}
