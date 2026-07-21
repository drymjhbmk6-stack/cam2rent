'use client';

import { Plus } from 'lucide-react';
import { PageHeader, DataTable, StatusChip, Button } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Angebots-Bündel (Festpreis-Pakete, statisch). */

type Angebot = {
  name: string;
  kameras: string;
  preis: string;
  von: string;
  bis: string;
  vorab: string;
  status: 'live' | 'geplant' | 'abgelaufen';
};

const ANGEBOTE: Angebot[] = [
  { name: 'Sommer-Bundle Wassersport', kameras: 'GoPro Hero 13, Insta360 X5', preis: '89,00 €', von: '01.06.2026', bis: '31.08.2026', vorab: '20.05.2026', status: 'live' },
  { name: 'Vlog-Starter Komplett', kameras: 'DJI Osmo Pocket 3', preis: '59,00 €', von: '15.07.2026', bis: '15.09.2026', vorab: '01.07.2026', status: 'geplant' },
  { name: 'Wintersport-Paket 360°', kameras: 'Insta360 X4', preis: '75,00 €', von: '01.12.2026', bis: '28.02.2027', vorab: '15.11.2026', status: 'geplant' },
  { name: 'Oster-Deal Action', kameras: 'GoPro Hero 12', preis: '49,00 €', von: '01.04.2026', bis: '20.04.2026', vorab: '—', status: 'abgelaufen' },
];

const STATUS: Record<Angebot['status'], { label: string; tone: 'emerald' | 'cyan' | 'slate' }> = {
  live: { label: 'Live', tone: 'emerald' },
  geplant: { label: 'Geplant', tone: 'cyan' },
  abgelaufen: { label: 'Abgelaufen', tone: 'slate' },
};

export default function AngebotePage() {
  const columns: Column<Angebot>[] = [
    {
      key: 'name',
      header: 'Angebot',
      cell: (a) => (
        <div>
          <div className="font-medium text-slate-900">{a.name}</div>
          <div className="text-slate-400 text-[11px] truncate max-w-[240px]">{a.kameras}</div>
        </div>
      ),
    },
    { key: 'preis', header: 'Preis', align: 'right', cell: (a) => <span className="font-mono text-[12px] font-semibold text-slate-900">{a.preis}</span> },
    { key: 'zeitraum', header: 'Gültig', align: 'right', cell: (a) => <span className="text-slate-500 text-[12px]">{a.von}–{a.bis}</span>, className: 'hidden md:table-cell' },
    { key: 'vorab', header: 'Vorab ab', align: 'right', cell: (a) => <span className="text-slate-500 text-[12px]">{a.vorab}</span>, className: 'hidden lg:table-cell' },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (a) => {
        const s = STATUS[a.status];
        return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
      },
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Angebots-Bündel"
        subtitle="Kuratierte Festpreis-Pakete — Kamera plus Zubehör, nur im gewählten Zeitraum buchbar."
        actions={<Button variant="primary" icon={Plus}>Neues Angebot</Button>}
      />
      <DataTable columns={columns} rows={ANGEBOTE} rowKey={(a) => a.name} empty="Noch keine Angebote angelegt." />
    </div>
  );
}
