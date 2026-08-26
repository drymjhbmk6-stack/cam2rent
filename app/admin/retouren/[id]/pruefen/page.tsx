'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SerialScanner from '@/components/admin/SerialScanner';
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
  type GroupedItem,
} from '@/components/admin/scan-workflow';
import { fmtDate, fmtEuro } from '@/lib/format-utils';
import type { OpenItemResolution } from '@/lib/return-open-items';

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
  cameras_resolved?: { product_name: string; serial_number: string | null; unit_id: string | null; product_id?: string | null }[];
  resolved_items?: ResolvedItem[];
  unit_codes?: UnitCode[];
  liability_summary?: LiabilitySummary;
}

/** Wiederbeschaffungswert-Zeile aus `GET /api/admin/booking/[id]`. */
interface LiabilityLine {
  name: string;
  qty: number;
  unit_value: number;
  total_value: number;
  accessory_id?: string | null;
  product_id?: string | null;
}

interface LiabilitySummary {
  cameras?: LiabilityLine[];
  accessories?: LiabilityLine[];
  customer_max_liability?: number;
  customer_max_label?: string;
  customer_max_note?: string;
}

/** Auflösung einer nicht zurückgegebenen Position (lokaler UI-State). */
interface OpenResolution {
  resolution: OpenItemResolution;
  qty: number;
  /** Wiederbeschaffungswert pro Stück (nur bei 'replace'). */
  unitValue: number;
  /** Frist YYYY-MM-DD (nur bei 'follow_up'). */
  dueDate: string;
}

/** Heute + N Tage als YYYY-MM-DD (Berlin-nah, reicht für eine Vorbelegung). */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function bookingToScanInput(b: BookingDetail) {
  return {
    productName: b.product_name,
    serialNumber: b.serial_number ?? null,
    resolvedItems: b.resolved_items,
    unitCodes: b.unit_codes,
    unitId: b.unit_id ?? null,
    // Multi-Kamera / Kamera-Einheit aus der neuen Inventar-Welt: gleiche
    // Auflösung wie Pack-/Übergabe-Scanner. Ohne das Feld fällt der Lookup auf
    // b.unit_id (nur Kamera 0) zurück — der Retoure-Scan würde dann mit
    // „passt nicht zu dieser Buchung" abbrechen, weil hier keine Substitution
    // erlaubt ist.
    cameras: Array.isArray(b.cameras_resolved) && b.cameras_resolved.length > 0
      ? b.cameras_resolved.map((c) => ({
          product_name: c.product_name,
          serial_number: c.serial_number,
          unit_id: c.unit_id,
        }))
      : undefined,
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

  // Nicht zurückgegebene Positionen: pro Gruppe eine Auflösung.
  const [openResolutions, setOpenResolutions] = useState<Record<string, OpenResolution>>({});
  const [chargeReplacement, setChargeReplacement] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

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

  // Wiederbeschaffungswert je Gruppe. Zubehör matcht über die accessory_id
  // (= groupKey in groupItems), Kameras über den normalisierten Modellnamen
  // (groupKey ist dort `camera::<label lowercase>`).
  const wbwByGroupKey = useMemo(() => {
    const m = new Map<string, number>();
    const ls = booking?.liability_summary;
    for (const line of ls?.accessories ?? []) {
      if (line.accessory_id) m.set(line.accessory_id, Number(line.unit_value) || 0);
    }
    for (const line of ls?.cameras ?? []) {
      m.set(`camera::${(line.name ?? '').trim().toLowerCase()}`, Number(line.unit_value) || 0);
    }
    return m;
  }, [booking]);

  // Gruppen mit noch offenen Slots (ohne das Rücksendeetikett).
  const missingGroups = useMemo(
    () => groups
      .filter((g) => g.type !== 'return-label')
      .map((g) => ({ g, missing: g.slotKeys.length - g.slotKeys.filter((k) => checked[k]).length }))
      .filter((x) => x.missing > 0),
    [groups, checked],
  );

  // Jede offene Position braucht eine Auflösung, die die volle Fehlmenge deckt.
  const allSlotsAccountedFor = totalItems > 0 && missingGroups.every(
    ({ g, missing }) => (openResolutions[g.groupKey]?.qty ?? 0) >= missing,
  );

  const replacementTotal = missingGroups.reduce((sum, { g }) => {
    const r = openResolutions[g.groupKey];
    return r?.resolution === 'replace' ? sum + r.unitValue * r.qty : sum;
  }, 0);

  const openCount = missingGroups.reduce((n, { missing }) => n + missing, 0);
  const hasReplace = missingGroups.some(({ g }) => openResolutions[g.groupKey]?.resolution === 'replace');
  const hasFollowUp = missingGroups.some(({ g }) => openResolutions[g.groupKey]?.resolution === 'follow_up');
  const hasCustomerEmail = !!booking?.customer_email;

  function setResolution(groupKey: string, resolution: OpenItemResolution, missing: number) {
    setOpenResolutions((prev) => {
      // Erneuter Klick auf die aktive Option hebt die Auswahl wieder auf.
      if (prev[groupKey]?.resolution === resolution) {
        const rest = { ...prev };
        delete rest[groupKey];
        return rest;
      }
      return {
        ...prev,
        [groupKey]: {
          resolution,
          qty: prev[groupKey]?.qty ?? missing,
          unitValue: prev[groupKey]?.unitValue ?? (wbwByGroupKey.get(groupKey) ?? 0),
          dueDate: prev[groupKey]?.dueDate ?? isoInDays(14),
        },
      };
    });
  }

  function patchResolution(groupKey: string, patch: Partial<OpenResolution>) {
    setOpenResolutions((prev) => (prev[groupKey] ? { ...prev, [groupKey]: { ...prev[groupKey], ...patch } } : prev));
  }

  // Eine Position, die als abgehakt nachgetragen wird, verliert ihre Auflösung
  // nicht automatisch — die Menge wird beim Absenden ohnehin auf die echte
  // Fehlmenge gedeckelt (siehe buildOpenItems).
  function buildOpenItems() {
    return missingGroups.flatMap(({ g, missing }) => {
      const r = openResolutions[g.groupKey];
      if (!r) return [];
      const isCamera = g.type === 'camera';
      return [{
        kind: isCamera ? ('camera' as const) : ('accessory' as const),
        accessoryId: isCamera ? undefined : g.groupKey,
        productId: isCamera ? (booking?.product_id ?? undefined) : undefined,
        label: g.label,
        qty: Math.min(r.qty, missing),
        resolution: r.resolution,
        unitValue: r.resolution === 'replace' ? r.unitValue : undefined,
        dueDate: r.resolution === 'follow_up' ? r.dueDate : undefined,
      }];
    });
  }

  // Ref spiegelt checked-State synchron — handleScan wird im continuous-
  // Scanner-Modus aus einer eingefrorenen Closure aufgerufen und sieht
  // sonst veraltete Werte.
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
    if (!booking || !scanLookup) return;
    // Retoure: keine Substitution — die Codes wurden in der Pack-Phase
    // festgelegt und stehen in der Buchung.
    const result = await applyScan(code, booking.id, items, checkedRef.current, scanLookup, new Set(), false);
    if (result.ok && result.key) {
      setChecked((p) => {
        const next = applyScanResult(result, items, p);
        checkedRef.current = next;
        return next;
      });
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

  // Abschluss ist moeglich, sobald JEDE Position entweder abgehakt ODER als
  // "nicht zurueckgegeben" aufgeloest ist. Vorher war das hart auf `allChecked`
  // gegated — bei fehlendem Zubehoer kam der Admin gar nicht weiter und die
  // Kamera blieb im Kalender blockiert.
  const canSubmit = !!booking && allSlotsAccountedFor && !submitting
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
          openItems: buildOpenItems(),
          chargeReplacement: chargeReplacement && hasCustomerEmail,
          notifyCustomer: notifyCustomer && hasCustomerEmail,
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

  if (loading) return <div className="p-8 text-center text-[var(--admin-text-dim)]">Lädt…</div>;
  if (error || !booking) return <div className="p-8 text-center text-[var(--admin-danger)]">{error}</div>;

  return (
    <div className="text-admin-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <AdminBackLink href="/admin/retouren" label="Zurück zur Retouren-Übersicht" />

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold text-admin-heading">Rückgabe prüfen</h1>
          <p className="text-sm text-admin-muted mt-1">
            Buchung <span className="font-mono">{booking.id}</span> · {booking.customer_name ?? 'Unbekannt'}
          </p>
        </div>

        {/* Bestellinfo */}
        <div className="bg-admin-surface border border-admin-border rounded-xl p-4 mb-6 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[var(--admin-text-dim)] text-xs uppercase tracking-wider mb-0.5">Mietzeitraum</div>
              <div>{fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}</div>
            </div>
            <div>
              <div className="text-[var(--admin-text-dim)] text-xs uppercase tracking-wider mb-0.5">Kamera</div>
              <div>{booking.product_name}</div>
            </div>
          </div>
        </div>

        <div className="bg-admin-surface border border-admin-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-lg font-bold mb-1 text-admin-heading">Vollständigkeit prüfen</h2>
          <p className="text-sm text-admin-muted mb-4">
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

        {/* Nicht zurueckgegebene Positionen — Ersatz oder Nachsendung */}
        {missingGroups.length > 0 && (
          <div className="bg-admin-surface border-2 border-amber-500/40 rounded-xl p-5 sm:p-6 mb-6">
            <h2 className="text-lg font-bold mb-1 text-amber-300">
              Nicht zurückgegeben ({openCount})
            </h2>
            <p className="text-sm text-admin-muted mb-4">
              Entscheide pro Position, was damit passiert. Erst dann lässt sich die Rückgabe abschliessen.
            </p>

            <div className="space-y-3">
              {missingGroups.map(({ g, missing }) => {
                const r = openResolutions[g.groupKey];
                return (
                  <div
                    key={g.groupKey}
                    className={`rounded-lg border p-3 sm:p-4 ${
                      r ? 'border-amber-500/40 bg-amber-500/5' : 'border-admin-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-admin-text">{g.label}</div>
                        <div className="text-xs text-admin-muted mt-0.5">
                          {missing} von {g.slotKeys.length} fehlt · {g.subLabel}
                        </div>
                      </div>
                      {missing > 1 && r && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => patchResolution(g.groupKey, { qty: Math.max(1, r.qty - 1) })}
                            aria-label="Menge verringern"
                            className="w-7 h-7 rounded border border-admin-border text-admin-muted hover:text-admin-text"
                          >
                            −
                          </button>
                          <span className="text-sm font-mono tabular-nums w-8 text-center text-admin-text">
                            {r.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => patchResolution(g.groupKey, { qty: Math.min(missing, r.qty + 1) })}
                            aria-label="Menge erhöhen"
                            className="w-7 h-7 rounded border border-admin-border text-admin-muted hover:text-admin-text"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => setResolution(g.groupKey, 'replace', missing)}
                        className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition-colors"
                        style={{
                          borderColor: r?.resolution === 'replace' ? '#f97316' : 'var(--admin-border)',
                          background: r?.resolution === 'replace' ? '#f9731622' : 'transparent',
                          color: r?.resolution === 'replace' ? '#fb923c' : 'var(--admin-muted)',
                        }}
                      >
                        💶 Kunde ersetzt
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolution(g.groupKey, 'follow_up', missing)}
                        className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition-colors"
                        style={{
                          borderColor: r?.resolution === 'follow_up' ? '#06b6d4' : 'var(--admin-border)',
                          background: r?.resolution === 'follow_up' ? '#06b6d422' : 'transparent',
                          color: r?.resolution === 'follow_up' ? '#22d3ee' : 'var(--admin-muted)',
                        }}
                      >
                        📦 Kommt nach
                      </button>
                    </div>

                    {r?.resolution === 'replace' && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-admin-muted mb-1.5">
                          Wiederbeschaffungswert pro Stück
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={String(r.unitValue).replace('.', ',')}
                            onChange={(e) => {
                              const v = Number(e.target.value.replace(',', '.'));
                              patchResolution(g.groupKey, { unitValue: Number.isFinite(v) && v >= 0 ? v : 0 });
                            }}
                            className="w-32 px-3 py-2 bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded-lg text-base text-admin-text outline-none"
                          />
                          <span className="text-sm text-admin-muted">€</span>
                          {r.qty > 1 && (
                            <span className="text-sm text-admin-muted">
                              × {r.qty} = <strong className="text-admin-text">{fmtEuro(r.unitValue * r.qty)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {r?.resolution === 'follow_up' && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-admin-muted mb-1.5">
                          Erwartet bis
                        </label>
                        <input
                          type="date"
                          value={r.dueDate}
                          onChange={(e) => patchResolution(g.groupKey, { dueDate: e.target.value })}
                          className="px-3 py-2 bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded-lg text-base text-admin-text outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Haftungs-Hinweis: reine Information, der Betrag wird NICHT gedeckelt. */}
            {hasReplace && booking.liability_summary?.customer_max_label && (
              <p className="text-xs text-admin-muted mt-4 leading-relaxed">
                ℹ Haftungsoption des Kunden: <strong className="text-admin-text-2">
                  {booking.liability_summary.customer_max_label}
                </strong>
                {typeof booking.liability_summary.customer_max_liability === 'number' && (
                  <> · Höchstbetrag der Ersatzpflicht {fmtEuro(booking.liability_summary.customer_max_liability)}</>
                )}
                . Nicht zurückgegeben ist kein Schadensfall — der Betrag oben ist der volle
                Wiederbeschaffungswert und von dir frei änderbar.
              </p>
            )}

            {(hasReplace || hasFollowUp) && (
              <div className="mt-4 pt-4 border-t border-admin-border space-y-2">
                {hasReplace && (
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-admin-muted">Ersatzforderung gesamt</span>
                    <strong className="text-amber-300 text-base">{fmtEuro(replacementTotal)}</strong>
                  </div>
                )}
                {!hasCustomerEmail && (
                  <p className="text-xs text-amber-400">
                    ⚠ Keine E-Mail bei dieser Buchung hinterlegt — es kann weder eine Rechnung
                    noch eine Nachsende-Erinnerung verschickt werden.
                  </p>
                )}
                {hasReplace && (
                  <Check
                    label="Rechnung + Zahlungslink an den Kunden senden"
                    checked={chargeReplacement && hasCustomerEmail}
                    onChange={setChargeReplacement}
                    disabled={!hasCustomerEmail}
                  />
                )}
                {hasFollowUp && (
                  <Check
                    label="Kunden an die Nachsendung erinnern (mit Frist)"
                    checked={notifyCustomer && hasCustomerEmail}
                    onChange={setNotifyCustomer}
                    disabled={!hasCustomerEmail}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Zusatz-Pruefungen */}
        <div className="bg-admin-surface border border-admin-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold text-admin-text-2 mb-3 uppercase tracking-wider">
            Zustand der Geräte
          </h2>
          <div className="space-y-2">
            <Check label="Keine sichtbaren Schäden" checked={noVisibleDamage} onChange={setNoVisibleDamage} />
            <Check label="Speicherkarte zurückgesetzt" checked={cardReset} onChange={setCardReset} />
            <Check label="Akku geladen" checked={batteryCharged} onChange={setBatteryCharged} />
          </div>
        </div>

        {/* Gesamtzustand */}
        <div className="bg-admin-surface border border-admin-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold text-admin-text-2 mb-3 uppercase tracking-wider">
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
                  borderColor: condition === opt.value ? opt.color : 'var(--admin-border)',
                  background: condition === opt.value ? `${opt.color}22` : 'transparent',
                  color: condition === opt.value ? opt.color : 'var(--admin-muted)',
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
                className="w-full px-3 py-2 bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded-lg text-sm text-admin-text outline-none resize-none focus:border-red-500"
              />
              <p className="text-xs text-red-400 mt-2">
                Es wird automatisch eine Schadensmeldung erstellt.
              </p>
            </div>
          )}
        </div>

        {/* Notizen */}
        <div className="bg-admin-surface border border-admin-border rounded-xl p-5 sm:p-6 mb-6">
          <label className="block text-xs font-semibold text-admin-muted uppercase tracking-wider mb-2">
            Notizen (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Interne Notizen zur Rückgabe..."
            className="w-full px-3 py-2 bg-[var(--admin-input-bg)] border border-[var(--admin-input-border)] rounded-lg text-sm text-admin-text outline-none resize-none"
          />
        </div>

        {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
        {!allSlotsAccountedFor && (
          <p className="text-xs text-amber-400 mb-3">
            ⚠ Jede Position muss abgehakt sein — oder oben unter &bdquo;Nicht zurückgegeben&ldquo; eine Entscheidung bekommen.
          </p>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-[var(--admin-surface-2)] disabled:cursor-not-allowed text-slate-950 disabled:text-[var(--admin-text-dim)] font-bold py-3 rounded-lg transition-colors"
        >
          {submitting ? 'Wird gespeichert…'
            : condition === 'beschaedigt' ? 'Rückgabe + Schaden melden'
            : openCount > 0 ? `Rückgabe abschliessen (${openCount} offen)`
            : 'Rückgabe abschliessen'}
        </button>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-800/50'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-emerald-500"
      />
      <span className="text-sm text-admin-text">{label}</span>
    </label>
  );
}
