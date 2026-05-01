'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  kind: 'camera' | 'accessory';
  unitId: string;
  code: string; // Bezeichnung — wird im Confirm-Dialog gezeigt
}

const ENDPOINTS: Record<Props['kind'], string> = {
  camera: '/api/admin/product-units',
  accessory: '/api/admin/accessory-units',
};

export default function DeleteUnitButton({ kind, unitId, code }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const ok = confirm(
      `Eintrag "${code}" wirklich endgültig löschen?\n\n` +
      'Die zugehörige Anlage wird ebenfalls entfernt. Wenn der Eintrag in einer aktiven Buchung steckt, wird das Löschen abgebrochen — setze den Status dann lieber auf "Ausgemustert".'
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ENDPOINTS[kind]}?id=${encodeURIComponent(unitId)}`, {
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
