'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BufferDaysSection from '@/components/admin/BufferDaysSection';
import AllowedCountriesSection from '@/components/admin/AllowedCountriesSection';
import { DEFAULT_SHIPPING, type ShippingPriceConfig } from '@/lib/price-config';
import type { ShippingZone } from '@/data/shipping';
import { sanitizeCountryCodes, countryName } from '@/lib/allowed-countries';

function newZoneId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `zone-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export default function VersandpreiseContent() {
  const [cfg, setCfg] = useState<ShippingPriceConfig>(DEFAULT_SHIPPING);
  const [allowedNonDe, setAllowedNonDe] = useState<string[]>([]); // freigeschaltete Länder außer DE
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dbMissing, setDbMissing] = useState(false);

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => { if (d.shipping) setCfg(d.shipping); })
      .catch(() => setDbMissing(true));
    // Freigeschaltete Lieferländer (für Zonen-Zuordnung), ohne DE (= Basis).
    fetch('/api/admin/config?key=allowed_countries')
      .then((r) => r.json())
      .then((val) => {
        const raw = val && typeof val === 'object' && !Array.isArray(val) ? (val as { codes?: unknown }).codes : val;
        setAllowedNonDe(sanitizeCountryCodes(raw).filter((c) => c !== 'DE'));
      })
      .catch(() => setAllowedNonDe([]));
  }, []);

  const zones = cfg.zones ?? [];

  function updateZone(id: string, patch: Partial<ShippingZone>) {
    setCfg((c) => ({ ...c, zones: (c.zones ?? []).map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
  }
  function addZone() {
    const z: ShippingZone = {
      id: newZoneId(),
      label: '',
      countries: [],
      freeShippingThreshold: cfg.freeShippingThreshold,
      standardPrice: cfg.standardPrice,
      expressPrice: cfg.expressPrice,
    };
    setCfg((c) => ({ ...c, zones: [...(c.zones ?? []), z] }));
  }
  function removeZone(id: string) {
    setCfg((c) => ({ ...c, zones: (c.zones ?? []).filter((z) => z.id !== id) }));
  }
  function toggleZoneCountry(id: string, code: string) {
    setCfg((c) => ({
      ...c,
      zones: (c.zones ?? []).map((z) =>
        z.id === id
          ? { ...z, countries: z.countries.includes(code) ? z.countries.filter((x) => x !== code) : [...z.countries, code] }
          : z,
      ),
    }));
  }

  // Länder, die in KEINER Zone liegen → nutzen die Basispreise.
  const assignedSet = new Set(zones.flatMap((z) => z.countries));
  const unassigned = allowedNonDe.filter((c) => !assignedSet.has(c));

  async function handleSave() {
    setSaving(true);
    try {
      // Zonen säubern: Codes normalisieren, leere Zonen (kein Land) verwerfen.
      const cleanZones: ShippingZone[] = zones
        .map((z) => ({ ...z, label: z.label.trim(), countries: [...new Set(z.countries.map((c) => c.trim().toUpperCase()).filter((c) => c && c !== 'DE'))] }))
        .filter((z) => z.countries.length > 0);
      const payload: ShippingPriceConfig = { ...cfg, zones: cleanZones };
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'shipping', value: payload }),
      });
      if (!res.ok) throw new Error();
      setCfg(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  const priceInput = 'w-full pr-8 pl-3 py-3 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue';

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-xl mx-auto px-6 py-8">
        <AdminBackLink href="/admin/preise" label="Zurück zu Preise" />
        <div className="flex items-center gap-2 mb-8">
          <h1 className="font-heading font-bold text-xl text-brand-black">Versandkosten</h1>
        </div>

        {dbMissing && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm font-body text-amber-800">
            Führe zuerst <code className="bg-amber-100 px-1 rounded">supabase-preise.sql</code> im Supabase SQL-Editor aus.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-brand-border p-6 space-y-6">
          <p className="text-xs font-body text-brand-muted bg-brand-bg rounded-lg p-3">
            Kostenloser Versand gilt nur für den Bestellwert (Miete + Zubehör + Sets) — ohne Kaution.
          </p>

          <div>
            <label className="block text-sm font-heading font-semibold text-brand-black mb-1">
              Deutschland <span className="font-normal text-brand-muted">(Basispreise)</span>
            </label>
            <p className="text-xs font-body text-brand-muted mb-3">
              Gilt für Deutschland und alle Länder, die keiner Zone unten zugeordnet sind.
            </p>
          </div>

          <div>
            <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
              Kostenloser Versand ab
            </label>
            <div className="relative">
              <input type="number" step="1" min="0" value={cfg.freeShippingThreshold}
                onChange={(e) => setCfg((c) => ({ ...c, freeShippingThreshold: parseFloat(e.target.value) || 0 }))}
                className={priceInput} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
            </div>
            <p className="text-xs font-body text-brand-muted mt-1">Bestellwert (Miete + Zubehör + Sets, ohne Kaution)</p>
          </div>

          <div>
            <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
              Standardversand <span className="font-normal text-brand-muted">(3–5 Werktage)</span>
            </label>
            <div className="relative">
              <input type="number" step="0.01" min="0" value={cfg.standardPrice}
                onChange={(e) => setCfg((c) => ({ ...c, standardPrice: parseFloat(e.target.value) || 0 }))}
                className={priceInput} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
              Expressversand <span className="font-normal text-brand-muted">(Versand innerhalb 24h)</span>
            </label>
            <div className="relative">
              <input type="number" step="0.01" min="0" value={cfg.expressPrice}
                onChange={(e) => setCfg((c) => ({ ...c, expressPrice: parseFloat(e.target.value) || 0 }))}
                className={priceInput} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
            </div>
          </div>

          {/* ── Versandzonen (Länder außer Deutschland) ─────────────────────── */}
          <div className="pt-5 border-t border-brand-border space-y-4">
            <div>
              <h2 className="font-heading font-bold text-base text-brand-black">Versandzonen</h2>
              <p className="text-xs font-body text-brand-muted mt-1">
                Eigene Preise für Länder außer Deutschland. Länder in keiner Zone nutzen die Basispreise oben.
              </p>
            </div>

            {allowedNonDe.length === 0 ? (
              <div className="p-3 rounded-lg bg-brand-bg text-xs font-body text-brand-muted">
                Aktuell ist nur Deutschland als Lieferland freigeschaltet. Aktiviere weitere Länder unter
                „Lieferländer“ (unten), um Zonen anzulegen.
              </div>
            ) : (
              <>
                {unassigned.length > 0 && (
                  <div className="p-3 rounded-lg bg-brand-bg text-xs font-body text-brand-muted">
                    <span className="font-semibold text-brand-black">Basispreise (keiner Zone zugeordnet):</span>{' '}
                    {unassigned.map((c) => countryName(c)).join(', ')}
                  </div>
                )}

                {zones.map((z) => (
                  <div key={z.id} className="rounded-xl border border-brand-border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={z.label}
                        onChange={(e) => updateZone(z.id, { label: e.target.value })}
                        placeholder="Zonenname (z. B. Nachbarländer)"
                        className="flex-1 px-3 py-2 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                      <button
                        onClick={() => removeZone(z.id)}
                        className="text-xs font-heading font-semibold text-red-600 hover:text-red-700 px-2 py-2"
                      >
                        Entfernen
                      </button>
                    </div>

                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-black mb-1.5">Länder in dieser Zone</p>
                      <div className="flex flex-wrap gap-1.5">
                        {allowedNonDe.map((code) => {
                          const active = z.countries.includes(code);
                          const takenElsewhere = !active && assignedSet.has(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              disabled={takenElsewhere}
                              onClick={() => toggleZoneCountry(z.id, code)}
                              title={takenElsewhere ? 'Bereits einer anderen Zone zugeordnet' : ''}
                              className={`px-2.5 py-1 rounded-full text-xs font-body border transition-colors ${
                                active
                                  ? 'bg-accent-blue text-white border-accent-blue'
                                  : takenElsewhere
                                    ? 'bg-brand-bg text-brand-muted border-brand-border opacity-40 cursor-not-allowed'
                                    : 'bg-white text-brand-black border-brand-border hover:border-accent-blue'
                              }`}
                            >
                              {countryName(code)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-body text-brand-muted mb-1">Gratis ab (€)</label>
                        <input type="number" step="1" min="0" value={z.freeShippingThreshold}
                          onChange={(e) => updateZone(z.id, { freeShippingThreshold: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-2 border border-brand-border rounded-[8px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-body text-brand-muted mb-1">Standard (€)</label>
                        <input type="number" step="0.01" min="0" value={z.standardPrice}
                          onChange={(e) => updateZone(z.id, { standardPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-2 border border-brand-border rounded-[8px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-body text-brand-muted mb-1">Express (€)</label>
                        <input type="number" step="0.01" min="0" value={z.expressPrice}
                          onChange={(e) => updateZone(z.id, { expressPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-2 border border-brand-border rounded-[8px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addZone}
                  className="w-full py-2.5 text-sm font-heading font-semibold text-accent-blue border border-dashed border-accent-blue/50 rounded-[10px] hover:bg-accent-blue/5"
                >
                  + Zone hinzufügen
                </button>
              </>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'}`}
          >
            {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
          </button>
        </div>

        <div className="mt-6">
          <AllowedCountriesSection />
        </div>

        <div className="mt-6">
          <BufferDaysSection />
        </div>
      </div>
    </div>
  );
}
