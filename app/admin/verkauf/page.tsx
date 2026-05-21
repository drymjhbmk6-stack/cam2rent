'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtEuro, fmtDateTime } from '@/lib/format-utils';

interface SaleItem {
  name: string;
  qty: number;
  unit_price: number;
}

interface Sale {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  price_total: number | null;
  status: string;
  created_at: string;
  sale_items: SaleItem[] | null;
  stripe_payment_link_id: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_payment: { label: 'Offen', cls: 'bg-amber-900/40 text-amber-300' },
  confirmed: { label: 'Bezahlt', cls: 'bg-emerald-900/40 text-emerald-300' },
  completed: { label: 'Bezahlt', cls: 'bg-emerald-900/40 text-emerald-300' },
  cancelled: { label: 'Storniert', cls: 'bg-red-900/40 text-red-300' },
};

function statusBadge(status: string) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-slate-800 text-slate-300' };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export default function VerkaufListe() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verkauf');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Fehler beim Laden.');
      setSales(data.sales ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(id: string, act: 'resend' | 'cancel' | 'mark_paid') {
    const confirms: Record<string, string> = {
      cancel: 'Diesen Verkauf wirklich stornieren? Der Zahlungslink wird deaktiviert.',
      mark_paid: 'Verkauf manuell als bezahlt markieren (z.B. Barzahlung)?',
    };
    if (confirms[act] && !confirm(confirms[act])) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/verkauf/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Aktion fehlgeschlagen.');
      if (act === 'resend') alert('Rechnung + Zahlungslink wurden erneut verschickt.');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />

      <div className="flex items-center justify-between mb-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Verkäufe</h1>
          <p className="text-sm text-slate-400">
            Zubehör (z.B. Speicherkarten) an Kunden verkaufen — Rechnung + Stripe-Zahlungslink.
          </p>
        </div>
        <Link
          href="/admin/verkauf/neu"
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500"
        >
          + Neuer Verkauf
        </Link>
      </div>

      {loading && <p className="text-slate-400">Lade…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && sales.length === 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
          <p className="text-slate-400">
            Noch keine Verkäufe. Klicke auf „Neuer Verkauf“, um einen Artikel an einen
            Kunden zu verkaufen.
          </p>
        </div>
      )}

      {!loading && !error && sales.length > 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-left text-slate-400">
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Kunde</th>
                <th className="px-4 py-3 font-medium">Artikel</th>
                <th className="px-4 py-3 font-medium text-right">Betrag</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const itemSummary = (sale.sale_items ?? [])
                  .map((it) => `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`)
                  .join(', ');
                return (
                  <tr key={sale.id} className="border-b border-slate-800 last:border-0">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {fmtDateTime(sale.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white">{sale.customer_name || '—'}</div>
                      <div className="text-xs text-slate-500">{sale.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[220px]">{itemSummary || '—'}</td>
                    <td className="px-4 py-3 text-right text-white whitespace-nowrap">
                      {fmtEuro(sale.price_total ?? 0)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(sale.status)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {sale.status === 'awaiting_payment' ? (
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          <button
                            type="button"
                            disabled={busyId === sale.id}
                            onClick={() => action(sale.id, 'resend')}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs hover:bg-slate-700 border border-slate-700 disabled:opacity-50"
                          >
                            Link senden
                          </button>
                          <button
                            type="button"
                            disabled={busyId === sale.id}
                            onClick={() => action(sale.id, 'mark_paid')}
                            className="px-2 py-1 rounded bg-emerald-900/40 text-emerald-300 text-xs hover:bg-emerald-900/60 border border-emerald-800 disabled:opacity-50"
                          >
                            Bezahlt
                          </button>
                          <button
                            type="button"
                            disabled={busyId === sale.id}
                            onClick={() => action(sale.id, 'cancel')}
                            className="px-2 py-1 rounded bg-red-900/40 text-red-300 text-xs hover:bg-red-900/60 border border-red-800 disabled:opacity-50"
                          >
                            Stornieren
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
