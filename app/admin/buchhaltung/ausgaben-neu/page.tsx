'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { formatCurrency, fmtDate as fmtDateCanonical } from '@/lib/format-utils';
import { usePersistentState } from '@/lib/use-persistent-state';

interface Ausgabe {
  id: string;
  bezeichnung: string;
  gesamt_brutto: number;
  gesamt_netto: number;
  kategorie: string | null;
  beleg: { id: string; beleg_nr: string; beleg_datum: string; quelle: string; lieferant: { name: string } | null } | null;
}

const QUELLE_BADGE: Record<string, { label: string; color: string }> = {
  upload: { label: 'Upload', color: 'cyan' },
  manuell: { label: 'Manuell', color: 'slate' },
  stripe_sync: { label: 'Stripe', color: 'amber' },
  migration: { label: 'Migration', color: 'slate' },
};

// Zentrale Helper aus lib/format-utils — formatCurrency liefert Intl-Output
// inkl. non-breaking-space, fmtDate ist Berlin-TZ-aware.
const fmtEuro = formatCurrency;
const fmtDate = fmtDateCanonical;

export default function AusgabenNeuPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [from, setFrom] = usePersistentState('admin:ausgaben-neu:from', firstOfMonth);
  const [to, setTo] = usePersistentState('admin:ausgaben-neu:to', todayStr);
  const [kategorie, setKategorie] = usePersistentState('admin:ausgaben-neu:kategorie', '');
  const [quelle, setQuelle] = usePersistentState('admin:ausgaben-neu:quelle', '');
  const [data, setData] = useState<Ausgabe[]>([]);
  const [kpi, setKpi] = useState({ total: 0, total_brutto: 0, top_kategorien: [] as Array<{ kategorie: string; brutto: number }> });
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const load = async () => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      const sp = new URLSearchParams();
      sp.set('from', from); sp.set('to', to);
      if (kategorie) sp.set('kategorie', kategorie);
      if (quelle) sp.set('quelle', quelle);
      const res = await fetch(`/api/admin/ausgaben?${sp.toString()}`);
      if (myId !== reqIdRef.current) return;
      const d = await res.json();
      if (myId !== reqIdRef.current) return;
      setData(d.ausgaben ?? []);
      setKpi(d.kpi ?? kpi);
      if (myId === reqIdRef.current) setLoading(false);
    };
    load();
  }, [from, to, kategorie, quelle]);

  return (
    <div className="min-h-screen text-admin-text px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung" />
      <div className="max-w-7xl mx-auto mt-4 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-heading">Ausgaben (vereinheitlicht)</h1>
            <p className="text-sm text-admin-muted">Aus beleg_positionen WHERE klassifizierung=&apos;ausgabe&apos;. Neue Ausgaben über → Beleg.</p>
          </div>
          <Link href="/admin/buchhaltung/belege/neu" className="px-4 py-2 bg-admin-accent hover:bg-admin-accent-hover text-slate-900 rounded font-semibold">+ Neuer Beleg</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Anzahl" value={String(kpi.total)} />
          <Stat label="Summe brutto" value={fmtEuro(kpi.total_brutto)} color="cyan" />
          {kpi.top_kategorien.slice(0, 2).map((k) => (
            <Stat key={k.kategorie} label={`Top: ${k.kategorie}`} value={fmtEuro(k.brutto)} />
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-admin-muted">Von</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded px-3 py-2 text-base" />
          </div>
          <div>
            <label className="block text-xs text-admin-muted">Bis</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded px-3 py-2 text-base" />
          </div>
          <select value={quelle} onChange={(e) => setQuelle(e.target.value)} className="bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded px-3 py-2 text-base">
            <option value="">Alle Quellen</option>
            <option value="upload">Upload</option>
            <option value="manuell">Manuell</option>
            <option value="stripe_sync">Stripe</option>
            <option value="migration">Migration</option>
          </select>
          <input value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="Kategorie" className="bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded px-3 py-2 text-base" />
        </div>

        {loading ? <p className="text-admin-muted">Lädt…</p> : (
          <div className="bg-admin-surface rounded border border-admin-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--admin-thead-bg)] text-left text-xs uppercase text-admin-muted">
                <tr>
                  <th className="px-3 py-2">Bezeichnung</th>
                  <th className="px-3 py-2">Kategorie</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Lieferant</th>
                  <th className="px-3 py-2">Quelle</th>
                  <th className="px-3 py-2 text-right">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => p.beleg && (
                  <tr key={p.id} className="border-t border-admin-border hover:bg-slate-800/40 cursor-pointer" onClick={() => { window.location.href = `/admin/buchhaltung/belege/${p.beleg!.id}`; }}>
                    <td className="px-3 py-2">{p.bezeichnung}</td>
                    <td className="px-3 py-2 text-xs text-admin-muted">{p.kategorie ?? '–'}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(p.beleg.beleg_datum)}</td>
                    <td className="px-3 py-2 text-xs">{p.beleg.lieferant?.name ?? '–'}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded border bg-${QUELLE_BADGE[p.beleg.quelle]?.color ?? 'slate'}-500/10 text-${QUELLE_BADGE[p.beleg.quelle]?.color ?? 'slate'}-400 border-${QUELLE_BADGE[p.beleg.quelle]?.color ?? 'slate'}-500/30`}>
                        {QUELLE_BADGE[p.beleg.quelle]?.label ?? p.beleg.quelle}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtEuro(Number(p.gesamt_brutto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <p className="p-3 text-sm text-[var(--admin-text-dim)] italic">Keine Ausgaben im Zeitraum.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'slate' }: { label: string; value: string; color?: string }) {
  const cl = color === 'cyan' ? 'text-cyan-400' : 'text-admin-text';
  return <div className="bg-admin-surface border border-admin-border rounded p-3"><div className="text-xs text-admin-muted">{label}</div><div className={`text-lg font-mono ${cl}`}>{value}</div></div>;
}
