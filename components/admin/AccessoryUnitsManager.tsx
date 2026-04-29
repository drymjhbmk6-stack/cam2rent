'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AccessoryUnit {
  id: string;
  accessory_id: string;
  exemplar_code: string;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AccessoryUnit>>({});
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<AccessoryUnit>>({
    exemplar_code: '',
    purchased_at: '',
    status: 'available',
    notes: '',
  });
  const [enrollingUnit, setEnrollingUnit] = useState<AccessoryUnit | null>(null);
  const [enrollDraft, setEnrollDraft] = useState<{
    purchase_price: string;
    purchase_date: string;
    useful_life_months: string;
  }>({ purchase_price: '', purchase_date: '', useful_life_months: '36' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportCounts = useCallback(
    (rows: AccessoryUnit[]) => {
      if (!onCountChanged) return;
      const available = rows.filter((u) => u.status === 'available' || u.status === 'rented').length;
      onCountChanged({ available, total: rows.length });
    },
    [onCountChanged]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Units + Assets parallel laden — Assets ueber kind=rental_accessory,
      // dann clientseitig nach accessory_unit_id filtern.
      const [unitsRes, assetsRes] = await Promise.all([
        fetch(`/api/admin/accessory-units?accessory_id=${encodeURIComponent(accessoryId)}`),
        fetch('/api/admin/assets?kind=rental_accessory&include_test=1'),
      ]);

      const unitsJson = await unitsRes.json();
      if (!unitsRes.ok) throw new Error(unitsJson.error || 'Fehler beim Laden');
      const rows = (unitsJson.units ?? []) as AccessoryUnit[];
      setUnits(rows);
      reportCounts(rows);

      // Assets-Mapping aufbauen — defensiv, falls Migration noch nicht durch
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
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [accessoryId, reportCounts]);

  function startEnroll(unit: AccessoryUnit) {
    setEnrollingUnit(unit);
    setEnrollDraft({
      purchase_price: '',
      purchase_date: unit.purchased_at ?? new Date().toISOString().slice(0, 10),
      useful_life_months: '36',
    });
    setError(null);
  }

  async function handleEnrollSave() {
    if (!enrollingUnit) return;
    const price = parseFloat(enrollDraft.purchase_price.replace(',', '.'));
    if (!isFinite(price) || price <= 0) {
      setError('Bitte einen gültigen Kaufpreis angeben.');
      return;
    }
    if (!enrollDraft.purchase_date) {
      setError('Kaufdatum ist Pflicht.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rental_accessory',
          name: enrollingUnit.exemplar_code,
          accessory_unit_id: enrollingUnit.id,
          purchase_price: price,
          purchase_date: enrollDraft.purchase_date,
          useful_life_months: parseInt(enrollDraft.useful_life_months, 10) || 36,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Anlegen der Anlage');
      setEnrollingUnit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen der Anlage');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accessory-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessory_id: accessoryId,
          exemplar_code: newDraft.exemplar_code?.trim() || undefined,
          purchased_at: newDraft.purchased_at || undefined,
          status: newDraft.status || 'available',
          notes: newDraft.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Anlegen');
      setNewDraft({ exemplar_code: '', purchased_at: '', status: 'available', notes: '' });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accessory-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          exemplar_code: editDraft.exemplar_code,
          purchased_at: editDraft.purchased_at ?? null,
          status: editDraft.status,
          notes: editDraft.notes ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Speichern');
      setEditingId(null);
      setEditDraft({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(unit: AccessoryUnit) {
    if (!confirm(`Exemplar "${unit.exemplar_code}" endgültig löschen?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/accessory-units?id=${encodeURIComponent(unit.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Löschen');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    } finally {
      setBusy(false);
    }
  }

  const activeCount = units.filter((u) => u.status !== 'retired' && u.status !== 'lost').length;

  return (
    <div className="bg-brand-bg dark:bg-slate-900/40 rounded-xl border border-brand-border dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-heading font-bold text-sm text-brand-black dark:text-slate-200">
          Exemplare ({units.length})
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs font-body text-brand-muted">
            {activeCount} aktiv
            {units.length - activeCount > 0 && `, ${units.length - activeCount} ausgemustert/verloren`}
          </span>
          {activeCount > 0 && (
            <a
              href={`/admin/zubehoer/${accessoryId}/qr-codes`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-heading font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
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

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-xs font-body text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-brand-muted py-4 text-center">Lade Exemplare…</p>
      ) : (
        <>
          {units.length > 0 && (
            <div className="overflow-x-auto mb-3 bg-white dark:bg-slate-800/60 rounded-lg border border-brand-border dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border dark:border-slate-700">
                    <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Exemplar-Code</th>
                    <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Status</th>
                    <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Kaufdatum</th>
                    <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Anlage (Zeitwert)</th>
                    <th className="text-left text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Notizen</th>
                    <th className="text-right text-[10px] font-heading font-semibold text-brand-muted py-2 px-2">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => {
                    const isEditing = editingId === unit.id;
                    return (
                      <tr key={unit.id} className="border-b border-brand-border/40 dark:border-slate-700/60 last:border-b-0">
                        {isEditing ? (
                          <>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={editDraft.exemplar_code ?? unit.exemplar_code}
                                onChange={(e) => setEditDraft((d) => ({ ...d, exemplar_code: e.target.value }))}
                                className="w-full px-2 py-1 border border-brand-border rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <select
                                value={editDraft.status ?? unit.status}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, status: e.target.value as AccessoryUnit['status'] }))
                                }
                                className="px-2 py-1 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_CONFIG[s].label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="date"
                                value={editDraft.purchased_at ?? unit.purchased_at ?? ''}
                                onChange={(e) => setEditDraft((d) => ({ ...d, purchased_at: e.target.value }))}
                                className="px-2 py-1 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                              />
                            </td>
                            <td className="py-2 px-2 text-xs text-brand-muted italic">
                              {unitAssets[unit.id]
                                ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(unitAssets[unit.id].current_value)
                                : '–'}
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={editDraft.notes ?? unit.notes ?? ''}
                                onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                                className="w-full px-2 py-1 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                              />
                            </td>
                            <td className="py-2 px-2 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleSaveEdit(unit.id)}
                                disabled={busy}
                                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold mr-2 disabled:opacity-40"
                              >
                                Speichern
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft({});
                                }}
                                className="text-xs text-brand-muted hover:text-brand-black"
                              >
                                Abbrechen
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-2 font-mono text-xs font-semibold text-brand-black dark:text-slate-200">
                              {unit.exemplar_code}
                            </td>
                            <td className="py-2 px-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CONFIG[unit.status].pill}`}>
                                {STATUS_CONFIG[unit.status].label}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-xs text-brand-muted">
                              {unit.purchased_at ? new Date(unit.purchased_at).toLocaleDateString('de-DE') : '–'}
                            </td>
                            <td className="py-2 px-2 text-xs">
                              {unitAssets[unit.id] ? (
                                <a
                                  href={`/admin/anlagen/${unitAssets[unit.id].id}`}
                                  className="text-accent-blue hover:underline font-semibold"
                                >
                                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(unitAssets[unit.id].current_value)}
                                </a>
                              ) : (
                                <button
                                  onClick={() => startEnroll(unit)}
                                  className="text-brand-muted hover:text-accent-blue underline-offset-2 hover:underline italic"
                                >
                                  + erfassen
                                </button>
                              )}
                            </td>
                            <td className="py-2 px-2 text-xs text-brand-muted max-w-[180px] truncate" title={unit.notes ?? ''}>
                              {unit.notes || '–'}
                            </td>
                            <td className="py-2 px-2 text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setEditingId(unit.id);
                                  setEditDraft({});
                                }}
                                className="text-xs text-accent-blue hover:text-blue-700 font-semibold mr-2"
                              >
                                Bearbeiten
                              </button>
                              <button
                                onClick={() => handleDelete(unit)}
                                disabled={busy}
                                className="text-xs text-red-500 hover:text-red-700 font-semibold disabled:opacity-40"
                              >
                                Löschen
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* + Hinzufuegen */}
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="w-full px-3 py-2 text-xs font-heading font-semibold text-accent-blue border border-dashed border-brand-border dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800/40 transition-colors"
            >
              + Exemplar hinzufügen
            </button>
          ) : (
            <div className="bg-white dark:bg-slate-800/60 rounded-lg border border-brand-border dark:border-slate-700 p-3">
              <p className="text-xs font-heading font-semibold text-brand-black dark:text-slate-200 mb-3">+ Neues Exemplar</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Code</label>
                  <input
                    type="text"
                    value={newDraft.exemplar_code ?? ''}
                    onChange={(e) => setNewDraft((u) => ({ ...u, exemplar_code: e.target.value }))}
                    placeholder={`auto: ${accessoryId}-XXX`}
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Kaufdatum</label>
                  <input
                    type="date"
                    value={newDraft.purchased_at ?? ''}
                    onChange={(e) => setNewDraft((u) => ({ ...u, purchased_at: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Status</label>
                  <select
                    value={newDraft.status ?? 'available'}
                    onChange={(e) => setNewDraft((u) => ({ ...u, status: e.target.value as AccessoryUnit['status'] }))}
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_CONFIG[s].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Notizen</label>
                  <input
                    type="text"
                    value={newDraft.notes ?? ''}
                    onChange={(e) => setNewDraft((u) => ({ ...u, notes: e.target.value }))}
                    placeholder="optional"
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setAdding(false);
                    setNewDraft({ exemplar_code: '', purchased_at: '', status: 'available', notes: '' });
                  }}
                  className="px-3 py-1.5 text-xs font-heading font-semibold text-brand-muted hover:text-brand-black"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAdd}
                  disabled={busy}
                  className="px-4 py-1.5 text-xs font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40"
                >
                  {busy ? 'Anlegen…' : 'Anlegen'}
                </button>
              </div>
            </div>
          )}

          {/* Anlage erfassen — Inline-Form, oeffnet sich wenn ein Exemplar
              "+ erfassen" geklickt hat. Legt eine assets-Row mit
              kind=rental_accessory + accessory_unit_id an. */}
          {enrollingUnit && (
            <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-900 p-3">
              <p className="text-xs font-heading font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
                Anlage erfassen — <span className="font-mono">{enrollingUnit.exemplar_code}</span>
              </p>
              <p className="text-[10px] font-body text-emerald-800/80 dark:text-emerald-300/80 mb-3">
                Wird im Anlagenverzeichnis als Asset (rental_accessory) angelegt. Der monatliche AfA-Cron schreibt den Zeitwert fort —
                er erscheint automatisch im Mietvertrag und im Schadensfall als Wiederbeschaffungswert.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Kaufpreis (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={enrollDraft.purchase_price}
                    onChange={(e) => setEnrollDraft((d) => ({ ...d, purchase_price: e.target.value }))}
                    placeholder="z.B. 39,99"
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Kaufdatum</label>
                  <input
                    type="date"
                    value={enrollDraft.purchase_date}
                    onChange={(e) => setEnrollDraft((d) => ({ ...d, purchase_date: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Nutzungsdauer (Mon.)</label>
                  <input
                    type="number"
                    min="1"
                    value={enrollDraft.useful_life_months}
                    onChange={(e) => setEnrollDraft((d) => ({ ...d, useful_life_months: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEnrollingUnit(null)}
                  className="px-3 py-1.5 text-xs font-heading font-semibold text-brand-muted hover:text-brand-black"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleEnrollSave}
                  disabled={busy}
                  className="px-4 py-1.5 text-xs font-heading font-semibold rounded-btn bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Anlegen…' : 'Anlage anlegen'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
