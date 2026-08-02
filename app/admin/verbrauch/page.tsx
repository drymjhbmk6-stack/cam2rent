'use client';

import { useEffect, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { getCached, setCached } from '@/lib/use-cached-fetch';

interface Verbrauchsartikel {
  id: string;
  name: string;
  bestand: number;
  auto_deduct: boolean;
  deduct_qty: number;
  warn_threshold: number | null;
  low_stock_notified: boolean;
  sort_order: number;
}

const CACHE_KEY = 'admin:verbrauch:items';

function isLow(a: Verbrauchsartikel): boolean {
  return typeof a.warn_threshold === 'number' && a.bestand <= a.warn_threshold;
}

export default function VerbrauchPage() {
  const [items, setItems] = useState<Verbrauchsartikel[]>(
    () => getCached<Verbrauchsartikel[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => getCached(CACHE_KEY) === undefined);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const didMount = useRef(false);

  // Neu-Anlegen-Formular
  const [showNew, setShowNew] = useState(false);
  const [nName, setNName] = useState('');
  const [nBestand, setNBestand] = useState('0');
  const [nAuto, setNAuto] = useState(false);
  const [nQty, setNQty] = useState('1');
  const [nWarn, setNWarn] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline-Bearbeitung der Einstellungen
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eAuto, setEAuto] = useState(false);
  const [eQty, setEQty] = useState('1');
  const [eWarn, setEWarn] = useState('');

  // Bestand-direkt-setzen
  const [setValById, setSetValById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    try {
      const res = await fetch('/api/admin/verbrauch');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setMigrationPending(!!data.migration_pending);
      const list: Verbrauchsartikel[] = data.items ?? [];
      setItems(list);
      setCached(CACHE_KEY, list);
      setError(null);
    } catch (e) {
      setError(`Netzwerk-Fehler: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void reload();
  }, []);

  function resetNew() {
    setNName('');
    setNBestand('0');
    setNAuto(false);
    setNQty('1');
    setNWarn('');
  }

  async function handleCreate() {
    if (!nName.trim()) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verbrauch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nName.trim(),
          bestand: parseInt(nBestand, 10) || 0,
          auto_deduct: nAuto,
          deduct_qty: parseInt(nQty, 10) || 1,
          warn_threshold: nWarn.trim() === '' ? null : parseInt(nWarn, 10) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      resetNew();
      setShowNew(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  // Optimistisch das Item lokal ersetzen.
  function applyLocal(updated: Verbrauchsartikel) {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === updated.id ? updated : it));
      setCached(CACHE_KEY, next);
      return next;
    });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verbrauch/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return null;
      }
      if (data.item) applyLocal(data.item as Verbrauchsartikel);
      return data.item as Verbrauchsartikel;
    } finally {
      setBusyId(null);
    }
  }

  async function adjust(id: string, delta: number) {
    await patch(id, { adjust: delta });
  }

  async function setBestand(id: string) {
    const raw = setValById[id];
    if (raw === undefined || raw.trim() === '') return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const ok = await patch(id, { bestand: Math.max(0, n) });
    if (ok) setSetValById((m) => ({ ...m, [id]: '' }));
  }

  function startEdit(a: Verbrauchsartikel) {
    setEditId(a.id);
    setEName(a.name);
    setEAuto(a.auto_deduct);
    setEQty(String(a.deduct_qty));
    setEWarn(a.warn_threshold === null ? '' : String(a.warn_threshold));
  }

  async function saveEdit(id: string) {
    if (!eName.trim()) {
      setError('Name darf nicht leer sein.');
      return;
    }
    const ok = await patch(id, {
      name: eName.trim(),
      auto_deduct: eAuto,
      deduct_qty: parseInt(eQty, 10) || 1,
      warn_threshold: eWarn.trim() === '' ? null : parseInt(eWarn, 10) || 0,
    });
    if (ok) setEditId(null);
  }

  async function handleDelete(a: Verbrauchsartikel) {
    if (!confirm(`„${a.name}" wirklich löschen? Der Zähler geht dabei verloren.`)) return;
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/admin/verbrauch/${a.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== a.id);
        setCached(CACHE_KEY, next);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  const inputCls =
    'px-2 py-1.5 rounded bg-[#0a0f1e] border border-slate-700 text-slate-50 text-sm w-full';

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink />
      <div className="max-w-5xl mx-auto mt-4 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Verbrauch</h1>
            <p className="text-slate-400 text-sm mt-1">
              Interner Zähler für Verbrauchsmaterial (z.B. Gummibärchentüten,
              Füllmaterial). Optional automatischer Abzug, sobald eine Buchung als
              versendet oder abgeholt markiert wird.
            </p>
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded font-semibold text-sm"
          >
            {showNew ? 'Abbrechen' : '+ Artikel anlegen'}
          </button>
        </div>

        {migrationPending && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
            Migration <code>supabase-verbrauchsartikel.sql</code> ist noch nicht
            ausgeführt — Anlegen ist erst danach möglich.
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">
            {error}
          </div>
        )}

        {showNew && (
          <div className="p-4 bg-[#111827] border border-slate-800 rounded space-y-3">
            <h2 className="font-semibold text-sm">Neuer Verbrauchsartikel</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Name</span>
                <input className={inputCls} value={nName} onChange={(e) => setNName(e.target.value)} placeholder="z.B. Gummibärchentüten" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Anfangsbestand</span>
                <input className={inputCls} type="number" inputMode="numeric" min={0} value={nBestand} onChange={(e) => setNBestand(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Abzugsmenge pro Buchung</span>
                <input className={inputCls} type="number" inputMode="numeric" min={1} value={nQty} onChange={(e) => setNQty(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Warnung ab Bestand (leer = aus)</span>
                <input className={inputCls} type="number" inputMode="numeric" min={0} value={nWarn} onChange={(e) => setNWarn(e.target.value)} placeholder="z.B. 3" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nAuto} onChange={(e) => setNAuto(e.target.checked)} className="w-4 h-4" />
              <span>Automatisch abziehen bei „versendet“ / „abgeholt“</span>
            </label>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 rounded font-semibold text-sm">
                {saving ? 'Speichern…' : 'Anlegen'}
              </button>
              <button onClick={() => { setShowNew(false); resetNew(); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="p-6 text-slate-400 text-sm">Wird geladen…</div>
        )}

        {!loading && items.length === 0 && !migrationPending && (
          <div className="p-6 bg-[#111827] border border-slate-800 rounded text-slate-400 text-sm">
            Noch keine Verbrauchsartikel. Lege oben den ersten an.
          </div>
        )}

        <div className="space-y-3">
          {items.map((a) => {
            const low = isLow(a);
            const editing = editId === a.id;
            const busy = busyId === a.id;
            return (
              <div
                key={a.id}
                className={`p-4 bg-[#111827] border rounded ${low ? 'border-amber-500/50' : 'border-slate-800'}`}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Bestand + Name */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="text-center">
                      <div className={`text-3xl font-bold tabular-nums ${low ? 'text-amber-400' : 'text-slate-50'}`}>
                        {a.bestand}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Bestand</div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{a.name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                        {a.auto_deduct ? (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                            Auto-Abzug −{a.deduct_qty}/Buchung
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-700/40 border border-slate-600 text-slate-400">
                            Kein Auto-Abzug
                          </span>
                        )}
                        {a.warn_threshold !== null && (
                          <span className={`px-2 py-0.5 rounded border ${low ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-700/40 border-slate-600 text-slate-400'}`}>
                            Warnung ab {a.warn_threshold}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manuelle Bestandsanpassung */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => adjust(a.id, -1)} disabled={busy || a.bestand <= 0} className="w-9 h-9 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-lg font-bold" title="−1">−</button>
                    <button onClick={() => adjust(a.id, 1)} disabled={busy} className="w-9 h-9 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-lg font-bold" title="+1">+</button>
                    <div className="flex items-center gap-1">
                      <input
                        className="px-2 py-1.5 rounded bg-[#0a0f1e] border border-slate-700 text-slate-50 text-sm w-20"
                        type="number"
                        inputMode="numeric"
                        placeholder="Wert"
                        value={setValById[a.id] ?? ''}
                        onChange={(e) => setSetValById((m) => ({ ...m, [a.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') setBestand(a.id); }}
                      />
                      <button onClick={() => setBestand(a.id)} disabled={busy} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-sm">Setzen</button>
                    </div>
                    <button onClick={() => (editing ? setEditId(null) : startEdit(a))} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm">
                      {editing ? 'Schließen' : 'Bearbeiten'}
                    </button>
                    <button onClick={() => handleDelete(a)} disabled={busy} className="px-3 py-1.5 rounded bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 text-sm">Löschen</button>
                  </div>
                </div>

                {editing && (
                  <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Name</span>
                      <input className={inputCls} value={eName} onChange={(e) => setEName(e.target.value)} />
                    </label>
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Abzugsmenge pro Buchung</span>
                      <input className={inputCls} type="number" inputMode="numeric" min={1} value={eQty} onChange={(e) => setEQty(e.target.value)} />
                    </label>
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Warnung ab Bestand (leer = aus)</span>
                      <input className={inputCls} type="number" inputMode="numeric" min={0} value={eWarn} onChange={(e) => setEWarn(e.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:mt-6">
                      <input type="checkbox" checked={eAuto} onChange={(e) => setEAuto(e.target.checked)} className="w-4 h-4" />
                      <span>Automatisch abziehen bei „versendet“ / „abgeholt“</span>
                    </label>
                    <div className="sm:col-span-2 flex gap-2">
                      <button onClick={() => saveEdit(a.id)} disabled={busy} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 rounded font-semibold text-sm">Speichern</button>
                      <button onClick={() => setEditId(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
