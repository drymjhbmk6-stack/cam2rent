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

      <LegacyMirrorPanel accessoryId={accessoryId} />
    </div>
  );
}

interface LegacyMirrorUnit {
  id: string;
  exemplar_code: string;
  status: string;
  notes: string | null;
  created_at: string | null;
  inventar_match: boolean;
}

interface LegacyMirrorResponse {
  accessory: { id: string; name: string; available_qty: number; is_bulk: boolean };
  accessory_units: LegacyMirrorUnit[];
  inventar_codes: Array<{ id: string; code: string; status: string; bezeichnung: string | null }>;
  counts: { mirror_active: number; inventar_active: number; available_qty: number };
  drift: boolean;
}

/**
 * Zeigt bei Welten-Drift (Mirror in alter Welt != Inventar in neuer Welt
 * oder available_qty unstimmig) die rohen accessory_units-Zeilen mit
 * Match-Indikator. Pro Zeile kann der Admin Status auf 'retired' setzen —
 * der Code (= QR-Etikett) bleibt erhalten, faellt aber aus dem
 * Verfuegbarkeits-Zaehler raus.
 */
function LegacyMirrorPanel({ accessoryId }: { accessoryId: string }) {
  const [data, setData] = useState<LegacyMirrorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/accessories/legacy-mirror?accessory_id=${encodeURIComponent(accessoryId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LegacyMirrorResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [accessoryId]);

  if (loading || !data || data.accessory.is_bulk) return null;
  if (!data.drift) return null;

  async function retire(unitId: string) {
    setBusyId(unitId);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/accessory-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: unitId, status: 'retired' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen.');
      setMsg({ t: 'ok', m: 'Als ausgemustert markiert. Bestand wird automatisch neu berechnet.' });
      load();
    } catch (e) {
      setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Fehlgeschlagen.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-heading font-bold text-sm text-amber-900 dark:text-amber-100">
            ⚠ Welten-Drift erkannt
          </h3>
          <p className="text-xs font-body text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
            Shop-Bestand: <strong>{data.counts.available_qty}</strong> ·
            Alt-Welt (Mirror aktiv): <strong>{data.counts.mirror_active}</strong> ·
            Neu-Welt (Inventar aktiv): <strong>{data.counts.inventar_active}</strong>.
            {data.counts.mirror_active > data.counts.inventar_active && (
              <>
                {' '}Überzählige Mirror-Zeilen ohne Inventar-Pendant kannst du <strong>ausmustern</strong>
                {' '}— der Code bleibt scanbar, zählt aber nicht mehr als verfügbar.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] font-heading font-semibold px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap"
        >
          {open ? 'Schließen' : 'Mirror-Zeilen anzeigen'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {data.accessory_units.length === 0 && (
            <p className="text-xs font-body text-amber-900/80 dark:text-amber-200/80">
              Keine accessory_units-Zeilen vorhanden.
            </p>
          )}
          {data.accessory_units.map((u) => {
            const isActive = u.status === 'available' || u.status === 'rented';
            const isOrphan = isActive && !u.inventar_match;
            return (
              <div
                key={u.id}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border ${
                  isOrphan
                    ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate">
                    {u.exemplar_code || '(leer)'}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Status: <strong>{u.status}</strong>
                    {' · '}
                    Inventar: {u.inventar_match ? (
                      <span className="text-emerald-700 dark:text-emerald-300">vorhanden</span>
                    ) : (
                      <span className="text-red-700 dark:text-red-300">nicht gefunden</span>
                    )}
                    {u.notes && ` · ${u.notes}`}
                  </p>
                </div>
                {isActive ? (
                  <button
                    type="button"
                    onClick={() => retire(u.id)}
                    disabled={busyId === u.id}
                    className="text-[11px] font-heading font-semibold px-2.5 py-1.5 rounded border border-red-400 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50 whitespace-nowrap"
                  >
                    {busyId === u.id ? '…' : 'Ausmustern'}
                  </button>
                ) : (
                  <span className="text-[10px] font-body text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    ausgemustert
                  </span>
                )}
              </div>
            );
          })}
          {msg && (
            <p className={`text-xs font-body ${msg.t === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
              {msg.m}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
