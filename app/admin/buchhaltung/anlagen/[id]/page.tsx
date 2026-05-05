'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Asset {
  id: string;
  bezeichnung: string;
  art: string;
  anschaffungsdatum: string;
  anschaffungskosten_netto: number;
  aktueller_buchwert: number;
  restwert: number;
  afa_methode: string;
  nutzungsdauer_monate: number | null;
  status: string;
  notizen: string | null;
  beleg_position: { id: string; bezeichnung: string; beleg: { id: string; beleg_nr: string } | null } | null;
}
interface AfaBuchung {
  id: string; buchungsdatum: string; afa_betrag: number; buchwert_nach: number; typ: string; notizen: string | null;
}
interface InventarUnit {
  id: string; bezeichnung: string; inventar_code: string | null; seriennummer: string | null;
}

function fmtEuro(n: number) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n); }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }); }

export default function AnlageDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AfaBuchung[]>([]);
  const [inventarUnit, setInventarUnit] = useState<InventarUnit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch(`/api/admin/anlagen-neu/${id}`);
    if (!res.ok) { setError('Nicht gefunden'); return; }
    const data = await res.json();
    setAsset(data.asset);
    setHistory(data.afa_history);
    setInventarUnit(data.inventar_unit);
  }

  useEffect(() => { reload(); }, [id]);

  async function changeStatus(newStatus: string) {
    if (!confirm(`Status auf "${newStatus}" setzen? Dies erzeugt eine Sonder-AfA.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/anlagen-neu/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setBusy(false);
  }

  if (!asset) return <div className="p-6 text-slate-400">{error ?? 'Lädt…'}</div>;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung/anlagen" />
      <div className="max-w-4xl mx-auto mt-4 space-y-6">
        <div>
          <h1 className="text-2xl font-heading">{asset.bezeichnung}</h1>
          <p className="text-sm text-slate-400">{asset.art} · angeschafft {fmtDate(asset.anschaffungsdatum)}</p>
        </div>

        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        <section className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2">
          <h2 className="font-semibold mb-2">Stammdaten</h2>
          <Row label="Anschaffungskosten netto" value={fmtEuro(Number(asset.anschaffungskosten_netto))} />
          <Row label="Aktueller Buchwert" value={fmtEuro(Number(asset.aktueller_buchwert))} />
          <Row label="Restwert" value={fmtEuro(Number(asset.restwert))} />
          <Row label="AfA-Methode" value={asset.afa_methode} />
          {asset.nutzungsdauer_monate && <Row label="Nutzungsdauer" value={`${asset.nutzungsdauer_monate} Monate`} />}
          <Row label="Status" value={asset.status} />
        </section>

        {asset.beleg_position?.beleg && (
          <section className="bg-[#111827] border border-slate-800 rounded p-4">
            <h2 className="font-semibold mb-2">Belegquelle</h2>
            <Link href={`/admin/buchhaltung/belege/${asset.beleg_position.beleg.id}`} className="text-cyan-400 hover:underline">
              {asset.beleg_position.beleg.beleg_nr} · {asset.beleg_position.bezeichnung}
            </Link>
          </section>
        )}

        {inventarUnit && (
          <section className="bg-[#111827] border border-slate-800 rounded p-4">
            <h2 className="font-semibold mb-2">Verknüpftes Inventar-Stück</h2>
            <Link href={`/admin/inventar/${inventarUnit.id}`} className="text-cyan-400 hover:underline">
              {inventarUnit.bezeichnung} ({inventarUnit.inventar_code ?? inventarUnit.seriennummer ?? ''})
            </Link>
            <p className="text-xs text-slate-400 mt-1">→ Wiederbeschaffungswert findest du dort.</p>
          </section>
        )}

        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <h2 className="font-semibold mb-3">AfA-Historie ({history.length})</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Noch keine AfA gebucht.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="pb-2">Datum</th><th className="pb-2">Typ</th>
                  <th className="pb-2 text-right">AfA</th><th className="pb-2 text-right">Buchwert nach</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-t border-slate-800">
                    <td className="py-1.5">{fmtDate(b.buchungsdatum)}</td>
                    <td className="py-1.5 text-xs">{b.typ}</td>
                    <td className="py-1.5 text-right font-mono">{fmtEuro(Number(b.afa_betrag))}</td>
                    <td className="py-1.5 text-right font-mono">{fmtEuro(Number(b.buchwert_nach))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {asset.status === 'aktiv' && (
          <section className="bg-[#111827] border border-slate-800 rounded p-4">
            <h2 className="font-semibold mb-3">Aktionen</h2>
            <div className="flex gap-2 flex-wrap">
              <button disabled={busy} onClick={() => changeStatus('verkauft')} className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-sm">Verkauft</button>
              <button disabled={busy} onClick={() => changeStatus('ausgemustert')} className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-sm">Ausgemustert</button>
              <button disabled={busy} onClick={() => changeStatus('verloren')} className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-sm">Verloren</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between text-sm"><span className="text-slate-400">{label}</span><span className="font-mono">{value}</span></div>;
}
