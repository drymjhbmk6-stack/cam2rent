'use client';

import { useEffect, useState } from 'react';

type CheckoutConfig = {
  expressSignupEnabled: boolean;
  verificationDeferred: boolean;
  maxRentalValueForExpressSignup: number | null;
  minHoursBeforeRentalStart: number | null;
};

const DEFAULT: CheckoutConfig = {
  expressSignupEnabled: false,
  verificationDeferred: false,
  maxRentalValueForExpressSignup: 500,
  minHoursBeforeRentalStart: 48,
};

export default function CheckoutConfigSection() {
  const [cfg, setCfg] = useState<CheckoutConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/checkout-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.config) setCfg(data.config);
        else setCfg(DEFAULT);
      })
      .catch(() => setCfg(DEFAULT))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<CheckoutConfig>) {
    if (!cfg) return;
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      const res = await fetch('/api/admin/checkout-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Fehler beim Speichern');
        return;
      }
      if (data?.config) setCfg(data.config);
      setSuccess('Gespeichert.');
      setTimeout(() => setSuccess(''), 2500);
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !cfg) {
    return (
      <section className="rounded-2xl border border-[#1e293b] bg-[#0f172a] p-6 mb-6">
        <div className="text-sm text-[#64748b]">Lade…</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#1e293b] bg-[#0f172a] p-6 shadow-sm mb-6">
      <header className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-lg bg-[#1e293b] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[#06b6d4]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white">Checkout-Verhalten</h2>
          <p className="text-sm text-[#94a3b8] mt-1">
            Steuert, ob Neukunden sich direkt im Checkout registrieren koennen. Neukunden zahlen
            immer sofort — der Ausweis wird vor dem Versand geprueft.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Express-Signup Toggle */}
        <div className="rounded-lg border border-[#1e293b] bg-[#020617] p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.expressSignupEnabled}
              onChange={(e) => save({ expressSignupEnabled: e.target.checked })}
              disabled={saving}
              className="mt-1 w-4 h-4 accent-[#06b6d4]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">Express-Signup im Checkout</div>
              <p className="text-xs text-[#94a3b8] mt-1">
                Neukunden koennen direkt im Zahlungs-Schritt ein Konto anlegen — ohne Umweg ueber
                die Registrierungs-Seite. Der Account wird mit E-Mail und Passwort sofort erstellt,
                Bestaetigungs-Mail geht asynchron raus.
              </p>
            </div>
          </label>
        </div>

        {/* Sofortzahlung-Info — Neukunden zahlen immer direkt, kein Zahlungslink */}
        <div className="rounded-lg border border-[#06b6d4]/30 bg-[#06b6d4]/5 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[#06b6d4] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <div className="font-semibold text-white">Neukunden zahlen sofort</div>
              <p className="text-xs text-[#94a3b8] mt-1">
                Auch ohne verifizierten Ausweis kann sofort bezahlt werden — es gibt keinen
                Zahlungslink-Umweg mehr. Die Buchung wird mit{' '}
                <code className="text-[#06b6d4]">verification_required=true</code> markiert; der
                Ausweis wird nach der Zahlung hochgeladen und der <strong>Versand erst nach der
                Freigabe</strong> in der Versand-Liste durchgefuehrt. Es gibt keine Betrags- oder
                Vorlauf-Grenze mehr.
              </p>
            </div>
          </div>
        </div>

        {success && <p className="text-sm text-emerald-400">{success}</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
