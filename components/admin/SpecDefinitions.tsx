'use client';

import { useEffect, useState } from 'react';
import { SPEC_ICON_OPTIONS } from '@/components/SpecIcon';

export interface SpecDefinition {
  id: string;
  name: string;
  icon: string;
  unit: string;
}

const DEFAULT_SPECS: SpecDefinition[] = [
  { id: 'resolution', name: 'Auflösung', icon: 'resolution', unit: '' },
  { id: 'fps', name: 'FPS', icon: 'fps', unit: 'fps' },
  { id: 'water', name: 'Wasserdicht', icon: 'water', unit: 'm' },
  { id: 'battery', name: 'Akku', icon: 'battery', unit: 'mAh' },
  { id: 'weight', name: 'Gewicht', icon: 'weight', unit: 'g' },
  { id: 'storage', name: 'Speicher', icon: 'storage', unit: '' },
];

export function useSpecDefinitions() {
  const [specs, setSpecs] = useState<SpecDefinition[]>(DEFAULT_SPECS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/settings?key=spec_definitions')
      .then((r) => r.json())
      .then((data) => {
        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          setSpecs(data.value);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(updated: SpecDefinition[]) {
    setSpecs(updated);
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'spec_definitions', value: updated }),
    }).catch(() => {});
  }

  return { specs, loading, save };
}

export function SpecDefinitionsManager() {
  const { specs, loading, save } = useSpecDefinitions();
  const [items, setItems] = useState<SpecDefinition[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newSpec, setNewSpec] = useState({ name: '', icon: 'custom', unit: '' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setItems(specs);
  }, [specs, loading]);

  async function handleSave() {
    setSaving(true);
    await save(items);
    setDirty(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleAdd() {
    if (!newSpec.name.trim()) return;
    const id = newSpec.name.toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const updated = [...items, { ...newSpec, id, name: newSpec.name.trim(), unit: newSpec.unit.trim() }];
    setItems(updated);
    setDirty(true);
    setNewSpec({ name: '', icon: 'custom', unit: '' });
    setShowNew(false);
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }

  function handleUpdate(id: string, patch: Partial<SpecDefinition>) {
    setItems((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    setDirty(true);
  }

  if (loading) return <div className="text-sm text-brand-muted py-4">Lädt...</div>;

  return (
    <div>
      <div className="space-y-2">
        {items.map((spec) => (
          <div key={spec.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-brand-border bg-brand-bg">
            <select
              value={spec.icon}
              onChange={(e) => handleUpdate(spec.id, { icon: e.target.value })}
              className="w-28 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              {SPEC_ICON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={spec.name}
              onChange={(e) => handleUpdate(spec.id, { name: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
              placeholder="Name"
            />
            <input
              type="text"
              value={spec.unit}
              onChange={(e) => handleUpdate(spec.id, { unit: e.target.value })}
              className="w-20 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
              placeholder="Einheit"
            />
            <button
              type="button"
              onClick={() => handleDelete(spec.id)}
              className="px-2 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-[8px] transition-colors"
              title="Löschen"
            >
              &#10005;
            </button>
          </div>
        ))}
      </div>

      {showNew ? (
        <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl border-2 border-accent-blue/30 bg-accent-blue-soft/10">
          <select
            value={newSpec.icon}
            onChange={(e) => setNewSpec((s) => ({ ...s, icon: e.target.value }))}
            className="w-28 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
          >
            {SPEC_ICON_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={newSpec.name}
            onChange={(e) => setNewSpec((s) => ({ ...s, name: e.target.value }))}
            placeholder="Name (z.B. Sensor)"
            className="flex-1 min-w-0 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowNew(false); }}
          />
          <input
            type="text"
            value={newSpec.unit}
            onChange={(e) => setNewSpec((s) => ({ ...s, unit: e.target.value }))}
            placeholder="Einheit"
            className="w-20 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 bg-accent-blue text-white text-xs font-heading font-semibold rounded-[8px] hover:bg-accent-blue/80 transition-colors"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setShowNew(false)}
            className="px-2 py-1.5 text-xs text-brand-muted hover:text-brand-black transition-colors"
          >
            &#10005;
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="mt-3 px-4 py-2 text-xs font-heading font-semibold text-accent-blue border border-accent-blue/30 rounded-btn hover:bg-accent-blue-soft/20 transition-colors"
        >
          + Neue Spec-Definition
        </button>
      )}

      {/* Speichern Button */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors disabled:opacity-40"
        >
          {saving ? 'Speichert...' : 'Speichern'}
        </button>
        {saved && <span className="text-xs text-emerald-500 font-semibold">Gespeichert!</span>}
        {dirty && !saved && <span className="text-xs text-amber-500">Ungespeicherte Änderungen</span>}
      </div>
    </div>
  );
}
