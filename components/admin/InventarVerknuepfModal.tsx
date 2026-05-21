'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Modal: mehrere Inventar-Stücke in einem Rutsch mit einer Beleg-Position
 * verknüpfen — optional mit direkt eingegebenem Wiederbeschaffungswert pro
 * Stück. Gedacht für Bundle-Einkäufe (z.B. 3 Akkus aus einem Set).
 */

interface InventarUnit {
  id: string;
  bezeichnung: string;
  inventar_code: string | null;
  seriennummer: string | null;
  status: string;
  typ: string;
}

interface Props {
  positionId: string;
  positionLabel: string;
  positionMenge: number;
  alreadyLinked: number;
  onClose: () => void;
  onDone: () => void;
}

function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function InventarVerknuepfModal({
  positionId,
  positionLabel,
  positionMenge,
  alreadyLinked,
  onClose,
  onDone,
}: Props) {
  const [units, setUnits] = useState<InventarUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wbw, setWbw] = useState<Record<string, string>>({});
  const [wbwAll, setWbwAll] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capacity = Math.max(0, positionMenge - alreadyLinked);

  useEffect(() => {
    fetch('/api/admin/inventar?beleg_status=beleg_fehlt')
      .then((r) => r.json())
      .then((d) => setUnits(Array.isArray(d.units) ? d.units : []))
      .catch(() => setUnits([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.bezeichnung.toLowerCase().includes(q) ||
        (u.inventar_code ?? '').toLowerCase().includes(q) ||
        (u.seriennummer ?? '').toLowerCase().includes(q),
    );
  }, [units, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyWbwToAll() {
    if (!wbwAll.trim()) return;
    setWbw((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = wbwAll;
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (selected.size === 0) {
      setError('Bitte mindestens ein Stück auswählen.');
      return;
    }
    if (selected.size > capacity) {
      setError(`Nur noch ${capacity} Stück verknüpfbar — du hast ${selected.size} gewählt.`);
      return;
    }
    setSubmitting(true);
    try {
      const items = [...selected].map((id) => {
        const v = parseNum(wbw[id] ?? '');
        return { inventar_unit_id: id, wbw: v > 0 ? v : null };
      });
      const res = await fetch(`/api/admin/beleg-positionen/${positionId}/verknuepfen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Verknüpfen fehlgeschlagen.');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Inventar-Stücke verknüpfen</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Position „{positionLabel}“ · Menge {positionMenge}
                {alreadyLinked > 0 && ` · ${alreadyLinked} bereits verknüpft`}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">
              ✕
            </button>
          </div>
          {capacity === 0 ? (
            <p className="text-xs text-amber-300 mt-2">
              Diese Position ist bereits voll verknüpft. Erhöhe die Menge der Position oder
              teile den Beleg in mehrere Positionen auf.
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-2">Noch {capacity} Stück verknüpfbar.</p>
          )}
        </div>

        {/* Wert für alle */}
        <div className="p-4 border-b border-slate-800 space-y-2">
          <label className="text-xs uppercase tracking-wider text-slate-500 block">
            Wiederbeschaffungswert je Stück (optional)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={wbwAll}
                onChange={(e) => setWbwAll(e.target.value)}
                inputMode="decimal"
                placeholder="z.B. 24,99"
                className="w-full bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-right pr-7 focus:outline-none focus:border-cyan-600"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
            </div>
            <button
              type="button"
              onClick={applyWbwToAll}
              disabled={!wbwAll.trim() || selected.size === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 rounded text-sm text-slate-200 whitespace-nowrap"
            >
              → für alle Gewählten
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Realistischer Einzel-Ersatzpreis (nicht der Bundle-Preis). Leer lassen = Wert
            aus dem Beleg übernehmen. Pro Zeile unten überschreibbar.
          </p>
        </div>

        {/* Suche + Liste */}
        <div className="p-4 border-b border-slate-800">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Inventar durchsuchen (Name / Code / Seriennr.)…"
            className="w-full bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-600"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[120px]">
          {loading && <p className="text-sm text-slate-500 py-4 text-center">Lade Inventar…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">
              Keine Inventar-Stücke ohne Beleg gefunden.
            </p>
          )}
          {!loading &&
            filtered.map((u) => {
              const checked = selected.has(u.id);
              return (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 py-1.5 border-b border-slate-800/60 last:border-0 ${
                    checked ? 'bg-cyan-500/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(u.id)}
                    className="shrink-0 accent-cyan-500 w-4 h-4"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm text-slate-200 truncate">{u.bezeichnung}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {u.inventar_code && <span className="font-mono">{u.inventar_code}</span>}
                      {u.seriennummer && <span> · SN {u.seriennummer}</span>}
                      {!u.inventar_code && !u.seriennummer && <span>{u.typ}</span>}
                    </div>
                  </button>
                  <div className="relative w-24 shrink-0">
                    <input
                      value={wbw[u.id] ?? ''}
                      onChange={(e) => setWbw((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="WBW"
                      disabled={!checked}
                      className="w-full bg-[#111827] border border-slate-700 rounded px-2 py-1 text-xs text-right pr-5 disabled:opacity-40 focus:outline-none focus:border-cyan-600"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">€</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {selected.size} gewählt{capacity > 0 ? ` · max. ${capacity}` : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-slate-200"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={submitting || selected.size === 0 || selected.size > capacity}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-sm font-semibold"
              >
                {submitting ? 'Verknüpfe…' : `${selected.size} verknüpfen`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
