'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader, FilterPills, DataTable, StatusChip, Button } from '@/components/admin/ui';
import type { Column, PillDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Gutscheine (Codes-Liste, statisch). */

type Coupon = {
  code: string;
  typ: 'percent' | 'fixed';
  wert: string;
  mbw: string;
  bis: string;
  used: number;
  max: number | null;
  abgelaufen: boolean;
};

const COUPONS: Coupon[] = [
  { code: 'WILLKOMMEN15', typ: 'percent', wert: '15 %', mbw: '50,00 €', bis: '31.12.2026', used: 42, max: null, abgelaufen: false },
  { code: 'SOMMER25', typ: 'percent', wert: '25 %', mbw: '80,00 €', bis: '31.08.2026', used: 18, max: 100, abgelaufen: false },
  { code: 'DANKE-042', typ: 'percent', wert: '10 %', mbw: '—', bis: '14.09.2026', used: 0, max: 1, abgelaufen: false },
  { code: 'C2R-CONTENT-007', typ: 'percent', wert: '15 %', mbw: '40,00 €', bis: '02.11.2026', used: 1, max: 1, abgelaufen: false },
  { code: 'GUTSCHEIN50', typ: 'fixed', wert: '50,00 €', mbw: '150,00 €', bis: '30.06.2026', used: 7, max: 50, abgelaufen: false },
  { code: 'OSTERN20', typ: 'percent', wert: '20 %', mbw: '60,00 €', bis: '20.04.2026', used: 33, max: null, abgelaufen: true },
  { code: 'FRUEHLING10', typ: 'percent', wert: '10 %', mbw: '—', bis: '31.03.2026', used: 12, max: 200, abgelaufen: true },
];

const FILTERS: PillDef[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'aktiv', label: 'Aktiv', tone: 'emerald' },
  { key: 'abgelaufen', label: 'Abgelaufen', tone: 'slate' },
];

export default function GutscheinePage() {
  const [filter, setFilter] = useState('alle');

  const rows = useMemo(() => {
    if (filter === 'aktiv') return COUPONS.filter((c) => !c.abgelaufen);
    if (filter === 'abgelaufen') return COUPONS.filter((c) => c.abgelaufen);
    return COUPONS;
  }, [filter]);

  const pills: PillDef[] = FILTERS.map((f) => ({
    ...f,
    count:
      f.key === 'alle'
        ? COUPONS.length
        : f.key === 'aktiv'
          ? COUPONS.filter((c) => !c.abgelaufen).length
          : COUPONS.filter((c) => c.abgelaufen).length,
  }));

  const columns: Column<Coupon>[] = [
    { key: 'code', header: 'Code', cell: (c) => <span className="font-mono text-[12px] font-semibold text-slate-900">{c.code}</span> },
    {
      key: 'typ',
      header: 'Typ',
      cell: (c) => <span className="text-slate-500 text-[12px]">{c.typ === 'percent' ? 'Prozent' : 'Festbetrag'}</span>,
      className: 'hidden sm:table-cell',
    },
    { key: 'wert', header: 'Wert', align: 'right', cell: (c) => <span className="font-mono text-[12px] text-slate-900">{c.wert}</span> },
    { key: 'mbw', header: 'Mindestwert', align: 'right', cell: (c) => <span className="font-mono text-[12px] text-slate-500">{c.mbw}</span>, className: 'hidden md:table-cell' },
    { key: 'bis', header: 'Gültig bis', align: 'right', cell: (c) => <span className="text-slate-500 text-[12px]">{c.bis}</span>, className: 'hidden md:table-cell' },
    {
      key: 'used',
      header: 'Nutzungen',
      align: 'right',
      cell: (c) => (
        <span className="font-mono text-[12px] text-slate-600">
          {c.used}
          {c.max !== null ? `/${c.max}` : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (c) => (c.abgelaufen ? <StatusChip tone="slate">Abgelaufen</StatusChip> : <StatusChip tone="emerald">Aktiv</StatusChip>),
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Gutscheine"
        subtitle="Rabatt-Codes anlegen, befristen und Einlösungen im Blick behalten."
        actions={<Button variant="primary" icon={Plus}>Neuer Gutschein</Button>}
      />
      <FilterPills pills={pills} active={filter} onChange={setFilter} />
      <DataTable columns={columns} rows={rows} rowKey={(c) => c.code} empty="Keine Gutscheine in dieser Auswahl." />
    </div>
  );
}
