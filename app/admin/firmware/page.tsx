'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface FirmwareCheck {
  product_id: string;
  brand: string;
  model: string;
  latest_version: string | null;
  source_url: string | null;
  release_date: string | null;
  status: 'ok' | 'error' | 'unsupported';
  error_message: string | null;
  last_checked_at: string;
  last_changed_at: string | null;
  seen_version: string | null;
}

function statusOrder(s: FirmwareCheck['status'], hasUpdate: boolean): number {
  if (hasUpdate) return 0;
  if (s === 'error') return 1;
  if (s === 'ok') return 2;
  return 3; // unsupported
}

function hasNewVersion(r: FirmwareCheck): boolean {
  if (r.status !== 'ok' || !r.latest_version) return false;
  return r.latest_version !== r.seen_version;
}

export default function FirmwareOverviewPage() {
  const [rows, setRows] = useState<FirmwareCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/firmware');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (e) {
      setError(`Netzwerk-Fehler: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function runFullCheck() {
    if (!confirm('Firmware-Check für alle Kameras starten? Dauert ca. 30–60 Sek.')) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/firmware/test', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      setError(`Fehler: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function markSeen(r: FirmwareCheck) {
    if (!r.latest_version) return;
    setBusyProduct(r.product_id);
    try {
      const res = await fetch(
        `/api/admin/firmware/${encodeURIComponent(r.product_id)}/seen`,
        {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: r.latest_version }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } finally {
      setBusyProduct(null);
    }
  }

  async function checkOne(productId: string) {
    setBusyProduct(productId);
    try {
      const res = await fetch('/api/admin/firmware/check-one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } finally {
      setBusyProduct(null);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const oa = statusOrder(a.status, hasNewVersion(a));
    const ob = statusOrder(b.status, hasNewVersion(b));
    if (oa !== ob) return oa - ob;
    return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
  });

  const updatesCount = rows.filter(hasNewVersion).length;
  const errorsCount = rows.filter((r) => r.status === 'error').length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink />
      <div className="max-w-5xl mx-auto mt-4 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Firmware-Updates</h1>
            <p className="text-slate-400 text-sm mt-1">
              Wöchentlicher Cron prüft pro Kamera-Modell auf neue Hersteller-Firmware.
            </p>
          </div>
          <button
            onClick={runFullCheck}
            disabled={running}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 rounded font-semibold text-sm"
          >
            {running ? 'Läuft…' : 'Jetzt prüfen'}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">
            {error}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="p-6 bg-[#111827] border border-slate-800 rounded text-slate-400 text-sm">
            Noch kein Firmware-Check gelaufen. Klick „Jetzt prüfen“ für den ersten Lauf —
            oder warte auf den wöchentlichen Cron-Lauf am Montag 07:00 Uhr.
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex gap-3 text-sm">
            <span className="px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              {updatesCount} {updatesCount === 1 ? 'Modell mit Update' : 'Modelle mit Update'}
            </span>
            {errorsCount > 0 && (
              <span className="px-3 py-1.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                {errorsCount} {errorsCount === 1 ? 'Fehler' : 'Fehler'}
              </span>
            )}
            <span className="px-3 py-1.5 rounded bg-slate-700/30 border border-slate-700 text-slate-300">
              {rows.length} {rows.length === 1 ? 'Modell gesamt' : 'Modelle gesamt'}
            </span>
          </div>
        )}

        {loading && (
          <div className="text-slate-400 text-sm">Lädt…</div>
        )}

        {sorted.map((r) => {
          const isUpdate = hasNewVersion(r);
          const borderColor = isUpdate
            ? 'border-emerald-500/50'
            : r.status === 'error'
              ? 'border-rose-500/30'
              : r.status === 'unsupported'
                ? 'border-slate-700'
                : 'border-slate-800';
          return (
            <div
              key={r.product_id}
              className={`bg-[#111827] border ${borderColor} rounded p-4`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold">{r.brand} {r.model}</h2>
                    {isUpdate && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                        🆕 Update
                      </span>
                    )}
                    {r.status === 'error' && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-semibold">
                        ⚠ Fehler
                      </span>
                    )}
                    {r.status === 'unsupported' && (
                      <span className="px-2 py-0.5 rounded bg-slate-700/50 text-slate-400 text-xs">
                        Nicht unterstützt
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-300 space-y-1">
                    {r.latest_version && (
                      <div>
                        Aktuelle Version: <span className="font-mono">{r.latest_version}</span>
                        {r.release_date && (
                          <span className="text-slate-500 ml-2 text-xs">
                            (erschienen {new Date(r.release_date).toLocaleDateString('de-DE')})
                          </span>
                        )}
                      </div>
                    )}
                    {r.seen_version && r.seen_version !== r.latest_version && (
                      <div className="text-slate-500 text-xs">
                        Zuletzt gesehen: <span className="font-mono">{r.seen_version}</span>
                      </div>
                    )}
                    {r.source_url && (
                      <div>
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 text-xs"
                        >
                          Hersteller-Quelle ↗
                        </a>
                      </div>
                    )}
                    {r.error_message && (
                      <div className="text-rose-300 text-xs italic mt-2">
                        {r.error_message}
                      </div>
                    )}
                    <div className="text-slate-500 text-xs">
                      Letzter Check: {new Date(r.last_checked_at).toLocaleString('de-DE')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => checkOne(r.product_id)}
                    disabled={busyProduct === r.product_id}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded text-xs"
                  >
                    {busyProduct === r.product_id ? '…' : 'Neu prüfen'}
                  </button>
                  {isUpdate && (
                    <button
                      onClick={() => markSeen(r)}
                      disabled={busyProduct === r.product_id}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 rounded text-xs font-semibold"
                    >
                      Als gesehen markieren
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
