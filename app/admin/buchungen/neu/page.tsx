'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface DynProduct {
  id: string;
  name: string;
  brand: string;
  priceTable?: number[];
  perDayAfter30?: number;
  deposit?: number;
  available?: boolean;
  stock?: number;
  hasHaftungsoption?: boolean;
}

interface DynAccessory {
  id: string;
  name: string;
  category?: string;
  pricing_mode: 'perDay' | 'flat';
  price: number;
  available: boolean;
}

interface DynSet {
  id: string;
  name: string;
  description?: string;
  pricing_mode: 'perDay' | 'flat';
  price: number;
  available: boolean;
}

interface DynPrices {
  haftung?: { standard: number; standardEigenbeteiligung?: number; premium: number };
  shipping?: { standardPrice: number; expressPrice: number; freeShippingThreshold: number };
  adminProducts?: Record<string, DynProduct>;
}

interface StaticProduct {
  id: string;
  name: string;
  brand: string;
  pricePerDay: number;
  deposit: number;
  priceTable?: { days: number; price: number }[];
  priceFormula31plus?: { base: number; perDay: number };
}

const HAFTUNG_OPTIONS = [
  { value: 'none', label: 'Keine Haftungsbegrenzung' },
  { value: 'standard', label: 'Standard-Haftungsschutz' },
  { value: 'premium', label: 'Premium-Haftungsschutz' },
];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function calcDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function getRentalPrice(
  productId: string,
  days: number,
  dynPrices: DynPrices | null,
  staticProducts: StaticProduct[]
): number {
  if (!days) return 0;
  const ap = dynPrices?.adminProducts?.[productId];
  if (ap?.priceTable?.length) {
    if (days <= ap.priceTable.length) return ap.priceTable[days - 1];
    if (ap.perDayAfter30) return ap.priceTable[ap.priceTable.length - 1] + ap.perDayAfter30 * (days - ap.priceTable.length);
  }
  const sp = staticProducts.find((p) => p.id === productId);
  if (sp?.priceTable) {
    const entry = sp.priceTable.find((e) => e.days === days);
    if (entry) return entry.price;
    if (days > 30 && sp.priceFormula31plus) return sp.priceFormula31plus.base + sp.priceFormula31plus.perDay * days;
  }
  return (sp?.pricePerDay ?? 10) * days;
}

function getAccessoryPrice(acc: DynAccessory, days: number): number {
  return acc.pricing_mode === 'flat' ? acc.price : acc.price * days;
}

function getSetPrice(set: DynSet, days: number): number {
  return set.pricing_mode === 'flat' ? set.price : set.price * days;
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f172a', border: '1px solid #334155',
  borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14,
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 };
const sectionStyle: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 };
const headingStyle: React.CSSProperties = { color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.8 };

/* ─── Component ─────────────────────────────────────────────────────────────── */

export default function ManualBookingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dynamic data
  const [dynPrices, setDynPrices] = useState<DynPrices | null>(null);
  const [staticProducts, setStaticProducts] = useState<StaticProduct[]>([]);
  const [accessories, setAccessories] = useState<DynAccessory[]>([]);
  const [sets, setSets] = useState<DynSet[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; qty: number; accessories: string[]; sets: string[]; note: string }[]>([]);
  const [addProductId, setAddProductId] = useState('');
  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [accAvailability, setAccAvailability] = useState<Record<string, { remaining: number; compatible: boolean; total: number }>>({});
  const [haftung, setHaftung] = useState('none');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('kleinanzeigen');
  const [manualPrice, setManualPrice] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');

  // Load all data on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/prices').then((r) => r.json()),
      import('@/data/products').then((m) => m.products),
      fetch('/api/admin/accessories').then((r) => r.ok ? r.json() : { accessories: [] }),
      fetch('/api/sets?available=true').then((r) => r.ok ? r.json() : { sets: [] }),
    ])
      .then(([prices, prods, accData, setData]) => {
        setDynPrices(prices);
        setStaticProducts(prods);
        setAccessories(accData.accessories ?? []);
        setSets(setData.sets ?? []);
        // Set default for add-dropdown
        if (prods.length > 0) setAddProductId(prods[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Merged product list: static + dynamic overrides
  const productList = useMemo(() => {
    const ap = dynPrices?.adminProducts;
    return staticProducts
      .filter((p) => p.id) // only valid
      .map((sp) => {
        const dyn = ap?.[sp.id];
        return {
          id: sp.id,
          name: dyn?.name ?? sp.name,
          brand: dyn?.brand ?? sp.brand,
          available: dyn?.available ?? true,
          deposit: dyn?.deposit ?? sp.deposit ?? 0,
        };
      });
  }, [staticProducts, dynPrices]);

  const days = calcDays(rentalFrom, rentalTo);

  function addProduct() {
    if (!addProductId) return;
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.id === addProductId);
      if (existing) return prev.map((p) => p.id === addProductId ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { id: addProductId, qty: 1, accessories: [], sets: [], note: '' }];
    });
  }
  function removeProduct(id: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  }
  function updateProductQty(id: string, qty: number) {
    if (qty < 1) return removeProduct(id);
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, qty } : p));
  }
  function updateProductNote(id: string, note: string) {
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, note } : p));
  }
  function toggleProductAccessory(productId: string, accId: string) {
    setSelectedProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const has = p.accessories.includes(accId);
      return { ...p, accessories: has ? p.accessories.filter((a) => a !== accId) : [...p.accessories, accId] };
    }));
  }
  function toggleProductSet(productId: string, setId: string) {
    setSelectedProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const has = p.sets.includes(setId);
      return { ...p, sets: has ? p.sets.filter((s) => s !== setId) : [...p.sets, setId] };
    }));
  }

  // Verfügbarkeit laden wenn Zeitraum oder Liefermodus sich ändert
  useEffect(() => {
    if (!rentalFrom || !rentalTo) return;
    fetch(`/api/accessory-availability?from=${rentalFrom}&to=${rentalTo}&delivery_mode=${deliveryMode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.accessories) {
          const map: Record<string, { remaining: number; compatible: boolean; total: number }> = {};
          for (const a of data.accessories) {
            map[a.id] = { remaining: a.available_qty_remaining, compatible: a.compatible, total: a.total_qty };
          }
          setAccAvailability(map);
        }
      })
      .catch(() => {});
  }, [rentalFrom, rentalTo, deliveryMode]);

  const haftungPrice = useMemo(() => {
    if (haftung === 'none') return 0;
    const h = dynPrices?.haftung;
    return haftung === 'standard' ? (h?.standard ?? 15) : (h?.premium ?? 25);
  }, [haftung, dynPrices]);

  const rentalPrice = useMemo(() => {
    if (!days) return 0;
    return selectedProducts.reduce((sum, sp) => {
      return sum + getRentalPrice(sp.id, days, dynPrices, staticProducts) * sp.qty;
    }, 0);
  }, [selectedProducts, days, dynPrices, staticProducts]);

  const totalDeposit = useMemo(() => {
    return selectedProducts.reduce((sum, sp) => {
      const p = productList.find((pl) => pl.id === sp.id);
      return sum + (p?.deposit ?? 0) * sp.qty;
    }, 0);
  }, [selectedProducts, productList]);

  const accessoryPrice = useMemo(() => {
    return selectedProducts.reduce((sum, sp) => {
      return sum + sp.accessories.reduce((s2, id) => {
        const acc = accessories.find((a) => a.id === id);
        return s2 + (acc ? getAccessoryPrice(acc, days) : 0);
      }, 0) * sp.qty;
    }, 0);
  }, [selectedProducts, accessories, days]);

  const setPrice = useMemo(() => {
    return selectedProducts.reduce((sum, sp) => {
      return sum + sp.sets.reduce((s2, id) => {
        const s = sets.find((st) => st.id === id);
        return s2 + (s ? getSetPrice(s, days) : 0);
      }, 0) * sp.qty;
    }, 0);
  }, [selectedProducts, sets, days]);

  const subtotal = rentalPrice + accessoryPrice + setPrice + haftungPrice;
  const sp = dynPrices?.shipping;
  const shippingPrice = deliveryMode === 'abholung' ? 0
    : shippingMethod === 'express' ? (sp?.expressPrice ?? 12.99)
    : subtotal >= (sp?.freeShippingThreshold ?? 50) ? 0 : (sp?.standardPrice ?? 5.99);
  const total = subtotal + shippingPrice;
  const finalTotal = manualPrice ? parseFloat(manualPrice) || 0 : total;
  const deposit = totalDeposit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!customerName.trim()) { setError('Name ist ein Pflichtfeld.'); return; }
    if (selectedProducts.length === 0) { setError('Mindestens ein Produkt auswählen.'); return; }
    if (!rentalFrom || !rentalTo || days <= 0) { setError('Gültiger Mietzeitraum nötig.'); return; }

    setSaving(true);
    try {
      const shippingAddress = street ? `${street}, ${zip} ${city}` : '';
      const bookingIds: string[] = [];

      // Pro Produkt eine eigene Buchung erstellen
      for (const sp of selectedProducts) {
        const p = productList.find((pl) => pl.id === sp.id);
        const pPrice = days > 0 ? getRentalPrice(sp.id, days, dynPrices, staticProducts) : 0;
        const pAccPrice = sp.accessories.reduce((sum, id) => {
          const acc = accessories.find((a) => a.id === id);
          return sum + (acc ? getAccessoryPrice(acc, days) : 0);
        }, 0);
        const pSetPrice = sp.sets.reduce((sum, id) => {
          const s = sets.find((st) => st.id === id);
          return sum + (s ? getSetPrice(s, days) : 0);
        }, 0);
        const pSubtotal = pPrice + pAccPrice + pSetPrice + haftungPrice;
        const pShipping = shippingPrice; // Versand nur einmal bei erster Buchung
        const pTotal = pSubtotal + (bookingIds.length === 0 ? pShipping : 0);
        // Bei manuellem Preis: anteilig auf Produkte verteilen
        const pFinalTotal = manualPrice
          ? (parseFloat(manualPrice) || 0) / selectedProducts.reduce((s, x) => s + x.qty, 0)
          : (bookingIds.length === 0 ? pTotal : pSubtotal);
        const pDeposit = p?.deposit ?? 0;

        const accNames = sp.accessories.map((id) => accessories.find((a) => a.id === id)?.name ?? id);
        const setNames = sp.sets.map((id) => sets.find((s) => s.id === id)?.name ?? id);

        // Überweisungsdaten bei "nicht bezahlt"
        const bankInfo = paymentStatus === 'unpaid'
          ? `Überweisung ausstehend | Kontoinhaber: Lennart Schickel | IBAN: DE77 2022 0800 0027 7841 43 | BIC: SXPYDEHHXXX | Verwendungszweck: ${customerName.trim() || 'Kunde'} – Kameraleihe`
          : '';

        // Für qty > 1: mehrere Buchungen erstellen
        for (let q = 0; q < sp.qty; q++) {
          const res = await fetch('/api/admin/manual-booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: sp.id,
              product_name: p?.name ?? sp.id,
              rental_from: rentalFrom,
              rental_to: rentalTo,
              days,
              delivery_mode: deliveryMode,
              shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
              shipping_price: bookingIds.length === 0 ? pShipping : 0,
              haftung,
              accessories: [...sp.accessories, ...sp.sets],
              price_rental: pPrice,
              price_accessories: pAccPrice + pSetPrice,
              price_haftung: haftungPrice,
              price_total: pFinalTotal,
              deposit: pDeposit,
              customer_name: customerName.trim(),
              customer_email: customerEmail.trim() || null,
              shipping_address: shippingAddress || null,
              payment_status: paymentStatus,
              notes: [
                source ? `Quelle: ${source}` : '',
                paymentStatus === 'paid' ? 'Bezahlt' : '',
                manualPrice ? `Manueller Preis: ${parseFloat(manualPrice).toFixed(2)} €` : '',
                sp.note ? `Produkt-Notiz (${p?.name ?? sp.id}): ${sp.note}` : '',
                setNames.length ? `Sets: ${setNames.join(', ')}` : '',
                accNames.length ? `Zubehör: ${accNames.join(', ')}` : '',
                bankInfo,
                notes,
              ].filter(Boolean).join(' | '),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Fehler');
          bookingIds.push(data.bookingId);
        }
      }

      setSuccess(`${bookingIds.length} Buchung${bookingIds.length > 1 ? 'en' : ''} erstellt: ${bookingIds.join(', ')}`);
      setTimeout(() => router.push('/admin/buchungen'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px 16px', maxWidth: 800 }}>
        <p style={{ color: '#64748b' }}>Daten werden geladen...</p>
      </div>
    );
  }

  const stdShippingLabel = subtotal >= (sp?.freeShippingThreshold ?? 50)
    ? 'Standard (3-5 Tage) — Gratis'
    : `Standard (3-5 Tage) — ${(sp?.standardPrice ?? 5.99).toFixed(2)} €`;

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h1 className="font-heading font-bold text-xl mb-1" style={{ color: '#e2e8f0' }}>
        Manuelle Buchung erstellen
      </h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>
        Fuer Kleinanzeigen, Telefon- oder sonstige externe Bestellungen
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}>{success}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ─── Kundendaten ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Kundendaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Vor- und Nachname" required />
            </div>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input style={inputStyle} type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="optional" />
            </div>
            <div className="sm:col-span-2">
              <label style={labelStyle}>Strasse + Hausnummer</label>
              <input style={inputStyle} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="z.B. Musterstr. 12" />
            </div>
            <div>
              <label style={labelStyle}>PLZ</label>
              <input style={inputStyle} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="12345" maxLength={5} />
            </div>
            <div>
              <label style={labelStyle}>Stadt</label>
              <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Berlin" />
            </div>
          </div>
        </div>

        {/* ─── Produkte ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Produkte</h2>

          {/* Hinzufügen */}
          <div className="flex gap-2 mb-4">
            <select style={{ ...selectStyle, flex: 1 }} value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              {productList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.brand}) {!p.available ? '— nicht verfügbar' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addProduct}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
              style={{ background: '#06b6d4', color: 'white' }}
            >
              + Hinzufügen
            </button>
          </div>

          {/* Zeitraum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label style={labelStyle}>Mietbeginn *</label>
              <input style={inputStyle} type="date" value={rentalFrom} onChange={(e) => setRentalFrom(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Mietende *</label>
              <input style={inputStyle} type="date" value={rentalTo} onChange={(e) => setRentalTo(e.target.value)} required />
            </div>
          </div>
          {days > 0 && (
            <p className="text-sm mb-4" style={{ color: '#06b6d4' }}>
              {days} {days === 1 ? 'Tag' : 'Tage'}
            </p>
          )}

          {/* Pro-Produkt Blöcke */}
          {selectedProducts.length > 0 && (
            <div className="space-y-4">
              {selectedProducts.map((sp) => {
                const p = productList.find((pl) => pl.id === sp.id);
                const productPrice = days > 0 ? getRentalPrice(sp.id, days, dynPrices, staticProducts) * sp.qty : 0;
                // Kompatible Zubehörteile für dieses Produkt
                const compatAccessories = accessories.filter((acc) => acc.available);
                const compatSets = sets.filter((s) => s.available);

                return (
                  <div key={sp.id} style={{ background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b', padding: 16 }}>
                    {/* Produkt-Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1">
                        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{p?.name ?? sp.id}</span>
                        {!p?.available && <span className="text-xs ml-2" style={{ color: '#f59e0b' }}>(nicht verfügbar)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateProductQty(sp.id, sp.qty - 1)} className="w-7 h-7 rounded flex items-center justify-center text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>−</button>
                        <span className="text-sm font-semibold w-6 text-center" style={{ color: '#e2e8f0' }}>{sp.qty}</span>
                        <button type="button" onClick={() => updateProductQty(sp.id, sp.qty + 1)} className="w-7 h-7 rounded flex items-center justify-center text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>+</button>
                      </div>
                      {days > 0 && <span className="text-xs font-semibold" style={{ color: '#06b6d4' }}>{productPrice.toFixed(2)} €</span>}
                      <button type="button" onClick={() => removeProduct(sp.id)} className="text-xs p-1" style={{ color: '#ef4444' }}>✕</button>
                    </div>

                    {/* Sets für dieses Produkt */}
                    {compatSets.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>SETS</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {compatSets.map((set) => {
                            const checked = sp.sets.includes(set.id);
                            const setItems: { accessory_id: string; qty: number }[] = (set as unknown as { accessory_items?: { accessory_id: string; qty: number }[] }).accessory_items ?? [];
                            const unavail = setItems.length > 0 && setItems.some((item) => {
                              const av = accAvailability[item.accessory_id];
                              return av && av.remaining < item.qty;
                            });
                            const price = days > 0 ? getSetPrice(set, days) : set.price;
                            return (
                              <label key={set.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${unavail ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} style={{ border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}`, background: checked ? '#06b6d40a' : 'transparent' }}>
                                <input type="checkbox" checked={checked} disabled={unavail} onChange={() => !unavail && toggleProductSet(sp.id, set.id)} className="accent-cyan-400" />
                                <span style={{ color: '#e2e8f0' }}>{set.name}</span>
                                {unavail ? (
                                  <span className="ml-auto text-xs" style={{ color: '#ef4444' }}>nicht verfügbar</span>
                                ) : (
                                  <span className="ml-auto" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Zubehör für dieses Produkt */}
                    {compatAccessories.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>ZUBEHÖR</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {compatAccessories.map((acc) => {
                            const checked = sp.accessories.includes(acc.id);
                            const avail = accAvailability[acc.id];
                            const unavail = avail && avail.remaining <= 0;
                            const price = days > 0 ? getAccessoryPrice(acc, days) : acc.price;
                            return (
                              <label key={acc.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${unavail ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} style={{ border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}`, background: checked ? '#06b6d40a' : 'transparent' }}>
                                <input type="checkbox" checked={checked} disabled={unavail} onChange={() => !unavail && toggleProductAccessory(sp.id, acc.id)} className="accent-cyan-400" />
                                <span style={{ color: '#e2e8f0' }}>{acc.name}</span>
                                {unavail ? (
                                  <span className="ml-auto" style={{ color: '#ef4444' }}>nicht verfügbar</span>
                                ) : (
                                  <span className="ml-auto" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notiz zu diesem Produkt */}
                    <div className="mt-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>NOTIZ ZU DIESEM PRODUKT</p>
                      <textarea
                        style={{ ...inputStyle, minHeight: 50, resize: 'vertical', fontSize: 12 }}
                        value={sp.note}
                        onChange={(e) => updateProductNote(sp.id, e.target.value)}
                        placeholder="z.B. Zustand, Seriennummer, Absprachen..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {selectedProducts.length === 0 && (
            <p className="text-xs" style={{ color: '#64748b' }}>Noch kein Produkt ausgewählt.</p>
          )}
        </div>

        {/* ─── Versand & Haftung ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Versand & Haftungsschutz</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label style={labelStyle}>Lieferung</label>
              <select style={selectStyle} value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as 'versand' | 'abholung')}>
                <option value="versand">Versand</option>
                <option value="abholung">Selbstabholung</option>
              </select>
            </div>
            {deliveryMode === 'versand' && (
              <div>
                <label style={labelStyle}>Versandart</label>
                <select style={selectStyle} value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value as 'standard' | 'express')}>
                  <option value="standard">{stdShippingLabel}</option>
                  <option value="express">Express (24h) — {(sp?.expressPrice ?? 12.99).toFixed(2)} €</option>
                </select>
              </div>
            )}
          </div>
          <label style={labelStyle}>Haftungsschutz</label>
          <div className="space-y-2">
            {HAFTUNG_OPTIONS.map((opt) => {
              const price = opt.value === 'standard' ? (dynPrices?.haftung?.standard ?? 15) : opt.value === 'premium' ? (dynPrices?.haftung?.premium ?? 25) : 0;
              return (
                <label key={opt.value} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: haftung === opt.value ? '#06b6d40a' : 'transparent', border: `1px solid ${haftung === opt.value ? '#06b6d433' : '#1e293b'}` }}>
                  <input type="radio" name="haftung" value={opt.value} checked={haftung === opt.value} onChange={() => setHaftung(opt.value)} className="accent-cyan-400" />
                  <span className="text-sm flex-1" style={{ color: '#e2e8f0' }}>{opt.label}</span>
                  <span className="text-xs font-semibold" style={{ color: price > 0 ? '#06b6d4' : '#64748b' }}>
                    {price > 0 ? `${price.toFixed(2)} €` : 'Kostenlos'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ─── Quelle & Notizen ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Herkunft & Notizen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Bestellquelle</label>
              <select style={selectStyle} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="kleinanzeigen">Kleinanzeigen</option>
                <option value="telefon">Telefon</option>
                <option value="email">E-Mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="vor-ort">Vor Ort</option>
                <option value="sonstige">Sonstige</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label style={labelStyle}>Interne Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z.B. Kleinanzeigen-Nachricht-ID, Absprachen etc." />
            </div>
          </div>
        </div>

        {/* ─── Preis & Zahlung ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Preis & Zahlung</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label style={labelStyle}>Manueller Gesamtpreis (optional)</label>
              <div className="relative">
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={`Berechnet: ${total.toFixed(2)} €`}
                />
                {manualPrice && (
                  <button
                    type="button"
                    onClick={() => setManualPrice('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                    style={{ color: '#94a3b8' }}
                  >
                    ✕ Zurücksetzen
                  </button>
                )}
              </div>
              {manualPrice && (
                <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                  Manueller Preis überschreibt den berechneten Preis ({total.toFixed(2)} €)
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Bezahlstatus</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: paymentStatus === 'paid' ? '#10b98125' : '#0f172a',
                    border: `1px solid ${paymentStatus === 'paid' ? '#10b981' : '#334155'}`,
                    color: paymentStatus === 'paid' ? '#10b981' : '#94a3b8',
                  }}
                >
                  Bezahlt
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('unpaid')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: paymentStatus === 'unpaid' ? '#f59e0b25' : '#0f172a',
                    border: `1px solid ${paymentStatus === 'unpaid' ? '#f59e0b' : '#334155'}`,
                    color: paymentStatus === 'unpaid' ? '#f59e0b' : '#94a3b8',
                  }}
                >
                  Nicht bezahlt
                </button>
              </div>
            </div>
          </div>

          {/* Kontodaten bei "nicht bezahlt" */}
          {paymentStatus === 'unpaid' && (
            <div className="rounded-lg p-4 mb-2" style={{ background: '#f59e0b0a', border: '1px solid #f59e0b33' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#f59e0b' }}>
                ÜBERWEISUNGSDATEN (werden in Notizen gespeichert)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" style={{ color: '#e2e8f0' }}>
                <div>
                  <span className="text-xs" style={{ color: '#64748b' }}>Kontoinhaber</span>
                  <p>Lennart Schickel</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: '#64748b' }}>IBAN</span>
                  <p style={{ fontFamily: 'monospace', letterSpacing: 1 }}>DE77 2022 0800 0027 7841 43</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: '#64748b' }}>BIC</span>
                  <p style={{ fontFamily: 'monospace' }}>SXPYDEHHXXX</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: '#64748b' }}>Verwendungszweck</span>
                  <p style={{ color: '#06b6d4' }}>{customerName.trim() || 'Kundenname'} – Kameraleihe</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Zusammenfassung ─── */}
        <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #06b6d433', padding: 20, marginBottom: 24 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Zusammenfassung
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
              <span>Kamera-Miete ({days || 0} {days === 1 ? 'Tag' : 'Tage'})</span>
              <span>{rentalPrice.toFixed(2)} €</span>
            </div>
            {setPrice > 0 && (
              <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
                <span>Sets ({selectedProducts.reduce((n, sp) => n + sp.sets.length, 0)}x)</span>
                <span>{setPrice.toFixed(2)} €</span>
              </div>
            )}
            {accessoryPrice > 0 && (
              <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
                <span>Zubehoer ({selectedProducts.reduce((n, sp) => n + sp.accessories.length, 0)}x)</span>
                <span>{accessoryPrice.toFixed(2)} €</span>
              </div>
            )}
            {haftungPrice > 0 && (
              <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
                <span>Haftungsschutz</span>
                <span>{haftungPrice.toFixed(2)} €</span>
              </div>
            )}
            {shippingPrice > 0 && (
              <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
                <span>Versand</span>
                <span>{shippingPrice.toFixed(2)} €</span>
              </div>
            )}
            <div style={{ height: 1, background: '#1e293b', margin: '8px 0' }} />
            {manualPrice && (
              <div className="flex justify-between text-xs line-through" style={{ color: '#64748b' }}>
                <span>Berechneter Preis</span>
                <span>{total.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between font-heading font-bold text-base" style={{ color: '#06b6d4' }}>
              <span>Gesamt {manualPrice ? '(manuell)' : ''}</span>
              <span>{finalTotal.toFixed(2)} €</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-xs" style={{ color: '#64748b' }}>
                <span>Kaution (vorgemerkt)</span>
                <span>{deposit.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-xs" style={{ color: paymentStatus === 'paid' ? '#10b981' : '#f59e0b' }}>
              <span>Status</span>
              <span>{paymentStatus === 'paid' ? 'Bezahlt' : 'Nicht bezahlt – Überweisung ausstehend'}</span>
            </div>
          </div>
        </div>

        {/* ─── Submit ─── */}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving || !days} className="px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50" style={{ background: '#06b6d4', color: 'white' }}>
            {saving ? 'Wird erstellt...' : 'Buchung erstellen'}
          </button>
          <button type="button" onClick={() => router.push('/admin/buchungen')} className="px-5 py-3 rounded-lg font-heading font-semibold text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
