'use client';

import { useState } from 'react';
import {
  Search, MessageSquare, Star, Image as ImageIcon, Plus, Mail, MessageCircle,
} from 'lucide-react';
import { PageHeader, Panel, Tabs, DataTable, StatusChip, MiniStat, Button } from '@/components/admin/ui';
import type { Column, TabDef } from '@/components/admin/ui';
import { CUSTOMERS, MESSAGES, WAITLIST, type Customer } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Kunden & Kommunikation (6 Tabs, statisch). */

const TABS: TabDef[] = [
  { key: 'kunden', label: 'Kunden' },
  { key: 'nachrichten', label: 'Nachrichten' },
  { key: 'warteliste', label: 'Warteliste' },
  { key: 'material', label: 'Material' },
  { key: 'bewertungen', label: 'Bewertungen' },
  { key: 'schaeden', label: 'Schäden' },
];

export default function KundenPage() {
  const [tab, setTab] = useState('kunden');
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Kunden & Kommunikation" subtitle="25 Kunden · Anfragen, Warteliste, Material, Schäden." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'kunden' && <KundenTab />}
      {tab === 'nachrichten' && <NachrichtenTab />}
      {tab === 'warteliste' && <WartelisteTab />}
      {tab === 'material' && <EmptyState icon={ImageIcon} title="Kundenmaterial" text="Von Kunden hochgeladene Fotos/Videos — prüfen, freigeben, feature-markieren. Aktuell keine Einreichungen." filters={['Wartet', 'Freigegeben', 'Veröffentlicht', 'Abgelehnt']} />}
      {tab === 'bewertungen' && <EmptyState icon={Star} title="Bewertungen" text="Kundenbewertungen prüfen, genehmigen und beantworten. Aktuell keine vorhanden." filters={['Alle', 'Ausstehend', 'Genehmigt']} />}
      {tab === 'schaeden' && <SchaedenTab />}
    </div>
  );
}

function KundenTab() {
  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (k) => (
        <span className="flex items-center gap-2 font-medium text-slate-900">
          {k.name}
          {k.tester && <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">Tester</span>}
        </span>
      ),
    },
    { key: 'mail', header: 'E-Mail', cell: (k) => <span className="text-slate-500 text-[12px]">{k.mail}</span>, className: 'hidden sm:table-cell' },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (k) => <StatusChip tone={k.status === 'aktiv' ? 'emerald' : k.status === 'gesperrt' ? 'rose' : 'slate'}>{k.status}</StatusChip>,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
          <Search size={13} />Name, E-Mail, Stadt…
        </div>
        <div className="flex gap-1">
          {['Alle', 'Aktive', 'Gesperrte', 'Inaktiv'].map((f, i) => (
            <button key={f} className={`px-2.5 py-1 rounded text-[11px] ${i === 0 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{f}</button>
          ))}
        </div>
      </div>
      <DataTable columns={columns} rows={CUSTOMERS} rowKey={(k) => k.mail} onRowClick={() => {}} />
    </div>
  );
}

function NachrichtenTab() {
  return (
    <Panel title="Konversationen" noBody>
      <div className="divide-y divide-slate-100">
        {MESSAGES.map((n, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
            <MessageSquare size={15} className={`mt-0.5 shrink-0 ${n.offen ? 'text-cyan-500' : 'text-slate-300'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{n.name}</span>
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  {n.kanal === 'email' ? <><Mail size={9} />E-Mail</> : <><MessageCircle size={9} />Konto</>}
                </span>
                {n.offen ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-semibold">OFFEN</span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Geschlossen</span>
                )}
                <span className="ml-auto text-[11px] text-slate-400">vor {n.vor}</span>
              </div>
              <div className="text-[12px] text-slate-700 truncate">{n.betreff}</div>
              <div className="text-[11px] text-slate-400 truncate">{n.preview}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WartelisteTab() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-[12px] flex-wrap">
        <MiniStat value="5" label="Einträge" />
        <MiniStat value="2" label="Produkte" />
        <MiniStat value="5" label="offen zu benachrichtigen" tone="accent" />
      </div>
      {WAITLIST.map((w, i) => (
        <Panel key={i} title={<span className="flex items-center gap-2"><span className="font-semibold text-slate-700 normal-case tracking-normal text-[13px]">{w.produkt}</span><span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">{w.leute.length} Interessenten</span></span>} noBody>
          <table className="w-full">
            <tbody>
              {w.leute.map((p, j) => (
                <tr key={j} className={j % 2 ? 'bg-slate-50/40' : ''}>
                  <td className="py-2 px-3 text-cyan-700 text-[12px]">{p.mail}</td>
                  <td className="py-2 px-3 text-slate-500 text-[12px]">{p.useCase}</td>
                  <td className="py-2 px-3 text-right text-slate-400 text-[11px]">Produktkarte</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
      <p className="text-slate-500 text-[12px]">Dein Nachfrage-Signal: 3 Leute warten auf die Ace Pro 2 — direkter Hinweis, wo Bestand fehlt.</p>
    </div>
  );
}

function SchaedenTab() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-3 text-[12px] flex-1">
          <MiniStat value="0" label="Offen" tone="accent" />
          <MiniStat value="0" label="Bestätigt" />
          <MiniStat value="1" label="Abgeschlossen" />
        </div>
        <Button variant="warning" size="sm" icon={Plus}>Neue Schadensmeldung</Button>
      </div>
      <Panel noBody title={undefined}>
        <table className="w-full">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium py-2 px-3">Buchung</th>
              <th className="text-left font-medium py-2 px-3">Kamera</th>
              <th className="text-left font-medium py-2 px-3">Kunde</th>
              <th className="text-right font-medium py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-slate-50 cursor-pointer">
              <td className="py-2.5 px-3 font-mono text-[12px] text-cyan-700">C2R-2624-006<div className="text-[10px] text-slate-400 font-sans">Vom Admin</div></td>
              <td className="py-2.5 px-3">OSMO Action 5 Pro</td>
              <td className="py-2.5 px-3">Kai Röhlig</td>
              <td className="py-2.5 px-3 text-right"><StatusChip tone="emerald">Abgeschlossen</StatusChip></td>
            </tr>
          </tbody>
        </table>
      </Panel>
      <p className="text-slate-500 text-[12px]">Schadensmeldung startet aus der Buchung heraus (positionsgenaue Wiederbeschaffung). Prüfung → Kaution → Reparatur.</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, filters }: { icon: typeof Star; title: string; text: string; filters?: string[] }) {
  return (
    <div className="space-y-3">
      {filters && (
        <div className="flex gap-2 flex-wrap">
          {filters.map((f, i) => (
            <button key={f} className={`px-3 py-1.5 rounded-full border text-[12px] ${i === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>{f}</button>
          ))}
        </div>
      )}
      <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center">
        <Icon size={22} className="mx-auto text-slate-300 mb-2" />
        <p className="font-medium text-slate-700">{title}</p>
        <p className="text-slate-400 mt-1 text-[12px] max-w-sm mx-auto">{text}</p>
      </div>
    </div>
  );
}
