'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Banner-Komponente, die den Bestand eines Zubehoer-Produkts aus
 * `inventar_units` (neue Welt) anzeigt und ins gefilterte Inventar verlinkt.
 *
 * Vorher war hier ein voller Exemplar-Manager mit Tabelle + Anlegen-/
 * Bearbeiten-Modal. Seit der Buchhaltungs-Konsolidierung (Stand 2026-05-05)
 * leben Exemplare in `inventar_units` und werden zentral unter `/admin/inventar`
 * gepflegt — diese Komponente ist nur noch ein Wegweiser dorthin.
 *
 * Die Schnittstelle (`accessoryId` + `onCountChanged`) bleibt gleich, damit der
 * Eltern-State (`available_qty`-Anzeige in der Zubehoer-Edit-Karte) ohne
 * weitere Aenderungen weiterlaeuft.
 */

interface InventarBridge {
  produkte_id: string | null;
  total: number;
  active: number;
  retired: number;
  bulk_total: number | null;
}

interface Props {
  accessoryId: string;
  /** Wird aufgerufen, wenn sich die Anzahl Exemplare ändert — damit der Parent
   *  available_qty in seinem lokalen State synchronisieren kann. */
  onCountChanged?: (counts: { available: number; total: number }) => void;
}

export default function AccessoryUnitsManager({ accessoryId, onCountChanged }: Props) {
  const [bridge, setBridge] = useState<InventarBridge | null>(null);
  const [loading, setLoading] = useState(true);

  // Callback per Ref — der Parent uebergibt typisch eine Inline-Funktion,
  // deren Identitaet sich bei jedem Re-Render aendert. Ohne Ref propagiert
  // diese Identitaetsaenderung durch report → useEffect → Render-Loop.
  const onCountChangedRef = useRef(onCountChanged);
  useEffect(() => {
    onCountChangedRef.current = onCountChanged;
  }, [onCountChanged]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/admin/produkte/legacy-bridge?source=accessories&legacy_id=${encodeURIComponent(accessoryId)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: InventarBridge | null) => {
        if (cancelled) return;
        const safe: InventarBridge = data ?? {
          produkte_id: null,
          total: 0,
          active: 0,
          retired: 0,
          bulk_total: null,
        };
        setBridge(safe);
        onCountChangedRef.current?.({ available: safe.active, total: safe.total });
      })
      .catch(() => {
        if (cancelled) return;
        const fallback: InventarBridge = {
          produkte_id: null,
          total: 0,
          active: 0,
          retired: 0,
          bulk_total: null,
        };
        setBridge(fallback);
        onCountChangedRef.current?.({ available: 0, total: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessoryId]);

  return (
    <div className="bg-brand-bg dark:bg-slate-900/40 rounded-xl border border-brand-border dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-heading font-bold text-sm text-brand-black dark:text-slate-200">Exemplare</h3>
        {loading ? (
          <span className="text-xs font-body text-brand-muted">Lade Bestand…</span>
        ) : (
          <span className="text-xs font-body text-brand-muted">
            {bridge?.active ?? 0} aktiv
            {bridge && bridge.retired > 0 && `, ${bridge.retired} ausgemustert`}
          </span>
        )}
      </div>

      {loading ? null : bridge && bridge.produkte_id ? (
        <div className="rounded-lg bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 px-4 py-3 text-sm font-body text-cyan-900 dark:text-cyan-200 flex items-center justify-between gap-3 flex-wrap">
          <span>
            Einzelexemplare werden seit der Buchhaltungs-Konsolidierung zentral im{' '}
            <span className="font-semibold">Inventar</span> verwaltet.
          </span>
          <Link
            href={`/admin/inventar?produkt_id=${bridge.produkte_id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors whitespace-nowrap"
          >
            Im Inventar öffnen →
          </Link>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm font-body text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 flex-wrap">
          <span>
            Noch keine Stammdaten in der neuen <span className="font-semibold">produkte</span>-Tabelle für dieses Zubehör.
            Lege das erste Exemplar direkt im Inventar an — dort kannst du auch Beleg, Kaufpreis und Wiederbeschaffungswert pflegen.
          </span>
          <Link
            href="/admin/inventar/neu"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            Inventar öffnen →
          </Link>
        </div>
      )}

      {!loading && (bridge?.active ?? 0) > 0 && (
        <div className="mt-3 flex justify-end">
          <a
            href={`/admin/zubehoer/${accessoryId}/qr-codes`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
            title="QR-Code-Etiketten zum Aufkleben drucken"
          >
            QR-Codes drucken
          </a>
        </div>
      )}

      <p className="text-xs font-body text-brand-muted mt-3">
        Der Lagerbestand für den Shop wird automatisch aus den aktiven Inventar-Einheiten berechnet.
        Mietverträge und Schadensabwicklung greifen ebenfalls dort.
      </p>
    </div>
  );
}
