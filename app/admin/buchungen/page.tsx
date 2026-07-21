'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight } from 'lucide-react';
import { PageHeader, FilterPills, DataTable, BookingStatusChip, ButtonLink } from '@/components/admin/ui';
import type { Column, PillDef } from '@/components/admin/ui';
import { BOOKINGS, type Booking } from '@/lib/admin-mock';
import { groupForStatus } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Buchungen (Liste, statisch). Zeile → Detail. */

const FILTERS: PillDef[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'versand', label: 'Versand', tone: 'cyan' },
  { key: 'draussen', label: 'Draußen', tone: 'blue' },
  { key: 'erledigt', label: 'Erledigt', tone: 'emerald' },
];

export default function BuchungenPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('alle');

  const rows = useMemo(
    () => (filter === 'alle' ? BOOKINGS : BOOKINGS.filter((b) => groupForStatus(b.status) === filter)),
    [filter],
  );

  const pills: PillDef[] = FILTERS.map((f) => ({
    ...f,
    count: f.key === 'alle' ? BOOKINGS.length : BOOKINGS.filter((b) => groupForStatus(b.status) === f.key).length,
  }));

  const columns: Column<Booking>[] = [
    { key: 'id', header: 'Nr.', cell: (b) => <span className="font-mono text-[12px] text-cyan-700">{b.id}</span> },
    {
      key: 'kunde',
      header: 'Kunde',
      cell: (b) => (
        <div>
          <div className="flex items-center gap-1.5 font-medium text-slate-900">
            {b.kunde}
            {b.warn && <span className="text-amber-500" title="Achtung">⚠</span>}
          </div>
          <div className="text-slate-400 text-[11px] truncate max-w-[200px]">{b.mail}</div>
        </div>
      ),
    },
    { key: 'modell', header: 'Produkt', cell: (b) => b.modell, className: 'hidden sm:table-cell text-slate-600' },
    { key: 'zeitraum', header: 'Zeitraum', cell: (b) => <span className="text-slate-500 text-[12px]">{b.von}–{b.bis}</span>, className: 'hidden md:table-cell' },
    { key: 'betrag', header: 'Betrag', align: 'right', cell: (b) => <span className="font-mono text-[12px]">{b.betrag}</span> },
    { key: 'status', header: 'Status', align: 'right', cell: (b) => <BookingStatusChip status={b.status} /> },
    { key: 'chevron', header: '', align: 'right', width: '32px', cell: () => <ChevronRight size={15} className="text-slate-300 inline" /> },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Buchungen"
        subtitle="Alle verwalten und Status aktualisieren."
        actions={<ButtonLink href="/admin/buchungen/neu" variant="primary" icon={Plus}>Neue Buchung</ButtonLink>}
      />
      <FilterPills pills={pills} active={filter} onChange={setFilter} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(b, i) => b.id + i}
        onRowClick={(b) => router.push(`/admin/buchungen/${b.id}`)}
        empty="Keine Buchungen in diesem Status."
      />
    </div>
  );
}
