'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Beleg {
  id: string;
  beleg_nr: string;
  beleg_datum: string;
  rechnungsnummer_lieferant: string | null;
  summe_brutto: number;
  status: 'offen' | 'teilweise' | 'klassifiziert' | 'festgeschrieben';
  quelle: string;
  positions_total: number;
  positions_pending: number;
  lieferant: { name: string } | null;
  ist_eigenbeleg: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  teilweise: 'Teilweise',
  klassifiziert: 'Klassifiziert',
  festgeschrieben: 'Festgeschrieben',
};
const STATUS_COLOR: Record<string, string> = {
  offen: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  teilweise: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  klassifiziert: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  festgeschrieben: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
}

export default function BelegeListePage() {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      if (q) sp.set('q', q);
      sp.set('limit', '100');
      const res = await fetch(`/api/admin/belege?${sp.toString()}`);
      const data = await res.json();
      setBelege(data.belege ?? []);
      setLoading(false);
    };
    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [statusFilter, q]);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung" />
      <div className="max-w-7xl mx-auto mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-heading">Belege</h1>
          <Link href="/admin/buchhaltung/belege/neu" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded font-semibold">
            + Neuer Beleg
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base flex-1 min-w-[200px]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base"
          >
            <option value="">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="teilweise">Teilweise</option>
            <option value="klassifiziert">Klassifiziert</option>
            <option value="festgeschrieben">Festgeschrieben</option>
          </select>
        </div>

        {loading ? (
          <p className="text-slate-400">Lädt…</p>
        ) : belege.length === 0 ? (
          <p className="text-slate-400">Keine Belege gefunden.</p>
        ) : (
          <div className="bg-[#111827] rounded border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Beleg-Nr</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Lieferant</th>
                  <th className="px-3 py-2 text-right">Brutto</th>
                  <th className="px-3 py-2">Klassif.</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {belege.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => { window.location.href = `/admin/buchhaltung/belege/${b.id}`; }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{b.beleg_nr}</td>
                    <td className="px-3 py-2">{fmtDate(b.beleg_datum)}</td>
                    <td className="px-3 py-2">
                      {b.lieferant?.name ?? <span className="text-slate-500 italic">–</span>}
                      {b.ist_eigenbeleg && <span className="ml-2 text-xs text-amber-400">(Eigenbeleg)</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtEuro(Number(b.summe_brutto))}</td>
                    <td className="px-3 py-2 text-xs">
                      {b.positions_pending > 0
                        ? <span className="text-amber-400">{b.positions_total - b.positions_pending}/{b.positions_total}</span>
                        : <span className="text-emerald-400">{b.positions_total}/{b.positions_total} ✓</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_COLOR[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
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
