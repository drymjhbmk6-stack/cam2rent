'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Quick-Edit-Modal fuer Sammel-Zubehoer (accessories.is_bulk=true) —
 * direkt von der Scan-Detail-Karte aus. Vollausstattung (Preis, Kompat,
 * Kategorien etc.) bleibt im /admin/zubehoer-Editor; hier sind nur die
 * Felder, die man typischerweise scannend ändert: Name, Bezeichnung
 * (= URL-id), verfuegbare Menge, verfuegbar-Toggle, Beschreibung.
 *
 * Die anderen Felder (pricing_mode, price, etc.) werden vom Server-
 * Render durchgereicht und beim PUT unveraendert mitgesendet, damit die
 * existierende API ohne Partial-Update-Pfad arbeiten kann.
 */

export interface BulkAccessoryFullData {
  id: string;
  name: string;
  category: string;
  description: string | null;
  pricing_mode: string;
  price: number;
  available_qty: number;
  available: boolean;
  image_url: string | null;
  compatible_product_ids: string[];
  internal: boolean;
  upgrade_group: string | null;
  is_upgrade_base: boolean;
  allow_multi_qty: boolean;
  max_qty_per_booking: number | null;
  replacement_value: number;
}

interface Props {
  initial: BulkAccessoryFullData;
}

export default function EditBulkAccessoryEntry({ initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [newId, setNewId] = useState(initial.id);
  const [availableQty, setAvailableQty] = useState(String(initial.available_qty));
  const [available, setAvailable] = useState(initial.available);
  const [description, setDescription] = useState(initial.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idChanged = newId.trim() !== initial.id;

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setName(initial.name);
    setNewId(initial.id);
    setAvailableQty(String(initial.available_qty));
    setAvailable(initial.available);
    setDescription(initial.description ?? '');
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('Name darf nicht leer sein.');
      return;
    }
    if (!newId.trim()) {
      setError('Bezeichnung darf nicht leer sein.');
      return;
    }
    if (idChanged && !/^[A-Za-z0-9_-]+$/.test(newId.trim())) {
      setError('Bezeichnung darf nur Buchstaben, Zahlen, "-" und "_" enthalten.');
      return;
    }
    const qty = parseInt(availableQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      setError('Verfügbare Menge muss eine positive Zahl sein.');
      return;
    }
    if (idChanged) {
      const ok = confirm(
        'Achtung: Wenn du die Bezeichnung änderst, sind bereits gedruckte QR-Aufkleber für dieses Sammel-Zubehör ungültig und müssen neu gedruckt werden. Trotzdem ändern?'
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const body = {
        // Editierbare Felder
        name: name.trim(),
        description: description.trim() || null,
        available_qty: qty,
        available,
        new_id: idChanged ? newId.trim() : undefined,
        // Nicht editierbare Felder — werden 1:1 zurueckgeschickt
        category: initial.category,
        pricing_mode: initial.pricing_mode,
        price: initial.price,
        image_url: initial.image_url,
        compatible_product_ids: initial.compatible_product_ids,
        internal: initial.internal,
        upgrade_group: initial.upgrade_group,
        is_upgrade_base: initial.is_upgrade_base,
        allow_multi_qty: initial.allow_multi_qty,
        max_qty_per_booking: initial.max_qty_per_booking,
        replacement_value: initial.replacement_value,
        is_bulk: true,
      };

      const res = await fetch(`/api/admin/accessories/${encodeURIComponent(initial.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Fehler beim Speichern.');
        setBusy(false);
        return;
      }
      const json = await res.json().catch(() => ({}));
      const finalId = json?.id ?? initial.id;
      setOpen(false);
      // ID-Rename → URL aendert sich → auf neue URL navigieren
      if (idChanged && finalId !== initial.id) {
        router.push(`/admin/scan/${encodeURIComponent(finalId)}`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Netzwerk-Fehler. Bitte erneut versuchen.');
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
              <h3 className="font-bold text-base" style={{ color: '#0f172a' }}>Sammel-Zubehör bearbeiten</h3>
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
                Preis, Kompatibilität und weitere Felder findest du im großen Zubehör-Editor.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  style={{ color: '#0f172a' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Bezeichnung (URL-Code)</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  style={{ color: '#0f172a' }}
                />
                {idChanged && newId.trim() && (
                  <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                    ⚠ Achtung: Bestehende QR-Aufkleber werden ungültig. Neu drucken nötig. Buchungen mit diesem Code werden bei Rename geprüft — falls schon verwendet, schlägt der Vorgang fehl.
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Verfügbare Menge</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={availableQty}
                  onChange={(e) => setAvailableQty(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  style={{ color: '#0f172a' }}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                  disabled={busy}
                  className="w-4 h-4 accent-cyan-600"
                />
                <span className="text-sm" style={{ color: '#0f172a' }}>Verfügbar (sonst ausgemustert)</span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Beschreibung</label>
                <textarea
                  value={description}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  placeholder="Optionale Notiz zum Zubehör"
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
