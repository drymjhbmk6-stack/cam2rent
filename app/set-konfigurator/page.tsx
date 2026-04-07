'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getPriceForDays, type Product } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import { useAccessories } from '@/components/AccessoriesProvider';
import { getAccessoryPrice, type Accessory } from '@/data/accessories';

// ─── Brand config ────────────────────────────────────────────────────────────

const brandConfig: Record<string, { bg: string; color: string; border: string; pill: string }> = {
  GoPro: { bg: 'bg-accent-blue-soft', color: '#3b82f6', border: 'border-blue-500', pill: 'bg-accent-blue-soft text-accent-blue' },
  DJI: { bg: 'bg-accent-teal-soft', color: '#0d9488', border: 'border-teal-500', pill: 'bg-accent-teal-soft text-accent-teal' },
  Insta360: { bg: 'bg-accent-amber-soft', color: '#f59e0b', border: 'border-amber-500', pill: 'bg-accent-amber-soft text-accent-amber' },
};
const defaultBrand = { bg: 'bg-gray-100', color: '#6b7280', border: 'border-gray-400', pill: 'bg-gray-100 text-gray-600' };

// ─── Available items ─────────────────────────────────────────────────────────

// availableAccessories wird im Component berechnet (useAccessories Hook)

// ─── Camera placeholder SVG ──────────────────────────────────────────────────

function CameraIcon({ brand }: { brand: string }) {
  const color = (brandConfig[brand] ?? defaultBrand).color;
  return (
    <svg viewBox="0 0 80 60" fill="none" className="w-20 h-16" aria-hidden="true">
      <rect x="8" y="18" width="64" height="36" rx="6" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
      <circle cx="40" cy="36" r="13" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
      <circle cx="40" cy="36" r="8" fill={color} fillOpacity="0.35" />
      <circle cx="40" cy="36" r="4" fill={color} fillOpacity="0.6" />
      <rect x="28" y="10" width="16" height="10" rx="3" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
      <circle cx="62" cy="26" r="3" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

// ─── Accessory icon ──────────────────────────────────────────────────────────

function AccessoryIcon({ iconId, className = 'w-5 h-5' }: { iconId: Accessory['iconId']; className?: string }) {
  switch (iconId) {
    case 'tripod':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v6m0 0l-4 12m4-12l4 12m-8-6h8" />
        </svg>
      );
    case 'sd-card':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
        </svg>
      );
    case 'battery':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375a.375.375 0 01.375.375v2.25a.375.375 0 01-.375.375H21m-4.5 0h-9a2.25 2.25 0 01-2.25-2.25v-1.5a2.25 2.25 0 012.25-2.25h9a2.25 2.25 0 012.25 2.25v1.5a2.25 2.25 0 01-2.25 2.25z" />
        </svg>
      );
    case 'charger':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
    case 'case':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      );
    case 'mount':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
      );
    case 'light':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      );
    case 'mic':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: 'Kamera' },
    { num: 2, label: 'Zubehör' },
    { num: 3, label: 'Zusammenfassung' },
  ] as const;

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-heading font-bold transition-colors ${
                s.num === current
                  ? 'bg-accent-blue text-white'
                  : s.num < current
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-brand-bg dark:bg-brand-black text-brand-muted dark:text-gray-500'
              }`}
            >
              {s.num < current ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                s.num
              )}
            </div>
            <span
              className={`text-sm font-body hidden sm:inline ${
                s.num === current ? 'text-brand-black dark:text-white font-semibold' : 'text-brand-muted dark:text-gray-500'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-8 sm:w-16 h-0.5 rounded-full ${
                s.num < current ? 'bg-accent-blue/40' : 'bg-brand-border dark:border-white/10'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',');
}

// ─── Page component ──────────────────────────────────────────────────────────

export default function SetKonfiguratorPage() {
  const { accessories: ALL_ACCESSORIES } = useAccessories();
  const { products } = useProducts();
  const router = useRouter();
  const { user } = useAuth();

  const availableAccessories = ALL_ACCESSORIES.filter((a) => a.available);
  const availableCameras = products.filter((p) => p.available);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCamera, setSelectedCamera] = useState<Product | null>(null);
  const [selectedAccessoryIds, setSelectedAccessoryIds] = useState<string[]>([]);
  const [days, setDays] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveSet = useCallback(async () => {
    if (!user || !selectedCamera) return;
    setSaving(true);
    try {
      const res = await fetch('/api/custom-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          cameraId: selectedCamera.id,
          accessoryIds: selectedAccessoryIds,
          name: `${selectedCamera.name} + ${selectedAccessoryIds.length} Zubehör`,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }, [user, selectedCamera, selectedAccessoryIds]);

  const dayOptions = [1, 3, 7, 14, 30];

  // Toggle accessory
  const toggleAccessory = (id: string) => {
    setSelectedAccessoryIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  // Selected accessories as objects
  const selectedAccessories = useMemo(
    () => availableAccessories.filter((a) => selectedAccessoryIds.includes(a.id)),
    [selectedAccessoryIds]
  );

  // Price calculation
  const pricing = useMemo(() => {
    const cameraPrice = selectedCamera ? getPriceForDays(selectedCamera, days) : 0;
    const cameraPricePerDay = selectedCamera ? selectedCamera.pricePerDay : 0;

    const accessoryTotal = selectedAccessories.reduce(
      (sum, acc) => sum + getAccessoryPrice(acc, days),
      0
    );
    const accessoryPerDay = selectedAccessories.reduce(
      (sum, acc) => sum + (acc.pricingMode === 'perDay' ? acc.price : 0),
      0
    );
    const accessoryFlat = selectedAccessories.reduce(
      (sum, acc) => sum + (acc.pricingMode === 'flat' ? acc.price : 0),
      0
    );

    const accCount = selectedAccessories.length;
    const discountPercent = 0;

    const subtotal = cameraPrice + accessoryTotal;
    const discountAmount = 0;
    const total = subtotal;

    return {
      cameraPrice,
      cameraPricePerDay,
      accessoryTotal,
      accessoryPerDay,
      accessoryFlat,
      accCount,
      discountPercent,
      discountAmount,
      subtotal,
      total,
    };
  }, [selectedCamera, selectedAccessories, days]);

  // Navigate to booking page
  const handleBook = () => {
    if (!selectedCamera) return;
    const accParam = selectedAccessoryIds.join(',');
    const url = `/kameras/${selectedCamera.slug}/buchen${accParam ? `?accessories=${accParam}` : ''}`;
    router.push(url);
  };

  // Can proceed?
  const canNext = step === 1 ? !!selectedCamera : true;

  return (
    <main className="min-h-screen bg-brand-bg dark:bg-brand-black">
      {/* Header */}
      <section className="bg-white dark:bg-brand-dark border-b border-brand-border dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/kameras"
            className="inline-flex items-center gap-1 text-sm font-body text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück zu Kameras
          </Link>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-white">
            Set-Konfigurator
          </h1>
          <p className="font-body text-brand-steel dark:text-gray-400 text-lg mt-2">
            Stelle dein individuelles Kamera-Set zusammen. Dein Set wird im Kundenkonto gespeichert.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepIndicator current={step} />

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Step 1: Kamera wählen */}
            {step === 1 && (
              <div>
                <h2 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-6">
                  Schritt 1: Kamera wählen
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {availableCameras.map((cam) => {
                    const isSelected = selectedCamera?.id === cam.id;
                    const brand = brandConfig[cam.brand] ?? defaultBrand;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => setSelectedCamera(cam)}
                        className={`text-left rounded-card border-2 overflow-hidden transition-all duration-200 hover:shadow-card ${
                          isSelected
                            ? 'border-accent-blue shadow-card ring-2 ring-accent-blue/20'
                            : 'border-brand-border dark:border-white/10 hover:border-brand-steel/30'
                        }`}
                      >
                        {/* Brand color bar */}
                        <div className={`${brand.bg} px-4 py-3 flex items-center justify-between`}>
                          <span className={`text-xs font-heading font-semibold uppercase tracking-wider ${brand.pill.split(' ')[1] ?? 'text-gray-600'}`}>
                            {cam.brand}
                          </span>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-accent-blue flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        {/* Content */}
                        <div className="p-4 bg-white dark:bg-brand-dark">
                          <div className="flex items-center gap-3">
                            <CameraIcon brand={cam.brand} />
                            <div className="flex-1 min-w-0">
                              <h3 className="font-heading font-semibold text-base text-brand-black dark:text-white truncate">
                                {cam.name}
                              </h3>
                              <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-0.5">
                                {cam.shortDescription}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-brand-border dark:border-white/10 flex items-center justify-between">
                            <span className="text-sm font-body text-brand-steel dark:text-gray-400">ab</span>
                            <span className="font-heading font-bold text-lg text-brand-black dark:text-white">
                              {fmt(cam.pricePerDay)} <span className="text-sm font-normal text-brand-steel dark:text-gray-400">€/Tag</span>
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Zubehör hinzufügen */}
            {step === 2 && (
              <div>
                <h2 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
                  Schritt 2: Zubehör hinzufügen
                </h2>
                <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
                  Wähle das Zubehör, das du zu deinem Set hinzufügen möchtest.
                </p>
                <div className="space-y-3">
                  {availableAccessories.map((acc) => {
                    const isSelected = selectedAccessoryIds.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center gap-4 p-4 rounded-card border-2 cursor-pointer transition-all duration-200 bg-white dark:bg-brand-dark ${
                          isSelected
                            ? 'border-accent-blue ring-2 ring-accent-blue/20'
                            : 'border-brand-border dark:border-white/10 hover:border-brand-steel/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-accent-blue border-accent-blue'
                              : 'border-brand-border dark:border-white/10'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => toggleAccessory(acc.id)}
                        />
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-lg bg-brand-bg dark:bg-brand-black flex items-center justify-center text-brand-steel dark:text-gray-400 flex-shrink-0">
                          <AccessoryIcon iconId={acc.iconId} />
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="font-heading font-semibold text-sm text-brand-black dark:text-white">
                            {acc.name}
                          </p>
                          <p className="text-xs font-body text-brand-steel dark:text-gray-400 mt-0.5">
                            {acc.description}
                          </p>
                        </div>
                        {/* Price */}
                        <div className="text-right flex-shrink-0">
                          <p className="font-heading font-semibold text-sm text-brand-black dark:text-white">
                            {fmt(acc.price)} €
                          </p>
                          <p className="text-xs font-body text-brand-muted dark:text-gray-500">
                            {acc.pricingMode === 'perDay' ? 'pro Tag' : 'einmalig'}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Zusammenfassung */}
            {step === 3 && (
              <div>
                <h2 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-6">
                  Schritt 3: Zusammenfassung
                </h2>

                {/* Selected camera */}
                {selectedCamera && (
                  <div className="bg-white dark:bg-brand-dark rounded-card border border-brand-border dark:border-white/10 p-5 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${(brandConfig[selectedCamera.brand] ?? defaultBrand).pill}`}>
                        {selectedCamera.brand}
                      </div>
                      <h3 className="font-heading font-semibold text-base text-brand-black dark:text-white">
                        {selectedCamera.name}
                      </h3>
                    </div>
                    <div className="flex items-center justify-between text-sm font-body">
                      <span className="text-brand-steel dark:text-gray-400">Kamera-Mietpreis ({days} {days === 1 ? 'Tag' : 'Tage'})</span>
                      <span className="font-semibold text-brand-black dark:text-white">{fmt(pricing.cameraPrice)} €</span>
                    </div>
                  </div>
                )}

                {/* Selected accessories */}
                {selectedAccessories.length > 0 && (
                  <div className="bg-white dark:bg-brand-dark rounded-card border border-brand-border dark:border-white/10 p-5 mb-4">
                    <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white mb-3">
                      Zubehör ({selectedAccessories.length} {selectedAccessories.length === 1 ? 'Teil' : 'Teile'})
                    </h3>
                    <div className="space-y-2">
                      {selectedAccessories.map((acc) => (
                        <div key={acc.id} className="flex items-center justify-between text-sm font-body">
                          <span className="text-brand-steel dark:text-gray-400">{acc.name}</span>
                          <span className="text-brand-black dark:text-white">
                            {fmt(getAccessoryPrice(acc, days))} €
                            <span className="text-brand-muted dark:text-gray-500 text-xs ml-1">
                              ({acc.pricingMode === 'perDay' ? `${fmt(acc.price)} €/Tag` : 'einmalig'})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Duration selector */}
                <div className="bg-white dark:bg-brand-dark rounded-card border border-brand-border dark:border-white/10 p-5 mb-4">
                  <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white mb-3">
                    Mietdauer wählen
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {dayOptions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={`px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors ${
                          days === d
                            ? 'bg-accent-blue text-white'
                            : 'bg-brand-bg dark:bg-brand-black text-brand-steel dark:text-gray-400 hover:bg-brand-border'
                        }`}
                      >
                        {d} {d === 1 ? 'Tag' : 'Tage'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price breakdown */}
                <div className="bg-white dark:bg-brand-dark rounded-card border border-brand-border dark:border-white/10 p-5">
                  <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white mb-3">
                    Preisberechnung
                  </h3>
                  <div className="space-y-2 text-sm font-body">
                    <div className="flex justify-between">
                      <span className="text-brand-steel dark:text-gray-400">Kamera</span>
                      <span className="text-brand-black dark:text-white">{fmt(pricing.cameraPrice)} €</span>
                    </div>
                    {selectedAccessories.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-brand-steel dark:text-gray-400">Zubehör</span>
                        <span className="text-brand-black dark:text-white">{fmt(pricing.accessoryTotal)} €</span>
                      </div>
                    )}
                    {pricing.discountPercent > 0 && (
                      <div className="flex justify-between text-accent-teal">
                        <span className="font-semibold">Set-Rabatt ({pricing.discountPercent} %)</span>
                        <span className="font-semibold">-{fmt(pricing.discountAmount)} €</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-brand-border dark:border-white/10 flex justify-between">
                      <span className="font-heading font-bold text-brand-black dark:text-white">Gesamt ({days} {days === 1 ? 'Tag' : 'Tage'})</span>
                      <span className="font-heading font-bold text-lg text-brand-black dark:text-white">{fmt(pricing.total)} €</span>
                    </div>
                  </div>

                  {/* Book button */}
                  <button
                    type="button"
                    onClick={handleBook}
                    className="mt-6 w-full py-3.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-base rounded-[10px] hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors shadow-lg shadow-brand-black/10 flex items-center justify-center gap-2"
                  >
                    Set buchen
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                  <p className="text-xs font-body text-brand-muted dark:text-gray-500 text-center mt-3">
                    Du wirst zur Buchungsseite der Kamera weitergeleitet. Dein Zubehör ist vorausgewählt.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-brand-border dark:border-white/10 rounded-[10px] font-heading font-semibold text-sm text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white hover:border-brand-steel/50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Zurück
                </button>
              ) : (
                <div />
              )}
              {step < 3 && (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white rounded-[10px] font-heading font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Weiter
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Sidebar summary (desktop) / bottom bar (mobile) */}
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-24 bg-white dark:bg-brand-dark rounded-card border border-brand-border dark:border-white/10 p-5 shadow-card">
              <h3 className="font-heading font-bold text-sm text-brand-black dark:text-white mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Dein Set
              </h3>

              {!selectedCamera && !selectedAccessories.length && (
                <p className="text-sm font-body text-brand-muted dark:text-gray-500">
                  Wähle eine Kamera, um zu starten.
                </p>
              )}

              {selectedCamera && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: (brandConfig[selectedCamera.brand] ?? defaultBrand).color }} />
                    <p className="text-sm font-heading font-semibold text-brand-black dark:text-white truncate">
                      {selectedCamera.name}
                    </p>
                  </div>
                  <p className="text-xs font-body text-brand-muted dark:text-gray-500 ml-4">
                    {fmt(selectedCamera.pricePerDay)} €/Tag
                  </p>
                </div>
              )}

              {selectedAccessories.length > 0 && (
                <div className="border-t border-brand-border dark:border-white/10 pt-3 mb-3">
                  <p className="text-xs font-heading font-semibold text-brand-steel dark:text-gray-400 uppercase tracking-wider mb-2">
                    Zubehör
                  </p>
                  {selectedAccessories.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between text-xs font-body mb-1.5">
                      <span className="text-brand-steel dark:text-gray-400 truncate mr-2">{acc.name}</span>
                      <span className="text-brand-black dark:text-white whitespace-nowrap">
                        {fmt(acc.price)} €{acc.pricingMode === 'perDay' ? '/Tag' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {pricing.discountPercent > 0 && (
                <div className="bg-accent-teal-soft rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs font-heading font-semibold text-accent-teal">
                    {pricing.discountPercent} % Set-Rabatt auf Zubehör
                  </p>
                </div>
              )}

              {(selectedCamera || selectedAccessories.length > 0) && (
                <div className="border-t border-brand-border dark:border-white/10 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-body text-brand-steel dark:text-gray-400">pro Tag ca.</span>
                    <span className="font-heading font-bold text-brand-black dark:text-white">
                      {fmt(
                        pricing.cameraPricePerDay +
                          pricing.accessoryPerDay * (1 - pricing.discountPercent / 100)
                      )}{' '}
                      €
                    </span>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Mobile bottom bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-brand-dark border-t border-brand-border dark:border-white/10 px-4 py-3 z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div>
                {selectedCamera ? (
                  <>
                    <p className="text-xs font-body text-brand-steel dark:text-gray-400">
                      {selectedCamera.name}
                      {selectedAccessories.length > 0 && ` + ${selectedAccessories.length} Zubehör`}
                    </p>
                    <p className="font-heading font-bold text-brand-black dark:text-white">
                      ab {fmt(
                        pricing.cameraPricePerDay +
                          pricing.accessoryPerDay * (1 - pricing.discountPercent / 100)
                      )} €/Tag
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-body text-brand-muted dark:text-gray-500">Kamera wählen</p>
                )}
              </div>
              {step < 3 ? (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                  className="px-5 py-2.5 bg-accent-blue text-white rounded-[10px] font-heading font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  Weiter
                </button>
              ) : (
                <div className="flex gap-2">
                  {user && (
                    <button
                      type="button"
                      onClick={handleSaveSet}
                      disabled={saving || saved}
                      className="px-4 py-2.5 border border-brand-border dark:border-white/10 text-brand-text dark:text-gray-300 rounded-[10px] font-heading font-semibold text-sm hover:border-brand-black dark:hover:border-white hover:text-brand-black dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {saved ? 'Gespeichert!' : saving ? 'Speichern…' : 'Set speichern'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleBook}
                    className="px-5 py-2.5 bg-brand-black dark:bg-accent-blue text-white rounded-[10px] font-heading font-semibold text-sm hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors"
                  >
                    Set buchen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom spacer for mobile bar */}
      <div className="lg:hidden h-20" />
    </main>
  );
}
