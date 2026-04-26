'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

/**
 * Warenkorb-Erinnerung — automatische E-Mail an eingeloggte Kunden,
 * die Artikel im Warenkorb haben aber den Checkout nicht abschliessen.
 * Frueher Sektion in /admin/einstellungen, jetzt eigene Seite unter
 * "Rabatte & Aktionen", weil das eher ein Marketing-Tool ist als eine
 * Shop-Konfiguration.
 */
export default function WarenkorbErinnerungContent() {
  const [enabled, setEnabled] = useState(true);
  const [delay, setDelay] = useState('24');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings?key=abandoned_cart_enabled').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_delay_hours').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_discount_enabled').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_discount_percent').then((r) => r.json()),
    ])
      .then(([en, dl, discEn, discPct]) => {
        if (en.value !== null && en.value !== undefined) setEnabled(en.value === 'true');
        if (dl.value) setDelay(String(dl.value));
        if (discEn.value !== null && discEn.value !== undefined) setDiscountEnabled(discEn.value === 'true');
        if (discPct.value) setDiscountPercent(String(discPct.value));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_enabled', value: String(enabled) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_delay_hours', value: delay }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_discount_enabled', value: String(discountEnabled) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_discount_percent', value: discountPercent }),
        }),
      ]);
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 700 }}>
      <AdminBackLink label="Zurück" />

      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginTop: 12 }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#8b5cf614', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-5 h-5" style={{ color: '#8b5cf6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-lg" style={{ color: '#e2e8f0' }}>
              Warenkorb-Erinnerung
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Automatische E-Mail an Kunden die ihren Warenkorb nicht abgeschlossen haben
            </p>
          </div>
          {!loading && (
            <span
              className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
              style={enabled
                ? { background: '#10b98114', color: '#10b981' }
                : { background: '#64748b14', color: '#64748b' }
              }
            >
              {enabled ? 'Aktiv' : 'Inaktiv'}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setEnabled(!enabled)}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{ background: enabled ? '#8b5cf6' : '#334155' }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ left: enabled ? 22 : 2 }}
                />
              </div>
              <span className="text-sm" style={{ color: '#e2e8f0' }}>
                Warenkorb-Erinnerungen aktivieren
              </span>
            </label>

            {enabled && (
              <>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>
                    Erinnerung senden nach
                  </label>
                  <select
                    value={delay}
                    onChange={(e) => setDelay(e.target.value)}
                    style={{
                      background: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#e2e8f0',
                      fontSize: 14,
                      width: 200,
                    }}
                  >
                    <option value="3">3 Stunden</option>
                    <option value="6">6 Stunden</option>
                    <option value="12">12 Stunden</option>
                    <option value="24">24 Stunden</option>
                    <option value="48">48 Stunden</option>
                  </select>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setDiscountEnabled(!discountEnabled)}
                    className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                    style={{ background: discountEnabled ? '#10b981' : '#334155' }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                      style={{ left: discountEnabled ? 22 : 2 }}
                    />
                  </div>
                  <span className="text-sm" style={{ color: '#e2e8f0' }}>
                    Rabatt-Gutschein in Erinnerungsmail anbieten
                  </span>
                </label>

                {discountEnabled && (
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>
                      Rabatt in Prozent
                    </label>
                    <select
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#e2e8f0',
                        fontSize: 14,
                        width: 160,
                      }}
                    >
                      <option value="5">5 %</option>
                      <option value="10">10 %</option>
                      <option value="15">15 %</option>
                      <option value="20">20 %</option>
                    </select>
                    <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                      Es wird automatisch ein Gutscheincode COMEBACK{discountPercent} erstellt.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: '#8b5cf6', color: 'white' }}
              >
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              {success && (
                <span className="text-sm" style={{ color: '#10b981' }}>{success}</span>
              )}
            </div>

            <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: '#8b5cf608', border: '1px solid #8b5cf620', color: '#94a3b8' }}>
              <strong style={{ color: '#a78bfa' }}>Hinweis:</strong> Die Erinnerung wird nur an eingeloggte Kunden
              gesendet, die Artikel im Warenkorb haben aber den Checkout nicht abschließen.
              Pro Warenkorb wird maximal eine Erinnerung versendet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
