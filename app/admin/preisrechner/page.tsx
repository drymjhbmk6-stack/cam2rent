'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { useProducts } from '@/components/ProductsProvider';
import { useAccessories } from '@/components/AccessoriesProvider';

interface Customer { id: string; full_name: string; email: string }

interface SetOption { id: string; name: string; product_ids: string[] }

interface Line {
  productId: string;
  qty: number;
  haftung: 'none' | 'standard' | 'premium';
  accessories: { accessory_id: string; qty: number }[];
}

interface QuoteAccessoryLine { accessoryId: string; name: string; qty: number; unitPrice: number; total: number; available: boolean; remaining: number | null; isSet?: boolean }
interface QuoteLine {
  productId: string; productName: string; qty: number;
  rentalUnitPrice: number; rentalTotal: number;
  haftung: string; haftungLabel: string; haftungPrice: number;
  accessories: QuoteAccessoryLine[];
  lineSubtotal: number;
  cameraAvailable: boolean; cameraFree: number | null; cameraConflictDay: string | null;
  deposit: number;
}
interface QuoteResult {
  days: number; lines: QuoteLine[];
  subtotalItems: number; discountBase: number; discountAmount: number; discountLabel: string;
  shipping: { price: number; isFree: boolean };
  grandTotal: number; depositSum: number; customerSpecialPercent: number;
  allAvailable: boolean; conflicts: string[];
}

function eur(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

export default function PreisrechnerPage() {
  const { products } = useProducts();
  const { accessories } = useAccessories();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sets, setSets] = useState<SetOption[]>([]);

  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [lines, setLines] = useState<Line[]>([]);
  const [discountMode, setDiscountMode] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const accById = useMemo(() => new Map(accessories.map((a) => [a.id, a])), [accessories]);
  const setById = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);

  useEffect(() => {
    fetch('/api/admin/kunden')
      .then((r) => r.json())
      .then((d) => setCustomers((d.customers ?? []).filter((c: Customer) => c.email)))
      .catch(() => {});
    fetch('/api/sets')
      .then((r) => r.json())
      .then((d) => setSets((d.sets ?? []).map((s: { id: string; name: string; product_ids?: string[] }) => ({
        id: s.id, name: s.name, product_ids: Array.isArray(s.product_ids) ? s.product_ids : [],
      }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (products.length > 0 && lines.length === 0) {
      setLines([{ productId: products[0].id, qty: 1, haftung: 'none', accessories: [] }]);
    }
  }, [products, lines.length]);

  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => (c.full_name || '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, custSearch]);

  function nameFor(id: string): string {
    return setById.get(id)?.name ?? accById.get(id)?.name ?? id;
  }

  // Zubehör + Sets passend zur Kamera der Zeile. Sets über product_ids,
  // Zubehör über compatibleProductIds (leer = alle Kameras).
  function optionsFor(productId: string) {
    const compatSets = sets.filter((s) => s.product_ids.length === 0 || s.product_ids.includes(productId));
    const compatAcc = accessories.filter((a) => {
      const c = a.compatibleProductIds;
      return !c || c.length === 0 || c.includes(productId);
    });
    return { compatSets, compatAcc };
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addAccessory(idx: number, accessoryId: string) {
    if (!accessoryId) return;
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      if (l.accessories.some((a) => a.accessory_id === accessoryId)) return l;
      return { ...l, accessories: [...l.accessories, { accessory_id: accessoryId, qty: 1 }] };
    }));
  }
  function setAccQty(idx: number, accessoryId: string, qty: number) {
    setLines((prev) => prev.map((l, i) => i === idx
      ? { ...l, accessories: l.accessories.map((a) => a.accessory_id === accessoryId ? { ...a, qty: Math.max(1, qty) } : a) }
      : l));
  }
  function removeAccessory(idx: number, accessoryId: string) {
    setLines((prev) => prev.map((l, i) => i === idx
      ? { ...l, accessories: l.accessories.filter((a) => a.accessory_id !== accessoryId) }
      : l));
  }

  async function calculate() {
    setError('');
    setCopied(false);
    if (!rentalFrom || !rentalTo) { setError('Bitte Mietzeitraum wählen.'); return; }
    if (rentalTo < rentalFrom) { setError('Enddatum liegt vor dem Startdatum.'); return; }
    if (lines.length === 0) { setError('Bitte mindestens eine Kamera hinzufügen.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/preis-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalFrom, rentalTo, deliveryMode, shippingMethod,
          lines,
          customerUserId: customer?.id ?? null,
          discount: { mode: discountMode, value: parseFloat(discountValue.replace(',', '.')) || 0 },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Berechnung fehlgeschlagen.'); setResult(null); return; }
      setResult(data.result as QuoteResult);
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setLoading(false);
    }
  }

  function applySpecial() {
    if (!result || result.customerSpecialPercent <= 0) return;
    setDiscountMode('percent');
    setDiscountValue(String(result.customerSpecialPercent));
    // Neu berechnen mit übernommenem Rabatt.
    setTimeout(() => { void calculate(); }, 0);
  }

  function buildQuoteText(): string {
    if (!result) return '';
    const l: string[] = [];
    l.push(`Angebot cam2rent — ${fmtDate(rentalFrom)} bis ${fmtDate(rentalTo)} (${result.days} ${result.days === 1 ? 'Tag' : 'Tage'})`);
    l.push('');
    for (const line of result.lines) {
      l.push(`${line.qty}× ${line.productName} — ${eur(line.rentalTotal)}`);
      for (const a of line.accessories) l.push(`   + ${a.qty}× ${a.name} — ${eur(a.total)}`);
      if (line.haftung !== 'none') l.push(`   + ${line.haftungLabel} — ${eur(line.haftungPrice)}`);
    }
    l.push('');
    l.push(`Zwischensumme: ${eur(result.subtotalItems)}`);
    if (result.discountAmount > 0) l.push(`${result.discountLabel || 'Rabatt'}: -${eur(result.discountAmount)}`);
    l.push(`Versand (${deliveryMode === 'abholung' ? 'Abholung' : shippingMethod === 'express' ? 'Express' : 'Standard'}): ${result.shipping.isFree ? 'kostenlos' : eur(result.shipping.price)}`);
    l.push(`Gesamt: ${eur(result.grandTotal)}`);
    return l.join('\n');
  }

  async function copyQuote() {
    const text = buildQuoteText();
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  }

  function toReservation() {
    // qty>1 in mehrere qty=1-Zeilen expandieren (Zubehör auf die erste),
    // passt zum 1-Cart-Item-pro-Zeile-Modell der Reservierung.
    const resLines: { productId: string; haftung: 'none' | 'standard' | 'premium'; accessories: { accessory_id: string; qty: number }[] }[] = [];
    for (const line of lines) {
      const n = Math.max(1, line.qty);
      for (let i = 0; i < n; i++) {
        resLines.push({ productId: line.productId, haftung: line.haftung, accessories: i === 0 ? line.accessories : [] });
      }
    }
    const prefill = {
      customerId: customer?.id ?? null,
      customerName: customer?.full_name ?? null,
      customerEmail: customer?.email ?? null,
      rentalFrom, rentalTo, deliveryMode, shippingMethod,
      lines: resLines,
    };
    try { sessionStorage.setItem('cam2rent_reservation_prefill', JSON.stringify(prefill)); } catch { /* ignore */ }
    router.push('/admin/reservierungen');
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink href="/admin" label="Zurück zum Dashboard" />
      <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mt-2 mb-1">Preisrechner</h1>
      <p className="font-body text-sm text-brand-steel mb-6">
        Für Preisanfragen: Kamera(s), Zubehör und Haftungsschutz für einen Zeitraum wählen — Preis wird berechnet und
        die Verfügbarkeit geprüft. Nichts wird gebucht oder blockiert.
      </p>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-6">
        {/* Kunde (optional) */}
        <label className="block text-sm font-medium text-brand-steel mb-1">Kunde (optional – für Sonderkondition)</label>
        {customer ? (
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 mb-4">
            <span className="text-sm text-brand-black dark:text-white">{customer.full_name || '—'} · {customer.email}</span>
            <button onClick={() => setCustomer(null)} className="text-xs text-brand-primary">entfernen</button>
          </div>
        ) : (
          <div className="mb-4">
            <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Name oder E-Mail suchen… (optional)"
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white" />
            {custSearch.trim() && filteredCustomers.length > 0 && (
              <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-56 overflow-auto">
                {filteredCustomers.map((c) => (
                  <button key={c.id} onClick={() => { setCustomer(c); setCustSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-brand-black dark:text-white">
                    {c.full_name || '—'} <span className="text-brand-steel">· {c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zeitraum + Modus */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-brand-steel mb-1">Von</label>
            <input type="date" value={rentalFrom} onChange={(e) => setRentalFrom(e.target.value)}
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-steel mb-1">Bis</label>
            <input type="date" value={rentalTo} onChange={(e) => setRentalTo(e.target.value)}
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-steel mb-1">Lieferart</label>
            <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as 'versand' | 'abholung')}
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
              <option value="versand">Versand</option>
              <option value="abholung">Abholung</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-steel mb-1">Versandart</label>
            <select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value as 'standard' | 'express')} disabled={deliveryMode !== 'versand'}
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white disabled:opacity-50">
              <option value="standard">Standard</option>
              <option value="express">Express</option>
            </select>
          </div>
        </div>

        {/* Kamera-Zeilen */}
        <label className="block text-sm font-medium text-brand-steel mb-2">Kameras &amp; Zubehör</label>
        <div className="space-y-3 mb-3">
          {lines.map((line, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <select value={line.productId} onChange={(e) => updateLine(idx, { productId: e.target.value })}
                  className="flex-1 min-w-[160px] text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-brand-steel">Anzahl</span>
                  <input type="number" min={1} value={line.qty} onChange={(e) => updateLine(idx, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-16 text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-brand-black dark:text-white" />
                </div>
                <select value={line.haftung} onChange={(e) => updateLine(idx, { haftung: e.target.value as Line['haftung'] })}
                  className="text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
                  <option value="none">Ohne Haftungsschutz</option>
                  <option value="standard">Basis-Haftungsschutz</option>
                  <option value="premium">Premium-Haftungsschutz</option>
                </select>
                {lines.length > 1 && (
                  <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="px-2 py-2 text-status-error text-sm">✕</button>
                )}
              </div>
              {line.accessories.length > 0 && (
                <div className="space-y-1 mb-2">
                  {line.accessories.map((a) => (
                    <div key={a.accessory_id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-brand-black dark:text-white">
                        {nameFor(a.accessory_id)}
                        {setById.has(a.accessory_id) && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-brand-primary/10 text-brand-primary">Set</span>}
                      </span>
                      <input type="number" min={1} value={a.qty}
                        onChange={(e) => setAccQty(idx, a.accessory_id, parseInt(e.target.value, 10) || 1)}
                        className="w-16 text-base rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-brand-black dark:text-white" />
                      <button onClick={() => removeAccessory(idx, a.accessory_id)} className="text-status-error">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const { compatSets, compatAcc } = optionsFor(line.productId);
                return (
                  <select value="" onChange={(e) => { addAccessory(idx, e.target.value); e.target.value = ''; }}
                    className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-steel">
                    <option value="">+ Set / Zubehör hinzufügen…</option>
                    {compatSets.length > 0 && (
                      <optgroup label="Sets">
                        {compatSets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </optgroup>
                    )}
                    {compatAcc.length > 0 && (
                      <optgroup label="Zubehör">
                        {compatAcc.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                );
              })()}
            </div>
          ))}
        </div>
        <button onClick={() => setLines((prev) => [...prev, { productId: products[0]?.id ?? '', qty: 1, haftung: 'none', accessories: [] }])}
          disabled={products.length === 0} className="text-sm text-brand-primary mb-4 disabled:opacity-50">+ weitere Kamera</button>

        {/* Rabatt */}
        <div className="flex items-end gap-2 mb-4">
          <div>
            <label className="block text-sm font-medium text-brand-steel mb-1">Rabatt</label>
            <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as 'none' | 'percent' | 'amount')}
              className="text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
              <option value="none">Kein Rabatt</option>
              <option value="percent">Prozent (%)</option>
              <option value="amount">Festbetrag (€)</option>
            </select>
          </div>
          {discountMode !== 'none' && (
            <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountMode === 'percent' ? '10' : '20'}
              className="w-24 text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white" />
          )}
        </div>

        {error && <p className="text-sm text-status-error mb-3">{error}</p>}
        <button onClick={calculate} disabled={loading}
          className="px-6 py-3 rounded-[10px] bg-brand-primary text-white font-heading font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
          {loading ? 'Wird berechnet…' : 'Berechnen'}
        </button>
      </div>

      {/* ── Ergebnis ─────────────────────────────────────────────── */}
      {result && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
          {customer && result.customerSpecialPercent > 0 && (
            <div className="mb-3 rounded-lg border border-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 p-2 text-sm flex items-center justify-between">
              <span className="text-indigo-700 dark:text-indigo-300">Kunde hat Sonderkondition {result.customerSpecialPercent} %.</span>
              <button onClick={applySpecial} className="text-xs text-brand-primary font-medium">Übernehmen</button>
            </div>
          )}

          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-1">Preisaufstellung</h2>
          <p className="text-xs text-brand-steel mb-4">{fmtDate(rentalFrom)}–{fmtDate(rentalTo)} · {result.days} {result.days === 1 ? 'Tag' : 'Tage'}</p>

          <div className="space-y-3 mb-4">
            {result.lines.map((line, i) => (
              <div key={i} className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-brand-black dark:text-white">
                    {line.qty}× {line.productName}
                    {line.cameraAvailable
                      ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded" style={{ color: '#059669', background: '#05966914' }}>✓ verfügbar</span>
                      : <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded" style={{ color: '#dc2626', background: '#dc262614' }}>nur {line.cameraFree ?? 0} frei{line.cameraConflictDay ? ` (${fmtDate(line.cameraConflictDay)})` : ''}</span>}
                  </span>
                  <span className="text-sm text-brand-black dark:text-white">{eur(line.rentalTotal)}</span>
                </div>
                {line.accessories.map((a) => (
                  <div key={a.accessoryId} className="flex items-center justify-between text-xs text-brand-steel mt-0.5">
                    <span>+ {a.qty}× {a.name}{a.isSet && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-brand-primary/10 text-brand-primary">Set</span>}{!a.available && <span className="ml-1 text-status-error">nur {a.remaining ?? 0} frei</span>}</span>
                    <span>{eur(a.total)}</span>
                  </div>
                ))}
                {line.haftung !== 'none' && (
                  <div className="flex items-center justify-between text-xs text-brand-steel mt-0.5">
                    <span>+ {line.haftungLabel}</span><span>{eur(line.haftungPrice)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-brand-steel"><span>Zwischensumme</span><span>{eur(result.subtotalItems)}</span></div>
            {result.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>{result.discountLabel || 'Rabatt'}</span><span>-{eur(result.discountAmount)}</span></div>
            )}
            <div className="flex justify-between text-brand-steel">
              <span>Versand ({deliveryMode === 'abholung' ? 'Abholung' : shippingMethod === 'express' ? 'Express' : 'Standard'})</span>
              <span>{result.shipping.isFree ? 'kostenlos' : eur(result.shipping.price)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-brand-black dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
              <span>Gesamt</span><span>{eur(result.grandTotal)}</span>
            </div>
            {result.depositSum > 0 && (
              <p className="text-[11px] text-brand-steel pt-1">Kaution/Sicherheit (falls Kautionsmodus): {eur(result.depositSum)}</p>
            )}
          </div>

          {!result.allAvailable && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-xs text-amber-700 dark:text-amber-300">
              ⚠ Im gewählten Zeitraum nicht vollständig verfügbar:
              <ul className="list-disc list-inside mt-1">{result.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={copyQuote} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-brand-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
              {copied ? '✓ kopiert' : '📋 Angebot kopieren'}
            </button>
            <button onClick={toReservation} className="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:opacity-90">
              → Als 48h-Reservierung übernehmen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
