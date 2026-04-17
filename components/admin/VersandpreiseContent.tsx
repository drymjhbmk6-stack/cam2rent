'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { DEFAULT_SHIPPING, type ShippingPriceConfig } from '@/lib/price-config';

export default function VersandpreiseContent() {
  const [cfg, setCfg] = useState<ShippingPriceConfig>(DEFAULT_SHIPPING);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dbMissing, setDbMissing] = useState(false);

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => { if (d.shipping) setCfg(d.shipping); })
      .catch(() => setDbMissing(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'shipping', value: cfg }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

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
            <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
              Kostenloser Versand ab
            </label>
            <div className="relative">
              <input type="number" step="1" min="0" value={cfg.freeShippingThreshold}
                onChange={(e) => setCfg((c) => ({ ...c, freeShippingThreshold: parseFloat(e.target.value) || 0 }))}
                className="w-full pr-8 pl-3 py-3 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
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
                className="w-full pr-8 pl-3 py-3 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
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
                className="w-full pr-8 pl-3 py-3 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'}`}
          >
            {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
