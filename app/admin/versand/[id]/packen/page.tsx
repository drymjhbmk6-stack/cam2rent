'use client';

import { useEffect, useRef, useState, use, useMemo } from 'react';
import Link from 'next/link';
import SignatureCanvas from 'react-signature-canvas';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SerialScanner from '@/components/admin/SerialScanner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResolvedItem {
  id: string;
  name: string;
  qty: number;
  isFromSet?: boolean;
  setName?: string;
}

interface UnitCode {
  id: string;
  accessory_id: string;
  exemplar_code: string;
}

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
  resolved_items?: ResolvedItem[];
  unit_codes?: UnitCode[];
  pack_status?: string | null;
  pack_packed_by?: string | null;
  pack_packed_by_user_id?: string | null;
  pack_packed_at?: string | null;
  pack_packed_items?: string[] | null;
  pack_checked_by?: string | null;
  pack_checked_by_user_id?: string | null;
  pack_checked_at?: string | null;
  pack_photo_url?: string | null;
}

interface CurrentAdminUser {
  id: string;
  name: string;
  role: 'owner' | 'employee';
  isEmployeeAccount: boolean; // true wenn echter Mitarbeiter-Account (nicht legacy-env Master-Passwort)
}

interface PackItem {
  key: string;
  label: string;
  subLabel: string;
  // Fuer Scanner-Lookup: welche Codes haken dieses Item ab?
  // 'camera' nutzt Kamera-Seriennummer, 'accessory' nutzt accessory_id (loest
  // ueber unit_codes auf), 'return-label' ist nicht scanbar.
  type: 'camera' | 'accessory' | 'return-label';
  accessoryId?: string;
}

// Stueckzahl aus resolved_items expandieren — eine Zeile pro physisches Stueck
// damit jeder Akku/Karte/etc. einzeln abgehakt werden kann.
//
// Set-Container-Zeilen (z.B. "Basic Set" als Header zwischen den Sub-Items)
// werden hier rausgefiltert — die Pack-UI listet nur die tatsaechlich zu
// packenden physischen Stuecke. Erkennung: ein nicht-isFromSet-Item dessen
// name als setName eines anderen Items vorkommt.
function expandItems(b: BookingDetail): PackItem[] {
  const items = b.resolved_items ?? [];
  const usedSetNames = new Set<string>();
  for (const it of items) {
    if (it.isFromSet && it.setName) usedSetNames.add(it.setName);
  }

  const out: PackItem[] = [];
  out.push({
    key: 'camera',
    type: 'camera',
    label: b.product_name,
    subLabel: b.serial_number ? `Seriennummer: ${b.serial_number}` : 'Kamera',
  });
  for (const it of items) {
    // Set-Container ueberspringen
    if (!it.isFromSet && usedSetNames.has(it.name)) continue;
    for (let i = 0; i < it.qty; i++) {
      out.push({
        key: `${it.id}::${i}`,
        type: 'accessory',
        accessoryId: it.id,
        label: it.name,
        subLabel: it.isFromSet && it.setName ? `Im Set: ${it.setName}` : 'Zubehör',
      });
    }
  }
  out.push({
    key: 'return-label',
    type: 'return-label',
    label: 'Rücksendeetikett beilegen',
    subLabel: 'DHL / DPD / etc.',
  });
  return out;
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

  const items = expandItems(booking);
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
          <div>{booking.rental_from} – {booking.rental_to}</div>
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
  const [name, setName] = useState('');
  const [namePrefilled, setNamePrefilled] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string } | null>(null);
  // itemKey → Substitution. Wenn der Packer ein anderes Exemplar gleicher
  // Kategorie scannt (Akku B statt Akku A), persistieren wir den Tausch beim
  // Pack-Submit in bookings.unit_id / accessory_unit_ids.
  const [substitutions, setSubstitutions] = useState<Record<string, {
    kind: 'camera' | 'accessory';
    newUnitId: string;
    newCode: string;
  }>>({});

  const scanLookup = useMemo(() => buildScanLookup(booking), [booking]);

  async function handleScan(code: string) {
    const result = await applyScan(code, booking.id, items, checked, scanLookup, substitutions);
    if (result.ok && result.key) {
      setChecked((p) => ({ ...p, [result.key!]: true }));
      if (result.substitution) {
        const sub = result.substitution;
        setSubstitutions((p) => ({
          ...p,
          [sub.itemKey]: { kind: sub.kind, newUnitId: sub.newUnitId, newCode: sub.newCode },
        }));
      }
      setScanFeedback({ type: 'ok', msg: result.message });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    setScannerOpen(false);
    window.setTimeout(() => setScanFeedback(null), 3500);
  }

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
      const subPayload = Object.entries(substitutions).map(([itemKey, s]) => ({
        itemKey,
        kind: s.kind,
        newUnitId: s.newUnitId,
      }));
      const res = await fetch(`/api/admin/versand/${booking.id}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packedBy: name.trim(),
          packedItems: items.filter((it) => checked[it.key]).map((it) => it.key),
          condition: { tested, noVisibleDamage: noVisible, note: note.trim() || undefined },
          signatureDataUrl: sig,
          substitutions: subPayload,
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
        scannableCount={scanLookup.scannableCount}
        checkedScannable={Object.keys(checked).filter((k) => checked[k] && items.find((i) => i.key === k)?.type !== 'return-label').length}
      />

      <ItemList
        items={items}
        checked={checked}
        onToggle={(k) => setChecked((p) => ({ ...p, [k]: !p[k] }))}
        substitutions={substitutions}
      />

      <SerialScanner
        open={scannerOpen}
        onResult={handleScan}
        onClose={() => setScannerOpen(false)}
        title="Item scannen"
      />

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
  const sigRef = useRef<SignatureCanvas>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string } | null>(null);

  const scanLookup = useMemo(() => buildScanLookup(booking), [booking]);

  async function handleScan(code: string) {
    // CheckStep: keine Substitution mehr — Codes sind durch Step 1 gesetzt.
    const result = await applyScan(code, booking.id, items, checked, scanLookup, {}, false);
    if (result.ok && result.key) {
      setChecked((p) => ({ ...p, [result.key!]: true }));
      setScanFeedback({ type: 'ok', msg: result.message });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    setScannerOpen(false);
    window.setTimeout(() => setScanFeedback(null), 3500);
  }

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
        scannableCount={scanLookup.scannableCount}
        checkedScannable={Object.keys(checked).filter((k) => checked[k] && items.find((i) => i.key === k)?.type !== 'return-label').length}
      />

      <ItemList items={items} checked={checked} onToggle={(k) => setChecked((p) => ({ ...p, [k]: !p[k] }))} />

      <SerialScanner
        open={scannerOpen}
        onResult={handleScan}
        onClose={() => setScannerOpen(false)}
        title="Item scannen"
      />

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
  const pdfUrl = `/api/packlist/${booking.id}`;
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
          target="_blank"
          rel="noopener noreferrer"
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

// ─── Item-Liste mit Checkboxen ───────────────────────────────────────────────

function ItemList({
  items, checked, onToggle, substitutions,
}: {
  items: PackItem[];
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  substitutions?: Record<string, { newCode: string }>;
}) {
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800">
      {items.map((it) => {
        const sub = substitutions?.[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors ${
              checked[it.key] ? 'bg-emerald-500/5' : ''
            }`}
          >
            <div className={`mt-0.5 w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              checked[it.key] ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-600'
            }`}>
              {checked[it.key] && <span className="font-bold">✓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold ${checked[it.key] ? 'text-emerald-300' : 'text-slate-100'}`}>
                {it.label}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{it.subLabel}</div>
              {sub && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">
                  ↻ Anderes Exemplar gepackt: <span className="font-mono">{sub.newCode}</span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
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

// ─── Scanner-Helpers ─────────────────────────────────────────────────────────

interface ScanLookup {
  cameraSerial: string | null;
  // exemplar_code → accessory_id
  codeToAccessory: Map<string, string>;
  scannableCount: number;
}

function buildScanLookup(b: BookingDetail): ScanLookup {
  const codeMap = new Map<string, string>();
  for (const u of b.unit_codes ?? []) {
    if (u.exemplar_code) codeMap.set(normalizeCode(u.exemplar_code), u.accessory_id);
  }
  return {
    cameraSerial: b.serial_number ? normalizeCode(b.serial_number) : null,
    codeToAccessory: codeMap,
    scannableCount: (b.serial_number ? 1 : 0) + codeMap.size,
  };
}

function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

interface ScanResult {
  ok: boolean;
  alreadyChecked?: boolean;
  key?: string;
  message: string;
  // Substitution: anderer Code derselben Kategorie wurde akzeptiert.
  // Beim Pack-Submit wird die Buchungs-Zuordnung in der DB ausgetauscht.
  substitution?: {
    itemKey: string;
    kind: 'camera' | 'accessory';
    newUnitId: string;
    newCode: string;
    oldUnitId: string | null;
  };
}

interface ServerScanLookup {
  kind: 'camera' | 'accessory' | 'unknown';
  productId?: string;
  productName?: string;
  accessoryId?: string;
  accessoryName?: string;
  unitId?: string;
  serialNumber?: string;
  exemplarCode?: string;
  matchesBooking?: boolean;
  conflict?: { bookingId: string; customerName: string | null } | null;
}

/**
 * Scan-Auswertung:
 *  1) Erst lokal gegen die zur Buchung reservierten Codes pruefen (schneller
 *     Pfad, kein API-Call) — Standardfall.
 *  2) Wenn der Code lokal nicht matcht, fragt die UI die scan-lookup-API:
 *     - Gehoert er zu einer Kamera/Zubehoer derselben Kategorie wie ein
 *       Buchungs-Slot? → Substitution erlaubt, Buchung wird beim Submit
 *       umgeschrieben.
 *     - Gehoert er zu einer anderen Kategorie? → Klartext-Fehler mit Namen.
 *     - Lockt er gerade in einer anderen aktiven Buchung? → hart blockiert.
 *     - Komplett unbekannt? → "Code unbekannt".
 */
async function applyScan(
  rawCode: string,
  bookingId: string,
  items: PackItem[],
  checked: Record<string, boolean>,
  lookup: ScanLookup,
  substitutions: Record<string, { newUnitId: string }>,
  allowSubstitution: boolean = true,
): Promise<ScanResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, message: 'Leerer Code.' };

  // ── Schritt 1: lokaler Match auf den reservierten Codes ──────────────────
  if (lookup.cameraSerial && lookup.cameraSerial === code) {
    if (checked['camera']) {
      return { ok: false, alreadyChecked: true, message: `Kamera (${rawCode}) schon abgehakt.` };
    }
    return { ok: true, key: 'camera', message: `✓ Kamera (${rawCode})` };
  }

  const accId = lookup.codeToAccessory.get(code);
  if (accId) {
    const slots = items.filter((it) => it.type === 'accessory' && it.accessoryId === accId);
    const free = slots.find((it) => !checked[it.key]);
    if (!free) {
      return { ok: false, alreadyChecked: true, message: `Alle ${slots[0]?.label ?? 'Slots'} schon abgehakt.` };
    }
    return { ok: true, key: free.key, message: `✓ ${free.label}` };
  }

  // ── Schritt 2: Server-Lookup fuer Substitution / Klartext-Fehler ─────────
  let info: ServerScanLookup;
  try {
    const res = await fetch('/api/admin/scan-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, bookingId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = await res.json();
  } catch {
    return { ok: false, message: `Code ${rawCode} unbekannt.` };
  }

  if (info.kind === 'unknown') {
    return { ok: false, message: `Code ${rawCode} ist im System nicht hinterlegt.` };
  }

  // Eine Substitution wurde gerade auf dieses Exemplar gemacht? Doppelt-Scan.
  if (info.unitId && Object.values(substitutions).some((s) => s.newUnitId === info.unitId)) {
    return { ok: false, alreadyChecked: true, message: `Code ${rawCode} schon abgehakt (Substitution).` };
  }

  // Konflikt: gerade in einer anderen aktiven Buchung
  if (info.conflict) {
    const cust = info.conflict.customerName ? ` (${info.conflict.customerName})` : '';
    const itemLabel = info.kind === 'camera' ? info.productName ?? 'Kamera' : info.accessoryName ?? 'Zubehör';
    return {
      ok: false,
      message: `${itemLabel} (${rawCode}) ist bereits Buchung ${info.conflict.bookingId}${cust} zugeordnet.`,
    };
  }

  if (info.kind === 'camera') {
    if (!info.matchesBooking) {
      return { ok: false, message: `Kamera „${info.productName ?? rawCode}" wird nicht benötigt.` };
    }
    if (!allowSubstitution) {
      return { ok: false, message: `Diese Kamera wurde nicht ins Paket gelegt — bitte gegen die gepackte Seriennummer pruefen.` };
    }
    if (checked['camera']) {
      return { ok: false, alreadyChecked: true, message: `Kamera schon abgehakt.` };
    }
    // Substitution akzeptieren
    return {
      ok: true,
      key: 'camera',
      message: `✓ Kamera ersetzt: ${info.serialNumber ?? rawCode}`,
      substitution: {
        itemKey: 'camera',
        kind: 'camera',
        newUnitId: info.unitId!,
        newCode: info.serialNumber ?? rawCode,
        oldUnitId: null, // wird im Pack-API-Update ueber bookings.unit_id ausgelesen
      },
    };
  }

  // info.kind === 'accessory'
  if (!info.matchesBooking) {
    return { ok: false, message: `Zubehör „${info.accessoryName ?? rawCode}" wird nicht benötigt.` };
  }
  if (!allowSubstitution) {
    return { ok: false, message: `Dieses „${info.accessoryName}" wurde nicht ins Paket gelegt — bitte gegen den gepackten Code pruefen.` };
  }
  const slots = items.filter((it) => it.type === 'accessory' && it.accessoryId === info.accessoryId);
  const free = slots.find((it) => !checked[it.key]);
  if (!free) {
    return { ok: false, alreadyChecked: true, message: `Alle „${info.accessoryName}" schon abgehakt.` };
  }
  // Alte unit-id fuer den Tausch: erste reservierte unit dieser accessory_id,
  // die noch nicht durch eine Substitution ueberschrieben wurde — wird vom
  // Server-Pack-Endpoint ueber das Substitutions-Mapping korrekt
  // herausgerechnet.
  return {
    ok: true,
    key: free.key,
    message: `✓ ${free.label} ersetzt: ${info.exemplarCode ?? rawCode}`,
    substitution: {
      itemKey: free.key,
      kind: 'accessory',
      newUnitId: info.unitId!,
      newCode: info.exemplarCode ?? rawCode,
      oldUnitId: null,
    },
  };
}

function ScannerBar({
  onOpen, feedback, scannableCount, checkedScannable,
}: {
  onOpen: () => void;
  feedback: { type: 'ok' | 'warn' | 'err'; msg: string } | null;
  scannableCount: number;
  checkedScannable: number;
}) {
  if (scannableCount === 0) return null;
  const fbColor = feedback?.type === 'ok'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
    : feedback?.type === 'warn'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-red-500/15 border-red-500/40 text-red-300';
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3 text-cyan-300">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>
          </svg>
          <div className="text-left">
            <div className="font-semibold text-sm">Scanner öffnen</div>
            <div className="text-xs text-cyan-400/80">Item-Code scannen → wird automatisch abgehakt</div>
          </div>
        </div>
        <div className="text-xs text-cyan-300/80 tabular-nums">
          {checkedScannable}/{scannableCount}
        </div>
      </button>
      {feedback && (
        <div className={`mt-2 px-3 py-2 rounded-lg border text-sm ${fbColor}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
