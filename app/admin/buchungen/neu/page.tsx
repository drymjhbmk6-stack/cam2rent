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
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; qty: number }[]>([]);
  const [addProductId, setAddProductId] = useState('');
  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [haftung, setHaftung] = useState('none');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('kleinanzeigen');

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
      return [...prev, { id: addProductId, qty: 1 }];
    });
  }
  function removeProduct(id: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  }
  function updateProductQty(id: string, qty: number) {
    if (qty < 1) return removeProduct(id);
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, qty } : p));
  }

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
    return selectedAccessories.reduce((sum, id) => {
      const acc = accessories.find((a) => a.id === id);
      return sum + (acc ? getAccessoryPrice(acc, days) : 0);
    }, 0);
  }, [selectedAccessories, accessories, days]);

  const setPrice = useMemo(() => {
    return selectedSets.reduce((sum, id) => {
      const s = sets.find((st) => st.id === id);
      return sum + (s ? getSetPrice(s, days) : 0);
    }, 0);
  }, [selectedSets, sets, days]);

  const subtotal = rentalPrice + accessoryPrice + setPrice + haftungPrice;
  const sp = dynPrices?.shipping;
  const shippingPrice = deliveryMode === 'abholung' ? 0
    : shippingMethod === 'express' ? (sp?.expressPrice ?? 12.99)
    : subtotal >= (sp?.freeShippingThreshold ?? 50) ? 0 : (sp?.standardPrice ?? 5.99);
  const total = subtotal + shippingPrice;
  const deposit = totalDeposit;

  function toggleAccessory(id: string) {
    setSelectedAccessories((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  }
  function toggleSet(id: string) {
    setSelectedSets((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

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
      const accNames = selectedAccessories.map((id) => accessories.find((a) => a.id === id)?.name ?? id);
      const setNames = selectedSets.map((id) => sets.find((s) => s.id === id)?.name ?? id);
      const productNames = selectedProducts.map((sp) => {
        const p = productList.find((pl) => pl.id === sp.id);
        return sp.qty > 1 ? `${sp.qty}x ${p?.name ?? sp.id}` : (p?.name ?? sp.id);
      });
      const mainProduct = selectedProducts[0];

      const res = await fetch('/api/admin/manual-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: mainProduct.id,
          product_name: productNames.join(', '),
          rental_from: rentalFrom,
          rental_to: rentalTo,
          days,
          delivery_mode: deliveryMode,
          shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
          shipping_price: shippingPrice,
          haftung,
          accessories: [...selectedAccessories, ...selectedSets],
          price_rental: rentalPrice,
          price_accessories: accessoryPrice + setPrice,
          price_haftung: haftungPrice,
          price_total: total,
          deposit,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || null,
          shipping_address: shippingAddress || null,
          notes: [
            source ? `Quelle: ${source}` : '',
            setNames.length ? `Sets: ${setNames.join(', ')}` : '',
            accNames.length ? `Zubehoer: ${accNames.join(', ')}` : '',
            notes,
          ].filter(Boolean).join(' | '),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');
      setSuccess(`Buchung ${data.bookingId} erfolgreich erstellt!`);
      setTimeout(() => router.push('/admin/buchungen'), 1500);
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

  const availableAccessories = accessories.filter((a) => a.available);
  const availableSets = sets.filter((s) => s.available);
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

          {/* Liste */}
          {selectedProducts.length > 0 && (
            <div className="space-y-2 mb-4">
              {selectedProducts.map((sp) => {
                const p = productList.find((pl) => pl.id === sp.id);
                const price = days > 0 ? getRentalPrice(sp.id, days, dynPrices, staticProducts) * sp.qty : 0;
                return (
                  <div key={sp.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#06b6d40a', border: '1px solid #06b6d433' }}>
                    <div className="flex-1">
                      <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{p?.name ?? sp.id}</span>
                      {!p?.available && <span className="text-xs ml-2" style={{ color: '#f59e0b' }}>(nicht verfügbar)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateProductQty(sp.id, sp.qty - 1)} className="w-7 h-7 rounded flex items-center justify-center text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>−</button>
                      <span className="text-sm font-semibold w-6 text-center" style={{ color: '#e2e8f0' }}>{sp.qty}</span>
                      <button type="button" onClick={() => updateProductQty(sp.id, sp.qty + 1)} className="w-7 h-7 rounded flex items-center justify-center text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>+</button>
                    </div>
                    {days > 0 && <span className="text-xs font-semibold ml-2" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>}
                    <button type="button" onClick={() => removeProduct(sp.id)} className="text-xs p-1" style={{ color: '#ef4444' }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {selectedProducts.length === 0 && (
            <p className="text-xs mb-4" style={{ color: '#64748b' }}>Noch kein Produkt ausgewählt.</p>
          )}

          {/* Zeitraum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Mietbeginn *</label>
              <input style={inputStyle} type="date" value={rentalFrom} onChange={(e) => setRentalFrom(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Mietende *</label>
              <input style={inputStyle} type="date" value={rentalTo} onChange={(e) => setRentalTo(e.target.value)} required />
            </div>
          </div>
          {days > 0 && selectedProducts.length > 0 && (
            <p className="mt-3 text-sm" style={{ color: '#06b6d4' }}>
              {days} {days === 1 ? 'Tag' : 'Tage'} · Mietpreis gesamt: {rentalPrice.toFixed(2)} €
            </p>
          )}
        </div>

        {/* ─── Sets ─── */}
        {availableSets.length > 0 && (
          <div style={sectionStyle}>
            <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Sets</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableSets.map((set) => {
                const checked = selectedSets.includes(set.id);
                const price = days > 0 ? getSetPrice(set, days) : set.price;
                return (
                  <label key={set.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: checked ? '#06b6d40a' : 'transparent', border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSet(set.id)} className="accent-cyan-400" />
                    <div className="flex-1">
                      <span className="text-sm" style={{ color: '#e2e8f0' }}>{set.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>
                        {set.price.toFixed(2)} €{set.pricing_mode === 'perDay' ? '/Tag' : ' pauschal'}
                      </span>
                    </div>
                    {checked && days > 0 && (
                      <span className="text-xs font-semibold" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Zubehoer ─── */}
        {availableAccessories.length > 0 && (
          <div style={sectionStyle}>
            <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Zubehoer</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableAccessories.map((acc) => {
                const checked = selectedAccessories.includes(acc.id);
                const price = days > 0 ? getAccessoryPrice(acc, days) : acc.price;
                return (
                  <label key={acc.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: checked ? '#06b6d40a' : 'transparent', border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAccessory(acc.id)} className="accent-cyan-400" />
                    <div className="flex-1">
                      <span className="text-sm" style={{ color: '#e2e8f0' }}>{acc.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>
                        {acc.price.toFixed(2)} €{acc.pricing_mode === 'perDay' ? '/Tag' : ' pauschal'}
                      </span>
                    </div>
                    {checked && days > 0 && (
                      <span className="text-xs font-semibold" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
                <span>Sets ({selectedSets.length}x)</span>
                <span>{setPrice.toFixed(2)} €</span>
              </div>
            )}
            {accessoryPrice > 0 && (
              <div className="flex justify-between" style={{ color: '#e2e8f0' }}>
                <span>Zubehoer ({selectedAccessories.length}x)</span>
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
            <div className="flex justify-between font-heading font-bold text-base" style={{ color: '#06b6d4' }}>
              <span>Gesamt</span>
              <span>{total.toFixed(2)} €</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-xs" style={{ color: '#64748b' }}>
                <span>Kaution (vorgemerkt)</span>
                <span>{deposit.toFixed(2)} €</span>
              </div>
            )}
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
