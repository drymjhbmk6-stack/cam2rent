'use client';

import { useEffect, useRef, useState, use, useMemo } from 'react';
import Link from 'next/link';
import SignatureCanvas from 'react-signature-canvas';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SerialScanner from '@/components/admin/SerialScanner';
import { fmtDateWeekday } from '@/lib/format-utils';
import {
  expandItems,
  groupItems,
  buildScanLookup,
  applyScan,
  applyScanResult,
  ItemList,
  ScannerBar,
  ScannerLiveList,
  type ResolvedItem,
  type UnitCode,
  type PackItem,
  type GroupedItem,
} from '@/components/admin/scan-workflow';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingDetail {
  id: string;
  product_name: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_method: string | null;
  shipping_address: string | null;
  rental_from: string;
  rental_to: string;
  serial_number?: string | null;
  unit_id?: string | null;
  cameras_resolved?: { product_name: string; serial_number: string | null; unit_id: string | null; product_id?: string | null }[];
  resolved_items?: ResolvedItem[];
  unit_codes?: UnitCode[];
  contract_signed?: boolean | null;
  pack_status?: string | null;
  pack_packed_by?: string | null;
  pack_packed_by_user_id?: string | null;
  pack_packed_at?: string | null;
  pack_packed_items?: string[] | null;
  pack_checked_by?: string | null;
  pack_checked_by_user_id?: string | null;
  pack_checked_at?: string | null;
  pack_photo_url?: string | null;
  pack_weight_kg?: number | null;
  pack_weight_estimate_kg?: number | null;
}

interface CurrentAdminUser {
  id: string;
  name: string;
  role: 'owner' | 'employee';
  isEmployeeAccount: boolean; // true wenn echter Mitarbeiter-Account (nicht legacy-env Master-Passwort)
}

function bookingToScanInput(b: BookingDetail) {
  return {
    productName: b.product_name,
    serialNumber: b.serial_number ?? null,
    resolvedItems: b.resolved_items,
    unitCodes: b.unit_codes,
    unitId: b.unit_id ?? null,
    cameras: Array.isArray(b.cameras_resolved) && b.cameras_resolved.length > 0
      ? b.cameras_resolved.map((c) => ({
          product_name: c.product_name,
          serial_number: c.serial_number,
          unit_id: c.unit_id,
        }))
      : undefined,
  };
}

export default function PackenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [me, setMe] = useState<CurrentAdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = () => {
    setLoading(true);
    fetch(`/api/admin/booking/${id}`)
      .then((r) => r.json())
      .then(({ booking: b, error: e }) => {
        if (e || !b) { setError('Buchung nicht gefunden.'); return; }
        setBooking(b);
      })
      .catch(() => setError('Fehler beim Laden.'))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aktuell eingeloggten Admin-User holen — fuer Name-Prefill + Anzeige, ob
  // der harte ID-basierte 4-Augen-Check greift.
  useEffect(() => {
    fetch('/api/admin/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) return;
        setMe({
          id: d.user.id,
          name: d.user.name ?? '',
          role: d.user.role,
          isEmployeeAccount: d.user.id !== 'legacy-env',
        });
      })
      .catch(() => {});
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Lädt…</div>;
  if (error || !booking) return <div className="p-8 text-center text-red-600">{error}</div>;

  const items = expandItems(bookingToScanInput(booking));
  const status = booking.pack_status ?? 'pending';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <AdminBackLink href="/admin/versand" label="Zurück zur Versand-Liste" />

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">Versand vorbereiten</h1>
          <p className="text-sm text-slate-400 mt-1">
            Buchung <span className="font-mono">{booking.id}</span> · {booking.customer_name ?? 'Unbekannt'}
          </p>
        </div>

        {!booking.contract_signed && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/30 border border-red-600 flex items-start gap-3">
            <span className="text-2xl leading-none">⚠️</span>
            <div className="min-w-0">
              <p className="font-bold text-red-300">Achtung: Mietvertrag nicht unterschrieben</p>
              <p className="text-sm text-red-200/80 mt-0.5">
                Für diese Buchung liegt kein unterschriebener Mietvertrag vor. Vor dem Versand
                den Vertrag unterschreiben lassen.
              </p>
              <a
                href={`/admin/buchungen/${booking.id}/vertrag-unterschreiben`}
                className="inline-block mt-2 text-sm font-semibold text-red-200 underline"
              >
                Jetzt unterschreiben →
              </a>
            </div>
          </div>
        )}

        {/* Status-Indikator */}
        <Stepper status={status} />

        {/* Bestellinfo */}
        <BookingInfo booking={booking} />

        {/* Step-spezifischer Block */}
        {status !== 'checked' && status !== 'pending' && status !== 'packed' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <p className="text-slate-400">Unbekannter Status: {status}</p>
          </div>
        )}
        {status === 'pending' && (
          <PackStep booking={booking} items={items} me={me} onDone={reload} />
        )}
        {status === 'packed' && (
          <CheckStep booking={booking} items={items} me={me} onDone={reload} />
        )}
        {status === 'checked' && (
          <DoneStep booking={booking} me={me} onReset={reload} />
        )}
      </div>
    </div>
  );
}

// ─── Stepper-Indikator ───────────────────────────────────────────────────────

function Stepper({ status }: { status: string }) {
  const steps = [
    { key: 'pending', label: '1. Packen', active: status === 'pending', done: status !== 'pending' },
    { key: 'packed', label: '2. Kontrollieren', active: status === 'packed', done: status === 'checked' },
    { key: 'checked', label: '3. Fertig + PDF', active: status === 'checked', done: false },
  ];
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
            s.active ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
            s.done ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
            'bg-slate-800 text-slate-500 border border-slate-700'
          }`}>
            {s.done && <span>✓</span>}
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <span className="text-slate-700">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bestellinfo-Card ────────────────────────────────────────────────────────

function BookingInfo({ booking }: { booking: BookingDetail }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Mietzeitraum</div>
          <div>{fmtDateWeekday(booking.rental_from)} – {fmtDateWeekday(booking.rental_to)}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Versand</div>
          <div>{booking.shipping_method === 'express' ? 'Express' : 'Standard'}</div>
        </div>
        {booking.shipping_address && (
          <div className="col-span-2">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Lieferadresse</div>
            <div className="whitespace-pre-line">{booking.shipping_address}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Packen ──────────────────────────────────────────────────────────

function PackStep({
  booking, items, me, onDone,
}: {
  booking: BookingDetail;
  items: PackItem[];
  me: CurrentAdminUser | null;
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tested, setTested] = useState(false);
  const [noVisible, setNoVisible] = useState(false);
  const [note, setNote] = useState('');
  // Ungefaehres Paketgewicht — vorbefuellt aus den hinterlegten Einzel-
  // gewichten (Kamera + Zubehoer), bleibt fuer den Packer aenderbar.
  const weightDefault = booking.pack_weight_kg ?? booking.pack_weight_estimate_kg ?? null;
  const [weightKg, setWeightKg] = useState<string>(
    weightDefault != null ? String(weightDefault) : '',
  );
  const [name, setName] = useState('');
  const [namePrefilled, setNamePrefilled] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string; parts?: string[] } | null>(null);
  // Welche Unit-IDs wurden tatsaechlich gescannt — egal ob reservierter Code
  // oder Substitut. Reihenfolge der Scans ist egal: das Backend rechnet beim
  // Pack-Submit die finale Buchungs-Zuordnung aus, indem es ungescannte
  // reservierte Units mit gescannten Substituten gleicher accessory_id
  // matched.
  const [scannedCameraUnitIds, setScannedCameraUnitIds] = useState<string[]>([]);
  const [scannedAccessoryUnitIds, setScannedAccessoryUnitIds] = useState<string[]>([]);
  // Klartext-Codes der Substitute fuer den Banner ueber der Liste.
  const [substituteBadges, setSubstituteBadges] = useState<string[]>([]);
  // Manueller Exemplar-Picker (Fallback wenn Scannen nicht klappt) — welche
  // Zubehoer-Gruppe ist gerade offen.
  const [pickerGroup, setPickerGroup] = useState<GroupedItem | null>(null);

  const scanLookup = useMemo(() => buildScanLookup(bookingToScanInput(booking)), [booking]);
  const groups = useMemo(() => groupItems(items), [items]);

  // Gesamt + abgehakt zaehlen — return-label bleibt bewusst draussen, das
  // Etikett ist nicht scanbar und zaehlt nicht in den Scanner-Fortschritt.
  const totalPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label').length,
    [items],
  );
  const checkedPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label' && checked[it.key]).length,
    [items, checked],
  );

  function incGroup(g: GroupedItem) {
    const next = g.slotKeys.find((k) => !checked[k]);
    if (next) setChecked((p) => ({ ...p, [next]: true }));
  }
  function decGroup(g: GroupedItem) {
    for (let i = g.slotKeys.length - 1; i >= 0; i--) {
      if (checked[g.slotKeys[i]]) {
        const k = g.slotKeys[i];
        setChecked((p) => ({ ...p, [k]: false }));
        return;
      }
    }
  }

  // Manuelle Exemplar-Auswahl auf eine Zubehoer-Gruppe anwenden: checkt so
  // viele Slots wie Exemplare gewaehlt wurden und schreibt die Unit-IDs in
  // scannedAccessoryUnitIds (exakt wie ein Scan → applyScannedUnits erfasst
  // sie beim Submit). allUnitIds = alle Exemplare dieser accessory_id (um eine
  // vorherige Auswahl zu entfernen), selectedUnitIds = die jetzt gewaehlten.
  function applyManualUnits(g: GroupedItem, allUnitIds: string[], selectedUnitIds: string[]) {
    const slotKeys = g.slotKeys;
    const sel = selectedUnitIds.slice(0, slotKeys.length);
    setChecked((prev) => {
      const next = { ...prev };
      slotKeys.forEach((k, i) => { next[k] = i < sel.length; });
      checkedRef.current = next;
      return next;
    });
    setScannedAccessoryUnitIds((prev) => {
      const allSet = new Set(allUnitIds);
      const next = [...prev.filter((id) => !allSet.has(id)), ...sel];
      scannedAccessoryUnitIdsRef.current = next;
      return next;
    });
  }

  // Sammel-/untracked-Zubehoer: nur Menge (anonym, kein Unit-Recording — wie
  // der Bulk-Scan, der ebenfalls keine Unit-ID erfasst).
  function applyManualQuantity(g: GroupedItem, n: number) {
    const slotKeys = g.slotKeys;
    const count = Math.max(0, Math.min(n, slotKeys.length));
    setChecked((prev) => {
      const next = { ...prev };
      slotKeys.forEach((k, i) => { next[k] = i < count; });
      checkedRef.current = next;
      return next;
    });
  }

  // Refs spiegeln den State synchron — handleScan wird aus einer
  // eingefrorenen Scanner-Closure aufgerufen und würde sonst veraltete
  // checked-/scanned-Werte sehen.
  const checkedRef = useRef(checked);
  const scannedCameraUnitIdsRef = useRef(scannedCameraUnitIds);
  const scannedAccessoryUnitIdsRef = useRef(scannedAccessoryUnitIds);
  useEffect(() => { checkedRef.current = checked; }, [checked]);
  useEffect(() => { scannedCameraUnitIdsRef.current = scannedCameraUnitIds; }, [scannedCameraUnitIds]);
  useEffect(() => { scannedAccessoryUnitIdsRef.current = scannedAccessoryUnitIds; }, [scannedAccessoryUnitIds]);

  async function handleScan(code: string) {
    const scannedSet = new Set([
      ...scannedCameraUnitIdsRef.current,
      ...scannedAccessoryUnitIdsRef.current,
    ]);
    const result = await applyScan(code, booking.id, items, checkedRef.current, scanLookup, scannedSet);
    if (result.ok && result.key) {
      setChecked((p) => {
        const next = applyScanResult(result, items, p);
        checkedRef.current = next;
        return next;
      });
      if (result.scannedUnitId) {
        if (result.scannedKind === 'camera') {
          setScannedCameraUnitIds((p) => {
            const next = p.includes(result.scannedUnitId!) ? p : [...p, result.scannedUnitId!];
            scannedCameraUnitIdsRef.current = next;
            return next;
          });
        } else if (result.scannedKind === 'accessory') {
          setScannedAccessoryUnitIds((p) => {
            const next = p.includes(result.scannedUnitId!) ? p : [...p, result.scannedUnitId!];
            scannedAccessoryUnitIdsRef.current = next;
            return next;
          });
        }
      }
      if (result.isSubstitute && result.substituteCode) {
        setSubstituteBadges((p) => p.includes(result.substituteCode!) ? p : [...p, result.substituteCode!]);
      }
      setScanFeedback({ type: 'ok', msg: result.message, parts: result.includedParts });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    // Scanner laeuft im continuous-Modus offen — Auto-Close greift via Effekt
    // unten, sobald alle scanbaren Items abgehakt sind. Bei Bestandteile-
    // Hinweis bleibt der Toast laenger sichtbar.
    const dur = result.includedParts && result.includedParts.length > 0 ? 6000 : 3500;
    window.setTimeout(() => setScanFeedback(null), dur);
  }

  // Auto-Close wenn alle scanbaren Items abgehakt sind. Verhindert zugleich
  // dass der Scanner Schritt 1 abschliesst — den Submit macht der User
  // weiterhin manuell ueber den Fertig-Button (mit Signatur, Konditions-
  // Checks usw.).
  useEffect(() => {
    if (!scannerOpen) return;
    if (totalPackable > 0 && checkedPackable >= totalPackable) {
      const t = window.setTimeout(() => setScannerOpen(false), 800);
      return () => window.clearTimeout(t);
    }
  }, [scannerOpen, checkedPackable, totalPackable]);

  // Name aus Mitarbeiter-Konto vorausfuellen — bleibt editierbar fuer den Fall,
  // dass jemand anderes (z.B. Aushilfe ohne eigenen Account) am Geraet packt.
  useEffect(() => {
    if (me?.isEmployeeAccount && me.name && !name && !namePrefilled) {
      setName(me.name);
      setNamePrefilled(true);
    }
  }, [me, name, namePrefilled]);

  const allChecked = items.every((it) => checked[it.key]);
  const canSubmit = allChecked && tested && noVisible && name.trim().length >= 2 && hasDrawn && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr('');
    try {
      const sig = sigRef.current?.toDataURL('image/png') ?? null;
      const res = await fetch(`/api/admin/versand/${booking.id}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packedBy: name.trim(),
          packedItems: items.filter((it) => checked[it.key]).map((it) => it.key),
          condition: { tested, noVisibleDamage: noVisible, note: note.trim() || undefined },
          packWeightKg: parseFloat(weightKg.replace(',', '.')) || undefined,
          signatureDataUrl: sig,
          scannedUnits: {
            cameraUnitIds: scannedCameraUnitIds,
            accessoryUnitIds: scannedAccessoryUnitIds,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Speichern fehlgeschlagen.');
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-bold mb-1 text-slate-100">Schritt 1: Paket packen</h2>
      <p className="text-sm text-slate-400 mb-4">
        Pack jedes Item einzeln ein und hake es ab. Am Ende unterschreiben — danach übergibst du das Paket einer zweiten Person zur Kontrolle.
      </p>

      <ScannerBar
        onOpen={() => setScannerOpen(true)}
        feedback={scanFeedback}
        totalCount={totalPackable}
        checkedCount={checkedPackable}
      />

      <SubstituteBanner codes={substituteBadges} />

      <ItemList
        groups={groups}
        checked={checked}
        onIncrement={incGroup}
        onDecrement={decGroup}
        onManualPick={(g) => setPickerGroup(g)}
      />

      <p className="text-xs text-slate-500 mt-2">
        Kannst du nicht scannen? Tippe bei einer Zubehör-Position auf
        <span className="text-cyan-400 font-semibold"> 📋 Wählen</span> und hake
        die Exemplare an, die du einpackst.
      </p>

      {pickerGroup && (
        <ManualExemplarPicker
          bookingId={booking.id}
          group={pickerGroup}
          currentScannedUnitIds={scannedAccessoryUnitIds}
          currentCheckedCount={pickerGroup.slotKeys.filter((k) => checked[k]).length}
          onApplyUnits={(allIds, selIds) => { applyManualUnits(pickerGroup, allIds, selIds); setPickerGroup(null); }}
          onApplyQuantity={(n) => { applyManualQuantity(pickerGroup, n); setPickerGroup(null); }}
          onClose={() => setPickerGroup(null)}
        />
      )}

      <SerialScanner
        open={scannerOpen}
        onResult={handleScan}
        onClose={() => setScannerOpen(false)}
        title={`Pack-Liste · ${checkedPackable}/${totalPackable}`}
        continuous
      >
        <ScannerLiveList
          groups={groups}
          checked={checked}
          feedback={scanFeedback}
          onIncrement={incGroup}
          onDecrement={decGroup}
        />
      </SerialScanner>

      <div className="mt-6 space-y-3 border-t border-slate-800 pt-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Zustand bei Verpackung</h3>
        <Check label="Gerät funktionstüchtig getestet" checked={tested} onChange={setTested} />
        <Check label="Keine sichtbaren Schäden" checked={noVisible} onChange={setNoVisible} />
        <textarea
          placeholder="Sonstige Notizen (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full mt-2 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100"
        />
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Ungefähres Paketgewicht</h3>
        <p className="text-xs text-slate-500 mb-2">
          Für das Versandetikett. {booking.pack_weight_estimate_kg != null
            ? `Vorschlag aus hinterlegten Einzelgewichten: ${String(booking.pack_weight_estimate_kg).replace('.', ',')} kg (inkl. Verpackung).`
            : 'Kein Gewicht hinterlegt — bitte schätzen.'}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="z. B. 1,2"
            className="w-32 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-base text-slate-100"
          />
          <span className="text-sm text-slate-400">kg</span>
        </div>
      </div>

      <SignatureBlock
        title="Deine Unterschrift (Packer)"
        name={name}
        setName={setName}
        sigRef={sigRef}
        hasDrawn={hasDrawn}
        setHasDrawn={setHasDrawn}
        accountHint={me?.isEmployeeAccount
          ? `Eingeloggt als ${me.name} — der harte 4-Augen-Check über dein Mitarbeiterkonto ist aktiv.`
          : undefined}
      />

      {err && <p className="text-sm text-red-400 mt-3">{err}</p>}
      {!allChecked && (
        <p className="text-xs text-amber-400 mt-2">⚠ Bitte alle Items abhaken bevor du fertig melden kannst.</p>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full mt-5 bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-bold py-3 rounded-lg"
      >
        {submitting ? 'Speichere…' : 'Fertig — zur Kontrolle übergeben'}
      </button>
    </div>
  );
}

// ─── Step 2: Kontrollieren ───────────────────────────────────────────────────

function CheckStep({
  booking, items, me, onDone,
}: {
  booking: BookingDetail;
  items: PackItem[];
  me: CurrentAdminUser | null;
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [namePrefilled, setNamePrefilled] = useState(false);
  const [notes, setNotes] = useState('');
  // Vom Packer erfasstes Gewicht — Kontrolleur kann korrigieren.
  const checkWeightDefault = booking.pack_weight_kg ?? booking.pack_weight_estimate_kg ?? null;
  const [weightKg, setWeightKg] = useState<string>(
    checkWeightDefault != null ? String(checkWeightDefault) : '',
  );
  const sigRef = useRef<SignatureCanvas>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string; parts?: string[] } | null>(null);

  const scanLookup = useMemo(() => buildScanLookup(bookingToScanInput(booking)), [booking]);
  const groups = useMemo(() => groupItems(items), [items]);
  const totalPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label').length,
    [items],
  );
  const checkedPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label' && checked[it.key]).length,
    [items, checked],
  );

  // Ref spiegelt checked-State synchron für race-safe Folge-Scans (Closure-
  // Schutz im continuous-Scanner-Modus).
  const checkedRef = useRef(checked);
  useEffect(() => { checkedRef.current = checked; }, [checked]);

  function incGroup(g: GroupedItem) {
    const next = g.slotKeys.find((k) => !checked[k]);
    if (next) setChecked((p) => ({ ...p, [next]: true }));
  }
  function decGroup(g: GroupedItem) {
    for (let i = g.slotKeys.length - 1; i >= 0; i--) {
      if (checked[g.slotKeys[i]]) {
        const k = g.slotKeys[i];
        setChecked((p) => ({ ...p, [k]: false }));
        return;
      }
    }
  }

  async function handleScan(code: string) {
    // CheckStep: keine Substitution mehr — Codes sind durch Step 1 gesetzt.
    const result = await applyScan(code, booking.id, items, checkedRef.current, scanLookup, new Set(), false);
    if (result.ok && result.key) {
      setChecked((p) => {
        const next = applyScanResult(result, items, p);
        checkedRef.current = next;
        return next;
      });
      setScanFeedback({ type: 'ok', msg: result.message, parts: result.includedParts });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    const dur = result.includedParts && result.includedParts.length > 0 ? 6000 : 3500;
    window.setTimeout(() => setScanFeedback(null), dur);
  }

  // Auto-Close wenn alle scanbaren Items abgehakt sind.
  useEffect(() => {
    if (!scannerOpen) return;
    if (totalPackable > 0 && checkedPackable >= totalPackable) {
      const t = window.setTimeout(() => setScannerOpen(false), 800);
      return () => window.clearTimeout(t);
    }
  }, [scannerOpen, checkedPackable, totalPackable]);

  // Name aus Mitarbeiter-Konto vorausfuellen.
  useEffect(() => {
    if (me?.isEmployeeAccount && me.name && !name && !namePrefilled) {
      setName(me.name);
      setNamePrefilled(true);
    }
  }, [me, name, namePrefilled]);

  const allChecked = items.every((it) => checked[it.key]);

  // 4-Augen-Pruefung clientseitig (nur UX-Hinweis — finale Pruefung serverseitig):
  // 1) Wenn Mitarbeiter-Account: User-ID-Vergleich gegen Packer.
  // 2) Sonst Namensvergleich als Notfall-Fallback.
  const idMatchesPacker = !!(me?.isEmployeeAccount && booking.pack_packed_by_user_id &&
    me.id === booking.pack_packed_by_user_id);
  const nameMatchesPacker = name.trim().length >= 2 && !!booking.pack_packed_by &&
    name.trim().toLowerCase() === booking.pack_packed_by.trim().toLowerCase();
  // ID-Treffer ist hart — Block. Name-Treffer nur wenn der Packer ohne Account
  // gepackt hat (sonst koennte ein anderer Mitarbeiter mit gleichem Namen
  // berechtigt sein und wir wuerden ihn faelschlich blocken).
  const isSamePerson = idMatchesPacker || (!booking.pack_packed_by_user_id && nameMatchesPacker);
  const canSubmit = allChecked && name.trim().length >= 2 && !isSamePerson && hasDrawn && !!photo && !submitting;

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhoto(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!canSubmit || !photo) return;
    setSubmitting(true);
    setErr('');
    try {
      const sig = sigRef.current?.toDataURL('image/png') ?? '';
      const fd = new FormData();
      fd.append('checkedBy', name.trim());
      fd.append('checkedItems', JSON.stringify(items.filter((it) => checked[it.key]).map((it) => it.key)));
      fd.append('notes', notes.trim());
      { const w = parseFloat(weightKg.replace(',', '.')); if (w > 0) fd.append('packWeightKg', String(w)); }
      fd.append('signatureDataUrl', sig);
      fd.append('photo', photo);
      const res = await fetch(`/api/admin/versand/${booking.id}/check`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Speichern fehlgeschlagen.');
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-bold mb-1 text-slate-100">Schritt 2: Kontrolle (4-Augen-Prinzip)</h2>
      <p className="text-sm text-slate-400 mb-5">
        Das Paket wurde von <span className="text-slate-200 font-semibold">{booking.pack_packed_by ?? 'Unbekannt'}</span> gepackt.
        Prüfe als zweite Person, ob alles vollständig ist, mache ein Foto und unterschreibe.
      </p>
      {idMatchesPacker && (
        <p className="text-xs text-amber-400 mb-5">
          ⚠ Du bist gerade mit dem Mitarbeiterkonto vom Packer eingeloggt. Eine zweite Person muss sich einloggen, um die Kontrolle zu signieren.
        </p>
      )}

      <ScannerBar
        onOpen={() => setScannerOpen(true)}
        feedback={scanFeedback}
        totalCount={totalPackable}
        checkedCount={checkedPackable}
      />

      <ItemList
        groups={groups}
        checked={checked}
        onIncrement={incGroup}
        onDecrement={decGroup}
      />

      <SerialScanner
        open={scannerOpen}
        onResult={handleScan}
        onClose={() => setScannerOpen(false)}
        title={`Kontroll-Liste · ${checkedPackable}/${totalPackable}`}
        continuous
      >
        <ScannerLiveList
          groups={groups}
          checked={checked}
          feedback={scanFeedback}
          onIncrement={incGroup}
          onDecrement={decGroup}
        />
      </SerialScanner>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Notizen (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="z.B. Akku 2 fehlt aber Ersatz beigelegt …"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100"
        />
      </div>

      <div className="mt-4">
        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
          Ungefähres Paketgewicht (fürs Etikett)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="z. B. 1,2"
            className="w-32 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-base text-slate-100"
          />
          <span className="text-sm text-slate-400">kg</span>
        </div>
      </div>

      {/* Foto-Upload */}
      <div className="mt-5 border-t border-slate-800 pt-4">
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Foto vom gepackten Paket (Pflicht)
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Mach ein Handy-Foto vom Paketinhalt als Nachweis. Das Foto wird intern gespeichert
          (nicht im PDF) und ist später im Admin-Detail abrufbar.
        </p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoChange}
          className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-slate-950 file:font-semibold file:cursor-pointer"
        />
        {photoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreview} alt="Vorschau" className="mt-3 max-h-48 rounded-lg border border-slate-700" />
        )}
      </div>

      <SignatureBlock
        title="Deine Unterschrift (Kontrolleur)"
        name={name}
        setName={setName}
        sigRef={sigRef}
        hasDrawn={hasDrawn}
        setHasDrawn={setHasDrawn}
        accountHint={me?.isEmployeeAccount
          ? `Eingeloggt als ${me.name} — der harte 4-Augen-Check über dein Mitarbeiterkonto ist aktiv.`
          : 'Kein Mitarbeiter-Account erkannt — der 4-Augen-Check fällt auf den Namensvergleich zurück.'}
      />

      {idMatchesPacker && (
        <p className="text-sm text-red-400 mt-3">⚠ Du bist mit deinem Mitarbeiterkonto auch als Packer eingetragen. Eine zweite Person muss kontrollieren.</p>
      )}
      {!idMatchesPacker && isSamePerson && (
        <p className="text-sm text-red-400 mt-3">⚠ Du bist als Packer eingetragen. Eine zweite Person muss kontrollieren.</p>
      )}
      {!allChecked && (
        <p className="text-xs text-amber-400 mt-2">⚠ Bitte alle Items prüfen und abhaken.</p>
      )}
      {!photo && (
        <p className="text-xs text-amber-400 mt-2">⚠ Bitte ein Foto vom Paket aufnehmen.</p>
      )}
      {err && <p className="text-sm text-red-400 mt-3">{err}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full mt-5 bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-bold py-3 rounded-lg"
      >
        {submitting ? 'Speichere + lade Foto hoch …' : 'Fertig — Versand freigeben'}
      </button>
    </div>
  );
}

// ─── Step 3: Fertig ──────────────────────────────────────────────────────────

function DoneStep({ booking, me, onReset }: { booking: BookingDetail; me: CurrentAdminUser | null; onReset: () => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  // Über den In-App-PDF-Viewer öffnen → eigener Zurück-Button (iOS-PWA-Sackgasse
  // mit chrome-loser Vollbild-PDF-Ansicht vermeiden).
  const pdfUrl = `/admin/pdf-viewer?u=${encodeURIComponent(`/api/packlist/${booking.id}`)}&t=Packliste`;
  // Workflow-Reset darf nur der Admin/Owner. Mitarbeiter sehen den Button
  // gar nicht erst (Server prueft zusaetzlich, falls jemand die UI umgeht).
  const canReset = me?.role === 'owner';

  useEffect(() => {
    if (!booking.pack_photo_url) return;
    fetch(`/api/admin/versand/${booking.id}/photo-url`)
      .then((r) => r.json())
      .then((d) => { if (d.url) setPhotoUrl(d.url); })
      .catch(() => {});
  }, [booking.id, booking.pack_photo_url]);

  async function resetWorkflow() {
    if (!confirm('Pack-Workflow neu starten? Alle Signaturen + Foto werden gelöscht.')) return;
    setResetting(true);
    setResetError('');
    try {
      const res = await fetch(`/api/admin/versand/${booking.id}/pack-reset`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Reset fehlgeschlagen.');
      }
      onReset();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Fehler.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl">✓</div>
        <h2 className="text-lg font-bold">Fertig — Paket bereit für Versand</h2>
      </div>

      <div className="text-sm space-y-2 mb-6">
        <div>
          <span className="text-slate-500">Gepackt von:</span>{' '}
          <span className="font-semibold">{booking.pack_packed_by}</span>
          {booking.pack_packed_at && (
            <span className="text-slate-500 ml-2 text-xs">
              ({new Date(booking.pack_packed_at).toLocaleString('de-DE')})
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Kontrolliert von:</span>{' '}
          <span className="font-semibold">{booking.pack_checked_by}</span>
          {booking.pack_checked_at && (
            <span className="text-slate-500 ml-2 text-xs">
              ({new Date(booking.pack_checked_at).toLocaleString('de-DE')})
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={pdfUrl}
          className="block bg-cyan-500 text-slate-950 font-bold py-3 px-4 rounded-lg text-center hover:bg-cyan-400"
        >
          📄 Packliste-PDF öffnen / drucken
        </a>
        {photoUrl ? (
          <a
            href={photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-slate-800 border border-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-lg text-center hover:bg-slate-700"
          >
            📷 Verpackungs-Foto ansehen
          </a>
        ) : booking.pack_photo_url ? (
          <div className="block bg-slate-800 border border-slate-700 text-slate-500 font-semibold py-3 px-4 rounded-lg text-center">
            📷 Foto wird geladen…
          </div>
        ) : null}
      </div>

      {canReset && (
        <div className="mt-4">
          <button
            onClick={resetWorkflow}
            disabled={resetting}
            className="text-xs text-slate-500 hover:text-red-400 underline disabled:opacity-50"
          >
            {resetting ? 'Setze zurück…' : 'Workflow zurücksetzen (neu packen)'}
          </button>
          <p className="text-[11px] text-slate-600 mt-1">Nur für Owner. Löscht Signaturen + Foto und startet den Pack-Workflow neu.</p>
          {resetError && <p className="text-xs text-red-400 mt-1">{resetError}</p>}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500">
        <Link href="/admin/versand" className="hover:text-cyan-400">← Zurück zur Versand-Übersicht</Link>
      </div>
    </div>
  );
}

function SubstituteBanner({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <div className="mb-3 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
      <div className="font-semibold mb-1">↻ {codes.length === 1 ? '1 Substitut gepackt' : `${codes.length} Substitute gepackt`}</div>
      <div className="font-mono text-amber-300">{codes.join(', ')}</div>
      <div className="text-[10px] text-amber-200/70 mt-1">Buchungs-Zuordnung wird beim Speichern automatisch ausgetauscht.</div>
    </div>
  );
}

// ─── Manueller Exemplar-Picker (Fallback wenn Scannen nicht klappt) ──────────

type ExemplarUnit = { id: string; exemplar_code: string; status: string; reserved: boolean };

function ManualExemplarPicker({
  bookingId, group, currentScannedUnitIds, currentCheckedCount,
  onApplyUnits, onApplyQuantity, onClose,
}: {
  bookingId: string;
  group: GroupedItem;
  currentScannedUnitIds: string[];
  currentCheckedCount: number;
  onApplyUnits: (allUnitIds: string[], selectedUnitIds: string[]) => void;
  onApplyQuantity: (n: number) => void;
  onClose: () => void;
}) {
  const maxQty = group.slotKeys.length;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [units, setUnits] = useState<ExemplarUnit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(currentCheckedCount);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/booking/${bookingId}/accessory-exemplars?accessory_id=${encodeURIComponent(group.groupKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error) { setError(d.error); return; }
        const us: ExemplarUnit[] = Array.isArray(d.units) ? d.units : [];
        setIsBulk(!!d.is_bulk);
        setUnits(us);
        // Vorauswahl: bereits gescannte Exemplare dieser Position, sonst die
        // fuer diese Buchung reservierten (auf benoetigte Menge gedeckelt).
        const alreadyScanned = us.filter((u) => currentScannedUnitIds.includes(u.id)).map((u) => u.id);
        if (alreadyScanned.length > 0) {
          setSelected(new Set(alreadyScanned.slice(0, maxQty)));
        } else {
          setSelected(new Set(us.filter((u) => u.reserved).map((u) => u.id).slice(0, maxQty)));
        }
      })
      .catch(() => { if (!cancelled) setError('Konnte Exemplare nicht laden.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId, group.groupKey, maxQty, currentScannedUnitIds]);

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        if (next.size >= maxQty) return prev; // Cap auf benoetigte Menge
        next.add(unitId);
      }
      return next;
    });
  }

  const useQuantityMode = !loading && !error && (isBulk || units.length === 0);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-slate-100">{group.label}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" className="text-slate-400 hover:text-slate-100 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Benötigt: {maxQty} Stück</p>

        {loading && <p className="text-sm text-slate-400">Lädt…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && !useQuantityMode && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Exemplare anhaken</span>
              <span className="text-xs font-mono text-cyan-300">{selected.size}/{maxQty}</span>
            </div>
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 mb-4">
              {units.map((u) => {
                const isSel = selected.has(u.id);
                const atCap = !isSel && selected.size >= maxQty;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    disabled={atCap}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${atCap ? 'opacity-40' : 'hover:bg-slate-800/60'}`}
                  >
                    <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? 'border-cyan-500 bg-cyan-500 text-slate-950' : 'border-slate-600'}`}>
                      {isSel && <span className="text-xs font-bold">✓</span>}
                    </span>
                    <span className="flex-1 min-w-0 font-mono text-sm text-slate-100 truncate">
                      {u.exemplar_code || u.id.slice(0, 8)}
                    </span>
                    <ExemplarStatusPill status={u.status} reserved={u.reserved} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onApplyUnits(units.map((u) => u.id), [...selected])}
              className="w-full bg-cyan-500 text-slate-950 font-bold py-2.5 rounded-lg"
            >
              Übernehmen ({selected.size})
            </button>
          </>
        )}

        {useQuantityMode && (
          <>
            <p className="text-sm text-slate-300 mb-3">
              {isBulk ? 'Sammel-Zubehör — keine Einzel-Exemplare.' : 'Keine einzeln erfassten Exemplare hinterlegt.'} Wie viele packst du ein?
            </p>
            <div className="flex items-center justify-center gap-4 mb-2">
              <button type="button" onClick={() => setQty((q) => Math.max(0, q - 1))} className="w-12 h-12 rounded-lg border border-slate-700 text-slate-200 text-2xl leading-none">−</button>
              <span className="text-2xl font-bold tabular-nums w-16 text-center">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-12 h-12 rounded-lg border border-slate-700 text-slate-200 text-2xl leading-none">+</button>
            </div>
            <p className="text-xs text-slate-500 text-center mb-4">von {maxQty} benötigt</p>
            <button
              type="button"
              onClick={() => onApplyQuantity(qty)}
              className="w-full bg-cyan-500 text-slate-950 font-bold py-2.5 rounded-lg"
            >
              Übernehmen ({qty})
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ExemplarStatusPill({ status, reserved }: { status: string; reserved: boolean }) {
  const label = reserved ? 'reserviert' : status === 'available' ? 'verfügbar' : status;
  const cls = reserved
    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
    : status === 'available'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : 'bg-slate-700/40 text-slate-300 border-slate-600';
  return <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-cyan-500"
      />
      <span>{label}</span>
    </label>
  );
}

// ─── Signature-Block (Name + Canvas) ─────────────────────────────────────────

function SignatureBlock({
  title, name, setName, sigRef, hasDrawn, setHasDrawn, accountHint,
}: {
  title: string;
  name: string;
  setName: (s: string) => void;
  sigRef: React.RefObject<SignatureCanvas | null>;
  hasDrawn: boolean;
  setHasDrawn: (v: boolean) => void;
  accountHint?: string;
}) {
  return (
    <div className="mt-6 border-t border-slate-800 pt-4">
      <label className="block text-sm font-semibold text-slate-300 mb-2">{title}</label>
      {accountHint && (
        <p className="text-xs text-cyan-400 mb-2">{accountHint}</p>
      )}
      <input
        type="text"
        placeholder="Vor- und Nachname"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 mb-3"
      />
      <p className="text-xs text-slate-300 mb-1.5">Hier mit Finger oder Stift unterschreiben:</p>
      <div className="bg-white rounded-lg overflow-hidden border-2 border-slate-300 shadow-inner" style={{ height: 160 }}>
        <SignatureCanvas
          ref={sigRef}
          penColor="#0a0a0a"
          canvasProps={{
            className: 'w-full h-full block',
            style: { width: '100%', height: '100%', background: '#ffffff', display: 'block', touchAction: 'none' },
          }}
          onEnd={() => setHasDrawn(true)}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => { sigRef.current?.clear(); setHasDrawn(false); }}
          className="text-xs text-slate-400 hover:text-cyan-400 underline-offset-2 hover:underline"
        >
          Signatur löschen
        </button>
        {!hasDrawn && (
          <p className="text-xs text-amber-400">Bitte unterschreiben.</p>
        )}
      </div>
    </div>
  );
}

