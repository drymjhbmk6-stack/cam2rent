'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface WaitlistEntry {
  id: string;
  product_id: string;
  product_name: string;
  email: string;
  source: string | null;
  use_case: string | null;
  created_at: string;
  notified_at: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  card: 'Produktkarte',
  detail: 'Detailseite',
};

function sourceLabel(source: string | null): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] ?? source;
}

export default function Warteliste() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/waitlist');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Fehler beim Laden.');
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    const res = await fetch(`/api/admin/waitlist?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } else {
      alert('Löschen fehlgeschlagen.');
    }
  }

  // Gruppierung nach Produkt (für schnelle Übersicht)
  const grouped = entries.reduce<Record<string, WaitlistEntry[]>>((acc, entry) => {
    const key = entry.product_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const productGroups = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />

      <div className="flex items-center justify-between mb-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Warteliste</h1>
          <p className="text-sm text-slate-400">
            Interessenten für Kameras, die noch keine Seriennummer im Bestand haben.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 border border-slate-700"
        >
          Aktualisieren
        </button>
      </div>

      {loading && <p className="text-slate-400">Lade…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
          <p className="text-slate-400">
            Noch keine Einträge. Sobald eine Kamera ohne Seriennummer angelegt ist und sich
            Interessenten eintragen, erscheinen sie hier.
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                Einträge gesamt
              </p>
              <p className="text-2xl font-bold text-white">{entries.length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                Produkte
              </p>
              <p className="text-2xl font-bold text-white">{productGroups.length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                Noch nicht benachrichtigt
              </p>
              <p className="text-2xl font-bold text-white">
                {entries.filter((e) => !e.notified_at).length}
              </p>
            </div>
          </div>

          {/* Gruppiert nach Produkt */}
          {productGroups.map(([productName, list]) => (
            <div
              key={productName}
              className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-white">{productName}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/40 text-cyan-300">
                  {list.length} {list.length === 1 ? 'Interessent' : 'Interessenten'}
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 720 }}>
                <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">E-Mail</th>
                    <th className="px-4 py-2 text-left font-medium">Nutzung</th>
                    <th className="px-4 py-2 text-left font-medium">Quelle</th>
                    <th className="px-4 py-2 text-left font-medium">Eingetragen</th>
                    <th className="px-4 py-2 text-left font-medium">Benachrichtigt</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-800/50">
                      <td className="px-4 py-2">
                        <a
                          href={`mailto:${entry.email}`}
                          className="text-cyan-400 hover:underline break-all"
                        >
                          {entry.email}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {entry.use_case ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 text-xs">
                            {entry.use_case}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {sourceLabel(entry.source)}
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {fmtDateTime(entry.created_at)}
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {entry.notified_at ? fmtDateTime(entry.notified_at) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
