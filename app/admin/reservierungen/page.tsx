'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { useProducts } from '@/components/ProductsProvider';
import { useAccessories } from '@/components/AccessoriesProvider';

interface Customer { id: string; full_name: string; email: string }

interface SetOption { id: string; name: string; product_ids: string[] }

interface Line {
  productId: string;
  haftung: 'none' | 'standard' | 'premium';
  accessories: { accessory_id: string; qty: number }[];
}

interface ReservationRow {
  id: string;
  token: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  items: { lines?: Array<{ productId: string; qty?: number; accessories?: { accessory_id: string; qty: number }[] }> } | null;
  rental_from: string;
  rental_to: string;
  delivery_mode: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Offen', color: '#06b6d4', bg: '#06b6d414' },
  completed: { label: 'Gebucht', color: '#10b981', bg: '#10b98114' },
  expired: { label: 'Abgelaufen', color: '#f59e0b', bg: '#f59e0b14' },
  cancelled: { label: 'Zurückgezogen', color: '#9ca3af', bg: '#9ca3af14' },
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}
function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'abgelaufen';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} h ${m} min`;
}

export default function ReservierungenPage() {
  const { products } = useProducts();
  const { accessories } = useAccessories();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sets, setSets] = useState<SetOption[]>([]);

  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [lines, setLines] = useState<Line[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [error, setError] = useState('');

  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  // Aus dem Preisrechner übernommene Kunden-ID (wird nach dem Laden der
  // Kundenliste aufgelöst und als ausgewählter Kunde gesetzt).
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
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
    loadReservations();

    // Übernahme aus dem Preisrechner (sessionStorage-Prefill).
    try {
      const raw = sessionStorage.getItem('cam2rent_reservation_prefill');
      if (raw) {
        sessionStorage.removeItem('cam2rent_reservation_prefill');
        const p = JSON.parse(raw);
        if (typeof p.rentalFrom === 'string') setRentalFrom(p.rentalFrom);
        if (typeof p.rentalTo === 'string') setRentalTo(p.rentalTo);
        if (p.deliveryMode === 'abholung' || p.deliveryMode === 'versand') setDeliveryMode(p.deliveryMode);
        if (p.shippingMethod === 'express' || p.shippingMethod === 'standard') setShippingMethod(p.shippingMethod);
        if (Array.isArray(p.lines) && p.lines.length > 0) {
          setLines(p.lines.map((l: { productId?: string; haftung?: string; accessories?: { accessory_id: string; qty: number }[] }) => ({
            productId: typeof l.productId === 'string' ? l.productId : '',
            haftung: (l.haftung === 'standard' || l.haftung === 'premium' ? l.haftung : 'none') as Line['haftung'],
            accessories: Array.isArray(l.accessories) ? l.accessories : [],
          })).filter((l: Line) => l.productId));
        }
        if (typeof p.customerId === 'string' && p.customerId) setPendingCustomerId(p.customerId);
        setPrefilled(true);
      }
    } catch { /* kein/ungültiger Prefill */ }
  }, []);

  // Prefill-Kunde auflösen, sobald die Kundenliste geladen ist.
  useEffect(() => {
    if (!pendingCustomerId || customers.length === 0) return;
    const c = customers.find((x) => x.id === pendingCustomerId);
    if (c) setCustomer(c);
    setPendingCustomerId(null);
  }, [pendingCustomerId, customers]);

  useEffect(() => {
    // Default-Zeile nur setzen, wenn NICHT aus dem Preisrechner vorbefüllt.
    if (!prefilled && products.length > 0 && lines.length === 0) {
      setLines([{ productId: products[0].id, haftung: 'none', accessories: [] }]);
    }
  }, [products, lines.length, prefilled]);

  function loadReservations() {
    fetch('/api/admin/reservierung')
      .then((r) => r.json())
      .then((d) => setReservations(d.reservations ?? []))
      .catch(() => {});
  }

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

  async function submit() {
    setError('');
    setResult(null);
    if (!customer) { setError('Bitte einen Bestandskunden auswählen.'); return; }
    if (!rentalFrom || !rentalTo) { setError('Bitte Mietzeitraum wählen.'); return; }
    if (rentalTo < rentalFrom) { setError('Enddatum liegt vor dem Startdatum.'); return; }
    if (lines.length === 0) { setError('Bitte mindestens eine Kamera hinzufügen.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/reservierung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUserId: customer.id,
          rentalFrom, rentalTo, deliveryMode, shippingMethod,
          lines: lines.map((l) => ({ productId: l.productId, qty: 1, haftung: l.haftung, accessories: l.accessories })),
          sendEmail: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Reservierung fehlgeschlagen.'); return; }
      setResult({ url: data.url, emailSent: !!data.emailSent });
      loadReservations();
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelReservation(id: string) {
    if (!confirm('Diese Reservierung wirklich zurückziehen? Das Inventar wird sofort freigegeben.')) return;
    await fetch(`/api/admin/reservierung?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    loadReservations();
  }

  function itemsSummary(row: ReservationRow): string {
    const l = row.items?.lines ?? [];
    const camNames = l.map((x) => productById.get(x.productId)?.name ?? x.productId);
    const accCount = l.reduce((s, x) => s + (x.accessories?.length ?? 0), 0);
    return `${camNames.join(', ')}${accCount > 0 ? ` · ${accCount} Zubehör` : ''}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink href="/admin" label="Zurück zum Dashboard" />
      <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mt-2 mb-1">48-Stunden-Reservierung</h1>
      <p className="font-body text-sm text-brand-steel mb-6">
        Für Bestandskunden Kamera + Zubehör reservieren. Der Kunde bekommt einen Link, kann alles anpassen und hat
        48 Stunden Zeit, selbst zu buchen. Danach wird das Inventar automatisch wieder freigegeben.
      </p>

      {/* ── Neue Reservierung ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-8">
        <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">Neue Reservierung</h2>

        {/* Kunde */}
        <label className="block text-sm font-medium text-brand-steel mb-1">Bestandskunde</label>
        {customer ? (
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 mb-4">
            <span className="text-sm text-brand-black dark:text-white">{customer.full_name || '—'} · {customer.email}</span>
            <button onClick={() => setCustomer(null)} className="text-xs text-brand-primary">ändern</button>
          </div>
        ) : (
          <div className="mb-4">
            <input
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
              placeholder="Name oder E-Mail suchen…"
              className="w-full text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white"
            />
            {filteredCustomers.length > 0 && (
              <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-56 overflow-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setCustomer(c); setCustSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-brand-black dark:text-white"
                  >
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
            <select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value as 'standard' | 'express')}
              disabled={deliveryMode !== 'versand'}
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
              <div className="flex items-center gap-2 mb-2">
                <select value={line.productId} onChange={(e) => updateLine(idx, { productId: e.target.value })}
                  className="flex-1 text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={line.haftung} onChange={(e) => updateLine(idx, { haftung: e.target.value as Line['haftung'] })}
                  className="text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-brand-black dark:text-white">
                  <option value="none">Ohne Haftungsschutz</option>
                  <option value="standard">Basis-Haftungsschutz</option>
                  <option value="premium">Premium-Haftungsschutz</option>
                </select>
                {lines.length > 1 && (
                  <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="px-2 py-2 text-status-error text-sm">✕</button>
                )}
              </div>

              {/* Zubehör dieser Kamera */}
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
        <button
          onClick={() => setLines((prev) => [...prev, { productId: products[0]?.id ?? '', haftung: 'none', accessories: [] }])}
          disabled={products.length === 0}
          className="text-sm text-brand-primary mb-4 disabled:opacity-50"
        >
          + weitere Kamera
        </button>

        {error && <p className="text-sm text-status-error mb-3">{error}</p>}
        {result && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-3 mb-3 text-sm">
            <p className="text-emerald-700 dark:text-emerald-300 font-medium mb-1">
              ✓ Reservierung angelegt{result.emailSent ? ' — Link per E-Mail verschickt.' : ' (E-Mail-Versand fehlgeschlagen — Link manuell senden).'}
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={result.url} className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-brand-black dark:text-white" />
              <button onClick={() => navigator.clipboard?.writeText(result.url)} className="text-xs text-brand-primary">kopieren</button>
            </div>
          </div>
        )}

        <button onClick={submit} disabled={submitting}
          className="px-6 py-3 rounded-[10px] bg-brand-primary text-white font-heading font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
          {submitting ? 'Wird angelegt…' : 'Reservieren & Link senden'}
        </button>
      </div>

      {/* ── Bestehende Reservierungen ─────────────────────────────────── */}
      <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-3">Reservierungen</h2>
      {reservations.length === 0 ? (
        <p className="text-sm text-brand-steel">Noch keine Reservierungen.</p>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => {
            const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.open;
            return (
              <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-brand-black dark:text-white font-medium">{r.customer_name || '—'} · <span className="text-brand-steel">{r.customer_email}</span></p>
                  <p className="text-xs text-brand-steel">{itemsSummary(r)} · {fmtDate(r.rental_from)}–{fmtDate(r.rental_to)}</p>
                </div>
                {r.status === 'open' && (
                  <>
                    <span className="text-xs text-brand-steel">läuft ab in {remaining(r.expires_at)}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/reservierung/${r.token}`)}
                      className="text-xs text-brand-primary">Link kopieren</button>
                    <button onClick={() => cancelReservation(r.id)} className="text-xs text-status-error">zurückziehen</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
