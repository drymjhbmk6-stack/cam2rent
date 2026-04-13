'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { calcHaftungTieredPrice } from '@/lib/price-config';
import SignatureStep, { type SignatureResult } from '@/components/booking/SignatureStep';

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
  compatible_product_ids?: string[];
  internal?: boolean;
  upgrade_group?: string | null;
  is_upgrade_base?: boolean;
}

interface DynSet {
  id: string;
  name: string;
  description?: string;
  pricing_mode: 'perDay' | 'flat';
  price: number;
  available: boolean;
  product_ids?: string[];
}

interface DynPrices {
  haftung?: { standard: number; standardIncrement?: number; standardEigenbeteiligung?: number; premium: number; premiumIncrement?: number };
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
  const [customerUserId, setCustomerUserId] = useState('');

  // Kundensuche
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<{ id: string; full_name: string; email: string; phone: string; address_city: string }[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ id: string; full_name: string; email: string; phone: string; address_street?: string; address_zip?: string; address_city: string }[]>([]);

  const loadCustomers = useCallback(async () => {
    if (allCustomers.length > 0) return;
    setCustomerSearchLoading(true);
    try {
      const res = await fetch('/api/admin/kunden');
      const data = await res.json();
      if (data.customers) {
        setAllCustomers(data.customers);
        setCustomerSearchResults(data.customers.slice(0, 8));
      }
    } catch {}
    setCustomerSearchLoading(false);
  }, [allCustomers.length]);

  // Kundensuche filtern
  useEffect(() => {
    if (!showCustomerSearch) return;
    if (!customerSearchQuery.trim()) {
      setCustomerSearchResults(allCustomers.slice(0, 8));
      return;
    }
    const q = customerSearchQuery.toLowerCase();
    const filtered = allCustomers.filter((c) =>
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.address_city?.toLowerCase().includes(q)
    );
    setCustomerSearchResults(filtered.slice(0, 8));
  }, [customerSearchQuery, allCustomers, showCustomerSearch]);

  function selectCustomer(c: typeof allCustomers[0]) {
    setCustomerName(c.full_name);
    setCustomerEmail(c.email);
    setCustomerUserId(c.id);
    // Adresse aus Profil laden
    fetch(`/api/admin/customer/${c.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          if (data.profile.address_street) setStreet(data.profile.address_street);
          if (data.profile.address_zip) setZip(data.profile.address_zip);
          if (data.profile.address_city) setCity(data.profile.address_city);
        }
      })
      .catch(() => {});
    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
  }
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; qty: number; accessories: string[]; sets: string[]; note: string; customPrice: string; haftung: string; serial: string }[]>([]);
  const [addProductId, setAddProductId] = useState('');
  const [rentalFrom, setRentalFrom] = useState('');
  const [rentalTo, setRentalTo] = useState('');
  const [accAvailability, setAccAvailability] = useState<Record<string, { remaining: number; compatible: boolean; total: number }>>({});
  const [depositMode, setDepositMode] = useState<'kaution' | 'haftung'>('haftung');
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>('versand');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('kleinanzeigen');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [customShippingPrice, setCustomShippingPrice] = useState('');
  const [remark, setRemark] = useState('');
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureResult | null>(null);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  // Load all data on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/prices').then((r) => r.json()),
      import('@/data/products').then((m) => m.products),
      fetch('/api/admin/accessories').then((r) => r.ok ? r.json() : { accessories: [] }),
      fetch('/api/sets?available=true').then((r) => r.ok ? r.json() : { sets: [] }),
      fetch('/api/admin/settings?key=deposit_mode').then((r) => r.ok ? r.json() : null),
    ])
      .then(([prices, prods, accData, setData, depositSetting]) => {
        setDynPrices(prices);
        setStaticProducts(prods);
        setAccessories(accData.accessories ?? []);
        setSets(setData.sets ?? []);
        if (depositSetting?.value) setDepositMode(depositSetting.value);
        // Set default for add-dropdown (DB-Produkte bevorzugen)
        const apKeys = Object.keys(prices?.adminProducts ?? {});
        if (apKeys.length > 0) setAddProductId(apKeys[0]);
        else if (prods.length > 0) setAddProductId(prods[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Produktliste: primaer aus DB (adminProducts), Fallback auf statische Daten
  const productList = useMemo(() => {
    const ap = dynPrices?.adminProducts;
    if (ap && Object.keys(ap).length > 0) {
      return Object.values(ap).map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        available: p.available ?? true,
        deposit: p.deposit ?? 0,
      }));
    }
    return staticProducts
      .filter((p) => p.id)
      .map((sp) => ({
        id: sp.id,
        name: sp.name,
        brand: sp.brand,
        available: true,
        deposit: sp.deposit ?? 0,
      }));
  }, [staticProducts, dynPrices]);

  const days = calcDays(rentalFrom, rentalTo);

  function addProduct() {
    if (!addProductId) return;
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.id === addProductId);
      if (existing) return prev.map((p) => p.id === addProductId ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { id: addProductId, qty: 1, accessories: [], sets: [], note: '', customPrice: '', haftung: 'none', serial: '' }];
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
  function updateProductCustomPrice(id: string, customPrice: string) {
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, customPrice } : p));
  }
  function updateProductHaftung(id: string, haftung: string) {
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, haftung } : p));
  }
  function updateProductSerial(id: string, serial: string) {
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, serial } : p));
  }
  function toggleProductAccessory(productId: string, accId: string) {
    setSelectedProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const has = p.accessories.includes(accId);
      return { ...p, accessories: has ? p.accessories.filter((a) => a !== accId) : [...p.accessories, accId] };
    }));
  }
  function selectProductUpgrade(productId: string, accId: string, group: string) {
    setSelectedProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const groupIds = accessories.filter((a) => a.upgrade_group === group).map((a) => a.id);
      const without = p.accessories.filter((id) => !groupIds.includes(id));
      const acc = accessories.find((a) => a.id === accId);
      if (acc?.is_upgrade_base) return { ...p, accessories: without };
      return { ...p, accessories: [...without, accId] };
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

  function getHaftungPrice(haftungValue: string): number {
    if (haftungValue === 'none') return 0;
    const h = dynPrices?.haftung;
    const d = days || 1;
    return haftungValue === 'standard'
      ? calcHaftungTieredPrice(h?.standard ?? 15, h?.standardIncrement ?? 5, d)
      : calcHaftungTieredPrice(h?.premium ?? 25, h?.premiumIncrement ?? 10, d);
  }

  const haftungPrice = useMemo(() => {
    return selectedProducts.reduce((sum, sp) => sum + getHaftungPrice(sp.haftung) * sp.qty, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts, dynPrices]);

  const rentalPrice = useMemo(() => {
    if (!days) return 0;
    return selectedProducts.reduce((sum, sp) => {
      const custom = parseFloat(sp.customPrice);
      if (!isNaN(custom) && sp.customPrice !== '') return sum + custom * sp.qty;
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
  const shippingPriceCalc = (() => {
    if (deliveryMode === 'abholung') return 0;
    const customParsed = parseFloat(customShippingPrice);
    if (customShippingPrice !== '' && !isNaN(customParsed)) return customParsed;
    return 0; // Standard: kostenlos bei manuellen Buchungen
  })();
  const shippingPrice = shippingPriceCalc;
  const total = subtotal + shippingPrice;
  const deposit = totalDeposit;

  // ─── Rechnungs-Vorschau ───
  const openInvoicePreview = useCallback(() => {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;
    const fmtD = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
    const fmtP = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

    // Positionen sammeln (alle Produkte)
    const items: { description: string; amount: number }[] = [];
    for (const prod of selectedProducts) {
      const p = productList.find((pl) => pl.id === prod.id);
      const custom = parseFloat(prod.customPrice);
      const price = (prod.customPrice !== '' && !isNaN(custom)) ? custom : (days > 0 ? getRentalPrice(prod.id, days, dynPrices, staticProducts) : 0);
      items.push({
        description: `Kamera-Miete: ${p?.name ?? prod.id}${prod.serial ? ' (SN: ' + prod.serial + ')' : ''} (${days} ${days === 1 ? 'Tag' : 'Tage'}${rentalFrom ? ', ' + fmtD(rentalFrom) + ' – ' + fmtD(rentalTo) : ''})${prod.qty > 1 ? ` × ${prod.qty}` : ''}`,
        amount: price * prod.qty,
      });
      // Zubehör
      for (const accId of prod.accessories) {
        const acc = accessories.find((a) => a.id === accId);
        if (acc) items.push({ description: acc.name, amount: getAccessoryPrice(acc, days) * prod.qty });
      }
      // Sets
      for (const setId of prod.sets) {
        const s = sets.find((st) => st.id === setId);
        if (s) items.push({ description: `Set: ${s.name}`, amount: getSetPrice(s, days) * prod.qty });
      }
      // Haftung
      const hp = getHaftungPrice(prod.haftung);
      if (hp > 0) {
        const label = prod.haftung === 'standard' ? 'Standard-Haftungsoption' : 'Premium-Haftungsoption';
        items.push({ description: `${label} (${p?.name ?? prod.id})`, amount: hp * prod.qty });
      }
      // Notiz
      if (prod.note) {
        items.push({ description: `inkl. ${prod.note}`, amount: 0 });
      }
    }
    // Versand immer als Position zeigen
    if (deliveryMode === 'versand') {
      const versandLabel = shippingMethod === 'express' ? 'Express-Versand (1–2 Werktage)' : 'Standard-Versand (3–5 Werktage)';
      items.push({ description: versandLabel, amount: shippingPrice });
    } else {
      items.push({ description: 'Selbstabholung', amount: 0 });
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Rechnungsvorschau – cam2rent</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a; width: 210mm; min-height: 297mm; padding: 48px 52px 60px; position: relative; }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #111827; padding: 12px 24px; display: flex; gap: 12px; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
  .toolbar button { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
  .btn-pdf { background: #06b6d4; color: #fff; }
  .btn-print { background: #374151; color: #e5e7eb; }
  .toolbar-spacer { height: 52px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 36px; }
  .brand { font-size: 20pt; font-weight: 700; color: #0a0a0a; letter-spacing: 0.5px; }
  .brand-sub { font-size: 9pt; color: #9ca3af; margin-top: 2px; }
  .sender { font-size: 9pt; color: #6b7280; text-align: right; line-height: 1.6; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .meta-title { font-size: 18pt; font-weight: 700; color: #0a0a0a; }
  .meta-sub { font-size: 9pt; color: #6b7280; }
  .meta-right { text-align: right; }
  .meta-label { font-size: 9pt; color: #9ca3af; margin-bottom: 2px; }
  .meta-value { font-size: 10pt; font-weight: 700; color: #0a0a0a; }
  .meta-gap { margin-top: 8px; }
  .addr { margin-bottom: 24px; padding: 14px; background: #f9f9f7; border-radius: 6px; }
  .addr-label { font-size: 8pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .addr-name { font-size: 11pt; font-weight: 700; margin-bottom: 2px; }
  .addr-email { font-size: 9pt; color: #6b7280; }
  .section { font-size: 9pt; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
  .detail { display: flex; margin-bottom: 5px; }
  .detail-label { width: 35%; font-size: 9pt; color: #6b7280; }
  .detail-value { width: 65%; font-size: 10pt; }
  .divider { border-bottom: 1px solid #e5e7eb; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f5f0; padding: 8px 10px; font-size: 9pt; font-weight: 700; color: #6b7280; text-align: left; }
  th:last-child { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 10pt; }
  td:last-child { text-align: right; }
  .total-row { background: #0a0a0a; color: #fff; }
  .total-row td { font-size: 11pt; font-weight: 700; color: #fff; border: none; padding: 10px; border-radius: 4px; }
  .note { margin-top: 28px; padding: 12px; background: #f9f9f7; border-radius: 6px; font-size: 9pt; color: #6b7280; line-height: 1.5; }
  .footer { position: absolute; bottom: 30px; left: 52px; right: 52px; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; }
  .status-paid { color: #16a34a; font-weight: 700; }
  .status-unpaid { color: #d97706; font-weight: 700; }
  .zero-amount { color: #9ca3af; font-style: italic; }
  @media print { .toolbar, .toolbar-spacer { display: none !important; } body { padding: 48px 52px 60px; } }
</style></head><body>
  <div class="toolbar">
    <button class="btn-pdf" onclick="window.print()">Als PDF speichern</button>
    <button class="btn-print" onclick="window.print()">Drucken</button>
  </div>
  <div class="toolbar-spacer"></div>
  <div class="header">
    <div><div class="brand">cam2rent</div><div class="brand-sub">Action-Cam Verleih</div></div>
    <div class="sender">Lennart Schickel<br>Heimsbrunner Str. 12<br>12349 Berlin<br>buchung@cam2rent.de<br>cam2rent.de</div>
  </div>
  <div class="meta">
    <div><div class="meta-title">Rechnung</div><div class="meta-sub">Buchungsbestätigung & Beleg</div></div>
    <div class="meta-right">
      <div class="meta-label">Rechnungsdatum</div><div class="meta-value">${dateStr}</div>
      <div class="meta-label meta-gap">Mietzeitraum</div><div class="meta-value">${rentalFrom ? fmtD(rentalFrom) + ' – ' + fmtD(rentalTo) : '–'}</div>
    </div>
  </div>
  <div class="addr">
    <div class="addr-label">Rechnungsempfänger</div>
    <div class="addr-name">${customerName || 'Kunde'}</div>
    ${customerEmail ? `<div class="addr-email">${customerEmail}</div>` : ''}
    ${street ? `<div class="addr-email">${street}, ${zip} ${city}</div>` : ''}
  </div>
  <div class="section">Buchungsdetails</div>
  <div class="detail"><div class="detail-label">Lieferung</div><div class="detail-value">${deliveryMode === 'abholung' ? 'Selbstabholung' : shippingMethod === 'express' ? 'Express-Versand' : 'Standard-Versand'}</div></div>
  <div class="detail"><div class="detail-label">Zahlungsstatus</div><div class="detail-value ${paymentStatus === 'paid' ? 'status-paid' : 'status-unpaid'}">${paymentStatus === 'paid' ? 'Bezahlt' : 'Nicht bezahlt'}</div></div>
  <div class="divider"></div>
  <div class="section">Leistungen</div>
  <table>
    <thead><tr><th>Beschreibung</th><th>Betrag</th></tr></thead>
    <tbody>
      ${items.map(item => `<tr><td>${item.description}</td><td${item.amount === 0 ? ' class="zero-amount"' : ''}>${item.amount > 0 ? fmtP(item.amount) : '–'}</td></tr>`).join('\n      ')}
    </tbody>
  </table>
  <table style="margin-top:4px"><tbody><tr class="total-row"><td>Gesamtbetrag</td><td>${fmtP(total)}</td></tr></tbody></table>
  ${(depositMode === 'kaution') && deposit > 0 ? `<div style="font-size:8pt;color:#6b7280;margin-top:6px;text-align:right">* Enthält Kaution ${fmtP(deposit)} – wird nach Rückgabe erstattet</div>` : ''}
  ${remark ? `<div class="note" style="margin-top:16px"><strong>Bemerkung:</strong><br>${remark.replace(/\n/g, '<br>')}</div>` : ''}
  <div class="note"${remark ? ' style="margin-top:8px"' : ''}>Gemäß §19 UStG wird keine Umsatzsteuer berechnet.</div>
  ${paymentStatus === 'unpaid' ? `<div class="note" style="margin-top:12px;border:1px solid #d97706;background:#fffbeb"><strong style="color:#d97706">Überweisungsdaten:</strong><br>Kontoinhaber: Lennart Schickel<br>IBAN: DE77 2022 0800 0027 7841 43<br>BIC: SXPYDEHHXXX<br>Verwendungszweck: ${customerName || 'Kunde'} – Kameraleihe</div>` : ''}
  <div class="footer"><span>cam2rent · Lennart Schickel · Heimsbrunner Str. 12 · 12349 Berlin</span><span>cam2rent.de · buchung@cam2rent.de</span></div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=1100');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts, productList, days, rentalFrom, rentalTo, dynPrices, staticProducts, accessories, sets, shippingPrice, shippingMethod, deliveryMode, customerName, customerEmail, street, zip, city, paymentStatus, total, deposit, depositMode, remark]);

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

      // Alle Produkte zusammenfassen als EINE Buchung
      const productNames: string[] = [];
      const allAccessories: string[] = [];
      const allNotes: string[] = [];
      let totalRental = 0;
      let totalAcc = 0;
      let totalHaftung = 0;
      let totalDep = 0;
      let haftungValue = 'none';

      for (const sp of selectedProducts) {
        const p = productList.find((pl) => pl.id === sp.id);
        const customParsed = parseFloat(sp.customPrice);
        const pPrice = (sp.customPrice !== '' && !isNaN(customParsed)) ? customParsed : (days > 0 ? getRentalPrice(sp.id, days, dynPrices, staticProducts) : 0);
        const pAccPrice = sp.accessories.reduce((sum, id) => {
          const acc = accessories.find((a) => a.id === id);
          return sum + (acc ? getAccessoryPrice(acc, days) : 0);
        }, 0);
        const pSetPrice = sp.sets.reduce((sum, id) => {
          const s = sets.find((st) => st.id === id);
          return sum + (s ? getSetPrice(s, days) : 0);
        }, 0);
        const pHaftungPrice = getHaftungPrice(sp.haftung);
        const pDeposit = (depositMode === 'kaution') ? (p?.deposit ?? 0) : 0;

        for (let q = 0; q < sp.qty; q++) {
          productNames.push(p?.name ?? sp.id);
        }
        totalRental += pPrice * sp.qty;
        totalAcc += (pAccPrice + pSetPrice) * sp.qty;
        totalHaftung += pHaftungPrice * sp.qty;
        totalDep += pDeposit * sp.qty;
        allAccessories.push(...sp.accessories, ...sp.sets);
        if (sp.haftung !== 'none') haftungValue = sp.haftung;

        const accNames = sp.accessories.map((id) => accessories.find((a) => a.id === id)?.name ?? id);
        const setNames = sp.sets.map((id) => sets.find((s) => s.id === id)?.name ?? id);

        if (sp.customPrice !== '' && !isNaN(customParsed)) allNotes.push(`Manueller Preis (${p?.name ?? sp.id}): ${customParsed.toFixed(2)} €`);
        if (sp.serial) allNotes.push(`SN (${p?.name ?? sp.id}): ${sp.serial}`);
        if (sp.note) allNotes.push(`Produkt-Notiz (${p?.name ?? sp.id}): ${sp.note}`);
        if (setNames.length) allNotes.push(`Sets: ${setNames.join(', ')}`);
        if (accNames.length) allNotes.push(`Zubehör: ${accNames.join(', ')}`);
      }

      const bankInfo = paymentStatus === 'unpaid'
        ? `Überweisung ausstehend | Kontoinhaber: Lennart Schickel | IBAN: DE77 2022 0800 0027 7841 43 | BIC: SXPYDEHHXXX | Verwendungszweck: ${customerName.trim() || 'Kunde'} – Kameraleihe`
        : '';

      const res = await fetch('/api/admin/manual-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProducts[0].id,
          product_name: productNames.join(', '),
          rental_from: rentalFrom,
          rental_to: rentalTo,
          days,
          delivery_mode: deliveryMode,
          shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
          shipping_price: shippingPrice,
          haftung: haftungValue,
          accessories: allAccessories,
          price_rental: totalRental,
          price_accessories: totalAcc,
          price_haftung: totalHaftung,
          price_total: total,
          deposit: totalDep,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || null,
          user_id: customerUserId || null,
          shipping_address: shippingAddress || null,
          payment_status: paymentStatus,
          send_email: !!customerEmail.trim(),
          contractSignature: signatureData ?? undefined,
          notes: [
            source ? `Quelle: ${source}` : '',
            paymentStatus === 'paid' ? 'Bezahlt' : '',
            ...allNotes,
            bankInfo,
            remark ? `Bemerkung: ${remark}` : '',
            notes,
          ].filter(Boolean).join(' | '),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');

      setCreatedBookingId(data.bookingId);
      setSuccess(`Buchung erstellt: ${data.bookingId}`);
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-sm" style={headingStyle}>Kundendaten</h2>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowCustomerSearch(!showCustomerSearch); if (!showCustomerSearch) loadCustomers(); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                style={{ background: showCustomerSearch ? '#334155' : '#1e293b', color: '#06b6d4', border: '1px solid #334155' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Kunde laden
              </button>

              {/* Suchdropdown */}
              {showCustomerSearch && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl z-50"
                  style={{ background: '#1e293b', border: '1px solid #334155' }}
                >
                  <div className="p-3 border-b" style={{ borderColor: '#334155' }}>
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="Name, E-Mail oder Stadt..."
                      autoFocus
                      className="w-full text-sm"
                      style={{ ...inputStyle, background: '#0f172a' }}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {customerSearchLoading ? (
                      <p className="p-4 text-center text-xs" style={{ color: '#64748b' }}>Wird geladen...</p>
                    ) : customerSearchResults.length === 0 ? (
                      <p className="p-4 text-center text-xs" style={{ color: '#64748b' }}>Keine Kunden gefunden</p>
                    ) : (
                      customerSearchResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-3"
                          style={{ borderBottom: '1px solid #1e293b' }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>
                            {c.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>{c.full_name || 'Kein Name'}</p>
                            <p className="text-xs truncate" style={{ color: '#64748b' }}>
                              {c.email}{c.address_city ? ` · ${c.address_city}` : ''}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ausgewaehlter Kunde Badge */}
          {customerUserId && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#06b6d410', border: '1px solid #06b6d430', color: '#06b6d4' }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Verknüpft mit bestehendem Kunden</span>
              <button type="button" onClick={() => setCustomerUserId('')} className="ml-auto hover:text-white transition-colors">✕</button>
            </div>
          )}

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
                const autoPrice = days > 0 ? getRentalPrice(sp.id, days, dynPrices, staticProducts) : 0;
                const customParsed = parseFloat(sp.customPrice);
                const hasCustomPrice = sp.customPrice !== '' && !isNaN(customParsed);
                const displayPrice = hasCustomPrice ? customParsed * sp.qty : autoPrice * sp.qty;
                // Kompatible Zubehörteile für dieses Produkt (nicht internal, kompatibel)
                const compatAccessories = accessories.filter((acc) => {
                  if (!acc.available) return false;
                  if (acc.internal) return false;
                  if (acc.compatible_product_ids?.length) {
                    return acc.compatible_product_ids.includes(sp.id);
                  }
                  return true;
                });
                const regularAccessories = compatAccessories.filter((a) => !a.upgrade_group);
                const upgradeGroups = [...new Set(compatAccessories.filter((a) => a.upgrade_group).map((a) => a.upgrade_group!))];
                const compatSets = sets.filter((s) => {
                  if (!s.available) return false;
                  if (s.product_ids?.length) return s.product_ids.includes(sp.id);
                  return true;
                });

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
                      {days > 0 && <span className="text-xs font-semibold" style={{ color: '#06b6d4' }}>{displayPrice.toFixed(2)} €</span>}
                      <button type="button" onClick={() => removeProduct(sp.id)} className="text-xs p-1" style={{ color: '#ef4444' }}>✕</button>
                    </div>

                    {/* Preis + Seriennummer */}
                    <div className="mb-3">
                      <div className="flex gap-3 items-end">
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>PREIS (PRO STÜCK)</p>
                          <div className="flex items-center gap-2">
                            <input
                              style={{ ...inputStyle, width: 140, fontSize: 13 }}
                              type="number"
                              step="0.01"
                              min="0"
                              value={sp.customPrice}
                              onChange={(e) => updateProductCustomPrice(sp.id, e.target.value)}
                              placeholder={days > 0 ? `${autoPrice.toFixed(2)} € (auto)` : 'Preis'}
                            />
                            {hasCustomPrice && (
                              <button type="button" onClick={() => updateProductCustomPrice(sp.id, '')} className="text-xs" style={{ color: '#94a3b8' }}>✕</button>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>SERIENNUMMER</p>
                          <input
                            style={{ ...inputStyle, fontSize: 13 }}
                            value={sp.serial}
                            onChange={(e) => updateProductSerial(sp.id, e.target.value)}
                            placeholder="z.B. C3531350615214"
                          />
                        </div>
                      </div>
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

                    {/* Upgrade-Gruppen (Radio-Buttons) */}
                    {upgradeGroups.map((group) => {
                      const groupAccs = compatAccessories.filter((a) => a.upgrade_group === group);
                      if (!groupAccs.length) return null;
                      const baseAcc = groupAccs.find((a) => a.is_upgrade_base);
                      const basePrice = baseAcc && days > 0 ? getAccessoryPrice(baseAcc, days) : 0;
                      const selectedId = groupAccs.find((a) => sp.accessories.includes(a.id))?.id ?? baseAcc?.id ?? null;
                      return (
                        <div key={group} className="mb-3">
                          <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>{group.toUpperCase()}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {groupAccs.map((acc) => {
                              const isSelected = selectedId === acc.id || (acc.is_upgrade_base && !groupAccs.some((a) => !a.is_upgrade_base && sp.accessories.includes(a.id)));
                              const upgradePrice = days > 0 ? getAccessoryPrice(acc, days) - basePrice : acc.price;
                              return (
                                <label key={acc.id} className="flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer" style={{ border: `1px solid ${isSelected ? '#06b6d433' : '#1e293b'}`, background: isSelected ? '#06b6d40a' : 'transparent' }}>
                                  <input type="radio" name={`upgrade-${sp.id}-${group}`} checked={isSelected} onChange={() => selectProductUpgrade(sp.id, acc.id, group)} className="accent-cyan-400" />
                                  <span style={{ color: '#e2e8f0' }}>{acc.name}</span>
                                  <span className="ml-auto" style={{ color: acc.is_upgrade_base ? '#22c55e' : '#06b6d4' }}>
                                    {acc.is_upgrade_base ? 'inklusive' : `+${upgradePrice.toFixed(2)} €`}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Normales Zubehör (Checkboxen) */}
                    {regularAccessories.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>ZUBEHÖR</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {regularAccessories.map((acc) => {
                            const checked = sp.accessories.includes(acc.id);
                            const avail = accAvailability[acc.id];
                            const unavail = avail && avail.remaining <= 0;
                            const price = days > 0 ? getAccessoryPrice(acc, days) : acc.price;
                            return (
                              <label key={acc.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${unavail ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} style={{ border: `1px solid ${checked ? '#06b6d433' : '#1e293b'}`, background: checked ? '#06b6d40a' : 'transparent' }}>
                                <input type="checkbox" checked={checked} disabled={unavail} onChange={() => !unavail && toggleProductAccessory(sp.id, acc.id)} className="accent-cyan-400" />
                                <span style={{ color: '#e2e8f0' }}>{acc.name}</span>
                                {unavail ? (
                                  <span className="ml-auto" style={{ color: '#ef4444' }}>nicht verfuegbar</span>
                                ) : (
                                  <span className="ml-auto" style={{ color: '#06b6d4' }}>{price.toFixed(2)} €</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Haftungsschutz pro Kamera (je nach deposit_mode) */}
                    {(depositMode === 'haftung') && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>HAFTUNGSSCHUTZ</p>
                        <div className="space-y-1">
                          {HAFTUNG_OPTIONS.map((opt) => {
                            const price = getHaftungPrice(opt.value);
                            return (
                              <label key={opt.value} className="flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer" style={{ background: sp.haftung === opt.value ? '#06b6d40a' : 'transparent', border: `1px solid ${sp.haftung === opt.value ? '#06b6d433' : '#1e293b'}` }}>
                                <input type="radio" name={`haftung-${sp.id}`} value={opt.value} checked={sp.haftung === opt.value} onChange={() => updateProductHaftung(sp.id, opt.value)} className="accent-cyan-400" />
                                <span className="flex-1" style={{ color: '#e2e8f0' }}>{opt.label}</span>
                                <span style={{ color: price > 0 ? '#06b6d4' : '#64748b' }}>
                                  {price > 0 ? `${price.toFixed(2)} €` : 'Kostenlos'}
                                </span>
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

        {/* ─── Versand ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Versand</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Lieferung</label>
              <select style={selectStyle} value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as 'versand' | 'abholung')}>
                <option value="versand">Versand</option>
                <option value="abholung">Selbstabholung</option>
              </select>
            </div>
            {deliveryMode === 'versand' && (
              <>
                <div>
                  <label style={labelStyle}>Versandart</label>
                  <select style={selectStyle} value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value as 'standard' | 'express')}>
                    <option value="standard">Standard (3-5 Tage)</option>
                    <option value="express">Express (24h)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Versandkosten (€)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="0.01"
                    min="0"
                    value={customShippingPrice}
                    onChange={(e) => setCustomShippingPrice(e.target.value)}
                    placeholder="0.00 (kostenlos)"
                  />
                </div>
              </>
            )}
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
            <div className="sm:col-span-2">
              <label style={labelStyle}>Bemerkung (erscheint auf der Rechnung)</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="z.B. Rückgabe am nächsten Tag per DHL, Sondervereinbarung etc." />
            </div>
          </div>
        </div>

        {/* ─── Bezahlstatus ─── */}
        <div style={sectionStyle}>
          <h2 className="font-heading font-semibold text-sm mb-4" style={headingStyle}>Zahlung</h2>

          <div className="mb-4">
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

          {/* Kontodaten bei "nicht bezahlt" */}
          {paymentStatus === 'unpaid' && (
            <div className="rounded-lg p-4" style={{ background: '#f59e0b0a', border: '1px solid #f59e0b33' }}>
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
            <div className="flex justify-between font-heading font-bold text-base" style={{ color: '#06b6d4' }}>
              <span>Gesamt</span>
              <span>{total.toFixed(2)} €</span>
            </div>
            {deposit > 0 && (depositMode === 'kaution') && (
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

        {/* ─── Signatur ─── */}
        {showSignature && days > 0 && selectedProducts.length > 0 ? (
          <div style={sectionStyle}>
            <h3 style={{ ...headingStyle, fontSize: 11, marginBottom: 12 }}>Vertrag unterschreiben</h3>
            <SignatureStep
              customerName={customerName}
              customerEmail={customerEmail}
              productName={selectedProducts.map((sp) => productList.find((p) => p.id === sp.id)?.name ?? sp.id).join(', ')}
              accessories={selectedProducts.flatMap((sp) => [...sp.accessories.map((id) => accessories.find((a) => a.id === id)?.name ?? id), ...sp.sets.map((id) => sets.find((s) => s.id === id)?.name ?? id)])}
              rentalFrom={rentalFrom ? new Date(rentalFrom).toLocaleDateString('de-DE') : ''}
              rentalTo={rentalTo ? new Date(rentalTo).toLocaleDateString('de-DE') : ''}
              rentalDays={days}
              priceTotal={total}
              deposit={0}
              onSigned={(result) => {
                setSignatureData(result);
                setShowSignature(false);
              }}
              onBack={() => setShowSignature(false)}
            />
          </div>
        ) : signatureData ? (
          <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span style={{ color: '#10b981', fontWeight: 600, fontSize: 14 }}>Vertrag unterschrieben von {signatureData.signerName}</span>
            </div>
            <button type="button" onClick={() => { setSignatureData(null); setShowSignature(true); }} style={{ color: '#64748b', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Neu unterschreiben
            </button>
          </div>
        ) : null}

        {/* ─── Submit ─── */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={openInvoicePreview}
            disabled={selectedProducts.length === 0 || !days}
            className="px-5 py-3 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
          >
            Rechnungsvorschau
          </button>
          {!showSignature && !signatureData && days > 0 && selectedProducts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSignature(true)}
              className="px-5 py-3 rounded-lg font-heading font-semibold text-sm transition-colors"
              style={{ background: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b40' }}
            >
              Vertrag unterschreiben
            </button>
          )}
          <button type="submit" disabled={saving || !days} className="px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50" style={{ background: '#06b6d4', color: 'white' }}>
            {saving ? 'Wird erstellt...' : 'Buchung erstellen'}
          </button>
          <button type="button" onClick={() => router.push('/admin/buchungen')} className="px-5 py-3 rounded-lg font-heading font-semibold text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>
            Abbrechen
          </button>
        </div>
      </form>

      {/* ─── Erfolg: Zahlungsoptionen ─── */}
      {createdBookingId && (
        <div style={{ ...sectionStyle, marginTop: 24, borderColor: '#10b98140' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginBottom: 16 }}>
            Buchung {createdBookingId} erstellt!
          </h3>

          {/* Überweisungsdaten */}
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Banküberweisung</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>Empfänger:</span><span style={{ color: '#e2e8f0' }}>Lennart Schickel</span>
              <span style={{ color: '#64748b' }}>IBAN:</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>DE77 2022 0800 0027 7841 43</span>
              <span style={{ color: '#64748b' }}>BIC:</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>SXPYDEHHXXX</span>
              <span style={{ color: '#64748b' }}>Betrag:</span><span style={{ color: '#22d3ee', fontWeight: 700 }}>{total.toFixed(2).replace('.', ',')} €</span>
              <span style={{ color: '#64748b' }}>Verwendung:</span><span style={{ color: '#e2e8f0' }}>{createdBookingId} – {customerName}</span>
            </div>
          </div>

          {/* PayPal QR */}
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>PayPal</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://paypal.me/Cam2Rent/${total.toFixed(2)}`)}`}
                alt="PayPal QR-Code"
                width={120}
                height={120}
                style={{ borderRadius: 8, background: 'white', padding: 4 }}
              />
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                <p style={{ margin: '0 0 8px' }}>QR-Code scannen oder Link nutzen:</p>
                <a
                  href={`https://paypal.me/Cam2Rent/${total.toFixed(2)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#06b6d4', wordBreak: 'break-all' }}
                >
                  paypal.me/Cam2Rent/{total.toFixed(2)}
                </a>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/admin/buchungen?id=${createdBookingId}`)}
              className="px-5 py-3 rounded-lg font-heading font-semibold text-sm"
              style={{ background: '#06b6d4', color: 'white' }}
            >
              Zur Buchung
            </button>
            <button
              onClick={() => { setCreatedBookingId(null); setSignatureData(null); setSuccess(''); }}
              className="px-5 py-3 rounded-lg font-heading font-semibold text-sm"
              style={{ background: '#1e293b', color: '#e2e8f0' }}
            >
              Neue Buchung
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
