'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader, FilterPills, DataTable, StatusChip, MiniStat } from '@/components/admin/ui';
import type { Column, PillDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — E-Mail-Protokoll (Design-Prototyp, statisch). */

type Email = {
  id: string;
  sentAt: string;
  type: string;
  typeTone: ChipTone;
  recipient: string;
  subject: string;
  booking: string | null;
  status: 'sent' | 'failed';
};

const EMAILS: Email[] = [
  { id: 'e1', sentAt: '21.07.2026 14:32', type: 'Buchungsbestätigung', typeTone: 'cyan', recipient: 'amreswar.v@gmail.com', subject: 'Deine Buchung C2R-2629-004 ist bestätigt', booking: 'C2R-2629-004', status: 'sent' },
  { id: 'e2', sentAt: '21.07.2026 14:31', type: 'Buchung (Admin)', typeTone: 'blue', recipient: 'kontakt@cam2rent.de', subject: 'Neue Buchung — GoPro Hero13 Black', booking: 'C2R-2629-004', status: 'sent' },
  { id: 'e3', sentAt: '21.07.2026 11:08', type: 'Versandbestätigung', typeTone: 'emerald', recipient: 'j.jungbluth@web.de', subject: 'Dein Paket ist unterwegs — DHL', booking: 'C2R-2629-002', status: 'sent' },
  { id: 'e4', sentAt: '21.07.2026 09:47', type: 'Rückgabe-Checkliste', typeTone: 'amber', recipient: 'peter.vieler@t-online.de', subject: 'Heute ist Rückgabetag — deine Checkliste', booking: 'C2R-2628-011', status: 'sent' },
  { id: 'e5', sentAt: '20.07.2026 18:20', type: 'Zahlungs-Link', typeTone: 'blue', recipient: 'sandra.k@outlook.de', subject: 'Bitte Zahlung abschließen — C2R-2628-009', booking: 'C2R-2628-009', status: 'failed' },
  { id: 'e6', sentAt: '20.07.2026 16:03', type: 'Bewertungsanfrage', typeTone: 'amber', recipient: 'kai.roehlig@gmx.de', subject: 'Wie war deine Miete? 10 % Gutschein', booking: 'C2R-2626-006', status: 'sent' },
  { id: 'e7', sentAt: '20.07.2026 08:15', type: 'Newsletter: Kampagne', typeTone: 'slate', recipient: '412 Empfänger', subject: 'Sommer-Aktion: 15 % auf alle Action-Cams', booking: null, status: 'sent' },
  { id: 'e8', sentAt: '19.07.2026 22:41', type: 'Wochenbericht', typeTone: 'cyan', recipient: 'kontakt@cam2rent.de', subject: 'Wochenbericht KW 29', booking: null, status: 'sent' },
];

const TYPE_PILLS: PillDef[] = [
  { key: 'alle', label: 'Alle', count: EMAILS.length },
  { key: 'buchung', label: 'Buchung', tone: 'cyan' },
  { key: 'versand', label: 'Versand', tone: 'emerald' },
  { key: 'zahlung', label: 'Zahlung', tone: 'blue' },
  { key: 'marketing', label: 'Marketing', tone: 'amber' },
];

export default function EmailLogPage() {
  const [filter, setFilter] = useState('alle');

  const columns: Column<Email>[] = [
    {
      key: 'sentAt',
      header: 'Zeitpunkt',
      cell: (e) => (
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${e.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{e.sentAt}</span>
        </span>
      ),
    },
    { key: 'type', header: 'Typ', cell: (e) => <StatusChip tone={e.typeTone}>{e.type}</StatusChip> },
    { key: 'recipient', header: 'Empfänger', cell: (e) => <span className="text-slate-700 text-[12px]">{e.recipient}</span>, className: 'hidden md:table-cell' },
    {
      key: 'subject',
      header: 'Betreff',
      cell: (e) => <span className="text-slate-500 text-[12px] block max-w-[280px] truncate" title={e.subject}>{e.subject}</span>,
    },
    {
      key: 'booking',
      header: 'Buchung',
      cell: (e) => (e.booking ? <span className="font-mono text-[11px] text-cyan-700">{e.booking}</span> : <span className="text-slate-300">–</span>),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (e) => <StatusChip tone={e.status === 'failed' ? 'rose' : 'emerald'}>{e.status === 'failed' ? 'Fehler' : 'Gesendet'}</StatusChip>,
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="E-Mail-Protokoll" subtitle="Alle automatisch versendeten E-Mails — 1.284 Einträge." />

      <div className="flex gap-3 flex-wrap">
        <MiniStat value="1.284" label="Gesamt" />
        <MiniStat value="1.271" label="Gesendet" tone="emerald" />
        <MiniStat value="13" label="Fehlgeschlagen" tone="rose" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
          <Search size={13} />E-Mail, Buchungsnr., Betreff…
        </div>
      </div>

      <FilterPills pills={TYPE_PILLS} active={filter} onChange={setFilter} />

      <DataTable columns={columns} rows={EMAILS} rowKey={(e) => e.id} onRowClick={() => {}} />
    </div>
  );
}
