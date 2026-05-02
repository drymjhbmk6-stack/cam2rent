'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  kind: 'camera' | 'accessory' | 'bulk_accessory';
  unitId: string;
  code: string; // Bezeichnung — wird im Confirm-Dialog gezeigt
}

const ENDPOINTS: Record<Props['kind'], (id: string) => string> = {
  camera: (id) => `/api/admin/product-units?id=${encodeURIComponent(id)}`,
  accessory: (id) => `/api/admin/accessory-units?id=${encodeURIComponent(id)}`,
  bulk_accessory: (id) => `/api/admin/accessories/${encodeURIComponent(id)}`,
};

export default function DeleteUnitButton({ kind, unitId, code }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const message = kind === 'bulk_accessory'
      ? `Sammel-Zubehör "${code}" wirklich endgültig löschen?\n\nDas entfernt das gesamte Zubehörteil aus dem Katalog (nicht nur ein Exemplar). Buchungen, die es bereits referenzieren, behalten ihren Datenstand — neue Buchungen können es aber nicht mehr verwenden. Alternativ: einfach den Verfügbar-Toggle abschalten.`
      : `Eintrag "${code}" wirklich endgültig löschen?\n\nDie zugehörige Anlage wird ebenfalls entfernt. Wenn der Eintrag in einer aktiven Buchung steckt, wird das Löschen abgebrochen — setze den Status dann lieber auf "Ausgemustert".`;
    const ok = confirm(message);
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINTS[kind](unitId), {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Fehler beim Löschen.');
        setBusy(false);
        return;
      }
      // Zurück zur Inventar-Liste — die alte URL waere nach Delete eh "Code unbekannt".
      router.push('/admin/inventar');
    } catch {
      setError('Netzwerk-Fehler. Bitte erneut versuchen.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="px-3 py-2 text-sm font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-40"
      >
        {busy ? 'Wird gelöscht…' : 'Eintrag löschen'}
      </button>
      {error && (
        <p className="w-full text-xs text-red-600 mt-2 basis-full">{error}</p>
      )}
    </>
  );
}
