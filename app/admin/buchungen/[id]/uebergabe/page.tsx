'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import Link from 'next/link';
import SignatureCanvas from 'react-signature-canvas';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SerialScanner from '@/components/admin/SerialScanner';
import {
  expandItems,
  groupItems,
  buildScanLookup,
  applyScan,
  ItemList,
  ScannerBar,
  ScannerLiveList,
  type ResolvedItem,
  type UnitCode,
  type GroupedItem,
  type ScanFeedback,
} from '@/components/admin/scan-workflow';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingDetail {
  id: string;
  product_name: string;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string;
  rental_to: string;
  delivery_mode: string;
  serial_number?: string | null;
  unit_id?: string | null;
  cameras_resolved?: { product_name: string; serial_number: string | null; unit_id: string | null; product_id?: string | null }[];
  resolved_items?: ResolvedItem[];
  unit_codes?: UnitCode[];
  shipping_address?: string | null;
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
    // Bei Übergabe (Abholung) gibt es kein Rücksendeetikett — der Scanner-
    // Fortschritt soll nur die physisch übergebenen Stücke zählen.
    skipReturnLabel: true,
  };
}

interface HandoverData {
  completedAt: string;
  location: string;
  condition: { tested: boolean; noDamage: boolean; otherNote?: string };
  items: Array<{ name: string; ok: boolean }>;
  photoPath?: string;
  signatures: {
    landlord: { dataUrl: string; name: string; signedAt: string };
    renter: { dataUrl: string; name: string; signedAt: string };
  };
}

type Step = 'condition' | 'landlord' | 'renter' | 'done';

export default function UebergabePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [existingHandover, setExistingHandover] = useState<HandoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/booking/${id}`).then((r) => r.json()),
      fetch(`/api/admin/handover/${id}`).then((r) => r.ok ? r.json() : { handoverData: null }),
    ])
      .then(([bookingRes, handoverRes]) => {
        if (!bookingRes?.booking) { setError('Buchung nicht gefunden.'); return; }
        setBooking(bookingRes.booking);
        if (handoverRes?.handoverData) setExistingHandover(handoverRes.handoverData);
      })
      .catch(() => setError('Fehler beim Laden.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Lädt…</div>;
  if (error || !booking) return <div className="p-8 text-center text-red-600">{error}</div>;

  // Falls bereits gespeichert: Done-Anzeige direkt
  if (existingHandover) {
    return <DoneView booking={booking} handover={existingHandover} />;
  }

  return <Wizard booking={booking} />;
}

function Wizard({ booking }: { booking: BookingDetail }) {
  const scanInput = useMemo(() => bookingToScanInput(booking), [booking]);
  const items = useMemo(() => expandItems(scanInput), [scanInput]);
  const groups = useMemo(() => groupItems(items), [items]);
  const scanLookup = useMemo(() => buildScanLookup(scanInput), [scanInput]);
  const [step, setStep] = useState<Step>('condition');

  // Step 1 state
  const [location, setLocation] = useState('');
  const [tested, setTested] = useState(false);
  const [noDamage, setNoDamage] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Scanner-State (analog zum Versand-Pack-Workflow)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null);
  // Welche physischen Units in dieser Scan-Session schon erfasst wurden —
  // verhindert Doppel-Scans desselben Stücks. Wird nicht ans Backend
  // geschickt (Übergabe speichert nur Name + ok pro Position).
  const [scannedCameraUnitIds, setScannedCameraUnitIds] = useState<string[]>([]);
  const [scannedAccessoryUnitIds, setScannedAccessoryUnitIds] = useState<string[]>([]);

  // Step 2 + 3 state
  const [landlordName, setLandlordName] = useState('');
  const [landlordSig, setLandlordSig] = useState<string | null>(null);
  const [renterName, setRenterName] = useState(booking.customer_name ?? '');
  const [renterSig, setRenterSig] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

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

  async function handleScan(code: string) {
    const scannedSet = new Set([
      ...scannedCameraUnitIds,
      ...scannedAccessoryUnitIds,
    ]);
    const result = await applyScan(code, booking.id, items, checked, scanLookup, scannedSet);
    if (result.ok && result.key) {
      const keysToCheck = result.keys && result.keys.length > 0 ? result.keys : [result.key];
      setChecked((p) => {
        const next = { ...p };
        for (const k of keysToCheck) next[k] = true;
        return next;
      });
      if (result.scannedUnitId) {
        if (result.scannedKind === 'camera') {
          setScannedCameraUnitIds((p) => p.includes(result.scannedUnitId!) ? p : [...p, result.scannedUnitId!]);
        } else if (result.scannedKind === 'accessory') {
          setScannedAccessoryUnitIds((p) =>
            p.includes(result.scannedUnitId!) ? p : [...p, result.scannedUnitId!]);
        }
      }
      setScanFeedback({ type: 'ok', msg: result.message, parts: result.includedParts });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    const dur = result.includedParts && result.includedParts.length > 0 ? 6000 : 3500;
    window.setTimeout(() => setScanFeedback(null), dur);
  }

  // Scanner automatisch schließen, sobald alle scanbaren Stücke abgehakt sind.
  useEffect(() => {
    if (!scannerOpen) return;
    if (totalPackable > 0 && checkedPackable >= totalPackable) {
      const t = window.setTimeout(() => setScannerOpen(false), 800);
      return () => window.clearTimeout(t);
    }
  }, [scannerOpen, checkedPackable, totalPackable]);

  const allItemsChecked = items.every((it) => checked[it.key]);
  const canProceedFromStep1 = allItemsChecked && location.trim().length > 0 && tested && noDamage && !!photoFile;

  // Vermieter-Name aus admin/me vorausfüllen
  useEffect(() => {
    fetch('/api/admin/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.name) setLandlordName(d.user.name);
      })
      .catch(() => {});
  }, []);

  async function submitAll() {
    if (!landlordSig || !landlordName.trim()) { setSubmitError('Vermieter-Signatur + Name erforderlich.'); return; }
    if (!renterSig || !renterName.trim()) { setSubmitError('Mieter-Signatur + Name erforderlich.'); return; }
    if (!photoFile) { setSubmitError('Foto ist Pflicht.'); return; }

    setSaving(true);
    setSubmitError('');
    try {
      const itemsArray = items
        .filter((it) => it.type !== 'return-label')
        .map((it) => ({ name: it.label, ok: !!checked[it.key] }));
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('data', JSON.stringify({
        location: location.trim(),
        condition: { tested, noDamage, otherNote: otherNote.trim() || undefined },
        items: itemsArray,
        signatures: {
          landlord: { dataUrl: landlordSig, name: landlordName.trim() },
          renter: { dataUrl: renterSig, name: renterName.trim() },
        },
        scannedUnits: {
          cameraUnitIds: scannedCameraUnitIds,
          accessoryUnitIds: scannedAccessoryUnitIds,
        },
      }));

      const res = await fetch(`/api/admin/handover/${booking.id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Speichern fehlgeschlagen.');
        return;
      }
      setStep('done');
    } catch {
      setSubmitError('Netzwerkfehler.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <AdminBackLink href={`/admin/buchungen/${booking.id}`} label="Zurück zur Buchung" />

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">Übergabeprotokoll</h1>
          <p className="text-sm text-slate-400 mt-1">
            Buchung <span className="font-mono">{booking.id}</span> · {booking.customer_name ?? 'Unbekannt'}
          </p>
        </div>

        <Stepper step={step} />
        <BookingInfo booking={booking} />

        {step === 'condition' && (
          <Step1 {...{
            bookingId: booking.id,
            groups, checked, incGroup, decGroup,
            scannerOpen, setScannerOpen,
            scanFeedback, handleScan,
            totalPackable, checkedPackable,
            location, setLocation,
            tested, setTested, noDamage, setNoDamage,
            photoFile, setPhotoFile, photoPreview, setPhotoPreview,
            otherNote, setOtherNote,
            canProceed: canProceedFromStep1,
            onNext: () => setStep('landlord'),
          }} />
        )}

        {step === 'landlord' && (
          <Step2Sign
            title="Unterschrift Vermieter"
            description="Bestätigt die ordnungsgemäße Übergabe in beschriebenem Zustand."
            name={landlordName}
            setName={setLandlordName}
            onSign={(d) => setLandlordSig(d)}
            onBack={() => setStep('condition')}
            onNext={() => setStep('renter')}
            canNext={!!landlordSig && landlordName.trim().length > 0}
          />
        )}

        {step === 'renter' && (
          <Step2Sign
            title="Unterschrift Mieter"
            description="Bestätigt den Erhalt des Equipments und den dokumentierten Zustand."
            name={renterName}
            setName={setRenterName}
            onSign={(d) => setRenterSig(d)}
            onBack={() => setStep('landlord')}
            onNext={submitAll}
            canNext={!!renterSig && renterName.trim().length > 0}
            nextLabel={saving ? 'Speichert…' : 'Speichern'}
            nextDisabled={saving}
          />
        )}

        {step === 'done' && (
          <DoneStep bookingId={booking.id} />
        )}

        {submitError && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ['condition', 'landlord', 'renter', 'done'];
  const labels: Record<Step, string> = {
    condition: '1. Zustand',
    landlord: '2. Vermieter',
    renter: '3. Mieter',
    done: '4. Fertig',
  };
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto">
      {order.map((k, i) => (
        <div key={k} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
            i === idx ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
            i < idx ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
            'bg-slate-800 text-slate-500 border border-slate-700'
          }`}>
            {i < idx && <span>✓</span>}
            {labels[k]}
          </div>
          {i < order.length - 1 && <span className="text-slate-700">→</span>}
        </div>
      ))}
    </div>
  );
}

function EquipmentSummary({ booking }: { booking: BookingDetail }) {
  const items = booking.resolved_items ?? [];
  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Mietgegenstände</div>
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between gap-3">
          <span className="font-medium">
            📷 {booking.product_name}
            {booking.serial_number ? <span className="text-slate-400 font-normal"> · SN {booking.serial_number}</span> : null}
          </span>
          <span className="text-slate-400 shrink-0">1×</span>
        </li>
        {items.map((it, i) => (
          <li
            key={i}
            className={`flex justify-between gap-3 ${it.isFromSet ? 'pl-4 text-slate-300' : 'font-medium'}`}
          >
            <span className="min-w-0 truncate">
              {it.isFromSet ? '└ ' : '🎒 '}{it.name}
            </span>
            <span className="text-slate-400 shrink-0">{it.qty}×</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-slate-500 italic">Kein Zubehör gebucht</li>}
      </ul>
    </div>
  );
}

function BookingInfo({ booking }: { booking: BookingDetail }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Mietzeitraum</div>
          <div>{booking.rental_from} – {booking.rental_to}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Lieferart</div>
          <div>{booking.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}</div>
        </div>
      </div>
      <EquipmentSummary booking={booking} />
    </div>
  );
}

// ─── Step 1: Zustand + Items ─────────────────────────────────────────────────

function Step1(props: {
  bookingId: string;
  groups: GroupedItem[];
  checked: Record<string, boolean>;
  incGroup: (g: GroupedItem) => void;
  decGroup: (g: GroupedItem) => void;
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  scanFeedback: ScanFeedback;
  handleScan: (code: string) => void;
  totalPackable: number;
  checkedPackable: number;
  location: string;
  setLocation: (v: string) => void;
  tested: boolean;
  setTested: (v: boolean) => void;
  noDamage: boolean;
  setNoDamage: (v: boolean) => void;
  photoFile: File | null;
  setPhotoFile: (f: File | null) => void;
  photoPreview: string | null;
  setPhotoPreview: (u: string | null) => void;
  otherNote: string;
  setOtherNote: (v: string) => void;
  canProceed: boolean;
  onNext: () => void;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('Foto zu gross (max 10 MB).'); return; }
    props.setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => props.setPhotoPreview(reader.result as string);
    reader.readAsDataURL(f);
  }
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="font-bold text-lg mb-1">1. Zustand bei Übergabe</h2>
      <p className="text-sm text-slate-400 mb-6">Items abhaken + Zustand festhalten.</p>

      {/* Ort der Übergabe */}
      <div className="mb-5">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1.5">Ort der Übergabe *</label>
        <input
          type="text"
          value={props.location}
          onChange={(e) => props.setLocation(e.target.value)}
          placeholder="z.B. Heimsbrunner Str. 12, 12349 Berlin"
          className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Item-Checkliste + Scanner */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Übergebene Gegenstände *</p>

        <ScannerBar
          onOpen={() => props.setScannerOpen(true)}
          feedback={props.scanFeedback}
          totalCount={props.totalPackable}
          checkedCount={props.checkedPackable}
        />

        <ItemList
          groups={props.groups}
          checked={props.checked}
          onIncrement={props.incGroup}
          onDecrement={props.decGroup}
        />

        <SerialScanner
          open={props.scannerOpen}
          onResult={props.handleScan}
          onClose={() => props.setScannerOpen(false)}
          title={`Übergabe · ${props.checkedPackable}/${props.totalPackable}`}
          continuous
        >
          <ScannerLiveList
            groups={props.groups}
            checked={props.checked}
            feedback={props.scanFeedback}
            onIncrement={props.incGroup}
            onDecrement={props.decGroup}
          />
        </SerialScanner>
      </div>

      {/* Zustand-Checkboxen */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Zustand *</p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" checked={props.tested} onChange={(e) => props.setTested(e.target.checked)} className="w-5 h-5 accent-cyan-500" />
            <span className="text-sm">Funktionsfähig getestet</span>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" checked={props.noDamage} onChange={(e) => props.setNoDamage(e.target.checked)} className="w-5 h-5 accent-cyan-500" />
            <span className="text-sm">Keine sichtbaren Schäden</span>
          </label>
        </div>
      </div>

      {/* Foto-Upload (Pflicht) */}
      <div className="mb-5">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1.5">Foto der Übergabe *</label>
        <p className="text-xs text-slate-500 mb-2">Pflicht: mindestens ein Foto vom Mietgegenstand bei der Übergabe (Zustand dokumentieren).</p>
        <input
          id="handover-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          onChange={onFile}
          className="hidden"
        />
        {props.photoPreview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.photoPreview} alt="Übergabe-Foto" className="w-full max-h-64 object-contain rounded-lg bg-slate-950 border border-slate-800" />
            <button
              type="button"
              onClick={() => { props.setPhotoFile(null); props.setPhotoPreview(null); }}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Foto entfernen / neu aufnehmen
            </button>
          </div>
        ) : (
          <label htmlFor="handover-photo" className="flex flex-col items-center justify-center w-full p-8 rounded-lg bg-slate-950 border-2 border-dashed border-slate-700 cursor-pointer hover:border-cyan-500 transition-colors">
            <svg className="w-8 h-8 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-slate-200">Foto aufnehmen / hochladen</span>
            <span className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP, HEIC · max 10 MB</span>
          </label>
        )}
      </div>

      {/* Sonstige Anmerkungen */}
      <div className="mb-6">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1.5">Sonstige Anmerkungen</label>
        <textarea
          value={props.otherNote}
          onChange={(e) => props.setOtherNote(e.target.value)}
          rows={3}
          placeholder="z.B. kleine Kratzer am Gehäuse rechts oben"
          className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:border-cyan-500 focus:outline-none resize-none"
        />
      </div>

      <button
        type="button"
        disabled={!props.canProceed}
        onClick={props.onNext}
        className="w-full px-4 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold transition-colors"
      >
        Weiter zur Vermieter-Signatur
      </button>
    </div>
  );
}

// ─── Step 2 + 3: Signatur ────────────────────────────────────────────────────

function Step2Sign(props: {
  title: string;
  description: string;
  name: string;
  setName: (v: string) => void;
  onSign: (dataUrl: string | null) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);

  const clear = () => {
    sigRef.current?.clear();
    props.onSign(null);
  };
  const capture = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      props.onSign(null);
      return;
    }
    props.onSign(sigRef.current.toDataURL('image/png'));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="font-bold text-lg mb-1">{props.title}</h2>
      <p className="text-sm text-slate-400 mb-6">{props.description}</p>

      <div className="mb-5">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1.5">Vor- und Nachname *</label>
        <input
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="mb-5">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1.5">Unterschrift *</label>
        <div
          className="rounded-lg overflow-hidden border-2 border-slate-400"
          style={{ backgroundColor: '#ffffff' }}
        >
          <SignatureCanvas
            ref={sigRef}
            penColor="#0f172a"
            backgroundColor="#ffffff"
            minWidth={1.5}
            maxWidth={3}
            canvasProps={{ className: 'w-full h-48 block', style: { backgroundColor: '#ffffff' } }}
            onEnd={capture}
          />
        </div>
        <button
          type="button"
          onClick={clear}
          className="mt-2 text-xs text-slate-400 hover:text-slate-200 underline"
        >
          Unterschrift löschen
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={props.onBack}
          className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
        >
          Zurück
        </button>
        <button
          type="button"
          disabled={!props.canNext || props.nextDisabled}
          onClick={props.onNext}
          className="flex-1 px-4 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold transition-colors"
        >
          {props.nextLabel ?? 'Weiter'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ────────────────────────────────────────────────────────────

function DoneStep({ bookingId }: { bookingId: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-bold text-xl mb-1">Übergabeprotokoll gespeichert</h2>
      <p className="text-sm text-slate-400 mb-6">Beide Signaturen liegen vor.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={`/admin/buchungen/${bookingId}`}
          className="px-4 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors"
        >
          Zurück zur Buchung
        </Link>
      </div>
    </div>
  );
}

// ─── DoneView (wenn Protokoll bereits gespeichert war) ───────────────────────

function DoneView({ booking, handover }: { booking: BookingDetail; handover: HandoverData }) {
  const completedDate = new Date(handover.completedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!handover.photoPath) return;
    fetch(`/api/admin/handover/${booking.id}/photo-url`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.url) setPhotoUrl(d.url); })
      .catch(() => {});
  }, [booking.id, handover.photoPath]);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <AdminBackLink href={`/admin/buchungen/${booking.id}`} label="Zurück zur Buchung" />

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">Übergabeprotokoll</h1>
          <p className="text-sm text-slate-400 mt-1">
            Buchung <span className="font-mono">{booking.id}</span> · {booking.customer_name ?? 'Unbekannt'}
          </p>
        </div>

        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold">Protokoll abgeschlossen</h2>
              <p className="text-xs text-slate-400">am {completedDate}</p>
            </div>
          </div>

          {handover.location && (
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Ort der Übergabe</div>
              <div>{handover.location}</div>
            </div>
          )}

          <div className="mb-4 bg-slate-950/50 rounded-lg p-3 border border-slate-800">
            <EquipmentSummary booking={booking} />
          </div>

          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Zustand</div>
            <ul className="text-sm space-y-1">
              <li>{handover.condition.tested ? '✓' : '✗'} Funktionsfähig getestet</li>
              <li>{handover.condition.noDamage ? '✓' : '✗'} Keine sichtbaren Schäden</li>
              {handover.condition.otherNote && (
                <li className="text-amber-300 mt-1">Anmerkung: {handover.condition.otherNote}</li>
              )}
            </ul>
          </div>

          {handover.photoPath && (
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Foto der Übergabe</div>
              {photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photoUrl} alt="Übergabe-Foto" className="w-full max-h-72 object-contain rounded-lg bg-slate-950 border border-slate-800" />
              ) : (
                <div className="text-xs text-slate-500">Foto wird geladen…</div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4 mb-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Vermieter</div>
              <div className="font-medium text-sm mb-1">{handover.signatures.landlord.name}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={handover.signatures.landlord.dataUrl} alt="Vermieter-Signatur" className="w-full bg-white rounded-lg p-2 h-32 object-contain border border-slate-300" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Mieter</div>
              <div className="font-medium text-sm mb-1">{handover.signatures.renter.name}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={handover.signatures.renter.dataUrl} alt="Mieter-Signatur" className="w-full bg-white rounded-lg p-2 h-32 object-contain border border-slate-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
