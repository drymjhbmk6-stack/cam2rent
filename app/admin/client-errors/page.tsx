'use client';

import { AlertTriangle } from 'lucide-react';
import { PageHeader, DataTable, StatusChip } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Frontend-Fehlerprotokoll (Design-Prototyp, statisch). */

type ClientError = {
  id: string;
  at: string;
  url: string;
  message: string;
  count: number;
  agent: string;
};

const ERRORS: ClientError[] = [
  { id: 'c1', at: '21.07.2026 13:44', url: '/kameras/gopro-hero13/buchen', message: "TypeError: Cannot read properties of undefined (reading 'price')", count: 4, agent: 'Safari 17 · iPhone' },
  { id: 'c2', at: '21.07.2026 10:12', url: '/checkout', message: 'ChunkLoadError: Loading chunk 482 failed', count: 2, agent: 'Chrome 126 · Windows' },
  { id: 'c3', at: '20.07.2026 19:58', url: '/set-konfigurator', message: 'Hydration failed: text content did not match', count: 1, agent: 'Firefox 128 · Android' },
  { id: 'c4', at: '20.07.2026 08:31', url: '/konto/buchungen', message: 'NetworkError when attempting to fetch resource', count: 7, agent: 'Chrome 126 · macOS' },
  { id: 'c5', at: '19.07.2026 21:07', url: '/kameras', message: "ReferenceError: gtag is not defined", count: 3, agent: 'Edge 126 · Windows' },
];

export default function ClientErrorsPage() {
  const columns: Column<ClientError>[] = [
    { key: 'at', header: 'Zeitpunkt', cell: (e) => <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{e.at}</span> },
    { key: 'url', header: 'Seite', cell: (e) => <span className="font-mono text-[11px] text-cyan-700 block max-w-[180px] truncate" title={e.url}>{e.url}</span> },
    {
      key: 'message',
      header: 'Fehlermeldung',
      cell: (e) => <span className="text-slate-600 text-[12px] block max-w-[320px] truncate" title={e.message}>{e.message}</span>,
    },
    {
      key: 'count',
      header: 'Häufigkeit',
      align: 'center',
      cell: (e) => <StatusChip tone={e.count >= 5 ? 'rose' : 'amber'}>{e.count}×</StatusChip>,
    },
    { key: 'agent', header: 'Browser', align: 'right', cell: (e) => <span className="text-slate-400 text-[11px]">{e.agent}</span>, className: 'hidden lg:table-cell' },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Frontend-Fehlerprotokoll" subtitle="JavaScript-Fehler, die im Browser der Kunden aufgetreten sind." />

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px]">
        <AlertTriangle size={14} className="shrink-0" />
        Einträge werden nach 30 Tagen automatisch gelöscht (DSGVO-Retention).
      </div>

      <DataTable columns={columns} rows={ERRORS} rowKey={(e) => e.id} onRowClick={() => {}} />

      <p className="text-slate-400 text-[11px]">Design-Prototyp · Beispieldaten.</p>
    </div>
  );
}
