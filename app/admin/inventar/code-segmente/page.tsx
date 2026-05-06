'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Segment {
  id: string;
  typ: 'kategorie' | 'hersteller';
  code: string;
  label: string;
  sort_order: number;
}

export default function CodeSegmentePage() {
  const [segmente, setSegmente] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Anlege-Form pro Typ
  const [newKat, setNewKat] = useState({ code: '', label: '' });
  const [newHer, setNewHer] = useState({ code: '', label: '' });

  // Inline-Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: '', label: '' });

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/inventar/code-segmente');
      const data = await res.json();
      setSegmente(data.segmente ?? []);
    } catch {
      setSegmente([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleAdd(typ: 'kategorie' | 'hersteller') {
    setError(null);
    const form = typ === 'kategorie' ? newKat : newHer;
    if (!form.code.trim() || !form.label.trim()) {
      setError('Code und Label sind Pflicht.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inventar/code-segmente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ, code: form.code.trim().toUpperCase(), label: form.label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler');
        return;
      }
      if (typ === 'kategorie') setNewKat({ code: '', label: '' });
      else setNewHer({ code: '', label: '' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: Segment) {
    setEditId(s.id);
    setEditForm({ code: s.code, label: s.label });
    setError(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventar/code-segmente?id=${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editForm.code.trim().toUpperCase(), label: editForm.label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler');
        return;
      }
      setEditId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(s: Segment) {
    if (!confirm(`Segment "${s.code}" (${s.label}) wirklich loeschen?\n\nAchtung: existierende Inventar-Codes bleiben erhalten — der Admin verliert nur den Vorschlag im Dropdown.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inventar/code-segmente?id=${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Fehler beim Loeschen');
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const kategorien = segmente.filter((s) => s.typ === 'kategorie');
  const hersteller = segmente.filter((s) => s.typ === 'hersteller');

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/inventar" />
      <div className="max-w-4xl mx-auto mt-4 space-y-6">
        <div>
          <h1 className="text-2xl font-heading">Inventar-Code-Segmente</h1>
          <p className="text-sm text-slate-400 mt-1">
            Stammdaten für den strukturierten Inventar-Code-Builder. Format:
            <span className="font-mono mx-1">[Kategorie]-[Hersteller]-[Name]-[NN]</span>
            (z.B. <span className="font-mono">STO-SAN-128-01</span>).
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Lädt…</p>
        ) : (
          <>
            <SegmentSection
              title="Kategorien"
              hint='Erstes Code-Segment — was ist das? CAM=Kamera, STO=Speichermedien, AKK=Akku, etc.'
              segmente={kategorien}
              newForm={newKat}
              setNewForm={setNewKat}
              onAdd={() => handleAdd('kategorie')}
              editId={editId}
              editForm={editForm}
              setEditForm={setEditForm}
              startEdit={startEdit}
              cancelEdit={() => setEditId(null)}
              saveEdit={saveEdit}
              onDelete={handleDelete}
              busy={busy}
            />

            <SegmentSection
              title="Hersteller"
              hint="Zweites Code-Segment — von wem? GPR=GoPro, DJI=DJI, INS=Insta360, etc."
              segmente={hersteller}
              newForm={newHer}
              setNewForm={setNewHer}
              onAdd={() => handleAdd('hersteller')}
              editId={editId}
              editForm={editForm}
              setEditForm={setEditForm}
              startEdit={startEdit}
              cancelEdit={() => setEditId(null)}
              saveEdit={saveEdit}
              onDelete={handleDelete}
              busy={busy}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  hint: string;
  segmente: Segment[];
  newForm: { code: string; label: string };
  setNewForm: (v: { code: string; label: string }) => void;
  onAdd: () => void;
  editId: string | null;
  editForm: { code: string; label: string };
  setEditForm: (v: { code: string; label: string }) => void;
  startEdit: (s: Segment) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  onDelete: (s: Segment) => void;
  busy: boolean;
}

function SegmentSection(props: SectionProps) {
  const { title, hint, segmente, newForm, setNewForm, onAdd, editId, editForm, setEditForm, startEdit, cancelEdit, saveEdit, onDelete, busy } = props;
  return (
    <section className="bg-[#111827] border border-slate-800 rounded p-4">
      <div className="mb-3">
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="text-xs text-slate-400 mt-1">{hint}</p>
      </div>

      {/* Anlege-Zeile */}
      <div className="flex gap-2 mb-4 items-end">
        <div className="w-24">
          <label className="block text-xs text-slate-400 mb-1">Code</label>
          <input
            value={newForm.code}
            onChange={(e) => setNewForm({ ...newForm, code: e.target.value.toUpperCase() })}
            placeholder="z.B. STO"
            maxLength={5}
            className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1.5 text-sm font-mono"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">Label</label>
          <input
            value={newForm.label}
            onChange={(e) => setNewForm({ ...newForm, label: e.target.value })}
            placeholder="z.B. Speichermedien"
            className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={busy || !newForm.code.trim() || !newForm.label.trim()}
          className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 rounded text-sm font-semibold"
        >
          + Hinzufuegen
        </button>
      </div>

      {/* Liste */}
      {segmente.length === 0 ? (
        <p className="text-sm text-slate-500 italic">Noch nichts angelegt.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="py-2 px-2">Code</th>
              <th className="py-2 px-2">Label</th>
              <th className="py-2 px-2 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {segmente.map((s) => (
              <tr key={s.id} className="border-b border-slate-800/60">
                {editId === s.id ? (
                  <>
                    <td className="py-1.5 px-2">
                      <input
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                        maxLength={5}
                        className="w-24 bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm font-mono"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        value={editForm.label}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <button onClick={saveEdit} disabled={busy} className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold mr-3">
                        Speichern
                      </button>
                      <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-300 text-xs">
                        Abbrechen
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 px-2 font-mono">{s.code}</td>
                    <td className="py-2 px-2">{s.label}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(s)} className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold mr-3">
                        Bearbeiten
                      </button>
                      <button onClick={() => onDelete(s)} disabled={busy} className="text-rose-400 hover:text-rose-300 text-xs">
                        Löschen
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
