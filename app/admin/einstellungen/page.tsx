'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, FileText, Sparkles } from 'lucide-react';
import {
  PageHeader, Panel, Tabs, Segmented, KVBlock, StatusChip, Button, ButtonLink,
} from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Einstellungen (Tab-Hub via ?tab=, statisch). */

const TABS: TabDef[] = [
  { key: 'allgemein', label: 'Allgemein' },
  { key: 'versand', label: 'Versand' },
  { key: 'haftung', label: 'Haftung & Kaution' },
  { key: 'vertrag', label: 'Vertrag' },
  { key: 'content-ki', label: 'Content-KI' },
];

const inputCls = 'px-3 py-2 rounded border border-slate-200 bg-white text-[13px] text-slate-800';
const labelCls = 'text-[10px] uppercase tracking-wider text-slate-400 mb-1 block';

function EinstellungenInner() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'allgemein';
  const active = TABS.some((t) => t.key === raw) ? raw : 'allgemein';

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Einstellungen" subtitle="Alle Shop-Konfigurationen an einer Stelle." />
      <Tabs
        tabs={TABS}
        active={active}
        onChange={(key) => router.replace(`/admin/einstellungen?tab=${key}`, { scroll: false })}
      />

      {active === 'allgemein' && <AllgemeinTab />}
      {active === 'versand' && <VersandTab />}
      {active === 'haftung' && <HaftungTab />}
      {active === 'vertrag' && <VertragTab />}
      {active === 'content-ki' && <ContentKiTab />}
    </div>
  );
}

function AllgemeinTab() {
  return (
    <div className="space-y-4">
      <Panel title="Test-/Live-Modus">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusChip tone="rose">LIVE</StatusChip>
          <span className="text-[12px] text-slate-500 flex-1">
            Echte Zahlungen, echte E-Mails und Rechnungsnummern ohne Test-Präfix.
          </span>
          <Button variant="secondary" size="sm">Auf Test umschalten</Button>
        </div>
      </Panel>

      <Panel title="Kaution-Modus">
        <p className="text-[12px] text-slate-500 mb-2">
          Haftungsschutz (Reparaturdepot) oder klassische Kaution per Kreditkarten-Vorautorisierung.
        </p>
        <ChoiceRow
          init="haftung"
          options={[
            { key: 'haftung', label: 'Haftungsschutz' },
            { key: 'kaution', label: 'Kaution' },
          ]}
        />
      </Panel>

      <Panel title="Umsatzsteuer">
        <ChoiceRow
          init="klein"
          options={[
            { key: 'klein', label: 'Kleinunternehmer (§ 19)' },
            { key: 'regel', label: 'Regelbesteuerung 19 %' },
          ]}
        />
      </Panel>

      <Panel title="Puffer-Tage (Verfügbarkeit)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l: 'Versand vorher', v: '3' },
            { l: 'Versand nachher', v: '3' },
            { l: 'Abholung vorher', v: '1' },
            { l: 'Abholung nachher', v: '1' },
          ].map((f) => (
            <div key={f.l}>
              <label className={labelCls}>{f.l}</label>
              <input type="number" defaultValue={f.v} className={`${inputCls} w-full`} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Geschäftsdaten">
        <div className="grid sm:grid-cols-2 gap-3">
          <KVBlock k="Inhaber" v="cam2rent — Lars Schickel" />
          <KVBlock k="Domain" v="cam2rent.de" mono />
          <KVBlock k="Anschrift" v="Musterstraße 12, 10115 Berlin" />
          <KVBlock k="Kontakt" v="kontakt@cam2rent.de" />
          <KVBlock k="IBAN" v="DE12 3456 7890 1234 5678 90" mono />
          <KVBlock k="Steuernummer" v="30/123/45678" mono />
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><Bell size={12} /> Push-Benachrichtigungen</span>}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[12px] text-slate-500">
            Web-Push auf dieses Gerät — neue Buchungen, Retouren, Nachrichten.
          </span>
          <Button variant="primary" size="sm">Push aktivieren</Button>
        </div>
      </Panel>

      <Panel title="Wochenbericht">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[12px] text-slate-500">Jeden Sonntag 18:30 Uhr als E-Mail mit PDF-Anhang.</span>
          <Toggle init={true} />
        </div>
        <div>
          <label className={labelCls}>Empfänger</label>
          <input className={`${inputCls} w-full max-w-sm`} defaultValue="kontakt@cam2rent.de" />
        </div>
      </Panel>
    </div>
  );
}

function VersandTab() {
  const zeilen = [
    { zone: 'Deutschland', gratis: 'ab 49,00 €', standard: '4,99 €', express: '12,99 €' },
    { zone: 'Österreich', gratis: 'ab 79,00 €', standard: '9,99 €', express: '19,99 €' },
    { zone: 'Schweiz', gratis: '—', standard: '14,99 €', express: '24,99 €' },
  ];
  return (
    <Panel title="Versandpreise nach Zone" noBody>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <th className="text-left font-medium py-2 px-3">Zone</th>
            <th className="text-left font-medium py-2 px-3">Gratis-Versand</th>
            <th className="text-right font-medium py-2 px-3">Standard</th>
            <th className="text-right font-medium py-2 px-3">Express</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={z.zone} className={i % 2 ? 'bg-slate-50/40' : ''}>
              <td className="py-2.5 px-3 font-medium text-slate-900">{z.zone}</td>
              <td className="py-2.5 px-3 text-slate-500 text-[12px]">{z.gratis}</td>
              <td className="py-2.5 px-3 text-right font-mono text-[12px] text-slate-800">{z.standard}</td>
              <td className="py-2.5 px-3 text-right font-mono text-[12px] text-slate-800">{z.express}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function HaftungTab() {
  const kategorien = [
    { kat: 'Action-Cam', eigen: '200 €' },
    { kat: '360°-Cam', eigen: '300 €' },
    { kat: 'Gimbal', eigen: '150 €' },
  ];
  return (
    <div className="space-y-4">
      <Panel title="Haftungsoptionen">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-slate-900">Standard</span>
              <StatusChip tone="amber">Basis</StatusChip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KVBlock k="Grundpreis (1–7 T.)" v="15,00 €" />
              <KVBlock k="je weitere Woche" v="+5,00 €" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-slate-900">Premium</span>
              <StatusChip tone="emerald">0 € Eigenanteil</StatusChip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KVBlock k="Grundpreis (1–7 T.)" v="25,00 €" />
              <KVBlock k="je weitere Woche" v="+10,00 €" />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Kein Versicherungsprodukt — die Prämien bilden ein eigenes Reparaturdepot.
        </p>
      </Panel>

      <Panel title="Eigenbeteiligung je Kategorie (Standard)" noBody>
        <table className="w-full">
          <tbody>
            {kategorien.map((k, i) => (
              <tr key={k.kat} className={i % 2 ? 'bg-slate-50/40' : ''}>
                <td className="py-2.5 px-3 font-medium text-slate-900">{k.kat}</td>
                <td className="py-2.5 px-3 text-right font-mono text-[13px] text-slate-800">{k.eigen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function VertragTab() {
  const paragraphen = [
    { nr: '§ 1', titel: 'Vertragsgegenstand', quelle: 'AGB' },
    { nr: '§ 7', titel: 'Haftung & Wiederbeschaffung', quelle: 'Haftung' },
    { nr: '§ 9', titel: 'Kaution / Haftungsschutz', quelle: 'Haftung' },
    { nr: '§ 13', titel: 'Widerrufsrecht', quelle: 'Widerruf' },
    { nr: '§ 17', titel: 'Datenschutz', quelle: 'Datenschutz' },
  ];
  const tone: Record<string, 'slate' | 'amber' | 'blue' | 'cyan'> = {
    AGB: 'slate', Haftung: 'amber', Widerruf: 'blue', Datenschutz: 'cyan',
  };
  return (
    <Panel title="Vertragsparagraphen" noBody>
      <div className="divide-y divide-slate-100">
        {paragraphen.map((p) => (
          <div key={p.nr} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
            <FileText size={15} className="text-slate-300 shrink-0" />
            <span className="font-mono text-[12px] text-cyan-700 w-10">{p.nr}</span>
            <span className="flex-1 text-[13px] text-slate-800">{p.titel}</span>
            <StatusChip tone={tone[p.quelle]}>{p.quelle}</StatusChip>
            <Button variant="ghost" size="sm">Bearbeiten</Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ContentKiTab() {
  return (
    <Panel title={<span className="flex items-center gap-1.5"><Sparkles size={12} /> Content-KI</span>}>
      <p className="text-[13px] text-slate-600 mb-1">
        Blog- und Social-Generierung, Faktencheck und Redaktionsplan werden in eigenen Bereichen verwaltet.
      </p>
      <p className="text-[12px] text-slate-500 mb-3">
        Hier laufen nur die API-Schlüssel und globalen Ton-Vorgaben zusammen.
      </p>
      <div className="flex gap-2 flex-wrap">
        <ButtonLink href="/admin/einstellungen?tab=content-ki" variant="secondary" size="sm">Blog-KI öffnen</ButtonLink>
        <ButtonLink href="/admin/einstellungen?tab=content-ki" variant="secondary" size="sm">Social-KI öffnen</ButtonLink>
      </div>
    </Panel>
  );
}

/* ── kleine Formular-Helfer ── */
function ChoiceRow({ init, options }: { init: string; options: TabDef[] }) {
  const [val, setVal] = useState(init);
  return <Segmented tabs={options} active={val} onChange={setVal} />;
}

function Toggle({ init }: { init: boolean }) {
  const [on, setOn] = useState(init);
  return (
    <button
      onClick={() => setOn((v) => !v)}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
        on ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200'
      }`}
    >
      {on ? 'An' : 'Aus'}
    </button>
  );
}

export default function EinstellungenPage() {
  return (
    <Suspense fallback={null}>
      <EinstellungenInner />
    </Suspense>
  );
}
