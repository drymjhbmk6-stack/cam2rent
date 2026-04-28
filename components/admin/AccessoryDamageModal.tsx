'use client';

import { useCallback, useEffect, useState } from 'react';

interface UnitDetail {
  id: string;
  accessory_id: string;
  accessory_name: string;
  exemplar_code: string;
  status: string;
  current_value: number;
  replacement_value: number;
  suggested_wbw: number;
  asset_id: string | null;
}

interface BookingDetail {
  id: string;
  deposit: number;
  deposit_intent_id: string | null;
  deposit_status: string | null;
}

type UnitChoice = 'available' | 'damaged' | 'lost';

interface UnitDraft {
  choice: UnitChoice;
  retainedAmount: string; // numeric string with comma support
  notes: string;
  photos: File[];
}

interface Props {
  bookingId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

const fmtEuro = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

export default function AccessoryDamageModal({ bookingId, open, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [units, setUnits] = useState<UnitDetail[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UnitDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/booking/${encodeURIComponent(bookingId)}/accessory-units-detail`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Laden');
      setBooking(json.booking);
      const us: UnitDetail[] = json.units ?? [];
      setUnits(us);
      const initial: Record<string, UnitDraft> = {};
      for (const u of us) {
        initial[u.id] = {
          choice: 'available',
          retainedAmount: u.suggested_wbw > 0 ? u.suggested_wbw.toFixed(2).replace('.', ',') : '',
          notes: '',
          photos: [],
        };
      }
      setDrafts(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  function setChoice(unitId: string, choice: UnitChoice) {
    setDrafts((d) => ({ ...d, [unitId]: { ...d[unitId], choice } }));
  }

  function setField<K extends keyof UnitDraft>(unitId: string, key: K, value: UnitDraft[K]) {
    setDrafts((d) => ({ ...d, [unitId]: { ...d[unitId], [key]: value } }));
  }

  // Sum + Validation
  const affected = units.filter((u) => drafts[u.id]?.choice && drafts[u.id].choice !== 'available');
  const totalRetained = affected.reduce((s, u) => {
    const raw = drafts[u.id]?.retainedAmount ?? '';
    const num = parseFloat(raw.replace(',', '.'));
    return s + (isFinite(num) && num > 0 ? num : 0);
  }, 0);
  const deposit = booking?.deposit ?? 0;
  const overshoot = totalRetained > deposit + 0.005;
  const hasStripe = !!(booking?.deposit_intent_id && booking?.deposit_status === 'held');

  async function handleSubmit() {
    setError(null);

    // Client-Validierung
    if (affected.length === 0) {
      setError('Mindestens ein Exemplar als beschädigt oder verloren markieren.');
      return;
    }
    for (const u of affected) {
      const d = drafts[u.id];
      const num = parseFloat(d.retainedAmount.replace(',', '.'));
      if (!isFinite(num) || num <= 0) {
        setError(`Wiederbeschaffungswert für ${u.exemplar_code} fehlt oder ist ungültig.`);
        return;
      }
      if (!d.notes.trim()) {
        setError(`Notiz für ${u.exemplar_code} ist Pflicht.`);
        return;
      }
      if (d.photos.length === 0) {
        setError(`Mindestens 1 Foto pro Exemplar erforderlich (${u.exemplar_code}).`);
        return;
      }
    }
    if (overshoot) {
      setError(`Summe (${fmtEuro(totalRetained)}) übersteigt die Kaution (${fmtEuro(deposit)}).`);
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('bookingId', bookingId);
      const unitsPayload = affected.map((u) => {
        const d = drafts[u.id];
        return {
          accessory_unit_id: u.id,
          condition: d.choice,
          retained_amount: parseFloat(d.retainedAmount.replace(',', '.')),
          notes: d.notes.trim(),
        };
      });
      fd.append('units_json', JSON.stringify(unitsPayload));
      for (const u of affected) {
        const d = drafts[u.id];
        for (const photo of d.photos) {
          fd.append(`photos_${u.id}`, photo);
        }
      }

      const res = await fetch('/api/admin/accessory-damage', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Schadensmeldung fehlgeschlagen');

      onSuccess?.(json.message ?? 'Schaden dokumentiert.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-brand-border dark:border-slate-700">
          <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white">
            Zubehör-Schaden melden — Buchung {bookingId}
          </h3>
          <p className="text-xs font-body text-brand-muted mt-1">
            Pro Exemplar: Status, Wiederbeschaffungswert, Foto und kurze Notiz. Summe wird aus der Stripe-Kaution
            (Pre-Auth) einbehalten — der Rest wird automatisch freigegeben.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-sm text-brand-muted py-8 text-center">Lade Exemplare…</p>
          ) : units.length === 0 ? (
            <p className="text-sm text-brand-muted py-4 text-center">
              Keine Zubehör-Exemplare an dieser Buchung. Wenn die Buchung vor Phase 2B angelegt wurde, gibt es keine
              individuelle Exemplar-Zuweisung — nutze den klassischen Schadensbericht über{' '}
              <a className="text-accent-blue underline" href="/admin/schaeden">
                /admin/schaeden
              </a>
              .
            </p>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm font-body text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {units.map((u) => {
                  const d = drafts[u.id];
                  if (!d) return null;
                  const isAffected = d.choice !== 'available';

                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl border p-4 ${
                        isAffected
                          ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20'
                          : 'border-brand-border dark:border-slate-700 bg-brand-bg dark:bg-slate-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                        <div>
                          <div className="font-heading font-bold text-sm text-brand-black dark:text-white">
                            {u.accessory_name}
                          </div>
                          <div className="font-mono text-xs text-brand-muted">{u.exemplar_code}</div>
                        </div>
                        <div className="flex gap-2">
                          {(['available', 'damaged', 'lost'] as UnitChoice[]).map((c) => (
                            <button
                              key={c}
                              onClick={() => setChoice(u.id, c)}
                              className={`px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors ${
                                d.choice === c
                                  ? c === 'available'
                                    ? 'bg-emerald-600 text-white'
                                    : c === 'damaged'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-red-600 text-white'
                                  : 'bg-white dark:bg-slate-700 text-brand-muted border border-brand-border dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600'
                              }`}
                            >
                              {c === 'available' ? 'OK' : c === 'damaged' ? 'beschädigt' : 'verloren'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isAffected && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">
                                Wiederbeschaffungswert (€)
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={d.retainedAmount}
                                onChange={(e) => setField(u.id, 'retainedAmount', e.target.value)}
                                placeholder="z.B. 39,99"
                                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                              />
                              <div className="text-[10px] font-body text-brand-muted mt-1">
                                Vorschlag: {fmtEuro(u.suggested_wbw)} ·{' '}
                                {u.current_value > 0 ? `Zeitwert ${fmtEuro(u.current_value)}` : 'kein Asset hinterlegt'}
                                {u.replacement_value > 0 && ` · Pauschal ${fmtEuro(u.replacement_value)}`}
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">
                                Foto (Pflicht, max 5)
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => setField(u.id, 'photos', Array.from(e.target.files ?? []).slice(0, 5))}
                                className="w-full text-xs font-body file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-brand-border file:bg-white file:text-brand-black file:cursor-pointer"
                              />
                              {d.photos.length > 0 && (
                                <div className="text-[10px] font-body text-brand-muted mt-1">
                                  {d.photos.length} Foto{d.photos.length === 1 ? '' : 's'} ausgewählt
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">
                              Notiz (Pflicht — was ist passiert?)
                            </label>
                            <textarea
                              value={d.notes}
                              onChange={(e) => setField(u.id, 'notes', e.target.value)}
                              rows={2}
                              placeholder="z.B. Akku quillt auf, eingerissene Hülle, ausgelaufen..."
                              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue resize-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-brand-border dark:border-slate-700 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm font-body">
                  <div className="text-brand-muted">Gehaltene Kaution (Pre-Auth)</div>
                  <div className="text-right font-heading font-semibold text-brand-black dark:text-white">
                    {fmtEuro(deposit)}
                  </div>
                  <div className="text-brand-muted">Einbehalten</div>
                  <div className={`text-right font-heading font-semibold ${overshoot ? 'text-red-600' : 'text-rose-600'}`}>
                    {fmtEuro(totalRetained)}
                  </div>
                  <div className="text-brand-muted">Wird freigegeben</div>
                  <div className="text-right font-heading font-semibold text-emerald-600">
                    {fmtEuro(Math.max(0, deposit - totalRetained))}
                  </div>
                </div>
                {!hasStripe && totalRetained > 0 && (
                  <div className="mt-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs font-body text-amber-800">
                    Hinweis: Diese Buchung hat keinen aktiven Stripe-Pre-Auth-Hold. Die Schadensmeldung wird gespeichert,
                    aber die Kaution muss separat geklärt werden.
                  </div>
                )}
                {overshoot && (
                  <div className="mt-3 p-2 rounded-lg bg-red-50 border border-red-200 text-xs font-body text-red-700">
                    Summe übersteigt die Kaution. Bitte Beträge anpassen.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-brand-border dark:border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border dark:border-slate-600 rounded-btn hover:bg-brand-bg dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || loading || affected.length === 0 || overshoot}
            className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-40"
          >
            {busy ? 'Wird verarbeitet…' : `Bestätigen & ${fmtEuro(totalRetained)} einbehalten`}
          </button>
        </div>
      </div>
    </div>
  );
}
