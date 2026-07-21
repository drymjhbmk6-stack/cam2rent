'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Camera, Layers, Package, Boxes, Cpu, Plus, Pencil, X, CheckCircle2, AlertTriangle,
  ExternalLink, RefreshCw, TrendingUp, Search,
} from 'lucide-react';
import { PageHeader, Tabs, DataTable, StatusChip, MiniStat, Button } from '@/components/admin/ui';
import type { Column, TabDef } from '@/components/admin/ui';
import { CAMERAS, SETS, ACCESSORIES, INVENTORY, FIRMWARE, type Camera as Cam, type SetItem, type Accessory, type InventoryUnit } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Katalog (5 Tabs, statisch). */

const TABS: TabDef[] = [
  { key: 'kameras', label: 'Kameras', icon: Camera },
  { key: 'sets', label: 'Sets', icon: Layers },
  { key: 'zubehoer', label: 'Zubehör', icon: Package },
  { key: 'inventar', label: 'Inventar', icon: Boxes },
  { key: 'firmware', label: 'Firmware', icon: Cpu },
];

const MARKE: Record<string, string> = {
  DJI: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GoPro: 'bg-blue-50 text-blue-700 border-blue-200',
  Insta360: 'bg-amber-50 text-amber-700 border-amber-200',
};
const auslColor = (n: number) => (n >= 70 ? 'text-emerald-600' : n >= 30 ? 'text-amber-600' : 'text-rose-600');

export default function KatalogPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState('kameras');
  useEffect(() => {
    const t = sp.get('tab');
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, [sp]);

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Katalog" subtitle="Kameras, Sets, Zubehör, Inventar und Firmware — alles hier." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'kameras' && <Kameras />}
      {tab === 'sets' && <Sets />}
      {tab === 'zubehoer' && <Zubehoer />}
      {tab === 'inventar' && <Inventar />}
      {tab === 'firmware' && <Firmware />}
    </div>
  );
}

function Brand({ marke }: { marke: string }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MARKE[marke] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{marke}</span>;
}

function Kameras() {
  const columns: Column<Cam>[] = [
    { key: 'name', header: 'Kamera', cell: (k) => <span className="flex items-center gap-2"><Brand marke={k.marke} /><span className="font-medium text-slate-900">{k.name}</span></span> },
    { key: 'ausl', header: 'Auslastung', cell: (k) => <span className={`font-mono font-semibold ${auslColor(k.auslastung)}`}>{k.auslastung}%</span>, className: 'hidden lg:table-cell' },
    { key: 'tag', header: 'Tag / Ersatz', cell: (k) => <span className="text-slate-500 font-mono text-[12px]">{k.tag} / {k.ersatz}</span>, className: 'hidden md:table-cell' },
    { key: 'aktion', header: 'Aktion', align: 'right', cell: () => (
      <span className="whitespace-nowrap">
        <button className="text-cyan-700 text-[12px] hover:underline mr-3"><Pencil size={12} className="inline" /> Bearbeiten</button>
        <button className="text-rose-400 hover:text-rose-600"><X size={14} className="inline" /></button>
      </span>
    ) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button className="text-cyan-700 text-[12px] flex items-center gap-1"><Layers size={13} />Marken verwalten · 3 Marken</button>
        <Button variant="primary" size="sm" icon={Plus} className="ml-auto">Neue Kamera</Button>
      </div>
      <DataTable columns={columns} rows={CAMERAS} rowKey={(k) => k.name + k.tag} />
      <p className="text-slate-500 text-[12px]">Auslastung farbcodiert: <span className="text-emerald-600 font-medium">grün</span> läuft, <span className="text-rose-600 font-medium">rot</span> steht.</p>
    </div>
  );
}

function Sets() {
  const columns: Column<SetItem>[] = [
    { key: 'name', header: 'Set', cell: (s) => (
      <span className="flex items-center gap-2 flex-wrap">
        <Brand marke={s.marke} />
        <span className="font-medium text-slate-900">{s.name}</span>
        {s.badges.map((b) => <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{b}</span>)}
        {s.verfuegbar
          ? <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><CheckCircle2 size={10} />Verfügbar</span>
          : <span className="text-[10px] text-rose-600 flex items-center gap-0.5"><X size={10} />Ausgebucht</span>}
      </span>
    ) },
    { key: 'preis', header: 'Preis', align: 'right', cell: (s) => <span className="font-mono font-semibold">{s.preis}</span> },
    { key: 'einzel', header: 'Einzeln', align: 'right', cell: (s) => <span className="font-mono text-slate-400 text-[12px]">{s.einzel}</span>, className: 'hidden sm:table-cell' },
    { key: 'spar', header: 'Ersparnis', align: 'right', cell: (s) => <span className="font-mono text-emerald-600 text-[12px]">{s.spar}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-slate-500 text-[12px] flex-1">Verfügbarkeit automatisch aus Zubehör-Lagerbestand berechnet.</p>
        <Button variant="primary" size="sm" icon={Plus}>Neues Set</Button>
      </div>
      <DataTable columns={columns} rows={SETS} rowKey={(s) => s.marke + s.name} />
    </div>
  );
}

function Zubehoer() {
  const cats = ['Alle', 'Akku', 'Halterung', 'Mikrofon', 'ND-Filter', 'Schutz', 'Selfi-Stick', 'Speicher', 'Stativ'];
  const [kat, setKat] = useState('Alle');
  const rows = kat === 'Alle' ? ACCESSORIES : ACCESSORIES.filter((z) => z.kat === kat);
  const columns: Column<Accessory>[] = [
    { key: 'name', header: 'Artikel', cell: (z) => <span><span className="text-[10px] uppercase tracking-wider text-slate-400 mr-2">{z.kat}</span><span className="font-medium text-slate-900">{z.name}</span></span> },
    { key: 'cams', header: 'Kameras', cell: (z) => <span className="flex gap-1 flex-wrap">{z.cams.map((c) => <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{c}</span>)}</span>, className: 'hidden sm:table-cell' },
    { key: 'preis', header: 'Preis', align: 'right', cell: (z) => <span className="font-mono">{z.preis}</span> },
    { key: 'buchbar', header: 'Buchbar', align: 'right', cell: (z) => (z.buchbar ? <CheckCircle2 size={15} className="text-emerald-500 inline" /> : <span className="text-[10px] text-amber-600">intern</span>) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Buchbar (23)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Intern (11)</span>
        </div>
        <Button variant="primary" size="sm" icon={Plus}>Neues Zubehör</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {cats.map((c) => (
          <button key={c} onClick={() => setKat(c)} className={`px-2.5 py-1 rounded-full border text-[11px] ${kat === c ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>{c}</button>
        ))}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(z, i) => z.name + i} />
    </div>
  );
}

function Inventar() {
  const columns: Column<InventoryUnit>[] = [
    { key: 'bez', header: 'Bezeichnung', cell: (r) => <span className="font-medium text-slate-900">{r.bezeichnung}</span> },
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-[11px] text-cyan-700">{r.code}</span> },
    { key: 'serial', header: 'Seriennummer', cell: (r) => <span className="font-mono text-[11px] text-slate-500">{r.serial}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-3 text-[12px] flex-1 flex-wrap">
          <MiniStat value="68" label="Gesamt" />
          <MiniStat value="68" label="Verfügbar" tone="emerald" />
          <MiniStat value="0" label="Vermietet" />
          <MiniStat value="35" label="Beleg fehlt" tone="amber" />
        </div>
        <Button variant="primary" size="sm" icon={Plus}>Manuell anlegen</Button>
      </div>
      <div className="flex items-center gap-2 flex-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
        <Search size={13} />Suche nach Bezeichnung, Code, Seriennummer…
      </div>
      <DataTable columns={columns} rows={INVENTORY} rowKey={(r) => r.code} onRowClick={() => {}} />
      <p className="text-slate-500 text-[12px]">Jedes physische Exemplar einzeln — mit Code-Schema (<span className="font-mono text-[11px]">CAM-DJI-OA5-02</span>) und Seriennummer. Grundlage für Schadenszuordnung und Ersatzwert.</p>
    </div>
  );
}

const FW = {
  update: { tone: 'emerald' as const, label: 'Update', icon: TrendingUp, border: 'border-emerald-200' },
  error: { tone: 'rose' as const, label: 'Fehler', icon: AlertTriangle, border: 'border-rose-200' },
  ok: { tone: 'slate' as const, label: 'Aktuell', icon: CheckCircle2, border: 'border-slate-200' },
};
function Firmware() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-slate-500 text-[12px] flex-1">Quartalslauf prüft pro Modell auf neue Hersteller-Firmware. „Jetzt prüfen“ geht jederzeit manuell.</p>
        <Button variant="primary" size="sm" icon={RefreshCw}>Jetzt prüfen</Button>
      </div>
      <div className="flex gap-3 text-[12px] flex-wrap">
        <MiniStat value="1" label="mit Update" tone="emerald" />
        <MiniStat value="2" label="Fehler" tone="amber" />
        <MiniStat value="6" label="Modelle gesamt" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIRMWARE.map((f, i) => {
          const fw = FW[f.tone];
          const Ico = fw.icon;
          return (
            <div key={i} className={`bg-white border rounded-lg p-3 ${fw.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-slate-900">{f.name}</span>
                <StatusChip tone={fw.tone}><Ico size={11} />{fw.label}</StatusChip>
                <button className="ml-auto text-[11px] text-slate-500 hover:text-slate-800">Neu prüfen</button>
              </div>
              <div className="font-mono text-[12px] text-slate-700">{f.version}</div>
              <div className="text-[11px] text-slate-400 mt-1">{f.note}</div>
              {f.tone !== 'error' && <span className="text-[11px] text-cyan-700 flex items-center gap-1 mt-1 cursor-pointer"><ExternalLink size={11} />Hersteller-Quelle</span>}
            </div>
          );
        })}
      </div>
      <p className="text-slate-500 text-[12px]">Quellen, die nicht von der Hersteller-Domain stammen, werden verworfen — Halluzinationsschutz statt falscher Versionsnummer.</p>
    </div>
  );
}
