'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { products } from '@/data/products';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface Accessory {
  id: string;
  name: string;
  pricePerDay: number;
}

interface DynPrices {
  haftung?: { standard: number; premium: number };
  shipping?: { standardPrice: number; expressPrice: number; freeShippingThreshold: number };
  products?: Record<string, { priceTable?: { days: number; price: number }[] }>;
}

const ACCESSORIES: Accessory[] = [
  { id: 'tripod', name: 'Mini-Stativ', pricePerDay: 1.5 },
  { id: 'sd64', name: 'SD-Karte 64GB', pricePerDay: 1 },
  { id: 'sd128', name: 'SD-Karte 128GB', pricePerDay: 1.5 },
  { id: 'extra-akku', name: 'Extra-Akku', pricePerDay: 2 },
];

const HAFTUNG_OPTIONS = [
  { value: 'none', label: 'Keine Haftungsbegrenzung', price: 0 },
  { value: 'standard', label: 'Standard-Haftungsschutz', price: 15 },
  { value: 'premium', label: 'Premium-Haftungsschutz', price: 25 },
];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function calcDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function getRentalPrice(product: typeof products[0], days: number, dynPrices?: DynPrices): number {
  const dynProduct = dynPrices?.products?.[product.id];
  const table = dynProduct?.priceTable ?? product.priceTable ?? [];
  const entry = table.find((e) => e.days === days);
  if (entry) return entry.price;
  if (days > 30 && product.priceFormula31plus) {
    return product.priceFormula31plus.base + product.priceFormula31plus.perDay * days;
  }
  return product.pricePerDay * days;
}

function getShippingPrice(subtotal: number, method: string, mode: string, dynPrices?: DynPrices): number {
  if (mode === 'abholung') return 0;
  const sp = dynPrices?.shipping;
  const expressPrice = sp?.expressPrice ?? 12.99;
  const standardPrice = sp?.standardPrice ?? 5.99;
  const threshold = sp?.freeShippingThreshold ?? 50;
  if (method === 'express') return expressPrice;
  return subtotal >= threshold ? 0 : standardPrice;
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#e2e8f0',
  fontSize: 14,
};

const selectStyle: React.CSSProperties = { ...inputStyle };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#64748b',
  marginBottom: 4,
  fontWeight: 600,
};

/* ─── Component ─────────────────────────────────────────────────────────────── */

export default function ManualBookingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dynPrices, setDynPrices] = useState<DynPrices | null>(null);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [productId, setProductId] = useState(products[0].id);
  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [haftung, setHaftung] = useState('none');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('kleinanzeigen');

  // Preise laden
  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => setDynPrices(d))
      .catch(() => {});
  }, []);

  const selectedProduct = products.find((p) => p.id === productId)!;
  const days = calcDays(rentalFrom, rentalTo);

  const haftungPrice = useMemo(() => {
    if (haftung === 'none') return 0;
    const h = dynPrices?.haftung;
    if (haftung === 'standard') return h?.standard ?? 15;
    return h?.premium ?? 25;
  }, [haftung, dynPrices]);

  const rentalPrice = useMemo(() => {
    if (!days || !selectedProduct) return 0;
    return getRentalPrice(selectedProduct, days, dynPrices ?? undefined);
  }, [selectedProduct, days, dynPrices]);

  const accessoryPrice = useMemo(() => {
    return selectedAccessories.reduce((sum, id) => {
      const acc = ACCESSORIES.find((a) => a.id === id);
      return sum + (acc ? acc.pricePerDay * days : 0);
    }, 0);
  }, [selectedAccessories, days]);

  const subtotal = rentalPrice + accessoryPrice + haftungPrice;
  const shippingPrice = getShippingPrice(subtotal, shippingMethod, deliveryMode, dynPrices ?? undefined);
  const total = subtotal + shippingPrice;
  const deposit = selectedProduct?.deposit ?? 0;

  function toggleAccessory(id: string) {
    setSelectedAccessories((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!customerName.trim()) { setError('Name ist ein Pflichtfeld.'); return; }
    if (!rentalFrom || !rentalTo) { setError('Mietzeitraum ist ein Pflichtfeld.'); return; }
    if (days <= 0) { setError('Ungültiger Mietzeitraum.'); return; }

    setSaving(true);
    try {
      const shippingAddress = street ? `${street}, ${zip} ${city}` : '';
      const res = await fetch('/api/admin/manual-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          product_name: selectedProduct.name,
          rental_from: rentalFrom,
          rental_to: rentalTo,
          days,
          delivery_mode: deliveryMode,
          shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
          shipping_price: shippingPrice,
          haftung,
          accessories: selectedAccessories,
          price_rental: rentalPrice,
          price_accessories: accessoryPrice,
          price_haftung: haftungPrice,
          price_total: total,
          deposit,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || null,
          shipping_address: shippingAddress || null,
          notes,
          source,
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

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h1 className="font-heading font-bold text-xl mb-1" style={{ color: '#e2e8f0' }}>
        Manuelle Buchung erstellen
      </h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>
        Fuer Kleinanzeigen, Telefon- oder sonstige externe Bestellungen
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ─── Kundendaten ─── */}
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Kundendaten
          </h2>
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

        {/* ─── Produkt & Zeitraum ─── */}
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Produkt & Zeitraum
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label style={labelStyle}>Kamera *</label>
              <select style={selectStyle} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.filter((p) => p.category === 'action-cam' || p.category === '360-cam').map((p) => (
                  <option key={p.id} value={p.id}>{p.brand} {p.name} — ab {p.pricePerDay.toFixed(2)} €/Tag</option>
                ))}
              </select>
            </div>
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
            <p className="mt-3 text-sm" style={{ color: '#06b6d4' }}>
              {days} {days === 1 ? 'Tag' : 'Tage'} · Mietpreis: {rentalPrice.toFixed(2)} €
            </p>
          )}
        </div>

        {/* ─── Zubehoer ─── */}
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Zubehoer
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ACCESSORIES.map((acc) => {
              const checked = selectedAccessories.includes(acc.id);
              return (
                <label
                  key={acc.id}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: checked ? '#06b6d40a' : 'transparent',
                    border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}`,
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleAccessory(acc.id)} className="accent-cyan-400" />
                  <div className="flex-1">
                    <span className="text-sm" style={{ color: '#e2e8f0' }}>{acc.name}</span>
                    <span className="text-xs ml-2" style={{ color: '#64748b' }}>{acc.pricePerDay.toFixed(2)} €/Tag</span>
                  </div>
                  {checked && days > 0 && (
                    <span className="text-xs font-semibold" style={{ color: '#06b6d4' }}>
                      {(acc.pricePerDay * days).toFixed(2)} €
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* ─── Versand & Haftung ─── */}
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Versand & Haftungsschutz
          </h2>
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
                  <option value="standard">Standard (3-5 Tage) — {shippingPrice === 0 && subtotal >= (dynPrices?.shipping?.freeShippingThreshold ?? 50) ? 'Gratis' : (dynPrices?.shipping?.standardPrice ?? 5.99).toFixed(2) + ' €'}</option>
                  <option value="express">Express (24h) — {(dynPrices?.shipping?.expressPrice ?? 12.99).toFixed(2)} €</option>
                </select>
              </div>
            )}
          </div>

          <label style={labelStyle}>Haftungsschutz</label>
          <div className="space-y-2">
            {HAFTUNG_OPTIONS.map((opt) => {
              const dynPrice = opt.value === 'standard' ? (dynPrices?.haftung?.standard ?? opt.price) : opt.value === 'premium' ? (dynPrices?.haftung?.premium ?? opt.price) : 0;
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: haftung === opt.value ? '#06b6d40a' : 'transparent',
                    border: `1px solid ${haftung === opt.value ? '#06b6d433' : '#1e293b'}`,
                  }}
                >
                  <input type="radio" name="haftung" value={opt.value} checked={haftung === opt.value} onChange={() => setHaftung(opt.value)} className="accent-cyan-400" />
                  <span className="text-sm flex-1" style={{ color: '#e2e8f0' }}>{opt.label}</span>
                  <span className="text-xs font-semibold" style={{ color: dynPrice > 0 ? '#06b6d4' : '#64748b' }}>
                    {dynPrice > 0 ? `${dynPrice.toFixed(2)} €` : 'Kostenlos'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ─── Quelle & Notizen ─── */}
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 }}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Herkunft & Notizen
          </h2>
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
              <textarea
                style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. Kleinanzeigen-Nachricht-ID, Absprachen etc."
              />
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
              <span>Kamera-Miete ({days} {days === 1 ? 'Tag' : 'Tage'})</span>
              <span>{rentalPrice.toFixed(2)} €</span>
            </div>
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
          <button
            type="submit"
            disabled={saving || !days}
            className="px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ background: '#06b6d4', color: 'white' }}
          >
            {saving ? 'Wird erstellt...' : 'Buchung erstellen'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/buchungen')}
            className="px-5 py-3 rounded-lg font-heading font-semibold text-sm transition-colors"
            style={{ background: '#1e293b', color: '#94a3b8' }}
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
