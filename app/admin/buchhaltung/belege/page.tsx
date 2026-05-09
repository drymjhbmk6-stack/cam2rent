'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
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
  // Default: neueste oben — Datum absteigend.
  const [sortKey, setSortKey] = useState<SortKey>('beleg_datum');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
                    // Liste neu laden, damit Badges erscheinen
                    const sp = new URLSearchParams();
                    if (statusFilter) sp.set('status', statusFilter);
                    if (q) sp.set('q', q);
                    sp.set('limit', '100');
                    const r = await fetch(`/api/admin/belege?${sp.toString()}`);
                    setBelege((await r.json()).belege ?? []);
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
        ) : sortedBelege.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {sortedBelege.map((b) => (
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
