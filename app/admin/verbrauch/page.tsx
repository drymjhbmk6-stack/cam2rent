'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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
  deduct_trigger: 'shipment' | 'return' | null;
  linked_accessory_ids: string[] | null;
  linked_accessory_id: string | null;
  image_url: string | null;
  notiz: string | null;
  sort_order: number;
}

interface AccessoryLite {
  id: string;
  name: string;
}

const CACHE_KEY = 'admin:verbrauch:items';
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const URL_TEST_RE = /^https?:\/\//;

function isLow(a: Verbrauchsartikel): boolean {
  return typeof a.warn_threshold === 'number' && a.bestand <= a.warn_threshold;
}

function triggerLabel(t: string | null | undefined): string {
  return t === 'return' ? 'bei Rückgabe' : 'bei Versand / Abholung';
}

// Verknüpfte IDs eines Artikels — Array bevorzugt, Legacy-Einzelfeld als Fallback.
function linkedIdsOf(a: Verbrauchsartikel): string[] {
  const arr = Array.isArray(a.linked_accessory_ids) ? a.linked_accessory_ids.filter(Boolean) : [];
  if (arr.length > 0) return arr;
  return a.linked_accessory_id ? [a.linked_accessory_id] : [];
}

// Notiz-Text rendern und URLs klickbar machen (sicher, kein dangerouslySetInnerHTML).
function renderNote(text: string) {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, i) =>
    URL_TEST_RE.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// Mehrfachauswahl (Checkbox-Liste + Suche). Modul-scope, damit sie beim
// Eltern-Re-Render (z.B. Checkbox-Toggle) nicht neu gemountet wird.
function AccessoryMultiSelect({
  accessories,
  selected,
  onToggle,
}: {
  accessories: AccessoryLite[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = accessories.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded border border-slate-700 bg-[#0a0f1e]">
      <input
        className="w-full px-2 py-1.5 bg-transparent border-b border-slate-700 text-slate-50 text-sm outline-none"
        placeholder="Zubehör suchen…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto p-1">
        {accessories.length === 0 && <div className="px-2 py-2 text-xs text-slate-500">Kein Zubehör geladen.</div>}
        {filtered.map((a) => {
          const on = selected.includes(a.id);
          return (
            <label key={a.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${on ? 'bg-cyan-500/10' : 'hover:bg-slate-800/60'}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(a.id)} className="w-4 h-4" />
              <span className="truncate">{a.name}</span>
            </label>
          );
        })}
        {filtered.length === 0 && accessories.length > 0 && (
          <div className="px-2 py-2 text-xs text-slate-500">Keine Treffer.</div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="px-2 py-1.5 border-t border-slate-700 text-xs text-slate-400">
          {selected.length} ausgewählt — pro zurückgegebenem/versendetem Exemplar wird abgezogen (Abzugsmenge × Stückzahl).
        </div>
      )}
    </div>
  );
}

export default function VerbrauchPage() {
  const [items, setItems] = useState<Verbrauchsartikel[]>(
    () => getCached<Verbrauchsartikel[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => getCached(CACHE_KEY) === undefined);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [accessories, setAccessories] = useState<AccessoryLite[]>([]);
  const accById = new Map(accessories.map((a) => [a.id, a.name]));
  const [lightbox, setLightbox] = useState<string | null>(null);
  const didMount = useRef(false);

  // Neu-Anlegen-Formular
  const [showNew, setShowNew] = useState(false);
  const [nName, setNName] = useState('');
  const [nBestand, setNBestand] = useState('0');
  const [nAuto, setNAuto] = useState(false);
  const [nQty, setNQty] = useState('1');
  const [nWarn, setNWarn] = useState('');
  const [nTrigger, setNTrigger] = useState<'shipment' | 'return'>('shipment');
  const [nLinked, setNLinked] = useState<string[]>([]);
  const [nImage, setNImage] = useState('');
  const [nNotiz, setNNotiz] = useState('');
  const [saving, setSaving] = useState(false);
  const newTmpId = useRef('tmp-' + Math.random().toString(36).slice(2, 10));

  // Inline-Bearbeitung
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eAuto, setEAuto] = useState(false);
  const [eQty, setEQty] = useState('1');
  const [eWarn, setEWarn] = useState('');
  const [eTrigger, setETrigger] = useState<'shipment' | 'return'>('shipment');
  const [eLinked, setELinked] = useState<string[]>([]);
  const [eImage, setEImage] = useState('');
  const [eNotiz, setENotiz] = useState('');

  const [setValById, setSetValById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  async function loadAccessories() {
    try {
      const res = await fetch('/api/admin/accessories');
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.accessories)) {
        const list: AccessoryLite[] = data.accessories
          .map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
          .sort((x: AccessoryLite, y: AccessoryLite) => x.name.localeCompare(y.name));
        setAccessories(list);
      }
    } catch {
      // Dropdown bleibt leer — nicht kritisch.
    }
  }

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void reload();
    void loadAccessories();
  }, []);

  // ESC schließt die Lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  function resetNew() {
    setNName('');
    setNBestand('0');
    setNAuto(false);
    setNQty('1');
    setNWarn('');
    setNTrigger('shipment');
    setNLinked([]);
    setNImage('');
    setNNotiz('');
    newTmpId.current = 'tmp-' + Math.random().toString(36).slice(2, 10);
  }

  function noteWarnings(w: unknown) {
    if (Array.isArray(w) && w.length > 0) setWarning(String(w[0]));
  }

  async function uploadImage(id: string, file: File): Promise<string | null> {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('id', id);
      fd.append('file', file);
      const res = await fetch('/api/admin/verbrauch-image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Upload fehlgeschlagen.');
        return null;
      }
      return data.url as string;
    } catch (e) {
      setError(`Upload-Fehler: ${(e as Error).message}`);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate() {
    if (!nName.trim()) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    setWarning(null);
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
          deduct_trigger: nTrigger,
          linked_accessory_ids: nLinked,
          image_url: nImage || null,
          notiz: nNotiz.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      noteWarnings(data.warnings);
      resetNew();
      setShowNew(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

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
      noteWarnings(data.warnings);
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
    setETrigger(a.deduct_trigger === 'return' ? 'return' : 'shipment');
    setELinked(linkedIdsOf(a));
    setEImage(a.image_url ?? '');
    setENotiz(a.notiz ?? '');
  }

  async function saveEdit(id: string) {
    if (!eName.trim()) {
      setError('Name darf nicht leer sein.');
      return;
    }
    setWarning(null);
    const ok = await patch(id, {
      name: eName.trim(),
      auto_deduct: eAuto,
      deduct_qty: parseInt(eQty, 10) || 1,
      warn_threshold: eWarn.trim() === '' ? null : parseInt(eWarn, 10) || 0,
      deduct_trigger: eTrigger,
      linked_accessory_ids: eLinked,
      image_url: eImage || null,
      notiz: eNotiz.trim() || null,
    });
    if (ok) setEditId(null);
  }

  async function handleDelete(a: Verbrauchsartikel) {
    if (!confirm(`„${a.name}“ wirklich löschen? Der Zähler geht dabei verloren.`)) return;
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

  function photoBlock(url: string, onPick: (f: File) => void, onClear: () => void) {
    return (
      <div className="flex items-center gap-3">
        {url ? (
          <button type="button" onClick={() => setLightbox(url)} title="Vergrößern">
            <Image src={url} alt="" width={64} height={64} unoptimized className="w-16 h-16 object-cover rounded border border-slate-700" />
          </button>
        ) : (
          <div className="w-16 h-16 rounded border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">Foto</div>
        )}
        <div className="flex flex-col gap-1">
          <label className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm cursor-pointer inline-block w-fit">
            {uploading ? 'Lädt…' : url ? 'Foto ändern' : '📷 Foto hochladen'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onPick(f);
              }}
            />
          </label>
          {url && <button onClick={onClear} className="text-xs text-rose-400 hover:text-rose-300 w-fit">Foto entfernen</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink />
      <div className="max-w-5xl mx-auto mt-4 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Verbrauch</h1>
            <p className="text-slate-400 text-sm mt-1">
              Interner Zähler für Verbrauchsmaterial (z.B. Gummibärchentüten,
              Füllmaterial, Klebepads). Optional automatischer Abzug bei Versand/
              Abholung oder bei Rückgabe — auch verknüpft mit Zubehör.
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

        {warning && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm flex items-start justify-between gap-3">
            <span>{warning}</span>
            <button onClick={() => setWarning(null)} className="text-amber-400 hover:text-amber-200">✕</button>
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
                <input className={inputCls} value={nName} onChange={(e) => setNName(e.target.value)} placeholder="z.B. Klebepad" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Anfangsbestand</span>
                <input className={inputCls} type="number" inputMode="numeric" min={0} value={nBestand} onChange={(e) => setNBestand(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Abzugsmenge pro Buchung / Stück</span>
                <input className={inputCls} type="number" inputMode="numeric" min={1} value={nQty} onChange={(e) => setNQty(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Warnung ab Bestand (leer = aus)</span>
                <input className={inputCls} type="number" inputMode="numeric" min={0} value={nWarn} onChange={(e) => setNWarn(e.target.value)} placeholder="z.B. 3" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-400">Abzug bei</span>
                <select className={inputCls} value={nTrigger} onChange={(e) => setNTrigger(e.target.value as 'shipment' | 'return')}>
                  <option value="shipment">Versand / Abholung</option>
                  <option value="return">Rückgabe</option>
                </select>
              </label>
              <div className="text-sm space-y-1">
                <span className="text-slate-400">Verknüpft mit Zubehör (optional, mehrere)</span>
                <AccessoryMultiSelect
                  accessories={accessories}
                  selected={nLinked}
                  onToggle={(id) => setNLinked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nAuto} onChange={(e) => setNAuto(e.target.checked)} className="w-4 h-4" />
              <span>Automatisch abziehen</span>
            </label>
            <label className="text-sm space-y-1 block">
              <span className="text-slate-400">Notiz (optional) — z.B. Nachbestell-Link / Lieferant</span>
              <textarea className={inputCls + ' min-h-[60px]'} value={nNotiz} onChange={(e) => setNNotiz(e.target.value)} placeholder="z.B. Nachbestellen bei https://…" />
            </label>
            {photoBlock(nImage, async (f) => { const u = await uploadImage(newTmpId.current, f); if (u) setNImage(u); }, () => setNImage(''))}
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
            const linkedNames = linkedIdsOf(a).map((id) => accById.get(id) || id);
            return (
              <div
                key={a.id}
                className={`p-4 bg-[#111827] border rounded ${low ? 'border-amber-500/50' : 'border-slate-800'}`}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Foto + Bestand + Name */}
                  <div className="flex items-center gap-4 min-w-0">
                    {a.image_url ? (
                      <button type="button" onClick={() => setLightbox(a.image_url!)} title="Vergrößern" className="flex-shrink-0">
                        <Image src={a.image_url} alt="" width={56} height={56} unoptimized className="w-14 h-14 object-cover rounded border border-slate-700" />
                      </button>
                    ) : null}
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
                            Auto-Abzug −{a.deduct_qty} {triggerLabel(a.deduct_trigger)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-700/40 border border-slate-600 text-slate-400">
                            Kein Auto-Abzug
                          </span>
                        )}
                        {linkedNames.map((n, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                            🔗 {n}
                          </span>
                        ))}
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

                {/* Notiz-Zeile */}
                {a.notiz && (
                  <div className="mt-2 text-xs text-slate-400 whitespace-pre-wrap break-words">
                    📝 {renderNote(a.notiz)}
                  </div>
                )}

                {editing && (
                  <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Name</span>
                      <input className={inputCls} value={eName} onChange={(e) => setEName(e.target.value)} />
                    </label>
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Abzugsmenge pro Buchung / Stück</span>
                      <input className={inputCls} type="number" inputMode="numeric" min={1} value={eQty} onChange={(e) => setEQty(e.target.value)} />
                    </label>
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Warnung ab Bestand (leer = aus)</span>
                      <input className={inputCls} type="number" inputMode="numeric" min={0} value={eWarn} onChange={(e) => setEWarn(e.target.value)} />
                    </label>
                    <label className="text-sm space-y-1">
                      <span className="text-slate-400">Abzug bei</span>
                      <select className={inputCls} value={eTrigger} onChange={(e) => setETrigger(e.target.value as 'shipment' | 'return')}>
                        <option value="shipment">Versand / Abholung</option>
                        <option value="return">Rückgabe</option>
                      </select>
                    </label>
                    <div className="text-sm space-y-1 sm:col-span-2">
                      <span className="text-slate-400">Verknüpft mit Zubehör (optional, mehrere)</span>
                      <AccessoryMultiSelect
                        accessories={accessories}
                        selected={eLinked}
                        onToggle={(id) => setELinked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={eAuto} onChange={(e) => setEAuto(e.target.checked)} className="w-4 h-4" />
                      <span>Automatisch abziehen</span>
                    </label>
                    <label className="text-sm space-y-1 sm:col-span-2">
                      <span className="text-slate-400">Notiz (optional) — z.B. Nachbestell-Link / Lieferant</span>
                      <textarea className={inputCls + ' min-h-[60px]'} value={eNotiz} onChange={(e) => setENotiz(e.target.value)} />
                    </label>
                    <div className="sm:col-span-2">
                      {photoBlock(eImage, async (f) => { const u = await uploadImage(a.id, f); if (u) setEImage(u); }, () => setEImage(''))}
                    </div>
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

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <Image src={lightbox} alt="" width={900} height={900} unoptimized className="max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain rounded" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none">✕</button>
        </div>
      )}
    </div>
  );
}
