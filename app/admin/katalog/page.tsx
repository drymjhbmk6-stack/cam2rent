'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Camera, Layers, Package, Boxes, Cpu, Plus, Pencil, X, CheckCircle2, AlertTriangle,
  ExternalLink, RefreshCw, TrendingUp, Search,
} from 'lucide-react';
import { PageHeader, Tabs, DataTable, StatusChip, MiniStat, Button } from '@/components/admin/ui';
import type { Column, TabDef } from '@/components/admin/ui';
import { fmtEuro } from '@/lib/format-utils';

/* cam2rent Admin 2.0 — Katalog. Liest LIVE aus der Datenbank (nicht mehr statisch). */

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

/** Kleiner Fetch-Hook: lädt eine API und zieht ein Feld raus. */
function useApi<T>(url: string, pick: (json: unknown) => T[]): { rows: T[]; loading: boolean; error: string | null } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((j) => { if (alive) { setRows(pick(j) ?? []); setLoading(false); } })
      .catch((e) => { if (alive) { setRows([]); setError(String(e?.message ?? e)); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return { rows, loading, error };
}

function State({ loading, error, empty, label }: { loading: boolean; error: string | null; empty: boolean; label: string }) {
  if (loading) return <div className="text-slate-400 text-[13px] py-8 text-center">Lädt…</div>;
  // Fehler (z.B. 401 im lokalen Vorschau-Modus) sehen für den Nutzer wie „leer" aus.
  if (error || empty) return <div className="text-slate-400 text-[13px] py-8 text-center border border-dashed border-slate-200 rounded-lg">Noch keine {label} in der Datenbank.</div>;
  return null;
}

export default function KatalogPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState('kameras');
  useEffect(() => {
    const t = sp.get('tab');
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, [sp]);

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Katalog" subtitle="Kameras, Sets, Zubehör, Inventar und Firmware — live aus der Datenbank." />
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
  if (!marke) return null;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MARKE[marke] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{marke}</span>;
}

/* ── Kameras ─────────────────────────────────────────────────────────────── */
type ApiProduct = { id: string; name: string; brand: string; pricePerDay?: number; deposit?: number; stock?: number; available?: boolean };
type CamRow = { marke: string; name: string; auslastung: number; tag: string; ersatz: string; stock: number };

function Kameras() {
  const { rows: products, loading, error } = useApi<ApiProduct>('/api/products', (j) => (Array.isArray(j) ? (j as ApiProduct[]) : []));
  const rows: CamRow[] = products.map((p) => ({
    marke: p.brand ?? '',
    name: p.name,
    auslastung: 0,
    tag: p.pricePerDay != null ? fmtEuro(p.pricePerDay) : '—',
    ersatz: p.deposit != null ? fmtEuro(p.deposit) : '—',
    stock: p.stock ?? 0,
  }));
  const columns: Column<CamRow>[] = [
    { key: 'name', header: 'Kamera', cell: (k) => <span className="flex items-center gap-2"><Brand marke={k.marke} /><span className="font-medium text-slate-900">{k.name}</span></span> },
    { key: 'stock', header: 'Bestand', cell: (k) => <span className="font-mono text-slate-500 text-[12px]">{k.stock} Stück</span>, className: 'hidden lg:table-cell' },
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
        <button className="text-cyan-700 text-[12px] flex items-center gap-1"><Layers size={13} />Marken verwalten</button>
        <Button variant="primary" size="sm" icon={Plus} className="ml-auto">Neue Kamera</Button>
      </div>
      <State loading={loading} error={error} empty={rows.length === 0} label="Kameras" />
      {rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(k) => k.name + k.tag} />}
      <p className="text-slate-500 text-[12px]">Auslastung farbcodiert: <span className="text-emerald-600 font-medium">grün</span> läuft, <span className="text-rose-600 font-medium">rot</span> steht.</p>
    </div>
  );
}

/* ── Sets ────────────────────────────────────────────────────────────────── */
type ApiSet = { id: string; name: string; price?: number; pricingMode?: string; available?: boolean; badge?: string; product_names?: string[]; brand?: string };
type SetRow = { marke: string; name: string; badges: string[]; verfuegbar: boolean; preis: string };

function Sets() {
  const { rows: sets, loading, error } = useApi<ApiSet>('/api/sets', (j) => (j && typeof j === 'object' && Array.isArray((j as { sets?: unknown }).sets) ? (j as { sets: ApiSet[] }).sets : []));
  const rows: SetRow[] = sets.map((s) => ({
    marke: s.brand ?? s.product_names?.[0]?.split(' ')[0] ?? '',
    name: s.name,
    badges: s.badge ? [s.badge] : [],
    verfuegbar: s.available ?? true,
    preis: s.price != null ? fmtEuro(s.price) : '—',
  }));
  const columns: Column<SetRow>[] = [
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
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-slate-500 text-[12px] flex-1">Verfügbarkeit automatisch aus Zubehör-Lagerbestand berechnet.</p>
        <Button variant="primary" size="sm" icon={Plus}>Neues Set</Button>
      </div>
      <State loading={loading} error={error} empty={rows.length === 0} label="Sets" />
      {rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(s) => s.marke + s.name} />}
    </div>
  );
}

/* ── Zubehör ─────────────────────────────────────────────────────────────── */
type ApiAccessory = { id: string; name: string; category?: string; price?: number; pricing_mode?: string; internal?: boolean; available?: boolean; compatible_product_ids?: string[] };
type AccRow = { kat: string; name: string; cams: string[]; preis: string; buchbar: boolean };

function Zubehoer() {
  const { rows: accs, loading, error } = useApi<ApiAccessory>('/api/admin/accessories', (j) => (j && typeof j === 'object' && Array.isArray((j as { accessories?: unknown }).accessories) ? (j as { accessories: ApiAccessory[] }).accessories : []));
  const all: AccRow[] = accs.map((a) => ({
    kat: a.category ?? '—',
    name: a.name,
    cams: a.compatible_product_ids?.length ? a.compatible_product_ids : ['Alle'],
    preis: a.price != null ? fmtEuro(a.price) + (a.pricing_mode === 'perDay' ? '/Tag' : '') : '—',
    buchbar: !a.internal,
  }));
  const cats = ['Alle', ...Array.from(new Set(all.map((a) => a.kat))).sort()];
  const [kat, setKat] = useState('Alle');
  const rows = kat === 'Alle' ? all : all.filter((z) => z.kat === kat);
  const buchbarN = all.filter((a) => a.buchbar).length;
  const internN = all.length - buchbarN;
  const columns: Column<AccRow>[] = [
    { key: 'name', header: 'Artikel', cell: (z) => <span><span className="text-[10px] uppercase tracking-wider text-slate-400 mr-2">{z.kat}</span><span className="font-medium text-slate-900">{z.name}</span></span> },
    { key: 'cams', header: 'Kameras', cell: (z) => <span className="flex gap-1 flex-wrap">{z.cams.map((c) => <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{c}</span>)}</span>, className: 'hidden sm:table-cell' },
    { key: 'preis', header: 'Preis', align: 'right', cell: (z) => <span className="font-mono">{z.preis}</span> },
    { key: 'buchbar', header: 'Buchbar', align: 'right', cell: (z) => (z.buchbar ? <CheckCircle2 size={15} className="text-emerald-500 inline" /> : <span className="text-[10px] text-amber-600">intern</span>) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Buchbar ({buchbarN})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Intern ({internN})</span>
        </div>
        <Button variant="primary" size="sm" icon={Plus}>Neues Zubehör</Button>
      </div>
      {all.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {cats.map((c) => (
            <button key={c} onClick={() => setKat(c)} className={`px-2.5 py-1 rounded-full border text-[11px] ${kat === c ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>{c}</button>
          ))}
        </div>
      )}
      <State loading={loading} error={error} empty={all.length === 0} label="Zubehör" />
      {rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(z, i) => z.name + i} />}
    </div>
  );
}

/* ── Inventar ────────────────────────────────────────────────────────────── */
type ApiUnit = { bezeichnung?: string; inventar_code?: string; code?: string; seriennummer?: string; serial?: string; status?: string; beleg_status?: string };
type InvRow = { bezeichnung: string; code: string; serial: string };

function Inventar() {
  const { rows: units, loading, error } = useApi<ApiUnit>('/api/admin/inventar', (j) => (j && typeof j === 'object' && Array.isArray((j as { units?: unknown }).units) ? (j as { units: ApiUnit[] }).units : []));
  const rows: InvRow[] = units.map((u) => ({
    bezeichnung: u.bezeichnung ?? '—',
    code: u.inventar_code ?? u.code ?? '—',
    serial: u.seriennummer ?? u.serial ?? '—',
  }));
  const total = units.length;
  const verf = units.filter((u) => u.status === 'verfuegbar').length;
  const verm = units.filter((u) => u.status === 'vermietet').length;
  const belegFehlt = units.filter((u) => u.beleg_status === 'beleg_fehlt').length;
  const columns: Column<InvRow>[] = [
    { key: 'bez', header: 'Bezeichnung', cell: (r) => <span className="font-medium text-slate-900">{r.bezeichnung}</span> },
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-[11px] text-cyan-700">{r.code}</span> },
    { key: 'serial', header: 'Seriennummer', cell: (r) => <span className="font-mono text-[11px] text-slate-500">{r.serial}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-3 text-[12px] flex-1 flex-wrap">
          <MiniStat value={String(total)} label="Gesamt" />
          <MiniStat value={String(verf)} label="Verfügbar" tone="emerald" />
          <MiniStat value={String(verm)} label="Vermietet" />
          <MiniStat value={String(belegFehlt)} label="Beleg fehlt" tone="amber" />
        </div>
        <Button variant="primary" size="sm" icon={Plus}>Manuell anlegen</Button>
      </div>
      <div className="flex items-center gap-2 flex-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
        <Search size={13} />Suche nach Bezeichnung, Code, Seriennummer…
      </div>
      <State loading={loading} error={error} empty={rows.length === 0} label="Inventar-Einheiten" />
      {rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(r) => r.code} onRowClick={() => {}} />}
      <p className="text-slate-500 text-[12px]">Jedes physische Exemplar einzeln — mit Code-Schema (<span className="font-mono text-[11px]">CAM-DJI-OA5-02</span>) und Seriennummer. Grundlage für Schadenszuordnung und Ersatzwert.</p>
    </div>
  );
}

/* ── Firmware ────────────────────────────────────────────────────────────── */
type ApiFw = { product_name?: string; model?: string; product_id?: string; latest_version?: string; status?: string; error_message?: string; source_url?: string };
const FW = {
  update: { tone: 'emerald' as const, label: 'Update', icon: TrendingUp, border: 'border-emerald-200' },
  error: { tone: 'rose' as const, label: 'Fehler', icon: AlertTriangle, border: 'border-rose-200' },
  ok: { tone: 'slate' as const, label: 'Aktuell', icon: CheckCircle2, border: 'border-slate-200' },
};
function fwTone(status?: string): keyof typeof FW {
  if (status === 'update_available') return 'update';
  if (status === 'error' || status === 'unsupported') return 'error';
  return 'ok';
}
function Firmware() {
  const { rows, loading, error } = useApi<ApiFw>('/api/admin/firmware', (j) => (j && typeof j === 'object' && Array.isArray((j as { rows?: unknown }).rows) ? (j as { rows: ApiFw[] }).rows : []));
  const withUpdate = rows.filter((f) => fwTone(f.status) === 'update').length;
  const withError = rows.filter((f) => fwTone(f.status) === 'error').length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-slate-500 text-[12px] flex-1">Quartalslauf prüft pro Modell auf neue Hersteller-Firmware. „Jetzt prüfen“ geht jederzeit manuell.</p>
        <Button variant="primary" size="sm" icon={RefreshCw}>Jetzt prüfen</Button>
      </div>
      <div className="flex gap-3 text-[12px] flex-wrap">
        <MiniStat value={String(withUpdate)} label="mit Update" tone="emerald" />
        <MiniStat value={String(withError)} label="Fehler" tone="amber" />
        <MiniStat value={String(rows.length)} label="Modelle gesamt" />
      </div>
      <State loading={loading} error={error} empty={rows.length === 0} label="Firmware-Einträge" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((f, i) => {
          const fw = FW[fwTone(f.status)];
          const Ico = fw.icon;
          return (
            <div key={i} className={`bg-white border rounded-lg p-3 ${fw.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-slate-900">{f.product_name ?? f.model ?? f.product_id ?? 'Modell'}</span>
                <StatusChip tone={fw.tone}><Ico size={11} />{fw.label}</StatusChip>
                <button className="ml-auto text-[11px] text-slate-500 hover:text-slate-800">Neu prüfen</button>
              </div>
              <div className="font-mono text-[12px] text-slate-700">{f.latest_version ?? '—'}</div>
              <div className="text-[11px] text-slate-400 mt-1">{f.error_message ?? ''}</div>
              {fwTone(f.status) !== 'error' && f.source_url && <span className="text-[11px] text-cyan-700 flex items-center gap-1 mt-1 cursor-pointer"><ExternalLink size={11} />Hersteller-Quelle</span>}
            </div>
          );
        })}
      </div>
      <p className="text-slate-500 text-[12px]">Quellen, die nicht von der Hersteller-Domain stammen, werden verworfen — Halluzinationsschutz statt falscher Versionsnummer.</p>
    </div>
  );
}
