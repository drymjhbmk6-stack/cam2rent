'use client';

import { useState } from 'react';
import {
  LayoutDashboard, TrendingUp, TrendingDown, CreditCard, FileBarChart, Settings,
  AlertTriangle, Link2, CalendarClock, ArrowRight, FileText, Download, Info,
} from 'lucide-react';
import {
  PageHeader, Panel, Tabs, DataTable, StatusChip, StatRows, Button, ButtonLink, KVBlock,
} from '@/components/admin/ui';
import type { Column, TabDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Buchhaltungs-Cockpit (6 Tabs, statisch). */

const TABS: TabDef[] = [
  { key: 'cockpit', label: 'Cockpit', icon: LayoutDashboard },
  { key: 'einnahmen', label: 'Einnahmen', icon: TrendingUp },
  { key: 'ausgaben', label: 'Ausgaben', icon: TrendingDown },
  { key: 'stripe', label: 'Stripe-Abgleich', icon: CreditCard },
  { key: 'berichte', label: 'Berichte', icon: FileBarChart },
  { key: 'einstellungen', label: 'Einstellungen', icon: Settings },
];

export default function BuchhaltungPage() {
  const [tab, setTab] = useState('cockpit');
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Buchhaltung"
        subtitle="Cockpit, Einnahmen, Ausgaben, Stripe-Abgleich, Berichte — Kleinunternehmer, SKR03."
        actions={<ButtonLink href="/admin/buchhaltung/belege" variant="secondary" size="sm" icon={FileText}>Belege</ButtonLink>}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'cockpit' && <Cockpit />}
      {tab === 'einnahmen' && <Einnahmen />}
      {tab === 'ausgaben' && <Ausgaben />}
      {tab === 'stripe' && <Stripe />}
      {tab === 'berichte' && <Berichte />}
      {tab === 'einstellungen' && <Einstellungen />}
    </div>
  );
}

/* ── Cockpit ── */

type Todo = {
  sev: 'danger' | 'warn' | 'info';
  icon: typeof AlertTriangle;
  title: string;
  text: string;
  action: string;
};

const TODOS: Todo[] = [
  { sev: 'danger', icon: AlertTriangle, title: '2 Rechnungen überfällig', text: 'RE-2624-011 & RE-2624-014 — Zahlungsziel überschritten. Mahnstufe 1 als Entwurf bereit.', action: 'Offene Posten' },
  { sev: 'warn', icon: Link2, title: '3 Stripe-Zahlungen nicht zugeordnet', text: 'Eingänge ohne passende Buchung — Auto-Match per E-Mail geprüft, manuelle Zuordnung nötig.', action: 'Stripe-Abgleich' },
  { sev: 'warn', icon: CalendarClock, title: 'Monatsabschluss Juni offen', text: 'Belege klassifiziert, Stripe abgeglichen. EÜR-Vorschau prüfen und Monat festschreiben.', action: 'Abschluss starten' },
  { sev: 'info', icon: FileText, title: '4 Belege ohne Klassifizierung', text: 'KI-OCR abgeschlossen — Positionen als AfA / GWG / Ausgabe bestätigen.', action: 'Belege öffnen' },
];

const SEV: Record<Todo['sev'], { border: string; icon: string; chip: ChipTone; label: string }> = {
  danger: { border: 'border-l-rose-400', icon: 'text-rose-500', chip: 'rose', label: 'Dringend' },
  warn: { border: 'border-l-amber-400', icon: 'text-amber-500', chip: 'amber', label: 'Bald' },
  info: { border: 'border-l-cyan-400', icon: 'text-cyan-500', chip: 'cyan', label: 'Hinweis' },
};

function Cockpit() {
  return (
    <div className="space-y-4">
      <StatRows
        groups={[
          {
            label: 'Juni 2026',
            items: [
              { value: '4.812,50 €', label: 'Umsatz', tone: 'strong' },
              { value: '1.203,80 €', label: 'Ausgaben' },
              { value: '3 608,70 €', label: 'Überschuss', tone: 'accent' },
            ],
          },
          {
            label: 'Rechnungen',
            items: [
              { value: '18', label: 'bezahlt', tone: 'default' },
              { value: '2', label: 'offen', tone: 'default' },
              { value: '448,00 €', label: 'überfällig', tone: 'danger' },
            ],
          },
        ]}
      />
      <Panel title="Heute zu tun" right={<span className="text-[11px] text-slate-400">4 Aufgaben</span>}>
        <div className="space-y-2">
          {TODOS.map((t) => {
            const s = SEV[t.sev];
            const Icon = t.icon;
            return (
              <div key={t.title} className={`flex items-start gap-3 rounded-lg border border-slate-200 border-l-2 ${s.border} bg-white px-3 py-2.5`}>
                <Icon size={16} className={`mt-0.5 shrink-0 ${s.icon}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-[13px]">{t.title}</span>
                    <StatusChip tone={s.chip}>{s.label}</StatusChip>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">{t.text}</p>
                </div>
                <Button variant="secondary" size="sm" iconRight={ArrowRight} className="shrink-0">{t.action}</Button>
              </div>
            );
          })}
        </div>
      </Panel>
      <p className="text-slate-500 text-[12px]">Eine Inbox statt neun Tabs: Das Cockpit bündelt alles, was heute Hand braucht — nach Dringlichkeit sortiert.</p>
    </div>
  );
}

/* ── Einnahmen ── */

type Rechnung = { nr: string; kunde: string; datum: string; betrag: string; bezahlt: boolean };
const RECHNUNGEN: Rechnung[] = [
  { nr: 'RE-2624-018', kunde: 'Lena Brandt', datum: '18.06.2026', betrag: '289,90 €', bezahlt: true },
  { nr: 'RE-2624-017', kunde: 'Marco Weiß', datum: '16.06.2026', betrag: '154,00 €', bezahlt: true },
  { nr: 'RE-2624-014', kunde: 'Jonas Peters', datum: '11.06.2026', betrag: '198,00 €', bezahlt: false },
  { nr: 'RE-2624-012', kunde: 'Sophie Adler', datum: '09.06.2026', betrag: '412,50 €', bezahlt: true },
  { nr: 'RE-2624-011', kunde: 'Kai Röhlig', datum: '07.06.2026', betrag: '250,00 €', bezahlt: false },
];

function Einnahmen() {
  const columns: Column<Rechnung>[] = [
    { key: 'nr', header: 'Nr.', cell: (r) => <span className="font-mono text-[12px] text-cyan-700">{r.nr}</span> },
    { key: 'kunde', header: 'Kunde', cell: (r) => <span className="font-medium text-slate-900">{r.kunde}</span> },
    { key: 'datum', header: 'Datum', cell: (r) => <span className="text-slate-500 text-[12px]">{r.datum}</span>, className: 'hidden sm:table-cell' },
    { key: 'betrag', header: 'Betrag', align: 'right', cell: (r) => <span className="font-mono font-semibold">{r.betrag}</span> },
    { key: 'status', header: 'Status', align: 'right', cell: (r) => <StatusChip tone={r.bezahlt ? 'emerald' : 'amber'}>{r.bezahlt ? 'Bezahlt' : 'Offen'}</StatusChip> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {['Rechnungen', 'Offene Posten', 'Gutschriften'].map((f, i) => (
          <button key={f} className={`px-2.5 py-1 rounded text-[11px] ${i === 0 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{f}</button>
        ))}
      </div>
      <DataTable columns={columns} rows={RECHNUNGEN} rowKey={(r) => r.nr} onRowClick={() => {}} />
      <p className="text-slate-500 text-[12px]">Rechnungsnummern sind lückenlos und GoBD-fest — Stornos laufen über separate Gutschriften.</p>
    </div>
  );
}

/* ── Ausgaben ── */

type Ausgabe = { datum: string; text: string; kat: string; katTone: ChipTone; betrag: string };
const AUSGABEN: Ausgabe[] = [
  { datum: '19.06.2026', text: 'Stripe-Gebühren von C2R-2624-018', kat: 'Gebühren', katTone: 'slate', betrag: '8,42 €' },
  { datum: '17.06.2026', text: 'DHL-Versandmarken (Sammelrechnung)', kat: 'Versand', katTone: 'cyan', betrag: '64,90 €' },
  { datum: '14.06.2026', text: 'Ersatz-Akku Insta360 X4 (3 Stk.)', kat: 'GWG', katTone: 'amber', betrag: '89,70 €' },
  { datum: '10.06.2026', text: 'Adobe Creative Cloud (Monat)', kat: 'Software', katTone: 'blue', betrag: '59,49 €' },
  { datum: '04.06.2026', text: 'Reinigungssets & Verpackung', kat: 'Büro', katTone: 'slate', betrag: '31,80 €' },
];

function Ausgaben() {
  const columns: Column<Ausgabe>[] = [
    { key: 'datum', header: 'Datum', cell: (a) => <span className="text-slate-500 text-[12px]">{a.datum}</span> },
    { key: 'text', header: 'Beschreibung', cell: (a) => <span className="text-slate-800">{a.text}</span> },
    { key: 'kat', header: 'Kategorie', cell: (a) => <StatusChip tone={a.katTone}>{a.kat}</StatusChip>, className: 'hidden sm:table-cell' },
    { key: 'betrag', header: 'Betrag', align: 'right', cell: (a) => <span className="font-mono font-semibold text-rose-600">{a.betrag}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {['Manuell', 'Einkauf'].map((f, i) => (
          <button key={f} className={`px-2.5 py-1 rounded text-[11px] ${i === 0 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{f}</button>
        ))}
        <span className="ml-auto self-center font-mono text-[12px] text-slate-500">Summe Juni: <span className="font-semibold text-slate-800">1.203,80 €</span></span>
      </div>
      <DataTable columns={columns} rows={AUSGABEN} rowKey={(a) => a.text} />
    </div>
  );
}

/* ── Stripe-Abgleich ── */

type Tx = { datum: string; betrag: string; kunde: string; match: 'matched' | 'unmatched' | 'refunded' };
const TX: Tx[] = [
  { datum: '18.06.2026', betrag: '289,90 €', kunde: 'Lena Brandt', match: 'matched' },
  { datum: '16.06.2026', betrag: '154,00 €', kunde: 'Marco Weiß', match: 'matched' },
  { datum: '15.06.2026', betrag: '99,00 €', kunde: 'unbekannt (m***@gmx.de)', match: 'unmatched' },
  { datum: '12.06.2026', betrag: '−45,00 €', kunde: 'Sophie Adler (Teilerstattung)', match: 'refunded' },
];
const MATCH: Record<Tx['match'], { tone: ChipTone; label: string }> = {
  matched: { tone: 'emerald', label: 'Zugeordnet' },
  unmatched: { tone: 'amber', label: 'Nicht zugeordnet' },
  refunded: { tone: 'amber', label: 'Erstattet' },
};

function Stripe() {
  const columns: Column<Tx>[] = [
    { key: 'datum', header: 'Datum', cell: (t) => <span className="text-slate-500 text-[12px]">{t.datum}</span> },
    { key: 'betrag', header: 'Betrag', cell: (t) => <span className={`font-mono font-semibold ${t.betrag.startsWith('−') ? 'text-rose-600' : 'text-slate-800'}`}>{t.betrag}</span> },
    { key: 'kunde', header: 'Kunde', cell: (t) => <span className="text-slate-700 text-[12px]">{t.kunde}</span> },
    { key: 'match', header: 'Match-Status', align: 'right', cell: (t) => <StatusChip tone={MATCH[t.match].tone}>{MATCH[t.match].label}</StatusChip> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-slate-500 text-[12px] flex-1">Stündlicher Auto-Sync + Match per E-Mail/Betrag. Nicht zuordenbare Eingänge landen hier.</p>
        <Button variant="secondary" size="sm">Synchronisieren</Button>
      </div>
      <DataTable columns={columns} rows={TX} rowKey={(t) => t.datum + t.betrag} onRowClick={() => {}} />
      <p className="text-slate-500 text-[12px]">Doppelzahlungen werden erkannt (netto null), der Stripe-Refund bleibt bewusst ein manueller Schritt.</p>
    </div>
  );
}

/* ── Berichte ── */

function Berichte() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Panel title="EÜR-Vorschau · Juni 2026">
        <div className="grid grid-cols-2 gap-3">
          <KVBlock k="Einnahmen (netto)" v="4.812,50 €" mono accent />
          <KVBlock k="Ausgaben (netto)" v="1.203,80 €" mono />
          <KVBlock k="Überschuss" v="3.608,70 €" mono />
          <KVBlock k="Belege" v="27" mono />
        </div>
        <div className="mt-3">
          <Button variant="secondary" size="sm" icon={FileText}>Detaillierte EÜR öffnen</Button>
        </div>
      </Panel>
      <Panel title="USt-Voranmeldung">
        <div className="flex items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0 text-cyan-500" />
          <p className="text-[12px] text-slate-600">Kleinunternehmer nach § 19 UStG — keine Umsatzsteuer ausgewiesen, kein Vorsteuerabzug. Eine USt-Voranmeldung ist nicht erforderlich.</p>
        </div>
        <div className="mt-3">
          <StatusChip tone="emerald">Nicht erforderlich</StatusChip>
        </div>
      </Panel>
      <Panel title="DATEV-Export" className="md:col-span-2">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[12px] text-slate-600 flex-1">Buchungsstapel im DATEV-Format (SKR03) für den Steuerberater — inkl. AfA-Zeilen aus dem Anlagenverzeichnis.</p>
          <Button variant="primary" size="sm" icon={Download}>DATEV exportieren</Button>
        </div>
      </Panel>
    </div>
  );
}

/* ── Einstellungen ── */

function Einstellungen() {
  return (
    <Panel title="Steuer &amp; Kontenrahmen">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KVBlock k="Steuer-Modus" v="Kleinunternehmer (§ 19)" accent />
        <KVBlock k="Kontenrahmen" v="SKR03" mono />
        <KVBlock k="Umsatzsteuer" v="0 % ausgewiesen" />
        <KVBlock k="Wirtschaftsjahr" v="Kalenderjahr" />
        <KVBlock k="Belegnummer" v="lückenlos" mono />
        <KVBlock k="Mahnstufen" v="1 – 3" />
      </div>
      <p className="text-slate-500 text-[12px] mt-3">Beim Wechsel auf Regelbesteuerung schaltet das System auf ausgewiesene USt, Vorsteuerabzug und harte Periodensperre um.</p>
    </Panel>
  );
}
