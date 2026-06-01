'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BelegDokumentVorschau from '@/components/admin/BelegDokumentVorschau';
import { formatCurrency, fmtDate as fmtDateCanonical } from '@/lib/format-utils';

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
  ocr_status?: 'pending' | 'running' | 'done' | 'failed' | null;
  ocr_error?: string | null;
  verdacht_duplikat_beleg_id?: string | null;
  verdacht_duplikat_dismissed_at?: string | null;
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

// Reihenfolge fuer Status-Sortierung: offen (oben/neu) → festgeschrieben (unten/erledigt)
const STATUS_ORDER: Record<string, number> = {
  offen: 0,
  teilweise: 1,
  klassifiziert: 2,
  festgeschrieben: 3,
};

type SortKey = 'beleg_nr' | 'beleg_datum' | 'lieferant' | 'summe_brutto' | 'klassifizierung' | 'status';
type SortDir = 'asc' | 'desc';

// Zentrale Helper aus lib/format-utils
const fmtEuro = formatCurrency;
const fmtDate = fmtDateCanonical;

const MONATS_NAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// 'YYYY-MM' → 'Mai 2026'
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MONATS_NAMEN[idx]} ${y}`;
}

function getSortValue(b: Beleg, key: SortKey): string | number {
  switch (key) {
    case 'beleg_nr': return b.beleg_nr ?? '';
    case 'beleg_datum': return b.beleg_datum ?? '';   // ISO YYYY-MM-DD ist lex-sortierbar
    case 'lieferant': return (b.lieferant?.name ?? '').toLocaleLowerCase('de-DE');
    case 'summe_brutto': return Number(b.summe_brutto ?? 0);
    case 'klassifizierung': return b.positions_total === 0 ? 0 : (b.positions_total - b.positions_pending) / b.positions_total;
    case 'status': return STATUS_ORDER[b.status] ?? 99;
  }
}

export default function BelegeListePage() {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [scanResult, setScanResult] = useState<{ scanned: number; flagged: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryStatus, setRetryStatus] = useState<{ done: number; remaining: number; succeeded: number } | null>(null);
  const retryAbortRef = useRef(false);
  // Default: neueste oben — Datum absteigend.
  const [sortKey, setSortKey] = useState<SortKey>('beleg_datum');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [previewBelegId, setPreviewBelegId] = useState<string | null>(null);
  // null = noch nicht initialisiert (springt auf neuesten Monat), '' = Alle Monate
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const monthInitRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      if (q) sp.set('q', q);
      sp.set('limit', '200');
      const res = await fetch(`/api/admin/belege?${sp.toString()}`);
      const data = await res.json();
      setBelege(data.belege ?? []);
      setLoading(false);
    };
    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [statusFilter, q]);

  const failedOcrCount = useMemo(
    () => belege.filter((b) => b.ocr_status === 'failed').length,
    [belege],
  );

  async function refreshList() {
    const sp = new URLSearchParams();
    if (statusFilter) sp.set('status', statusFilter);
    if (q) sp.set('q', q);
    sp.set('limit', '200');
    const r = await fetch(`/api/admin/belege?${sp.toString()}`);
    setBelege((await r.json()).belege ?? []);
  }

  async function handleRetryFailed() {
    if (retrying) {
      // Zweiter Klick = abbrechen
      retryAbortRef.current = true;
      return;
    }
    setRetrying(true);
    retryAbortRef.current = false;
    let done = 0;
    let succeeded = 0;
    let remaining = failedOcrCount;
    setRetryStatus({ done, remaining, succeeded });

    while (remaining > 0 && !retryAbortRef.current) {
      try {
        const res = await fetch('/api/admin/belege/retry-failed-ocr', { method: 'POST' });
        if (!res.ok) {
          alert('Retry fehlgeschlagen — bitte später erneut versuchen.');
          break;
        }
        const data = await res.json();
        done += data.retried ?? 0;
        succeeded += data.succeeded ?? 0;
        remaining = data.remaining ?? 0;
        setRetryStatus({ done, remaining, succeeded });
        if ((data.retried ?? 0) === 0) break; // Sicherheits-Bremse
      } catch {
        alert('Netzwerkfehler beim Retry — bitte erneut versuchen.');
        break;
      }
    }

    await refreshList();
    setRetrying(false);
  }

  // Client-seitige Sortierung — bei 100 Eintraegen vernachlaessigbarer Aufwand
  // gegenueber dem Network-Roundtrip einer Server-Sortierung.
  const sortedBelege = useMemo(() => {
    const arr = [...belege];
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va === vb) return 0;
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'de-DE');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [belege, sortKey, sortDir]);

  // Verfuegbare Monate aus den geladenen Belegen (neueste zuerst) inkl. Anzahl + Summe.
  const months = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    for (const b of belege) {
      const key = (b.beleg_datum ?? '').slice(0, 7);
      if (key.length !== 7) continue;
      const cur = map.get(key) ?? { count: 0, sum: 0 };
      cur.count++;
      cur.sum += Number(b.summe_brutto ?? 0);
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([ym, v]) => ({ ym, ...v }))
      .sort((a, b) => b.ym.localeCompare(a.ym));
  }, [belege]);

  // Beim ersten Laden automatisch auf den neuesten Monat springen (entstaubt die Ansicht).
  useEffect(() => {
    if (!monthInitRef.current && months.length > 0) {
      monthInitRef.current = true;
      setMonthFilter(months[0].ym);
    }
  }, [months]);

  // Bei aktiver Suche: Monatsfilter ignorieren (Treffer aus allen Monaten zeigen).
  const searching = q.trim().length > 0;
  const effectiveMonth = searching ? '' : (monthFilter ?? '');

  const visibleBelege = useMemo(() => {
    if (!effectiveMonth) return sortedBelege;
    return sortedBelege.filter((b) => (b.beleg_datum ?? '').slice(0, 7) === effectiveMonth);
  }, [sortedBelege, effectiveMonth]);

  const visibleSum = useMemo(
    () => visibleBelege.reduce((acc, b) => acc + Number(b.summe_brutto ?? 0), 0),
    [visibleBelege],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      // gleicher Key → Richtung wechseln
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      // neuer Key → bei Datum/Brutto/Klassifizierung default desc, sonst asc
      setSortKey(key);
      setSortDir(key === 'beleg_datum' || key === 'summe_brutto' || key === 'klassifizierung' ? 'desc' : 'asc');
    }
  }

  function SortHeader({
    label, k, align,
  }: { label: string; k: SortKey; align?: 'left' | 'right' }) {
    const active = sortKey === k;
    const arrow = !active ? '↕' : sortDir === 'asc' ? '↑' : '↓';
    return (
      <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 uppercase text-xs font-semibold tracking-wider transition-colors ${
            active ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label={`Sortieren nach ${label}${active ? `, aktuell ${sortDir === 'asc' ? 'aufsteigend' : 'absteigend'}` : ''}`}
        >
          <span>{label}</span>
          <span className={active ? '' : 'opacity-50'}>{arrow}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung" />
      <div className="max-w-7xl mx-auto mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-heading">Belege</h1>
          <div className="flex gap-2 flex-wrap">
            {failedOcrCount > 0 && (
              <button
                onClick={handleRetryFailed}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-slate-900 rounded font-semibold"
                title="Re-triggert OCR mit Throttle (3 parallel max), umgeht Rate-Limits."
              >
                {retrying
                  ? `⏸ Stoppen (${retryStatus?.done ?? 0}/${(retryStatus?.done ?? 0) + (retryStatus?.remaining ?? 0)})`
                  : `🔄 OCR-Fehler neu starten (${failedOcrCount})`}
              </button>
            )}
            <button
              onClick={async () => {
                if (scanning) return;
                setScanning(true);
                setScanResult(null);
                try {
                  const res = await fetch('/api/admin/belege/scan-duplicates', { method: 'POST' });
                  const data = await res.json();
                  if (res.ok) {
                    setScanResult({ scanned: data.scanned ?? 0, flagged: data.flagged ?? 0 });
                    await refreshList();
                  } else {
                    alert(data.error ?? 'Scan fehlgeschlagen');
                  }
                } finally {
                  setScanning(false);
                }
              }}
              disabled={scanning}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 rounded font-semibold"
              title="Sucht inhaltliche Duplikate im gesamten Bestand und markiert sie"
            >
              {scanning ? 'Scanne…' : '🔍 Duplikate scannen'}
            </button>
            <Link
              href="/admin/buchhaltung/belege/bulk"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-semibold"
            >
              📚 Mehrere hochladen
            </Link>
            <Link href="/admin/buchhaltung/belege/neu" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded font-semibold">
              + Neuer Beleg
            </Link>
          </div>
        </div>
        {scanResult && (
          <div className={`p-3 rounded text-sm mb-4 ${
            scanResult.flagged > 0
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
          }`}>
            {scanResult.flagged > 0
              ? <>⚠ <b>{scanResult.flagged}</b> verdächtige Duplikate gefunden (von {scanResult.scanned} geprüften Belegen). Markierte Belege haben jetzt einen ⚠-Badge.</>
              : <>✓ Keine Duplikate gefunden (alle {scanResult.scanned} offenen Belege geprüft).</>
            }
          </div>
        )}
        {retryStatus && (
          <div className={`p-3 rounded text-sm mb-4 ${
            retrying
              ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-200'
              : retryStatus.remaining === 0 && retryStatus.succeeded > 0
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
          }`}>
            {retrying ? (
              <>⏳ Retry läuft… {retryStatus.done} verarbeitet, {retryStatus.succeeded} erfolgreich, noch {retryStatus.remaining} übrig.</>
            ) : retryStatus.remaining === 0 ? (
              <>✓ Alle OCR-Retries fertig — {retryStatus.succeeded} von {retryStatus.done} erfolgreich.</>
            ) : (
              <>⏸ Retry gestoppt — {retryStatus.done} verarbeitet ({retryStatus.succeeded} erfolgreich), {retryStatus.remaining} noch fehlgeschlagen.</>
            )}
          </div>
        )}

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

        {/* Monats-Reiter — entzerrt die Liste nach Monat. Bei aktiver Suche ausgeblendet. */}
        {!searching && months.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
            <button
              onClick={() => setMonthFilter('')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                effectiveMonth === ''
                  ? 'bg-cyan-500 text-slate-900 border-cyan-500'
                  : 'bg-[#111827] text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
              style={{ scrollSnapAlign: 'start' }}
            >
              Alle ({belege.length})
            </button>
            {months.map((m) => (
              <button
                key={m.ym}
                onClick={() => setMonthFilter(m.ym)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
                  effectiveMonth === m.ym
                    ? 'bg-cyan-500 text-slate-900 border-cyan-500'
                    : 'bg-[#111827] text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                {monthLabel(m.ym)} ({m.count})
              </button>
            ))}
          </div>
        )}

        {/* Summen-Zeile fuer die aktuelle Ansicht */}
        {!loading && visibleBelege.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 text-sm">
            <span className="text-slate-400">
              {searching
                ? `${visibleBelege.length} Treffer`
                : effectiveMonth
                  ? `${monthLabel(effectiveMonth)} · ${visibleBelege.length} Beleg(e)`
                  : `Alle Monate · ${visibleBelege.length} Beleg(e)`}
            </span>
            <span className="text-slate-300">
              Summe brutto: <b className="text-white">{fmtEuro(visibleSum)}</b>
            </span>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Lädt…</p>
        ) : visibleBelege.length === 0 ? (
          <p className="text-slate-400">Keine Belege gefunden.</p>
        ) : (
          // overflow-x-auto + min-w auf der Tabelle = horizontal scrollbar auf
          // schmalen Viewports, Lieferanten-Namen werden nicht mehr umbrochen.
          <div className="bg-[#111827] rounded border border-slate-800 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-900 text-left">
                <tr>
                  <SortHeader label="Beleg-Nr" k="beleg_nr" />
                  <SortHeader label="Datum" k="beleg_datum" />
                  <SortHeader label="Lieferant" k="lieferant" />
                  <SortHeader label="Brutto" k="summe_brutto" align="right" />
                  <SortHeader label="Klassif." k="klassifizierung" />
                  <SortHeader label="Status" k="status" />
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 whitespace-nowrap">Beleg</th>
                </tr>
              </thead>
              <tbody>
                {visibleBelege.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => { window.location.href = `/admin/buchhaltung/belege/${b.id}`; }}
                  >
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{b.beleg_nr}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.beleg_datum)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.lieferant?.name ?? <span className="text-slate-500 italic">–</span>}
                      {b.ist_eigenbeleg && <span className="ml-2 text-xs text-amber-400">(Eigenbeleg)</span>}
                      {(b.ocr_status === 'running' || b.ocr_status === 'pending') && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-violet-500/15 text-violet-300 border border-violet-500/30"
                          title="Die KI liest den Beleg gerade aus — eine Push-Notification kommt, sobald fertig."
                        >
                          <span className="inline-block w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                          KI läuft
                        </span>
                      )}
                      {b.ocr_status === 'failed' && (
                        <span
                          className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-300 border border-red-500/30"
                          title={b.ocr_error ?? 'OCR-Fehler — Daten manuell ergänzen.'}
                        >
                          OCR-Fehler
                        </span>
                      )}
                      {b.verdacht_duplikat_beleg_id && !b.verdacht_duplikat_dismissed_at && (
                        <span
                          className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-rose-500/15 text-rose-300 border border-rose-500/30"
                          title="Verdacht auf Duplikat — gleicher Lieferant + Datum/Rg-Nr/Betrag wie ein anderer Beleg. Bitte im Detail prüfen."
                        >
                          ⚠ Duplikat-Verdacht
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{fmtEuro(Number(b.summe_brutto))}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {b.positions_pending > 0
                        ? <span className="text-amber-400">{b.positions_total - b.positions_pending}/{b.positions_total}</span>
                        : <span className="text-emerald-400">{b.positions_total}/{b.positions_total} ✓</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_COLOR[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setPreviewBelegId(b.id)}
                        title="Rechnung ansehen"
                        aria-label="Rechnung ansehen"
                        className="text-slate-400 hover:text-cyan-300 text-base"
                      >
                        👁
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewBelegId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewBelegId(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">Rechnung ansehen</h2>
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/buchhaltung/belege/${previewBelegId}`}
                  className="text-cyan-400 hover:text-cyan-300 text-xs"
                >
                  Zum Beleg →
                </Link>
                <button
                  onClick={() => setPreviewBelegId(null)}
                  className="text-slate-500 hover:text-slate-300 text-xl leading-none"
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-3 overflow-y-auto">
              <BelegDokumentVorschau belegId={previewBelegId} height={620} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
