'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import Link from 'next/link';
import SignatureCanvas from 'react-signature-canvas';
import AdminBackLink from '@/components/admin/AdminBackLink';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResolvedItem {
  id: string;
  name: string;
  qty: number;
  isFromSet?: boolean;
  setName?: string;
}

interface BookingDetail {
  id: string;
  product_name: string;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string;
  rental_to: string;
  delivery_mode: string;
  serial_number?: string | null;
  resolved_items?: ResolvedItem[];
  shipping_address?: string | null;
}

interface HandoverData {
  completedAt: string;
  location: string;
  condition: { tested: boolean; noDamage: boolean; photosTaken: boolean; otherNote?: string };
  items: Array<{ name: string; ok: boolean }>;
  signatures: {
    landlord: { dataUrl: string; name: string; signedAt: string };
    renter: { dataUrl: string; name: string; signedAt: string };
  };
}

type Step = 'condition' | 'landlord' | 'renter' | 'done';

// Items expandieren — analog zum Pack-Workflow, eine Zeile pro Stück
function expandItems(b: BookingDetail): { key: string; label: string; subLabel: string }[] {
  const out: { key: string; label: string; subLabel: string }[] = [];
  out.push({ key: 'camera', label: b.product_name, subLabel: b.serial_number ? `Seriennummer: ${b.serial_number}` : 'Kamera' });
  for (const it of b.resolved_items ?? []) {
    for (let i = 0; i < it.qty; i++) {
      out.push({
        key: `${it.id}::${i}`,
        label: it.name,
        subLabel: it.isFromSet && it.setName ? `Im Set: ${it.setName}` : 'Zubehör',
      });
    }
  }
  return out;
}

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
  const items = useMemo(() => expandItems(booking), [booking]);
  const [step, setStep] = useState<Step>('condition');

  // Step 1 state
  const [location, setLocation] = useState('');
  const [tested, setTested] = useState(false);
  const [noDamage, setNoDamage] = useState(false);
  const [photosTaken, setPhotosTaken] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [itemChecks, setItemChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) init[it.key] = false;
    return init;
  });

  // Step 2 + 3 state
  const [landlordName, setLandlordName] = useState('');
  const [landlordSig, setLandlordSig] = useState<string | null>(null);
  const [renterName, setRenterName] = useState(booking.customer_name ?? '');
  const [renterSig, setRenterSig] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const allItemsChecked = items.every((it) => itemChecks[it.key]);
  const canProceedFromStep1 = allItemsChecked && location.trim().length > 0 && tested && noDamage;

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

    setSaving(true);
    setSubmitError('');
    try {
      const itemsArray = items.map((it) => ({ name: it.label, ok: !!itemChecks[it.key] }));
      const res = await fetch(`/api/admin/handover/${booking.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: location.trim(),
          condition: { tested, noDamage, photosTaken, otherNote: otherNote.trim() || undefined },
          items: itemsArray,
          signatures: {
            landlord: { dataUrl: landlordSig, name: landlordName.trim() },
            renter: { dataUrl: renterSig, name: renterName.trim() },
          },
        }),
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
            items, itemChecks, setItemChecks,
            location, setLocation,
            tested, setTested, noDamage, setNoDamage, photosTaken, setPhotosTaken,
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
    </div>
  );
}

// ─── Step 1: Zustand + Items ─────────────────────────────────────────────────

function Step1(props: {
  items: { key: string; label: string; subLabel: string }[];
  itemChecks: Record<string, boolean>;
  setItemChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  location: string;
  setLocation: (v: string) => void;
  tested: boolean;
  setTested: (v: boolean) => void;
  noDamage: boolean;
  setNoDamage: (v: boolean) => void;
  photosTaken: boolean;
  setPhotosTaken: (v: boolean) => void;
  otherNote: string;
  setOtherNote: (v: string) => void;
  canProceed: boolean;
  onNext: () => void;
}) {
  const toggle = (key: string) => props.setItemChecks((prev) => ({ ...prev, [key]: !prev[key] }));
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

      {/* Item-Checkliste */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Übergebene Gegenstände *</p>
        <div className="space-y-2">
          {props.items.map((it) => (
            <label key={it.key} className="flex items-start gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={!!props.itemChecks[it.key]}
                onChange={() => toggle(it.key)}
                className="mt-0.5 w-5 h-5 accent-cyan-500"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{it.label}</div>
                <div className="text-xs text-slate-500">{it.subLabel}</div>
              </div>
            </label>
          ))}
        </div>
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
          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" checked={props.photosTaken} onChange={(e) => props.setPhotosTaken(e.target.checked)} className="w-5 h-5 accent-cyan-500" />
            <span className="text-sm">Fotos / Videos zur Dokumentation erstellt</span>
          </label>
        </div>
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
        <div className="bg-white rounded-lg overflow-hidden">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            canvasProps={{ className: 'w-full h-48' }}
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

          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Zustand</div>
            <ul className="text-sm space-y-1">
              <li>{handover.condition.tested ? '✓' : '✗'} Funktionsfähig getestet</li>
              <li>{handover.condition.noDamage ? '✓' : '✗'} Keine sichtbaren Schäden</li>
              <li>{handover.condition.photosTaken ? '✓' : '✗'} Fotos / Videos erstellt</li>
              {handover.condition.otherNote && (
                <li className="text-amber-300 mt-1">Anmerkung: {handover.condition.otherNote}</li>
              )}
            </ul>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Vermieter</div>
              <div className="font-medium text-sm mb-1">{handover.signatures.landlord.name}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={handover.signatures.landlord.dataUrl} alt="Vermieter-Signatur" className="bg-white rounded p-1 max-h-24" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Mieter</div>
              <div className="font-medium text-sm mb-1">{handover.signatures.renter.name}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={handover.signatures.renter.dataUrl} alt="Mieter-Signatur" className="bg-white rounded p-1 max-h-24" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
