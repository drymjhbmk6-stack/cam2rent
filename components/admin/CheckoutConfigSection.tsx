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
            Steuert, ob Neukunden sich direkt im Checkout registrieren koennen und ob der Ausweis-Check
            vor der Zahlung oder vor dem Versand stattfindet.
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

        {/* Verification-Deferred Toggle */}
        <div className="rounded-lg border border-[#1e293b] bg-[#020617] p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.verificationDeferred}
              onChange={(e) => save({ verificationDeferred: e.target.checked })}
              disabled={saving}
              className="mt-1 w-4 h-4 accent-[#06b6d4]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">Ausweis-Check erst vor Versand</div>
              <p className="text-xs text-[#94a3b8] mt-1">
                Wenn aktiv: Neukunden koennen auch ohne verifizierten Ausweis bezahlen. Die Buchung
                wird mit <code className="text-[#06b6d4]">verification_required=true</code> markiert
                und erscheint in der Versand-Liste erst nach Freigabe. Der Kunde bekommt per E-Mail
                den Link zum Ausweis-Upload. Ohne diesen Flag bleibt der bestehende
                <code className="text-[#06b6d4]"> pending_verification</code>-Pfad aktiv.
              </p>
            </div>
          </label>
        </div>

        {/* Sub-Regeln — nur sichtbar wenn Express-Signup an */}
        {cfg.expressSignupEnabled && (
          <div className="rounded-lg border border-[#06b6d4]/30 bg-[#06b6d4]/5 p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-1">
                Max. Buchungswert fuer Express-Signup (EUR)
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={cfg.maxRentalValueForExpressSignup ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  save({ maxRentalValueForExpressSignup: v });
                }}
                placeholder="kein Limit"
                disabled={saving}
                className="w-full bg-[#020617] border border-[#1e293b] rounded px-3 py-2 text-sm text-white focus:border-[#06b6d4] focus:outline-none"
              />
              <p className="text-xs text-[#64748b] mt-1">
                Groessere Buchungen gehen weiter durch den normalen Verifizierungs-Pfad. Leer = kein Limit.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-1">
                Min. Vorlauf vor Mietbeginn (Stunden)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={cfg.minHoursBeforeRentalStart ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  save({ minHoursBeforeRentalStart: v });
                }}
                placeholder="kein Limit"
                disabled={saving}
                className="w-full bg-[#020617] border border-[#1e293b] rounded px-3 py-2 text-sm text-white focus:border-[#06b6d4] focus:outline-none"
              />
              <p className="text-xs text-[#64748b] mt-1">
                Kurzfristige Buchungen werden ausgeschlossen, weil der Ausweis-Check sonst nicht
                vor dem Versand durchlaeuft. Leer = kein Limit.
              </p>
            </div>
          </div>
        )}

        {success && <p className="text-sm text-emerald-400">{success}</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
