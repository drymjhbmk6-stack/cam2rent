'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@/components/admin/scan-workflow';
import { fmtDate } from '@/lib/format-utils';

interface BookingDetail {
  id: string;
  product_name: string;
  product_id?: string;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string;
  rental_to: string;
  status?: string;
  serial_number?: string | null;
  unit_id?: string | null;
  resolved_items?: ResolvedItem[];
  unit_codes?: UnitCode[];
}

function bookingToScanInput(b: BookingDetail) {
  return {
    productName: b.product_name,
    serialNumber: b.serial_number ?? null,
    resolvedItems: b.resolved_items,
    unitCodes: b.unit_codes,
    unitId: b.unit_id ?? null,
    // In der Retoure ist das Rücksendeetikett kein Punkt mehr — der Kunde hat
    // es schon benutzt.
    skipReturnLabel: true,
  };
}

const CONDITION_OPTIONS = [
  { value: 'gut' as const, label: 'Gut', color: '#10b981' },
  { value: 'gebrauchsspuren' as const, label: 'Gebrauchsspuren', color: '#f59e0b' },
  { value: 'beschaedigt' as const, label: 'Beschädigt', color: '#ef4444' },
];

export default function RetourenPruefenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Scan-Workflow-State
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string } | null>(null);

  // Retouren-spezifische Felder
  const [condition, setCondition] = useState<'gut' | 'gebrauchsspuren' | 'beschaedigt'>('gut');
  const [noVisibleDamage, setNoVisibleDamage] = useState(false);
  const [cardReset, setCardReset] = useState(false);
  const [batteryCharged, setBatteryCharged] = useState(false);
  const [damageDesc, setDamageDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/admin/booking/${id}`)
      .then((r) => r.json())
      .then(({ booking: b, error: e }) => {
        if (e || !b) { setError('Buchung nicht gefunden.'); return; }
        setBooking(b);
      })
      .catch(() => setError('Fehler beim Laden.'))
      .finally(() => setLoading(false));
  }, [id]);

  const items = useMemo(() => booking ? expandItems(bookingToScanInput(booking)) : [], [booking]);
  const groups = useMemo(() => groupItems(items), [items]);
  const scanLookup = useMemo(
    () => booking ? buildScanLookup(bookingToScanInput(booking)) : null,
    [booking],
  );

  const totalItems = items.filter((it) => it.type !== 'return-label').length;
  const checkedItems = items.filter((it) => it.type !== 'return-label' && checked[it.key]).length;
  const allChecked = totalItems > 0 && checkedItems === totalItems;

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
    if (!booking || !scanLookup) return;
    // Retoure: keine Substitution — die Codes wurden in der Pack-Phase
    // festgelegt und stehen in der Buchung.
    const result = await applyScan(code, booking.id, items, checked, scanLookup, new Set(), false);
    if (result.ok && result.key) {
      setChecked((p) => ({ ...p, [result.key!]: true }));
      setScanFeedback({ type: 'ok', msg: result.message });
    } else if (result.alreadyChecked) {
      setScanFeedback({ type: 'warn', msg: result.message });
    } else {
      setScanFeedback({ type: 'err', msg: result.message });
    }
    window.setTimeout(() => setScanFeedback(null), 3500);
  }

  // Auto-Close wenn alle Items abgehakt sind.
  useEffect(() => {
    if (!scannerOpen) return;
    if (totalItems > 0 && checkedItems >= totalItems) {
      const t = window.setTimeout(() => setScannerOpen(false), 800);
      return () => window.clearTimeout(t);
    }
  }, [scannerOpen, checkedItems, totalItems]);

  const canSubmit = !!booking && allChecked && !submitting
    && (condition !== 'beschaedigt' || damageDesc.trim().length > 0);

  async function submit() {
    if (!canSubmit || !booking) return;
    setSubmitting(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/return-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          condition,
          notes: notes.trim() || undefined,
          checklist: {
            kameraVollstaendig: !!checked['camera'],
            zubehoerVollstaendig: items
              .filter((it) => it.type === 'accessory')
              .every((it) => checked[it.key]),
            keineSichtbarenSchaeden: noVisibleDamage,
            speicherkarteZurueckgesetzt: cardReset,
            akkuGeladen: batteryCharged,
          },
          checkedItems: items.filter((it) => checked[it.key]).map((it) => it.key),
          createDamageReport: condition === 'beschaedigt',
          damageDescription: condition === 'beschaedigt' ? damageDesc.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Fehler beim Speichern.');
      }
      router.push('/admin/retouren');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Lädt…</div>;
  if (error || !booking) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <AdminBackLink href="/admin/retouren" label="Zurück zur Retouren-Übersicht" />

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">Rückgabe prüfen</h1>
          <p className="text-sm text-slate-400 mt-1">
            Buchung <span className="font-mono">{booking.id}</span> · {booking.customer_name ?? 'Unbekannt'}
          </p>
        </div>

        {/* Bestellinfo */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Mietzeitraum</div>
              <div>{fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Kamera</div>
              <div>{booking.product_name}</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-lg font-bold mb-1 text-slate-100">Vollständigkeit prüfen</h2>
          <p className="text-sm text-slate-400 mb-4">
            Hake jedes Item ab oder scanne den Code. Nur eine Person notwendig.
          </p>

          <ScannerBar
            onOpen={() => setScannerOpen(true)}
            feedback={scanFeedback}
            totalCount={totalItems}
            checkedCount={checkedItems}
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
            title={`Rückgabe-Liste · ${checkedItems}/${totalItems}`}
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
        </div>

        {/* Zusatz-Pruefungen */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
            Zustand der Geräte
          </h2>
          <div className="space-y-2">
            <Check label="Keine sichtbaren Schäden" checked={noVisibleDamage} onChange={setNoVisibleDamage} />
            <Check label="Speicherkarte zurückgesetzt" checked={cardReset} onChange={setCardReset} />
            <Check label="Akku geladen" checked={batteryCharged} onChange={setBatteryCharged} />
          </div>
        </div>

        {/* Gesamtzustand */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
            Gesamtzustand
          </h2>
          <div className="flex gap-2">
            {CONDITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCondition(opt.value)}
                className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition-colors"
                style={{
                  borderColor: condition === opt.value ? opt.color : '#1e293b',
                  background: condition === opt.value ? `${opt.color}22` : 'transparent',
                  color: condition === opt.value ? opt.color : '#94a3b8',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {condition === 'beschaedigt' && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <label className="block text-xs font-semibold text-red-400 mb-2">
                Schadensbeschreibung (Pflicht)
              </label>
              <textarea
                value={damageDesc}
                onChange={(e) => setDamageDesc(e.target.value)}
                rows={3}
                placeholder="Was ist beschädigt? Wo am Gerät?"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none resize-none focus:border-red-500"
              />
              <p className="text-xs text-red-400 mt-2">
                Es wird automatisch eine Schadensmeldung erstellt.
              </p>
            </div>
          )}
        </div>

        {/* Notizen */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 mb-6">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Notizen (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Interne Notizen zur Rückgabe..."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none resize-none"
          />
        </div>

        {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
        {!allChecked && (
          <p className="text-xs text-amber-400 mb-3">⚠ Bitte alle Items abhaken bevor du die Rückgabe abschliessen kannst.</p>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 disabled:text-slate-500 font-bold py-3 rounded-lg transition-colors"
        >
          {submitting ? 'Wird gespeichert…'
            : condition === 'beschaedigt' ? 'Rückgabe + Schaden melden'
            : 'Rückgabe abschliessen'}
        </button>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-emerald-500"
      />
      <span className="text-sm text-slate-200">{label}</span>
    </label>
  );
}
