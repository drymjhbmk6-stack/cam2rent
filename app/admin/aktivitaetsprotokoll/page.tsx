'use client';

import { Search } from 'lucide-react';
import { PageHeader, DataTable } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Admin-Aktivitätsprotokoll (Design-Prototyp, statisch). */

type Entry = {
  id: string;
  at: string;
  action: string;
  object: string;
  by: string;
  ip: string;
};

const ENTRIES: Entry[] = [
  { id: 'a1', at: '21.07.2026 14:33', action: 'booking.mark_paid', object: 'C2R-2629-004', by: 'Lars Schickel', ip: '84.132.14.7' },
  { id: 'a2', at: '21.07.2026 12:10', action: 'booking.ship', object: 'C2R-2629-002', by: 'Maja Weber', ip: '84.132.14.7' },
  { id: 'a3', at: '21.07.2026 09:52', action: 'customer.verify', object: 'Peter Vieler', by: 'Lars Schickel', ip: '84.132.14.7' },
  { id: 'a4', at: '20.07.2026 18:21', action: 'booking.cancel', object: 'C2R-2628-009', by: 'Maja Weber', ip: '91.44.203.18' },
  { id: 'a5', at: '20.07.2026 16:40', action: 'invoice.mark_paid', object: 'RE-2628-004', by: 'Lars Schickel', ip: '84.132.14.7' },
  { id: 'a6', at: '20.07.2026 11:05', action: 'settings.update', object: 'shipping', by: 'Lars Schickel', ip: '84.132.14.7' },
  { id: 'a7', at: '19.07.2026 22:41', action: 'newsletter.send_campaign', object: 'Sommer-Aktion', by: 'Maja Weber', ip: '91.44.203.18' },
  { id: 'a8', at: '19.07.2026 15:18', action: 'customer.block', object: 'sandra.k@outlook.de', by: 'Lars Schickel', ip: '84.132.14.7' },
];

export default function AktivitaetsprotokollPage() {
  const columns: Column<Entry>[] = [
    { key: 'at', header: 'Zeitpunkt', cell: (e) => <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{e.at}</span> },
    {
      key: 'action',
      header: 'Aktion',
      cell: (e) => (
        <span className="inline-flex items-center rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
          {e.action}
        </span>
      ),
    },
    { key: 'object', header: 'Objekt', cell: (e) => <span className="font-mono text-[11px] text-cyan-700">{e.object}</span> },
    { key: 'by', header: 'Mitarbeiter', cell: (e) => <span className="text-slate-700 text-[12px]">{e.by}</span>, className: 'hidden md:table-cell' },
    { key: 'ip', header: 'IP', align: 'right', cell: (e) => <span className="font-mono text-[11px] text-slate-400">{e.ip}</span>, className: 'hidden lg:table-cell' },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Aktivitätsprotokoll" subtitle="Wer hat wann was im Admin geändert — lückenloses Audit-Log." />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
          <Search size={13} />Aktion, Objekt, Mitarbeiter…
        </div>
        <div className="flex gap-1">
          {['Alle', 'Buchungen', 'Kunden', 'Finanzen', 'System'].map((f, i) => (
            <button key={f} className={`px-2.5 py-1 rounded text-[11px] ${i === 0 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{f}</button>
          ))}
        </div>
      </div>

      <DataTable columns={columns} rows={ENTRIES} rowKey={(e) => e.id} />

      <p className="text-slate-400 text-[11px]">Design-Prototyp · Beispieldaten.</p>
    </div>
  );
}
