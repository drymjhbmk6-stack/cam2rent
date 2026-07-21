'use client';

import { useState } from 'react';
import { Users, Send, Bell } from 'lucide-react';
import { PageHeader, Panel, Tabs, StatRows, DataTable, StatusChip, Button } from '@/components/admin/ui';
import type { Column, TabDef, StatGroup } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Newsletter & Kunden-Push (statisch). */

const TABS: TabDef[] = [
  { key: 'abonnenten', label: 'Abonnenten', icon: Users },
  { key: 'versand', label: 'Versand', icon: Send },
  { key: 'push', label: 'Kunden-Push', icon: Bell },
];

type Abonnent = { email: string; status: 'confirmed' | 'pending' | 'unsubscribed'; datum: string };
const ABONNENTEN: Abonnent[] = [
  { email: 'lars.k@example.de', status: 'confirmed', datum: '02.05.2026' },
  { email: 'mia.berg@example.de', status: 'confirmed', datum: '28.04.2026' },
  { email: 'tom.wagner@example.de', status: 'pending', datum: '11.05.2026' },
  { email: 'sabine.h@example.de', status: 'confirmed', datum: '19.04.2026' },
  { email: 'jonas.p@example.de', status: 'unsubscribed', datum: '06.03.2026' },
  { email: 'nina.f@example.de', status: 'confirmed', datum: '14.05.2026' },
];

const STATUS: Record<Abonnent['status'], { label: string; tone: 'emerald' | 'amber' | 'slate' }> = {
  confirmed: { label: 'Bestätigt', tone: 'emerald' },
  pending: { label: 'Ausstehend', tone: 'amber' },
  unsubscribed: { label: 'Abgemeldet', tone: 'slate' },
};

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 focus:border-cyan-400 focus:outline-none';
const labelCls = 'block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5';

export default function NewsletterPage() {
  const [tab, setTab] = useState('abonnenten');

  const stats: StatGroup[] = [
    {
      label: 'Abonnenten',
      items: [
        { value: 6, label: 'Total' },
        { value: 4, label: 'Aktiv', tone: 'strong' },
        { value: 1, label: 'Ausstehend', tone: 'accent' },
        { value: 1, label: 'Abgemeldet', tone: 'zero' },
      ],
    },
  ];

  const columns: Column<Abonnent>[] = [
    { key: 'email', header: 'E-Mail', cell: (a) => <span className="font-mono text-[12px] text-slate-900">{a.email}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => {
        const s = STATUS[a.status];
        return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
      },
    },
    { key: 'datum', header: 'Angemeldet', align: 'right', cell: (a) => <span className="text-slate-500 text-[12px]">{a.datum}</span> },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="Newsletter"
        subtitle="Abonnenten verwalten, Kampagnen versenden und Kunden per Push erreichen."
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'abonnenten' && (
        <div className="space-y-4">
          <StatRows groups={stats} />
          <DataTable columns={columns} rows={ABONNENTEN} rowKey={(a) => a.email} empty="Noch keine Abonnenten." />
        </div>
      )}

      {tab === 'versand' && (
        <Panel title="Kampagne verfassen">
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className={labelCls}>Betreff</label>
              <input type="text" placeholder="z. B. Neue Action-Cams im Verleih" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Inhalt (HTML)</label>
              <textarea
                rows={8}
                placeholder="<h2>Hallo …</h2>"
                className={`${inputCls} font-mono text-[12px] resize-y`}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary">Test senden</Button>
              <Button variant="primary" icon={Send}>An alle senden</Button>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'push' && (
        <Panel title="Kunden-Push senden">
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className={labelCls}>Titel</label>
              <input type="text" placeholder="z. B. Sommeraktion gestartet" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Text</label>
              <textarea rows={3} placeholder="Kurze Nachricht an alle Kunden-Geräte …" className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Klick-URL</label>
              <input type="text" placeholder="/angebote" className={`${inputCls} font-mono text-[12px]`} />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" icon={Bell}>Push senden</Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
