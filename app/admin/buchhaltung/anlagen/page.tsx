'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Asset {
  id: string;
  bezeichnung: string;
  art: string;
  anschaffungsdatum: string;
  anschaffungskosten_netto: number;
  aktueller_buchwert: number;
  afa_methode: string;
  status: string;
  beleg_position: { id: string; bezeichnung: string; beleg: { id: string; beleg_nr: string } | null } | null;
  inventar_unit: { id: string; bezeichnung: string } | null;
}

const ART_LABEL: Record<string, string> = {
  kamera: 'Kamera', zubehoer: 'Zubehör', buero: 'Büro', werkzeug: 'Werkzeug', sonstiges: 'Sonstiges',
};
const METHODE_LABEL: Record<string, string> = {
  linear: 'Linear', sofort_gwg: 'GWG sofort', keine: 'Keine',
};
const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', verkauft: 'Verkauft', ausgemustert: 'Ausgemustert', verloren: 'Verloren',
};

function fmtEuro(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
}

export default function AnlagenNeuPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kpi, setKpi] = useState({ total: 0, total_anschaffung: 0, total_buchwert: 0, gwg_count: 0, gwg_sum: 0 });
  const [art, setArt] = useState('');
  const [methode, setMethode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (art) sp.set('art', art);
      if (methode) sp.set('afa_methode', methode);
      const res = await fetch(`/api/admin/anlagen-neu?${sp.toString()}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
      setKpi(data.kpi ?? kpi);
      setLoading(false);
    };
    load();
  }, [art, methode]);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung" />
      <div className="max-w-7xl mx-auto mt-4 space-y-4">
        <h1 className="text-2xl font-heading">Anlagen (Steuersicht)</h1>
        <p className="text-sm text-slate-400">
          Reine Steuersicht — Anschaffungskosten + Buchwert nach AfA. Wiederbeschaffungswerte
          findest du im <Link href="/admin/inventar" className="text-cyan-400 hover:underline">Inventar</Link>.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Anschaffung gesamt" value={fmtEuro(kpi.total_anschaffung)} />
          <Stat label="Buchwert aktuell" value={fmtEuro(kpi.total_buchwert)} color="cyan" />
          <Stat label="Bereits abgeschrieben" value={fmtEuro(kpi.total_anschaffung - kpi.total_buchwert)} color="amber" />
          <Stat label={`GWG (${kpi.gwg_count})`} value={fmtEuro(kpi.gwg_sum)} />
        </div>

        <div className="flex flex-wrap gap-3">
          <select value={art} onChange={(e) => setArt(e.target.value)} className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">Alle Arten</option>
            <option value="kamera">Kamera</option>
            <option value="zubehoer">Zubehör</option>
            <option value="buero">Büro</option>
            <option value="werkzeug">Werkzeug</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
          <select value={methode} onChange={(e) => setMethode(e.target.value)} className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">Alle Methoden</option>
            <option value="linear">Linear</option>
            <option value="sofort_gwg">GWG sofort</option>
            <option value="keine">Keine</option>
          </select>
        </div>

        {loading ? (
          <p className="text-slate-400">Lädt…</p>
        ) : assets.length === 0 ? (
          <p className="text-slate-400">Keine Anlagen.</p>
        ) : (
          <div className="bg-[#111827] rounded border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Bezeichnung</th>
                  <th className="px-3 py-2">Art</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2 text-right">Anschaffung</th>
                  <th className="px-3 py-2 text-right">Buchwert</th>
                  <th className="px-3 py-2">Methode</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer" onClick={() => { window.location.href = `/admin/buchhaltung/anlagen/${a.id}`; }}>
                    <td className="px-3 py-2">{a.bezeichnung}</td>
                    <td className="px-3 py-2 text-xs">{ART_LABEL[a.art] ?? a.art}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(a.anschaffungsdatum)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtEuro(Number(a.anschaffungskosten_netto))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtEuro(Number(a.aktueller_buchwert))}</td>
                    <td className="px-3 py-2 text-xs">{METHODE_LABEL[a.afa_methode] ?? a.afa_methode}</td>
                    <td className="px-3 py-2 text-xs">{STATUS_LABEL[a.status] ?? a.status}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.inventar_unit && (
                        <Link href={`/admin/inventar/${a.inventar_unit.id}`} className="text-cyan-400 hover:underline" onClick={(e) => e.stopPropagation()}>📦</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'slate' }: { label: string; value: string; color?: string }) {
  const cl = color === 'cyan' ? 'text-cyan-400' : color === 'amber' ? 'text-amber-400' : 'text-slate-200';
  return (
    <div className="bg-[#111827] border border-slate-800 rounded p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-lg font-mono ${cl}`}>{value}</div>
    </div>
  );
}
