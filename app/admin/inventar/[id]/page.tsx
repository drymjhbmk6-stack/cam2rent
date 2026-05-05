'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Unit {
  id: string;
  bezeichnung: string;
  typ: 'kamera' | 'zubehoer' | 'verbrauch';
  tracking_mode: 'individual' | 'bulk';
  produkt_id: string | null;
  produkt: { id: string; name: string; marke: string | null } | null;
  seriennummer: string | null;
  inventar_code: string | null;
  bestand: number | null;
  kaufpreis_netto: number | null;
  kaufdatum: string | null;
  wiederbeschaffungswert: number | null;
  wbw_manuell_gesetzt: boolean;
  status: string;
  beleg_status: 'verknuepft' | 'beleg_fehlt';
  notizen: string | null;
}

interface Produkt {
  id: string;
  name: string;
  marke: string | null;
  modell: string | null;
}

interface Link {
  id: string;
  stueck_anteil: number;
  beleg_position: {
    id: string; bezeichnung: string;
    beleg: { id: string; beleg_nr: string; beleg_datum: string; lieferant: { name: string } | null };
  } | null;
}

interface PositionMatch {
  id: string;
  bezeichnung: string;
  einzelpreis_netto: number;
  beleg: { id: string; beleg_nr: string; beleg_datum: string; lieferant: { name: string } | null } | null;
}

function fmtEuro(n: number | null): string {
  if (n === null || n === undefined) return 'Nicht gesetzt';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n));
}

export default function InventarDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const [unit, setUnit] = useState<Unit | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Produkt-Zuordnung
  const [showProduktEdit, setShowProduktEdit] = useState(false);
  const [produktInput, setProduktInput] = useState<string>('');

  // Verknuepfungs-Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<PositionMatch[]>([]);

  // WBW-Override
  const [showWbwEdit, setShowWbwEdit] = useState(false);
  const [wbwInput, setWbwInput] = useState<number>(0);

  async function reload() {
    const res = await fetch(`/api/admin/inventar/${id}`);
    if (!res.ok) { setError('Nicht gefunden'); return; }
    const data = await res.json();
    setUnit(data.unit);
    setLinks(data.links);
  }

  useEffect(() => { reload(); }, [id]);

  // Produkte-Liste fuer das Zuordnungs-Dropdown laden
  useEffect(() => {
    fetch('/api/admin/produkte')
      .then((r) => (r.ok ? r.json() : { produkte: [] }))
      .then((data) => setProdukte(data.produkte ?? []))
      .catch(() => setProdukte([]));
  }, []);

  async function handleSetProdukt() {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produkt_id: produktInput || null }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowProduktEdit(false);
    setBusy(false);
  }

  useEffect(() => {
    if (!showLinkModal) return;
    const timer = setTimeout(async () => {
      const sp = new URLSearchParams();
      if (linkSearch) sp.set('q', linkSearch);
      const res = await fetch(`/api/admin/beleg-positionen?${sp.toString()}`);
      if (res.ok) setLinkResults((await res.json()).positionen ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [linkSearch, showLinkModal]);

  async function handleLink(positionId: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}/verknuepfen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beleg_position_id: positionId }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowLinkModal(false);
    setBusy(false);
  }

  async function handleSetWbw() {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wiederbeschaffungswert: wbwInput }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowWbwEdit(false);
    setBusy(false);
  }

  async function handleClearWbw() {
    if (!confirm('Manuellen Override entfernen?')) return;
    setBusy(true);
    await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wiederbeschaffungswert: null }),
    });
    await reload();
    setBusy(false);
  }

  async function handleStatusChange(newStatus: string) {
    setBusy(true);
    await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await reload();
    setBusy(false);
  }

  if (!unit) return <div className="p-6 text-slate-400">Lädt…</div>;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/inventar" />
      <div className="max-w-4xl mx-auto mt-4 space-y-6">
        <div>
          <h1 className="text-2xl font-heading">{unit.bezeichnung}</h1>
          <p className="text-sm text-slate-400 font-mono">
            {unit.inventar_code} {unit.seriennummer && `· SN: ${unit.seriennummer}`}
          </p>
        </div>

        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        {unit.beleg_status === 'beleg_fehlt' && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
            ⚠ Kein Beleg verknüpft. Kaufpreis ist {unit.kaufpreis_netto === null ? 'nicht hinterlegt' : 'manuell gesetzt'}.
            <button onClick={() => setShowLinkModal(true)} className="ml-2 underline">Beleg verknüpfen</button>
          </div>
        )}

        {/* Stammdaten */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2">
          <h2 className="font-semibold mb-2">Stammdaten</h2>
          <Row label="Typ" value={unit.typ === 'kamera' ? 'Kamera' : unit.typ === 'zubehoer' ? 'Zubehör' : 'Verbrauchsmaterial'} />
          <Row label="Tracking" value={unit.tracking_mode === 'bulk' ? `Bulk (Bestand: ${unit.bestand ?? 0})` : 'Einzeln'} />
          <Row label="Status" value={
            <select value={unit.status} onChange={(e) => handleStatusChange(e.target.value)} className="bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm">
              <option value="verfuegbar">Verfügbar</option>
              <option value="vermietet">Vermietet</option>
              <option value="wartung">Wartung</option>
              <option value="defekt">Defekt</option>
              <option value="ausgemustert">Ausgemustert</option>
            </select>
          } />
          <Row label="Produkt" value={
            showProduktEdit ? (
              <div className="flex gap-2 items-center">
                <select value={produktInput} onChange={(e) => setProduktInput(e.target.value)} className="bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm">
                  <option value="">— Keins —</option>
                  {produkte.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.marke ? `${p.marke} ` : ''}{p.name}
                    </option>
                  ))}
                </select>
                <button onClick={handleSetProdukt} disabled={busy} className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-xs font-semibold">Speichern</button>
                <button onClick={() => setShowProduktEdit(false)} className="text-slate-400 text-xs hover:text-slate-300">Abbrechen</button>
              </div>
            ) : (
              <span className="flex gap-2 items-center">
                {unit.produkt ? `${unit.produkt.marke ?? ''} ${unit.produkt.name}`.trim() : <span className="text-amber-400 italic">Nicht zugeordnet</span>}
                <button onClick={() => { setShowProduktEdit(true); setProduktInput(unit.produkt_id ?? ''); }} className="text-cyan-400 text-xs hover:text-cyan-300">Ändern</button>
              </span>
            )
          } />
          <Row label="Kaufpreis netto" value={fmtEuro(unit.kaufpreis_netto)} />
          <Row label="Kaufdatum" value={unit.kaufdatum ? new Date(unit.kaufdatum).toLocaleDateString('de-DE') : '–'} />
        </section>

        {/* WBW */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Wiederbeschaffungswert</h2>
            <div className="flex gap-2">
              {!showWbwEdit ? (
                <button onClick={() => { setShowWbwEdit(true); setWbwInput(unit.wiederbeschaffungswert ?? unit.kaufpreis_netto ?? 0); }} className="text-cyan-400 text-sm hover:text-cyan-300">
                  {unit.wbw_manuell_gesetzt ? 'Override anpassen' : 'Manuell setzen'}
                </button>
              ) : (
                <button onClick={() => setShowWbwEdit(false)} className="text-slate-400 text-sm hover:text-slate-300">Abbrechen</button>
              )}
              {unit.wbw_manuell_gesetzt && (
                <button onClick={handleClearWbw} className="text-rose-400 text-sm hover:text-rose-300">Override entfernen</button>
              )}
            </div>
          </div>
          {showWbwEdit ? (
            <div className="flex gap-2 items-center">
              <input type="number" step="0.01" min="0" value={wbwInput} onChange={(e) => setWbwInput(parseFloat(e.target.value || '0'))} className="bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base flex-1" />
              <button onClick={handleSetWbw} disabled={busy} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded">Speichern</button>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-mono">{fmtEuro(unit.wiederbeschaffungswert ?? unit.kaufpreis_netto ?? null)}</div>
              <div className="text-xs text-slate-400 mt-1">
                {unit.wbw_manuell_gesetzt && '● Manueller Override aktiv'}
                {!unit.wbw_manuell_gesetzt && unit.kaufpreis_netto && '○ Berechnet aus Kaufpreis (siehe Liste)'}
                {!unit.wbw_manuell_gesetzt && !unit.kaufpreis_netto && '⚠ Nicht gesetzt — Beleg verknüpfen oder manuell pflegen'}
              </div>
            </div>
          )}
        </section>

        {/* Verknuepfungen */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Verknüpfte Belege ({links.length})</h2>
            <button onClick={() => setShowLinkModal(true)} className="text-cyan-400 text-sm hover:text-cyan-300">+ Beleg verknüpfen</button>
          </div>
          {links.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Keine Verknüpfung</p>
          ) : (
            <div className="space-y-1">
              {links.map((l) => l.beleg_position && (
                <div key={l.id} className="text-sm">
                  <Link href={`/admin/buchhaltung/belege/${l.beleg_position.beleg.id}`} className="text-cyan-400 hover:text-cyan-300">
                    {l.beleg_position.beleg.beleg_nr}
                  </Link>
                  {' · '}
                  <span className="text-slate-400">{l.beleg_position.bezeichnung}</span>
                  {l.stueck_anteil > 1 && <span className="text-xs text-slate-500"> ({l.stueck_anteil}× Anteil)</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {unit.notizen && (
          <section className="bg-[#111827] border border-slate-800 rounded p-4">
            <h2 className="font-semibold mb-2">Notizen</h2>
            <p className="text-sm text-slate-400 whitespace-pre-wrap">{unit.notizen}</p>
          </section>
        )}
      </div>

      {/* Verknuepfungs-Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111827] border border-slate-700 rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-lg font-semibold mb-3">Belegposition suchen</h2>
            <input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Bezeichnung, Lieferant…" className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base mb-3" autoFocus />
            <div className="max-h-96 overflow-y-auto space-y-1">
              {linkResults.map((r) => (
                <button key={r.id} onClick={() => handleLink(r.id)} disabled={busy} className="w-full text-left p-3 bg-slate-800/40 hover:bg-slate-700/40 rounded text-sm">
                  <div className="font-medium">{r.bezeichnung}</div>
                  <div className="text-xs text-slate-400">
                    {r.beleg && `${r.beleg.beleg_nr} · ${new Date(r.beleg.beleg_datum).toLocaleDateString('de-DE')}`}
                    {r.beleg?.lieferant && ` · ${r.beleg.lieferant.name}`}
                    {' · '}
                    {fmtEuro(Number(r.einzelpreis_netto))}
                  </div>
                </button>
              ))}
              {linkResults.length === 0 && <p className="text-sm text-slate-500 italic p-3">Keine Treffer</p>}
            </div>
            <div className="mt-3">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded">Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
