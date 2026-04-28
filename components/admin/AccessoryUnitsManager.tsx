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

interface Props {
  accessoryId: string;
  /** Wird aufgerufen, wenn sich die Anzahl Exemplare ändert — damit der Parent
   *  available_qty in seinem lokalen State synchronisieren kann. */
  onCountChanged?: (counts: { available: number; total: number }) => void;
}

export default function AccessoryUnitsManager({ accessoryId, onCountChanged }: Props) {
  const [units, setUnits] = useState<AccessoryUnit[]>([]);
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
      const res = await fetch(`/api/admin/accessory-units?accessory_id=${encodeURIComponent(accessoryId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Laden');
      const rows = (json.units ?? []) as AccessoryUnit[];
      setUnits(rows);
      reportCounts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [accessoryId, reportCounts]);

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
        <span className="text-xs font-body text-brand-muted">
          {activeCount} aktiv
          {units.length - activeCount > 0 && `, ${units.length - activeCount} ausgemustert/verloren`}
        </span>
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
        </>
      )}
    </div>
  );
}
