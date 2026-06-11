'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Unit {
  id: string;
  bezeichnung: string;
  typ: 'kamera' | 'zubehoer' | 'verbrauch';
  tracking_mode: 'individual' | 'bulk';
  produkt_id: string | null;
  produkt: { id: string; name: string; marke: string | null } | null;
  seriennummer: string | null;
  inventar_code: string | null;
  bestand: number | null;
  kaufpreis_netto: number | null;
  kaufdatum: string | null;
  wiederbeschaffungswert: number | null;
  wbw_manuell_gesetzt: boolean;
  status: string;
  beleg_status: 'verknuepft' | 'beleg_fehlt';
  notizen: string | null;
  installed_firmware: string | null;
}

interface FirmwareCheck {
  product_id: string;
  brand: string;
  model: string;
  latest_version: string | null;
  source_url: string | null;
  release_date: string | null;
  status: 'ok' | 'error' | 'unsupported';
  error_message: string | null;
  last_checked_at: string;
  seen_version: string | null;
}

interface Produkt {
  id: string;
  name: string;
  marke: string | null;
  modell: string | null;
  compatible_camera_names?: string[];
}

function produktLabel(p: Produkt): string {
  const base = `${p.marke ? p.marke + ' ' : ''}${p.name}`.trim();
  const compat = p.compatible_camera_names ?? [];
  if (compat.length === 0) return base; // Kamera-Produkt — keine Kompat-Info
  if (compat.length === 1 && compat[0] === 'Alle Kameras') return `${base} — Alle Kameras`;
  return `${base} — fuer ${compat.join(', ')}`;
}

interface Link {
  id: string;
  stueck_anteil: number;
  beleg_position: {
    id: string; bezeichnung: string;
    beleg: { id: string; beleg_nr: string; beleg_datum: string; lieferant: { name: string } | null };
  } | null;
}

interface PositionMatch {
  id: string;
  bezeichnung: string;
  menge: number;
  einzelpreis_netto: number;
  klassifizierung?: string;
  verknuepfungen_count?: number;
  beleg: { id: string; beleg_nr: string; beleg_datum: string; lieferant: { name: string } | null } | null;
}

function fmtEuro(n: number | null): string {
  if (n === null || n === undefined) return 'Nicht gesetzt';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n));
}

/**
 * Versions-Strings für den Update-Hinweis normalisieren — leading „v"/
 * Whitespace raus, lowercase, damit „v02.10", „V02.10" und „02.10" als
 * gleich gelten. Bewusst defensiv, damit ein „01.02" niemals mit „1.2"
 * fälschlich gleichgesetzt wird (kein Zahlen-Parsing, reiner String-Cmp).
 */
function normalizeVersion(v: string): string {
  return v.trim().toLowerCase().replace(/^v/, '');
}

export default function InventarDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const [unit, setUnit] = useState<Unit | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmwareCheck, setFirmwareCheck] = useState<FirmwareCheck | null>(null);
  const [firmwareBusy, setFirmwareBusy] = useState(false);

  // Produkt-Zuordnung
  const [showProduktEdit, setShowProduktEdit] = useState(false);
  const [produktInput, setProduktInput] = useState<string>('');

  // Verknuepfungs-Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<PositionMatch[]>([]);

  // WBW-Override
  const [showWbwEdit, setShowWbwEdit] = useState(false);
  const [wbwInput, setWbwInput] = useState<number>(0);

  async function reload() {
    const res = await fetch(`/api/admin/inventar/${id}`);
    if (!res.ok) { setError('Nicht gefunden'); return; }
    const data = await res.json();
    setUnit(data.unit);
    setLinks(data.links);
  }

  useEffect(() => { reload(); }, [id]);

  // Firmware-Check-Zeile pro Modell laden — nur Kameras mit Produkt-Zuordnung.
  // Nutzt die alte `admin_config.products`-id, daher koennen wir auf
  // `unit.produkt_id` (neue Welt) nicht direkt mappen. Stattdessen muss in
  // `firmware_checks.product_id` der Klartext-Slug der alten Welt liegen —
  // den Resolver besorgen wir uns weiter unten ueber `/api/admin/produkte`.
  useEffect(() => {
    if (!unit || unit.typ !== 'kamera' || !unit.produkt) {
      setFirmwareCheck(null);
      return;
    }
    // Lookup ueber Marke + Modell, weil firmware_checks.product_id mit
    // `admin_config.products[].id` arbeitet (Shop-Welt).
    fetch(`/api/admin/firmware`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data: { rows: FirmwareCheck[] }) => {
        const marke = (unit.produkt?.marke ?? '').trim().toLowerCase();
        const name = (unit.produkt?.name ?? '').trim().toLowerCase();
        // Match auf Brand + (Modell oder vollstaendiger Name)
        const match = data.rows.find((r) => {
          const rBrand = r.brand.toLowerCase();
          const rModel = r.model.toLowerCase();
          if (rBrand !== marke) return false;
          return rModel === name || name.includes(rModel) || rModel.includes(name);
        });
        setFirmwareCheck(match ?? null);
      })
      .catch(() => setFirmwareCheck(null));
  }, [unit]);

  async function runProductCheck() {
    if (!firmwareCheck) return;
    setFirmwareBusy(true);
    try {
      const res = await fetch('/api/admin/firmware/check-one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: firmwareCheck.product_id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Firmware-Check fehlgeschlagen');
      } else {
        const d = await res.json();
        setFirmwareCheck(d.row);
      }
    } finally {
      setFirmwareBusy(false);
    }
  }

  // Produkte-Liste fuer das Zuordnungs-Dropdown laden
  useEffect(() => {
    fetch('/api/admin/produkte')
      .then((r) => (r.ok ? r.json() : { produkte: [] }))
      .then((data) => setProdukte(data.produkte ?? []))
      .catch(() => setProdukte([]));
  }, []);

  async function handleSetProdukt() {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produkt_id: produktInput || null }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowProduktEdit(false);
    setBusy(false);
  }

  useEffect(() => {
    if (!showLinkModal) return;
    const timer = setTimeout(async () => {
      const sp = new URLSearchParams();
      if (linkSearch) sp.set('q', linkSearch);
      // Nur inventarbare Positionen anzeigen — Versand, Stripe-Gebuehren,
      // Marketing, Rabatte (alles 'ausgabe') tauchen nicht im Picker auf.
      sp.set('inventarbar', '1');
      const res = await fetch(`/api/admin/beleg-positionen?${sp.toString()}`);
      if (res.ok) setLinkResults((await res.json()).positionen ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [linkSearch, showLinkModal]);

  async function handleLink(positionId: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}/verknuepfen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beleg_position_id: positionId }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowLinkModal(false);
    setBusy(false);
  }

  async function handleUnlink(linkId: string, label: string) {
    if (!confirm(
      `Verknüpfung zu "${label}" wirklich lösen?\n\n` +
      `Wenn keine weitere Verknüpfung übrig bleibt, werden Kaufpreis, ` +
      `Kaufdatum und Wiederbeschaffungswert auf diesem Stück zurückgesetzt ` +
      `(manueller WBW-Override bleibt erhalten). Bei mehreren Verknüpfungen ` +
      `werden die Werte aus der verbleibenden Quelle neu berechnet.`,
    )) return;
    setBusy(true);
    const res = await fetch(
      `/api/admin/inventar/${id}/verknuepfen?verknuepfung_id=${encodeURIComponent(linkId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Lösen fehlgeschlagen');
    await reload();
    setBusy(false);
  }

  async function handleSetWbw() {
    setBusy(true);
    const res = await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wiederbeschaffungswert: wbwInput }),
    });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setShowWbwEdit(false);
    setBusy(false);
  }

  async function handleClearWbw() {
    if (!confirm('Manuellen Override entfernen?')) return;
    setBusy(true);
    await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wiederbeschaffungswert: null }),
    });
    await reload();
    setBusy(false);
  }

  async function handleStatusChange(newStatus: string) {
    setBusy(true);
    await fetch(`/api/admin/inventar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await reload();
    setBusy(false);
  }

  async function handleDelete() {
    if (!unit) return;
    if (!confirm(
      `"${unit.bezeichnung}" endgültig aus dem Inventar löschen?\n\n` +
      `Vermietete Stücke können nicht gelöscht werden. Der gespiegelte ` +
      `Eintrag in der alten Welt (product_units/accessory_units) wird mit entfernt.`,
    )) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventar/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(res.status === 409
          ? (data.error ?? 'Stück ist vermietet — kann nicht gelöscht werden.')
          : `Löschen fehlgeschlagen: ${data.error ?? 'Status ' + res.status}`);
        setBusy(false);
        return;
      }
      router.push('/admin/inventar');
    } catch (err) {
      setError(`Netzwerk-Fehler: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  async function patchField(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventar/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = String(data.error ?? '');
        if (msg.includes('duplicate key') || msg.includes('unique')) {
          setError('Dieser Code/Seriennummer existiert bereits an einem anderen Stück.');
        } else {
          setError(msg || 'Speichern fehlgeschlagen');
        }
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (!unit) return <div className="p-6 text-slate-400">Lädt…</div>;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/inventar" />
      <div className="max-w-4xl mx-auto mt-4 space-y-6">
        <div>
          <EditableHeading
            value={unit.bezeichnung}
            onSave={(v) => patchField({ bezeichnung: v.trim() })}
          />
        </div>

        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        {unit.beleg_status === 'beleg_fehlt' && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
            ⚠ Kein Beleg verknüpft. Kaufpreis ist {unit.kaufpreis_netto === null ? 'nicht hinterlegt' : 'manuell gesetzt'}.
            <button onClick={() => setShowLinkModal(true)} className="ml-2 underline">Beleg verknüpfen</button>
          </div>
        )}

        {/* Stammdaten */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2">
          <h2 className="font-semibold mb-2">Stammdaten</h2>
          <Row label="Typ" value={unit.typ === 'kamera' ? 'Kamera' : unit.typ === 'zubehoer' ? 'Zubehör' : 'Verbrauchsmaterial'} />
          <Row label="Tracking" value={unit.tracking_mode === 'bulk' ? 'Bulk (Sammelbestand)' : 'Einzeln (mit Code/SN)'} />
          <Row label="Status" value={
            <select value={unit.status} onChange={(e) => handleStatusChange(e.target.value)} className="bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm">
              <option value="verfuegbar">Verfügbar</option>
              <option value="vermietet">Vermietet</option>
              <option value="wartung">Wartung</option>
              <option value="defekt">Defekt</option>
              <option value="ausgemustert">Ausgemustert</option>
            </select>
          } />
          <Row label="Produkt" value={
            showProduktEdit ? (
              <div className="flex gap-2 items-center">
                <select value={produktInput} onChange={(e) => setProduktInput(e.target.value)} className="bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm max-w-[16rem] truncate">
                  <option value="">— Keins —</option>
                  {produkte.map((p) => (
                    <option key={p.id} value={p.id}>{produktLabel(p)}</option>
                  ))}
                </select>
                <button onClick={handleSetProdukt} disabled={busy} className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-xs font-semibold">Speichern</button>
                <button onClick={() => setShowProduktEdit(false)} className="text-slate-400 text-xs hover:text-slate-300">Abbrechen</button>
              </div>
            ) : (
              <span className="flex gap-2 items-center">
                {unit.produkt ? `${unit.produkt.marke ?? ''} ${unit.produkt.name}`.trim() : <span className="text-amber-400 italic">Nicht zugeordnet</span>}
                <button onClick={() => { setShowProduktEdit(true); setProduktInput(unit.produkt_id ?? ''); }} className="text-cyan-400 text-xs hover:text-cyan-300">Ändern</button>
              </span>
            )
          } />
          <Row label="Code" value={
            <EditableInline
              value={unit.inventar_code ?? ''}
              placeholder="z.B. CAM-DJI-OA5-01"
              mono
              onSave={(v) => patchField({ inventar_code: v.trim() || null })}
            />
          } />
          {unit.tracking_mode === 'individual' && (
            <Row label="Seriennummer" value={
              <EditableInline
                value={unit.seriennummer ?? ''}
                placeholder="Hersteller-Seriennr."
                mono
                onSave={(v) => patchField({ seriennummer: v.trim() || null })}
              />
            } />
          )}
          {unit.tracking_mode === 'bulk' && (
            <Row label="Bestand" value={
              <EditableInline
                value={String(unit.bestand ?? 0)}
                type="number"
                onSave={(v) => {
                  const n = parseInt(v, 10);
                  if (Number.isNaN(n) || n < 0) {
                    setError('Bestand muss eine nicht-negative Zahl sein');
                    return Promise.resolve(false);
                  }
                  return patchField({ bestand: n });
                }}
              />
            } />
          )}
          <Row label="Kaufpreis netto" value={
            <EditableInline
              value={unit.kaufpreis_netto !== null && unit.kaufpreis_netto !== undefined ? String(unit.kaufpreis_netto) : ''}
              placeholder="Nicht gesetzt"
              type="number"
              suffix="€"
              displayValue={fmtEuro(unit.kaufpreis_netto)}
              onSave={(v) => {
                const trimmed = v.trim();
                if (!trimmed) return patchField({ kaufpreis_netto: null });
                const n = parseFloat(trimmed.replace(',', '.'));
                if (Number.isNaN(n) || n < 0) {
                  setError('Kaufpreis muss eine nicht-negative Zahl sein');
                  return Promise.resolve(false);
                }
                return patchField({ kaufpreis_netto: n });
              }}
            />
          } />
          <Row label="Kaufdatum" value={
            <EditableInline
              value={unit.kaufdatum ?? ''}
              type="date"
              displayValue={unit.kaufdatum ? new Date(unit.kaufdatum).toLocaleDateString('de-DE') : '–'}
              onSave={(v) => patchField({ kaufdatum: v || null })}
            />
          } />
          {unit.typ === 'kamera' && (
            <>
              <Row label="Firmware installiert" value={
                <EditableInline
                  value={unit.installed_firmware ?? ''}
                  placeholder="z.B. v02.10"
                  mono
                  onSave={(v) => patchField({ installed_firmware: v.trim() || null })}
                />
              } />
              {firmwareCheck && firmwareCheck.status === 'ok' && firmwareCheck.latest_version && (
                <Row label="Aktuell verfügbar" value={
                  <span className="flex items-center justify-end gap-2 text-sm">
                    <span className="font-mono text-xs">{firmwareCheck.latest_version}</span>
                    {firmwareCheck.release_date && (
                      <span className="text-slate-500 text-xs">
                        ({new Date(firmwareCheck.release_date).toLocaleDateString('de-DE')})
                      </span>
                    )}
                    {firmwareCheck.source_url && (
                      <a
                        href={firmwareCheck.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 text-xs"
                      >
                        Quelle ↗
                      </a>
                    )}
                  </span>
                } />
              )}
              {firmwareCheck && firmwareCheck.status === 'unsupported' && (
                <Row label="Aktuell verfügbar" value={
                  <span className="text-slate-500 italic text-xs">Marke/Modell vom Firmware-Check nicht unterstützt</span>
                } />
              )}
              {firmwareCheck && firmwareCheck.status === 'error' && (
                <Row label="Aktuell verfügbar" value={
                  <span className="text-amber-400 italic text-xs">Check fehlgeschlagen — siehe /admin/firmware</span>
                } />
              )}
            </>
          )}
        </section>

        {/* Firmware-Update-Hinweis */}
        {unit.typ === 'kamera' && firmwareCheck && firmwareCheck.status === 'ok'
          && firmwareCheck.latest_version
          && unit.installed_firmware
          && normalizeVersion(unit.installed_firmware) !== normalizeVersion(firmwareCheck.latest_version) && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-sm flex items-center justify-between gap-3 flex-wrap">
            <div>
              🆕 <strong>Firmware-Update verfügbar:</strong>{' '}
              <span className="font-mono">{unit.installed_firmware}</span> →{' '}
              <span className="font-mono">{firmwareCheck.latest_version}</span>
              {firmwareCheck.release_date && (
                <span className="text-emerald-400/70 text-xs ml-2">
                  (erschienen {new Date(firmwareCheck.release_date).toLocaleDateString('de-DE')})
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {firmwareCheck.source_url && (
                <a
                  href={firmwareCheck.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded text-xs font-semibold"
                >
                  Zur Quelle
                </a>
              )}
              <button
                onClick={runProductCheck}
                disabled={firmwareBusy}
                className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-xs font-semibold disabled:opacity-50"
              >
                {firmwareBusy ? '…' : 'Neu prüfen'}
              </button>
            </div>
          </div>
        )}

        {/* Firmware-„up to date" — kein Banner, nur subtiler Hinweis */}
        {unit.typ === 'kamera' && firmwareCheck && firmwareCheck.status === 'ok'
          && firmwareCheck.latest_version
          && unit.installed_firmware
          && normalizeVersion(unit.installed_firmware) === normalizeVersion(firmwareCheck.latest_version) && (
          <div className="p-2 text-emerald-400/70 text-xs italic">
            ✓ Firmware aktuell — keine neuere Version bekannt
          </div>
        )}

        {/* WBW */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Wiederbeschaffungswert</h2>
            <div className="flex gap-2">
              {links.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm('Kaufpreis + Wiederbeschaffungswert anhand der Beleg-Position neu berechnen? Bei Kleinunternehmer wird der Brutto-Betrag genommen (Vorsteuer ist nicht abziehbar).')) return;
                    try {
                      const res = await fetch(`/api/admin/inventar/${unit.id}/refresh-from-beleg`, { method: 'POST' });
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}));
                        alert(d.error || 'Fehler beim Neuberechnen');
                        return;
                      }
                      window.location.reload();
                    } catch {
                      alert('Netzwerkfehler beim Neuberechnen');
                    }
                  }}
                  className="text-cyan-400 text-sm hover:text-cyan-300"
                  title="Bei Kleinunternehmer wird brutto (netto + MwSt) als Anschaffungswert genommen"
                >
                  🔄 Aus Beleg neu berechnen
                </button>
              )}
              {!showWbwEdit ? (
                <button onClick={() => { setShowWbwEdit(true); setWbwInput(unit.wiederbeschaffungswert ?? unit.kaufpreis_netto ?? 0); }} className="text-cyan-400 text-sm hover:text-cyan-300">
                  {unit.wbw_manuell_gesetzt ? 'Override anpassen' : 'Manuell setzen'}
                </button>
              ) : (
                <button onClick={() => setShowWbwEdit(false)} className="text-slate-400 text-sm hover:text-slate-300">Abbrechen</button>
              )}
              {unit.wbw_manuell_gesetzt && (
                <button onClick={handleClearWbw} className="text-rose-400 text-sm hover:text-rose-300">Override entfernen</button>
              )}
            </div>
          </div>
          {showWbwEdit ? (
            <div className="flex gap-2 items-center">
              <input type="number" step="0.01" min="0" value={wbwInput} onChange={(e) => setWbwInput(parseFloat(e.target.value || '0'))} className="bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base flex-1" />
              <button onClick={handleSetWbw} disabled={busy} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded">Speichern</button>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-mono">{fmtEuro(unit.wiederbeschaffungswert ?? unit.kaufpreis_netto ?? null)}</div>
              <div className="text-xs text-slate-400 mt-1">
                {unit.wbw_manuell_gesetzt && '● Manueller Override aktiv'}
                {!unit.wbw_manuell_gesetzt && unit.kaufpreis_netto && '○ Berechnet aus Kaufpreis (siehe Liste)'}
                {!unit.wbw_manuell_gesetzt && !unit.kaufpreis_netto && '⚠ Nicht gesetzt — Beleg verknüpfen oder manuell pflegen'}
              </div>
            </div>
          )}
        </section>

        {/* Verknuepfungen */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Verknüpfte Belege ({links.length})</h2>
            <button onClick={() => setShowLinkModal(true)} className="text-cyan-400 text-sm hover:text-cyan-300">+ Beleg verknüpfen</button>
          </div>
          {links.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Keine Verknüpfung</p>
          ) : (
            <div className="space-y-2">
              {links.map((l) => l.beleg_position && (
                <div key={l.id} className="flex justify-between items-start gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/buchhaltung/belege/${l.beleg_position.beleg.id}`} className="text-cyan-400 hover:text-cyan-300">
                      {l.beleg_position.beleg.beleg_nr}
                    </Link>
                    {' · '}
                    <span className="text-slate-400">{l.beleg_position.bezeichnung}</span>
                    {l.stueck_anteil > 1 && <span className="text-xs text-slate-500"> ({l.stueck_anteil}× Anteil)</span>}
                  </div>
                  <button
                    onClick={() => handleUnlink(l.id, l.beleg_position!.bezeichnung)}
                    disabled={busy}
                    className="shrink-0 text-xs text-red-400 hover:text-red-300 underline-offset-2 hover:underline disabled:opacity-40"
                    title="Verknüpfung lösen — Kaufpreis/WBW werden bereinigt"
                  >
                    Lösen
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <NotizenSection
          value={unit.notizen ?? ''}
          onSave={(v) => patchField({ notizen: v.trim() || null })}
        />

        <section className="bg-[#111827] border border-rose-500/30 rounded p-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="font-semibold text-rose-300">Gefahrenzone</h2>
              <p className="text-xs text-slate-400 mt-1">
                {unit.status === 'vermietet'
                  ? 'Stück ist aktuell vermietet — Löschen ist gesperrt.'
                  : 'Entfernt das Stück endgültig aus dem Inventar (inkl. gespiegeltem Legacy-Eintrag).'}
              </p>
            </div>
            <button
              onClick={handleDelete}
              disabled={busy || unit.status === 'vermietet'}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
            >
              {busy ? 'Löscht…' : 'Endgültig löschen'}
            </button>
          </div>
        </section>
      </div>

      {/* Verknuepfungs-Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111827] border border-slate-700 rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-lg font-semibold mb-2">Belegposition suchen</h2>
            <p className="text-xs text-slate-400 mb-3">
              Pro Belegposition koennen nur so viele Inventar-Stuecke verknuepft werden wie die Position Mengen hat.
              Bereits voll belegte Positionen sind ausgegraut.
            </p>
            <input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Bezeichnung, Lieferant…" className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base mb-3" autoFocus />
            <div className="max-h-96 overflow-y-auto space-y-1">
              {[...linkResults]
                .sort((a, b) => {
                  // voll-belegte Positionen ans Ende sortieren
                  const restA = Math.max(0, Number(a.menge ?? 1) - Number(a.verknuepfungen_count ?? 0));
                  const restB = Math.max(0, Number(b.menge ?? 1) - Number(b.verknuepfungen_count ?? 0));
                  if ((restA === 0) !== (restB === 0)) return restA === 0 ? 1 : -1;
                  return 0;
                })
                .map((r) => {
                  const menge = Number(r.menge ?? 1);
                  const used = Number(r.verknuepfungen_count ?? 0);
                  const rest = Math.max(0, menge - used);
                  const full = rest === 0;
                  return (
                    <button
                      key={r.id}
                      onClick={() => !full && handleLink(r.id)}
                      disabled={busy || full}
                      title={full ? 'Diese Position ist bereits voll belegt — alle Mengen sind verknuepft.' : `Noch ${rest} von ${menge} verfuegbar`}
                      className={`w-full text-left p-3 rounded text-sm transition-colors ${
                        full
                          ? 'bg-slate-900/30 opacity-50 cursor-not-allowed'
                          : 'bg-slate-800/40 hover:bg-slate-700/40'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{r.bezeichnung}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {r.beleg && `${r.beleg.beleg_nr} · ${new Date(r.beleg.beleg_datum).toLocaleDateString('de-DE')}`}
                            {r.beleg?.lieferant && ` · ${r.beleg.lieferant.name}`}
                            {' · '}
                            {fmtEuro(Number(r.einzelpreis_netto))} netto/Stueck
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 font-mono ${
                          full
                            ? 'bg-slate-700/30 text-slate-500 border-slate-700'
                            : rest < menge
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {full ? `${menge}/${menge} belegt` : `${rest}/${menge} frei`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              {linkResults.length === 0 && <p className="text-sm text-slate-500 italic p-3">Keine Treffer</p>}
            </div>
            <div className="mt-3">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded">Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 text-sm py-1">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );
}

function EditableHeading({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <h1 className="text-2xl font-heading flex items-center gap-2">
        <span>{value || <span className="text-slate-500 italic">Ohne Bezeichnung</span>}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-cyan-400 hover:text-cyan-300 text-sm font-body"
          aria-label="Bezeichnung bearbeiten"
        >
          ✎
        </button>
      </h1>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="flex-1 bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-2xl font-heading"
        disabled={busy}
      />
      <button onClick={save} disabled={busy} className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-sm font-semibold">Speichern</button>
      <button onClick={() => setEditing(false)} disabled={busy} className="text-slate-400 hover:text-slate-300 text-sm">Abbrechen</button>
    </div>
  );

  async function save() {
    if (draft.trim() === value.trim()) { setEditing(false); return; }
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) setEditing(false);
  }
}

function EditableInline({
  value,
  placeholder,
  type = 'text',
  mono = false,
  suffix,
  displayValue,
  onSave,
}: {
  value: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'date';
  mono?: boolean;
  suffix?: string;
  displayValue?: string;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (draft === value) { setEditing(false); return; }
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    const display = displayValue ?? (value
      ? (suffix ? `${value} ${suffix}` : value)
      : (placeholder ? <span className="text-slate-500 italic">{placeholder}</span> : '–'));
    return (
      <span className="flex items-center justify-end gap-2">
        <span className={mono ? 'font-mono text-xs' : ''}>{display}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-cyan-400 hover:text-cyan-300 text-xs"
          aria-label="Bearbeiten"
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center justify-end gap-2">
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder={placeholder}
        className={`bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1 text-sm ${mono ? 'font-mono text-xs' : ''}`}
        style={{ width: type === 'date' ? 160 : type === 'number' ? 120 : 220 }}
        disabled={busy}
        step={type === 'number' ? '0.01' : undefined}
      />
      <button onClick={save} disabled={busy} className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-xs font-semibold">Speichern</button>
      <button onClick={() => setEditing(false)} disabled={busy} className="text-slate-400 hover:text-slate-300 text-xs">Abbrechen</button>
    </span>
  );
}

function NotizenSection({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <section className="bg-[#111827] border border-slate-800 rounded p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">Notizen</h2>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            {value ? 'Bearbeiten' : '+ Notiz hinzufügen'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Interne Notizen zu diesem Stück (Zustand, Reparaturen, Besonderheiten…)"
            className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-sm"
            disabled={busy}
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded text-sm font-semibold">Speichern</button>
            <button onClick={() => setEditing(false)} disabled={busy} className="px-3 py-1 text-slate-400 hover:text-slate-300 text-sm">Abbrechen</button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-slate-500 italic">Keine Notizen</p>
      )}
    </section>
  );
}
