'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

/**
 * Inventar — Konsolidiert (neue Welt). Zeigt alles aus inventar_units.
 * Ersetzt die alte Liste, die noch product_units + accessory_units gemischt hat.
 */

interface Unit {
  id: string;
  bezeichnung: string;
  typ: 'kamera' | 'zubehoer' | 'verbrauch';
  tracking_mode: 'individual' | 'bulk';
  produkt: { id: string; name: string; marke: string | null; modell: string | null } | null;
  seriennummer: string | null;
  inventar_code: string | null;
  bestand: number | null;
  kaufpreis_netto: number | null;
  kaufdatum: string | null;
  wbw_computed: number | null;
  wbw_source: string;
  wbw_manuell_gesetzt: boolean;
  wiederbeschaffungswert: number | null;
  status: string;
  beleg_status: 'verknuepft' | 'beleg_fehlt';
}

const TYP_LABEL: Record<string, string> = { kamera: 'Kamera', zubehoer: 'Zubehör', verbrauch: 'Verbrauch' };
const STATUS_LABEL: Record<string, string> = {
  verfuegbar: 'Verfügbar', vermietet: 'Vermietet', wartung: 'Wartung',
  defekt: 'Defekt', ausgemustert: 'Ausgemustert',
};

function fmtEuro(n: number | null): string {
  if (n === null) return 'Nicht gesetzt';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

/**
 * Liefert die Display-Felder fuer die Listen-Spalten Bezeichnung / Code / SN.
 *
 * Hintergrund: Bei der Migration von product_units / accessory_units in die
 * konsolidierte Tabelle inventar_units wurden Codes teilweise in das
 * `bezeichnung`-Feld gepackt (z.B. "128 GB (STO-SAN-128-01)") oder als
 * inventar_code mit DB-ID-Praefix erzeugt ("CAM-2-82JXN..."). Hier wird das
 * fuer die Anzeige aufgedroeselt, ohne DB-Daten anzufassen.
 */
function displayFields(u: Unit): { bezeichnung: string; code: string; sn: string } {
  const empty = '—';

  if (u.typ === 'kamera') {
    // Kamera: produkt.marke + produkt.modell als Bezeichnung,
    // bezeichnung-Feld (= altes product_units.label, z.B. "CAM-DJI-OA5-01")
    // als Code, seriennummer separat.
    const modellName = [u.produkt?.marke, u.produkt?.modell].filter(Boolean).join(' ').trim()
      || u.produkt?.name
      || u.bezeichnung;
    const codeFromLabel = u.bezeichnung && u.bezeichnung !== modellName ? u.bezeichnung : u.inventar_code;
    return {
      bezeichnung: modellName,
      code: codeFromLabel ?? empty,
      sn: u.seriennummer ?? empty,
    };
  }

  // Zubehoer / Verbrauch: Code-Suffix " (XYZ-123)" am Ende der Bezeichnung
  // abstreifen, damit nichts doppelt steht.
  let bez = u.bezeichnung;
  if (u.inventar_code) {
    const suffix = ` (${u.inventar_code})`;
    if (bez.endsWith(suffix)) bez = bez.slice(0, -suffix.length).trim();
  }
  return {
    bezeichnung: bez || u.inventar_code || empty,
    code: u.inventar_code ?? empty,
    sn: u.seriennummer ?? empty,
  };
}

export default function InventarPage() {
  const searchParams = useSearchParams();
  const produktId = searchParams.get('produkt_id') ?? '';
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [typ, setTyp] = useState(searchParams.get('typ') ?? '');
  const [status, setStatus] = useState('');
  const [belegStatus, setBelegStatus] = useState('');
  const [q, setQ] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, label: string) {
    if (!confirm(
      `"${label}" endgültig aus dem Inventar löschen?\n\n` +
      `Vermietete Stücke können nicht gelöscht werden. ` +
      `Der gespiegelte Eintrag in der alten Welt (product_units/accessory_units) ` +
      `wird mit entfernt.`,
    )) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/inventar/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(res.status === 409
          ? (data.error ?? 'Stück ist vermietet — kann nicht gelöscht werden.')
          : `Löschen fehlgeschlagen: ${data.error ?? 'Status ' + res.status}`);
        return;
      }
      setUnits((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      alert(`Netzwerk-Fehler: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (typ) sp.set('typ', typ);
      if (status) sp.set('status', status);
      if (belegStatus) sp.set('beleg_status', belegStatus);
      if (q) sp.set('q', q);
      if (produktId) sp.set('produkt_id', produktId);
      const res = await fetch(`/api/admin/inventar?${sp.toString()}`);
      const data = await res.json();
      setUnits(data.units ?? []);
      setLoading(false);
    };
    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [typ, status, belegStatus, q, produktId]);

  const stats = {
    total: units.length,
    verfuegbar: units.filter((u) => u.status === 'verfuegbar').length,
    vermietet: units.filter((u) => u.status === 'vermietet').length,
    fehlend: units.filter((u) => u.beleg_status === 'beleg_fehlt').length,
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin" />
      <div className="max-w-7xl mx-auto mt-4">
        <div className="flex flex-wrap justify-between gap-3 mb-6">
          <h1 className="text-2xl font-heading">Inventar</h1>
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin/inventar/code-segmente" className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm">
              Code-Segmente
            </Link>
            <BackfillCodesButton />
            <BackfillMirrorsButton />
            <ResyncQtyButton />
            <Link href="/admin/inventar/neu" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded font-semibold">
              + Manuell anlegen
            </Link>
          </div>
        </div>

        {produktId && (
          <div className="mb-4 px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded text-sm flex items-center justify-between gap-3">
            <span>
              Gefiltert auf Produkt
              {units[0]?.produkt && <>: <strong>{units[0].produkt.marke ?? ''} {units[0].produkt.name}</strong></>}
            </span>
            <Link href="/admin/inventar" className="underline hover:text-cyan-200">Filter entfernen</Link>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Gesamt" value={stats.total} />
          <Stat label="Verfügbar" value={stats.verfuegbar} color="emerald" />
          <Stat label="Vermietet" value={stats.vermietet} color="cyan" />
          <Stat label="Beleg fehlt" value={stats.fehlend} color="amber" />
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche..." className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base flex-1 min-w-[200px]" />
          <select value={typ} onChange={(e) => setTyp(e.target.value)} className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">Alle Typen</option>
            <option value="kamera">Kamera</option>
            <option value="zubehoer">Zubehör</option>
            <option value="verbrauch">Verbrauch</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">Alle Status</option>
            <option value="verfuegbar">Verfügbar</option>
            <option value="vermietet">Vermietet</option>
            <option value="wartung">Wartung</option>
            <option value="defekt">Defekt</option>
            <option value="ausgemustert">Ausgemustert</option>
          </select>
          <select value={belegStatus} onChange={(e) => setBelegStatus(e.target.value)} className="bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">Alle Belege</option>
            <option value="verknuepft">Verknüpft</option>
            <option value="beleg_fehlt">Beleg fehlt</option>
          </select>
        </div>

        {loading ? (
          <p className="text-slate-400">Lädt…</p>
        ) : units.length === 0 ? (
          <p className="text-slate-400">Keine Einheiten gefunden.</p>
        ) : (
          <div className="bg-[#111827] rounded border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Bezeichnung</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Seriennummer</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Bestand</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Beleg</th>
                  <th className="px-3 py-2 text-right">WBW</th>
                  <th className="px-3 py-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const d = displayFields(u);
                  return (
                  <tr key={u.id} className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                      onClick={() => { window.location.href = `/admin/inventar/${u.id}`; }}>
                    <td className="px-3 py-2">{d.bezeichnung}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.sn}</td>
                    <td className="px-3 py-2 text-xs">{TYP_LABEL[u.typ]}{u.tracking_mode === 'bulk' ? ' (Bulk)' : ''}</td>
                    <td className="px-3 py-2">{u.tracking_mode === 'bulk' ? u.bestand : '–'}</td>
                    <td className="px-3 py-2 text-xs">{STATUS_LABEL[u.status] ?? u.status}</td>
                    <td className="px-3 py-2 text-xs">
                      {u.beleg_status === 'verknuepft'
                        ? <span className="text-emerald-400">✓</span>
                        : <span className="text-amber-400">⚠ fehlt</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={u.wbw_computed === null ? 'text-slate-500 italic' : ''}>
                        {fmtEuro(u.wbw_computed)}
                      </span>
                      {u.wbw_manuell_gesetzt && <span className="ml-1 text-cyan-400" title="Manueller Override">●</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(u.id, d.bezeichnung); }}
                        disabled={deletingId === u.id || u.status === 'vermietet'}
                        title={u.status === 'vermietet' ? 'Vermietet — kann nicht gelöscht werden' : 'Endgültig löschen'}
                        className="text-xs text-rose-400 hover:text-rose-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                      >
                        {deletingId === u.id ? 'Löscht…' : 'Löschen'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'slate' }: { label: string; value: number; color?: string }) {
  const colorClass = color === 'emerald' ? 'text-emerald-400'
    : color === 'cyan' ? 'text-cyan-400'
    : color === 'amber' ? 'text-amber-400' : 'text-slate-200';
  return (
    <div className="bg-[#111827] border border-slate-800 rounded p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-mono ${colorClass}`}>{value}</div>
    </div>
  );
}

function BackfillCodesButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    // Erst Dry-Run, damit der User weiss was passiert
    setBusy(true);
    setResult(null);
    try {
      const dry = await fetch('/api/admin/inventar/backfill-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      });
      const dryData = await dry.json();
      if (!dry.ok) {
        setResult(`Fehler: ${dryData.error ?? 'unbekannt'}`);
        return;
      }

      const sampleText = (dryData.samples ?? [])
        .map((s: { from_bezeichnung: string; to_bezeichnung: string; to_code: string }) =>
          `  • "${s.from_bezeichnung}" → Bezeichnung: "${s.to_bezeichnung}", Code: ${s.to_code}`)
        .join('\n');

      const msg =
        `Codes aufräumen?\n\n` +
        `${dryData.updated} Kameras werden umgestellt:\n` +
        `  • Bezeichnung wird zum Modellnamen (z.B. "DJI Action 5 Pro")\n` +
        `  • inventar_code wird zum sauberen Label (z.B. "CAM-DJI-OA5-01")\n\n` +
        (sampleText ? `Beispiele:\n${sampleText}\n\n` : '') +
        `${dryData.skipped} bereits korrekt, ${dryData.conflicts} Konflikte.\n\n` +
        `Idempotent — kann mehrfach laufen.`;

      if (!confirm(msg)) {
        setResult('Abgebrochen.');
        return;
      }

      const res = await fetch('/api/admin/inventar/backfill-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Fehler: ${data.error ?? 'unbekannt'}`);
      } else {
        const parts: string[] = [`${data.updated} aktualisiert`];
        if (data.skipped > 0) parts.push(`${data.skipped} übersprungen`);
        if (data.conflicts > 0) parts.push(`${data.conflicts} Konflikte`);
        setResult(parts.join(' · '));
        if (data.updated > 0) setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setResult(`Netzwerk-Fehler: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setResult(null), 8000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-slate-400">{result}</span>}
      <button
        onClick={run}
        disabled={busy}
        title="Repariert Kamera-Inventar-Einträge: Bezeichnung wird auf den Modellnamen gesetzt, Code auf das saubere Label (z.B. CAM-DJI-OA5-01). Idempotent."
        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 rounded text-sm"
      >
        {busy ? 'Räume auf…' : 'Codes aufräumen'}
      </button>
    </div>
  );
}

function BackfillMirrorsButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!confirm('Bestand reparieren?\n\n1) Zubehoer-Listings aus migration_audit wiederherstellen (falls /admin/zubehoer leer)\n2) Inventar-Einheiten in product_units/accessory_units spiegeln (fuer Buchungs-RPCs)\n\nIdempotent — kann gefahrlos mehrfach laufen.')) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/inventar/backfill-mirrors', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Fehler: ${data.error ?? 'unbekannt'}`);
      } else {
        const parts: string[] = [];
        if (data.accessories_restored > 0) parts.push(`${data.accessories_restored} Zubehör wiederhergestellt`);
        parts.push(`${data.mirrored} gespiegelt`);
        if (data.skipped > 0) parts.push(`${data.skipped} übersprungen`);
        setResult(parts.join(' · '));
      }
    } catch (err) {
      setResult(`Netzwerk-Fehler: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setResult(null), 6000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-slate-400">{result}</span>}
      <button
        onClick={run}
        disabled={busy}
        title="Spiegelt alle Einzel-Inventar-Einheiten in product_units/accessory_units. Damit funktioniert die Buchungs-Auto-Zuweisung fuer manuell angelegte Stuecke."
        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 rounded text-sm"
      >
        {busy ? 'Spiegele…' : 'Mirror-Backfill'}
      </button>
    </div>
  );
}

interface DriftRow {
  id: string;
  name: string;
  current_qty: number;
  unit_count: number;
  diff: number;
  has_inventar: boolean;
}

function ResyncQtyButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [drift, setDrift] = useState<DriftRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/accessories/resync-qty');
      const data = await res.json();
      if (!res.ok) {
        setResult(`Fehler: ${data.error ?? 'unbekannt'}`);
        setDrift([]);
      } else {
        setDrift(data.rows as DriftRow[]);
        // Default-Auswahl: nur Eintraege, die VOR Migration auch im Inventar
        // existieren — bei diesen ist der Unit-Count autoritativ.
        const safe = new Set<string>(
          (data.rows as DriftRow[]).filter((r) => r.has_inventar).map((r) => r.id),
        );
        setSelected(safe);
      }
    } catch (err) {
      setResult(`Netzwerk-Fehler: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} Zubehör-Bestand jetzt anpassen?`)) return;
    setApplying(true);
    try {
      const res = await fetch('/api/admin/accessories/resync-qty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Fehler: ${data.error ?? 'unbekannt'}`);
      } else {
        setResult(`${data.applied} angepasst${data.errors?.length ? ` · ${data.errors.length} Fehler` : ''}`);
        setOpen(false);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err) {
      setResult(`Netzwerk-Fehler: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button
        onClick={openPreview}
        title="Zeigt Zubehöre an, deren Lagerbestand (available_qty) nicht mit den Exemplaren übereinstimmt. Nichts wird ohne Bestätigung geändert."
        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
      >
        Bestände prüfen
      </button>
      {result && !open && <span className="text-xs text-slate-400">{result}</span>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !applying && setOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-heading text-slate-100">Bestands-Drift prüfen</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vergleich zwischen <code className="text-slate-300">accessories.available_qty</code> und gezählten aktiven Exemplaren.
                  Sammel-Zubehör (Bulk) ist ausgenommen.
                </p>
              </div>
              <button onClick={() => !applying && setOpen(false)} className="text-slate-500 hover:text-slate-300 text-xl">×</button>
            </div>

            <div className="overflow-auto flex-1">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Lade Drift…</div>
              ) : !drift || drift.length === 0 ? (
                <div className="p-8 text-center text-emerald-400">✓ Keine Drift gefunden — alle Bestände stimmen.</div>
              ) : (
                <>
                  <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-200">
                    <strong>Hinweis:</strong> Zubehör <em>ohne Inventar-Verknüpfung</em> (graue Zeilen) ist evtl. nur historisch
                    angelegt, ohne dass je Exemplare erfasst wurden. Wenn du das anhakst, fällt es auf <strong>0 Stück</strong>.
                    Default-Auswahl haakt nur Einträge an, deren Inventar-Welt vorhanden ist.
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={drift.length > 0 && selected.size === drift.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelected(new Set(drift.map((r) => r.id)));
                              else setSelected(new Set());
                            }}
                          />
                        </th>
                        <th className="px-4 py-2 text-left">Zubehör</th>
                        <th className="px-4 py-2 text-right">Aktuell</th>
                        <th className="px-4 py-2 text-right">Tatsächlich</th>
                        <th className="px-4 py-2 text-right">Differenz</th>
                        <th className="px-4 py-2 text-center">Inventar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift.map((row) => {
                        const isSafe = row.has_inventar;
                        return (
                          <tr key={row.id} className={`border-t border-slate-800 ${!isSafe ? 'bg-slate-900/50 text-slate-500' : 'text-slate-200'}`}>
                            <td className="px-4 py-2">
                              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{row.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{row.current_qty}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{row.unit_count}</td>
                            <td className={`px-4 py-2 text-right tabular-nums font-semibold ${row.diff < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {row.diff > 0 ? `+${row.diff}` : row.diff}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isSafe
                                ? <span className="text-emerald-400 text-xs">✓ verknüpft</span>
                                : <span className="text-amber-400 text-xs">⚠ ohne Inventar</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {drift && drift.length > 0 && `${selected.size} von ${drift.length} ausgewählt`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={applying}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
                >
                  Abbrechen
                </button>
                <button
                  onClick={apply}
                  disabled={applying || selected.size === 0}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 rounded text-sm font-semibold"
                >
                  {applying ? 'Wende an…' : `${selected.size} anpassen`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
