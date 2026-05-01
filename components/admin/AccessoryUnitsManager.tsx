'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AccessoryUnit {
  id: string;
  accessory_id: string;
  exemplar_code: string;
  serial_number: string | null;
  status: 'available' | 'rented' | 'maintenance' | 'damaged' | 'lost' | 'retired';
  notes: string | null;
  purchased_at: string | null; // ISO date YYYY-MM-DD
  retired_at: string | null;
  retirement_reason: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<
  AccessoryUnit['status'],
  { label: string; pill: string }
> = {
  available:   { label: 'Verfügbar',    pill: 'bg-emerald-100 text-emerald-700' },
  rented:      { label: 'Vermietet',    pill: 'bg-blue-100 text-blue-700' },
  maintenance: { label: 'Wartung',      pill: 'bg-amber-100 text-amber-700' },
  damaged:     { label: 'Beschädigt',   pill: 'bg-rose-100 text-rose-700' },
  lost:        { label: 'Verloren',     pill: 'bg-red-100 text-red-700' },
  retired:     { label: 'Ausgemustert', pill: 'bg-gray-200 text-gray-600' },
};

const STATUS_OPTIONS: AccessoryUnit['status'][] = [
  'available',
  'rented',
  'maintenance',
  'damaged',
  'lost',
  'retired',
];

interface AssetRow {
  id: string;
  accessory_unit_id: string | null;
  current_value: number;
  purchase_price: number;
  purchase_date: string;
}

interface Props {
  accessoryId: string;
  /** Wird aufgerufen, wenn sich die Anzahl Exemplare ändert — damit der Parent
   *  available_qty in seinem lokalen State synchronisieren kann. */
  onCountChanged?: (counts: { available: number; total: number }) => void;
}

export default function AccessoryUnitsManager({ accessoryId, onCountChanged }: Props) {
  const [units, setUnits] = useState<AccessoryUnit[]>([]);
  const [unitAssets, setUnitAssets] = useState<Record<string, AssetRow>>({});
  const [loading, setLoading] = useState(true);

  // Anlegen-Modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    exemplar_code: '',
    serial_number: '',
    purchased_at: '',
    purchase_price: '',
    notes: '',
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Bearbeiten-Modal (Status + Notizen + Bezeichnung aenderbar — letzteres mit
  // Warnung, weil sich dadurch die QR-URL aendert)
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<AccessoryUnit['status']>('available');
  const [editNotes, setEditNotes] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCodeOriginal, setEditCodeOriginal] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Callback per Ref — der Parent uebergibt typisch eine Inline-Funktion,
  // deren Identitaet sich bei jedem Re-Render aendert. Ohne Ref propagiert
  // diese Identitaetsaenderung durch reportCounts -> load -> useEffect und
  // loest eine Render-Loop aus ("Lade Exemplare..." flackert ewig).
  const onCountChangedRef = useRef(onCountChanged);
  useEffect(() => {
    onCountChangedRef.current = onCountChanged;
  }, [onCountChanged]);

  const reportCounts = useCallback((rows: AccessoryUnit[]) => {
    const cb = onCountChangedRef.current;
    if (!cb) return;
    const available = rows.filter((u) => u.status === 'available' || u.status === 'rented').length;
    cb({ available, total: rows.length });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [unitsRes, assetsRes] = await Promise.all([
        fetch(`/api/admin/accessory-units?accessory_id=${encodeURIComponent(accessoryId)}`),
        fetch('/api/admin/assets?kind=rental_accessory&include_test=1'),
      ]);

      const unitsJson = await unitsRes.json();
      if (!unitsRes.ok) throw new Error(unitsJson.error || 'Fehler beim Laden');
      const rows = (unitsJson.units ?? []) as AccessoryUnit[];
      setUnits(rows);
      reportCounts(rows);

      if (assetsRes.ok) {
        const assetsJson = await assetsRes.json();
        const map: Record<string, AssetRow> = {};
        for (const a of (assetsJson.assets ?? []) as Array<Record<string, unknown>>) {
          if (a.accessory_unit_id) {
            map[a.accessory_unit_id as string] = {
              id: a.id as string,
              accessory_unit_id: a.accessory_unit_id as string,
              current_value: Number(a.current_value),
              purchase_price: Number(a.purchase_price),
              purchase_date: a.purchase_date as string,
            };
          }
        }
        setUnitAssets(map);
      }
    } catch (err) {
      console.error('[AccessoryUnitsManager] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [accessoryId, reportCounts]);

  useEffect(() => {
    load();
  }, [load]);

  function openAddModal() {
    setAddForm({ exemplar_code: '', serial_number: '', purchased_at: '', purchase_price: '', notes: '' });
    setAddError(null);
    setAddOpen(true);
  }

  async function handleAdd() {
    setAddError(null);
    const code = addForm.exemplar_code.trim();
    const purchaseDate = addForm.purchased_at;
    const priceNum = Number(String(addForm.purchase_price).replace(',', '.'));

    if (!code) { setAddError('Bezeichnung ist Pflicht.'); return; }
    if (!purchaseDate) { setAddError('Kaufdatum ist Pflicht.'); return; }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setAddError('Kaufpreis muss eine positive Zahl sein.');
      return;
    }

    setAddBusy(true);
    try {
      const res = await fetch('/api/admin/accessory-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessory_id: accessoryId,
          exemplar_code: code,
          serial_number: addForm.serial_number.trim() || undefined,
          purchased_at: purchaseDate,
          purchase_price: priceNum,
          notes: addForm.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || 'Fehler beim Anlegen.');
        return;
      }
      setAddOpen(false);
      await load();
    } catch {
      setAddError('Netzwerk-Fehler. Bitte erneut versuchen.');
    } finally {
      setAddBusy(false);
    }
  }

  function openEditModal(unit: AccessoryUnit) {
    setEditId(unit.id);
    setEditStatus(unit.status);
    setEditNotes(unit.notes ?? '');
    setEditCode(unit.exemplar_code);
    setEditCodeOriginal(unit.exemplar_code);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setEditError(null);

    const codeChanged = editCode.trim() !== editCodeOriginal.trim();
    if (codeChanged && !editCode.trim()) {
      setEditError('Bezeichnung darf nicht leer sein.');
      return;
    }
    if (codeChanged) {
      const ok = confirm(
        'Achtung: Wenn du die Bezeichnung änderst, sind bereits gedruckte QR-Aufkleber für dieses Exemplar ungültig und müssen neu gedruckt werden. Trotzdem ändern?'
      );
      if (!ok) return;
    }

    setEditBusy(true);
    try {
      const body: Record<string, unknown> = { id: editId, status: editStatus, notes: editNotes };
      if (codeChanged) body.exemplar_code = editCode.trim();
      const res = await fetch('/api/admin/accessory-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.error || 'Fehler beim Speichern.');
        return;
      }
      setEditId(null);
      await load();
    } catch {
      setEditError('Netzwerk-Fehler.');
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(unit: AccessoryUnit) {
    if (!confirm(`Exemplar "${unit.exemplar_code}" endgültig löschen?`)) return;
    try {
      const res = await fetch(`/api/admin/accessory-units?id=${encodeURIComponent(unit.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fehler beim Löschen.');
        return;
      }
      await load();
    } catch {
      alert('Fehler beim Löschen.');
    }
  }

  const activeCount = units.filter((u) => u.status !== 'retired' && u.status !== 'lost').length;

  return (
    <div className="bg-brand-bg dark:bg-slate-900/40 rounded-xl border border-brand-border dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-heading font-bold text-sm text-brand-black dark:text-slate-200">
          Exemplare ({units.length})
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-body text-brand-muted">
            {activeCount} aktiv
            {units.length - activeCount > 0 && `, ${units.length - activeCount} ausgemustert/verloren`}
          </span>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-accent-blue text-white rounded hover:bg-blue-600 transition-colors"
          >
            + Exemplar anlegen
          </button>
          {activeCount > 0 && (
            <a
              href={`/admin/zubehoer/${accessoryId}/qr-codes`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
              title="QR-Code-Etiketten zum Aufkleben drucken"
            >
              QR-Codes drucken
            </a>
          )}
        </div>
      </div>
      <p className="text-xs font-body text-brand-muted mb-3">
        Jedes physische Exemplar einzeln erfassen. Die verfügbare Menge wird automatisch berechnet.
      </p>

      {loading ? (
        <p className="text-sm text-brand-muted py-4 text-center">Lade Exemplare…</p>
      ) : units.length === 0 ? (
        <p className="text-sm text-brand-muted py-4 text-center italic">
          Noch kein Exemplar angelegt. Klick auf <span className="font-semibold">&bdquo;+ Exemplar anlegen&ldquo;</span> oben rechts.
        </p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-800/60 rounded-lg border border-brand-border dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border dark:border-slate-700">
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Bezeichnung</th>
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Seriennummer</th>
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Status</th>
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Kaufdatum</th>
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Anlage (Zeitwert)</th>
                <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Notizen</th>
                <th className="text-right text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => {
                const asset = unitAssets[unit.id];
                return (
                  <tr key={unit.id} className="border-b border-brand-border/50 dark:border-slate-700/50 hover:bg-brand-bg/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-2 font-mono text-xs font-semibold text-brand-black dark:text-slate-200">{unit.exemplar_code}</td>
                    <td className="py-2 px-2 text-xs text-brand-muted">{unit.serial_number || '–'}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CONFIG[unit.status]?.pill ?? ''}`}>
                        {STATUS_CONFIG[unit.status]?.label ?? unit.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs text-brand-muted">
                      {unit.purchased_at ? new Date(unit.purchased_at).toLocaleDateString('de-DE') : '–'}
                    </td>
                    <td className="py-2 px-2 text-xs">
                      {asset ? (
                        <a href={`/admin/anlagen/${asset.id}`} className="text-accent-blue hover:underline font-semibold">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(asset.current_value)}
                        </a>
                      ) : (
                        <span className="text-brand-muted italic">–</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-brand-muted max-w-[150px] truncate" title={unit.notes ?? ''}>{unit.notes || '–'}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <button onClick={() => openEditModal(unit)}
                        className="text-xs text-accent-blue hover:text-blue-700 font-semibold mr-3">Bearbeiten</button>
                      <button onClick={() => handleDelete(unit)}
                        className="text-xs text-red-500 hover:text-red-700 font-semibold">Löschen</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Neues Exemplar anlegen */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-16"
          onClick={() => { if (!addBusy) setAddOpen(false); }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-brand-border dark:border-slate-700 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 border-b border-brand-border dark:border-slate-700 flex items-center justify-between">
              <h4 className="font-heading font-bold text-base text-brand-black dark:text-slate-200">Neues Exemplar anlegen</h4>
              <button onClick={() => setAddOpen(false)} disabled={addBusy}
                className="text-brand-muted hover:text-brand-black text-2xl leading-none disabled:opacity-40">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bezeichnung <span className="text-red-500">*</span></label>
                <input type="text" value={addForm.exemplar_code}
                  onChange={(e) => setAddForm((f) => ({ ...f, exemplar_code: e.target.value }))}
                  placeholder="z.B. AKKU-DJI-OA5-01"
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                <p className="text-[10px] text-brand-muted mt-1">Eindeutige Kennung. Wird im QR-Code-Link verwendet und kann später nicht mehr geändert werden.</p>
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Seriennummer (optional)</label>
                <input type="text" value={addForm.serial_number}
                  onChange={(e) => setAddForm((f) => ({ ...f, serial_number: e.target.value }))}
                  placeholder="Hersteller-S/N — z.B. bei Akkus, Speicherkarten"
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kaufdatum <span className="text-red-500">*</span></label>
                  <input type="date" value={addForm.purchased_at}
                    onChange={(e) => setAddForm((f) => ({ ...f, purchased_at: e.target.value }))}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kaufpreis <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="text" inputMode="decimal" value={addForm.purchase_price}
                      onChange={(e) => setAddForm((f) => ({ ...f, purchase_price: e.target.value }))}
                      placeholder="z.B. 49,90"
                      className="w-full pr-8 pl-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted pointer-events-none">€</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Notizen (optional)</label>
                <textarea value={addForm.notes} rows={2}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Zustand, Bemerkungen…"
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y" />
              </div>

              <div className="rounded-lg bg-brand-bg dark:bg-slate-800 border border-brand-border/60 dark:border-slate-700/60 p-3 text-[11px] font-body text-brand-muted">
                <p className="font-semibold text-brand-black dark:text-slate-200 mb-1">Automatisch erfasst:</p>
                <ul className="space-y-0.5">
                  <li>• <span className="text-brand-black dark:text-slate-300">Wiederbeschaffungswert</span> = aktueller AfA-Zeitwert (Start = Kaufpreis)</li>
                  <li>• <span className="text-brand-black dark:text-slate-300">Nutzungsdauer</span> = 36 Monate (Standard, linear)</li>
                  <li>• <span className="text-brand-black dark:text-slate-300">Anlagen-Status</span> = aktiv</li>
                </ul>
              </div>

              {addError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-body text-red-700">
                  {addError}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-brand-border dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setAddOpen(false)} disabled={addBusy}
                className="px-4 py-2 text-xs font-heading font-semibold text-brand-muted hover:text-brand-black transition-colors disabled:opacity-40">Abbrechen</button>
              <button onClick={handleAdd} disabled={addBusy}
                className="px-4 py-2 text-xs font-heading font-semibold bg-accent-blue text-white rounded-btn hover:bg-blue-600 transition-colors disabled:opacity-40">
                {addBusy ? 'Wird angelegt…' : 'Exemplar anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eintrag bearbeiten (Status + Notizen) */}
      {editId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-16"
          onClick={() => { if (!editBusy) setEditId(null); }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-brand-border dark:border-slate-700 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 border-b border-brand-border dark:border-slate-700 flex items-center justify-between">
              <h4 className="font-heading font-bold text-base text-brand-black dark:text-slate-200">Eintrag bearbeiten</h4>
              <button onClick={() => setEditId(null)} disabled={editBusy}
                className="text-brand-muted hover:text-brand-black text-2xl leading-none disabled:opacity-40">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-brand-muted">Seriennummer, Kaufdatum und Kaufpreis sind nach Anlage nicht mehr änderbar. Bezeichnung, Status und Notizen kannst du jederzeit ändern.</p>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bezeichnung</label>
                <input type="text" value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                {editCode.trim() !== editCodeOriginal.trim() && editCode.trim() && (
                  <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-body text-amber-800">
                    ⚠ Achtung: Bestehende QR-Aufkleber werden ungültig, weil die QR-URL die Bezeichnung enthält. Du musst die QR-Codes für dieses Exemplar neu drucken.
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Status</label>
                <select value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AccessoryUnit['status'])}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Notizen</label>
                <textarea value={editNotes} rows={4}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Zustand, Bemerkungen…"
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white dark:bg-slate-800 text-brand-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y" />
              </div>
              {editError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-body text-red-700">
                  {editError}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-brand-border dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setEditId(null)} disabled={editBusy}
                className="px-4 py-2 text-xs font-heading font-semibold text-brand-muted hover:text-brand-black transition-colors disabled:opacity-40">Abbrechen</button>
              <button onClick={handleSaveEdit} disabled={editBusy}
                className="px-4 py-2 text-xs font-heading font-semibold bg-accent-blue text-white rounded-btn hover:bg-blue-600 transition-colors disabled:opacity-40">
                {editBusy ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
