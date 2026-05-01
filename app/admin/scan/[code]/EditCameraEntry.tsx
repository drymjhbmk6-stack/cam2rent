'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'available' | 'rented' | 'maintenance' | 'retired';

interface Props {
  unitId: string;
  initialStatus: Status;
  initialNotes: string;
  initialLabel: string;
}

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'available', label: 'Verfügbar' },
  { value: 'rented', label: 'Vermietet' },
  { value: 'maintenance', label: 'Wartung' },
  { value: 'retired', label: 'Ausgemustert' },
];

export default function EditCameraEntry({ unitId, initialStatus, initialNotes, initialLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [label, setLabel] = useState(initialLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelChanged = label.trim() !== initialLabel.trim();

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setStatus(initialStatus);
    setNotes(initialNotes);
    setLabel(initialLabel);
  }

  async function save() {
    setError(null);
    if (labelChanged && !label.trim()) {
      setError('Bezeichnung darf nicht leer sein.');
      return;
    }
    if (labelChanged) {
      const ok = confirm(
        'Achtung: Wenn du die Bezeichnung änderst, sind bereits gedruckte QR-Aufkleber für diese Kamera ungültig und müssen neu gedruckt werden. Trotzdem ändern?'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { id: unitId, status, notes };
      if (labelChanged) body.label = label.trim();
      const res = await fetch('/api/admin/product-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Fehler beim Speichern.');
        return;
      }
      setOpen(false);
      // Bei Label-Aenderung aendert sich auch die URL — auf neue navigieren.
      if (labelChanged) {
        router.push(`/admin/scan/${encodeURIComponent(label.trim())}`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Netzwerk-Fehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
      >
        Eintrag bearbeiten
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-16"
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: '#0f172a' }}>Eintrag bearbeiten</h3>
              <button
                onClick={close}
                disabled={busy}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none disabled:opacity-40"
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Seriennummer, Kaufdatum und Kaufpreis sind nach Anlage nicht mehr änderbar. Bezeichnung, Status und Notizen kannst du jederzeit ändern.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Bezeichnung</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  style={{ color: '#0f172a' }}
                />
                {labelChanged && label.trim() && (
                  <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                    ⚠ Achtung: Bestehende QR-Aufkleber werden ungültig, weil die QR-URL die Bezeichnung enthält. Du musst die QR-Codes für diese Kamera neu drucken.
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  style={{ color: '#0f172a' }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Notizen</label>
                <textarea
                  value={notes}
                  rows={4}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                  placeholder="Zustand, Bemerkungen…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y"
                  style={{ color: '#0f172a' }}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={close}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
              >
                Abbrechen
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors disabled:opacity-40"
              >
                {busy ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
