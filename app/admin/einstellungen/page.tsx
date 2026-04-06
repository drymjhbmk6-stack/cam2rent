'use client';

import { useState, useEffect } from 'react';

type DepositMode = 'kaution' | 'haftung' | 'both';

export default function EinstellungenPage() {
  // 2FA State
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFALoading, setTwoFALoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const [twoFASuccess, setTwoFASuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Deposit Mode State
  const [depositMode, setDepositMode] = useState<DepositMode>('both');
  const [depositLoading, setDepositLoading] = useState(true);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState('');

  // Tax State
  type TaxMode = 'kleinunternehmer' | 'regelbesteuerung';
  const [taxMode, setTaxMode] = useState<TaxMode>('kleinunternehmer');
  const [taxRate, setTaxRate] = useState('19');
  const [ustId, setUstId] = useState('');
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxSuccess, setTaxSuccess] = useState('');

  // Abandoned Cart State
  const [acEnabled, setAcEnabled] = useState(true);
  const [acDelay, setAcDelay] = useState('24');
  const [acDiscountEnabled, setAcDiscountEnabled] = useState(false);
  const [acDiscountPercent, setAcDiscountPercent] = useState('5');
  const [acLoading, setAcLoading] = useState(true);
  const [acSaving, setAcSaving] = useState(false);
  const [acSuccess, setAcSuccess] = useState('');

  useEffect(() => {
    // 2FA Status laden
    fetch('/api/admin/2fa/status')
      .then((r) => r.json())
      .then((d) => {
        setTwoFAEnabled(d.enabled);
        setTwoFALoading(false);
      })
      .catch(() => setTwoFALoading(false));

    // Deposit Mode laden
    fetch('/api/admin/settings?key=deposit_mode')
      .then((r) => r.json())
      .then((d) => {
        if (d.value) setDepositMode(d.value as DepositMode);
        setDepositLoading(false);
      })
      .catch(() => setDepositLoading(false));

    // Tax config laden
    fetch('/api/tax-config')
      .then((r) => r.json())
      .then((d) => {
        setTaxMode(d.taxMode || 'kleinunternehmer');
        setTaxRate(String(d.taxRate || '19'));
        setUstId(d.ustId || '');
        setTaxLoading(false);
      })
      .catch(() => setTaxLoading(false));

    // Abandoned Cart Einstellungen laden
    Promise.all([
      fetch('/api/admin/settings?key=abandoned_cart_enabled').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_delay_hours').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_discount_enabled').then((r) => r.json()),
      fetch('/api/admin/settings?key=abandoned_cart_discount_percent').then((r) => r.json()),
    ])
      .then(([enabled, delay, discEnabled, discPercent]) => {
        if (enabled.value !== null) setAcEnabled(enabled.value === 'true');
        if (delay.value) setAcDelay(delay.value);
        if (discEnabled.value !== null) setAcDiscountEnabled(discEnabled.value === 'true');
        if (discPercent.value) setAcDiscountPercent(discPercent.value);
        setAcLoading(false);
      })
      .catch(() => setAcLoading(false));

  }, []);

  async function startSetup() {
    setTwoFAError('');
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (data.qrDataUrl) {
        setQrDataUrl(data.qrDataUrl);
        setTotpSecret(data.secret);
        setSetupMode(true);
      }
    } catch {
      setTwoFAError('Fehler beim Starten des Setups.');
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmSetup() {
    setTwoFAError('');
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/2fa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: totpSecret, token: confirmCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFAEnabled(true);
        setSetupMode(false);
        setConfirmCode('');
        setTwoFASuccess('2FA erfolgreich aktiviert!');
        setTimeout(() => setTwoFASuccess(''), 3000);
      } else {
        setTwoFAError(data.error || 'Bestätigung fehlgeschlagen.');
      }
    } catch {
      setTwoFAError('Netzwerkfehler.');
    } finally {
      setActionLoading(false);
    }
  }

  async function disable2FA() {
    setTwoFAError('');
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disableCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFAEnabled(false);
        setDisableCode('');
        setTwoFASuccess('2FA deaktiviert.');
        setTimeout(() => setTwoFASuccess(''), 3000);
      } else {
        setTwoFAError(data.error || 'Deaktivierung fehlgeschlagen.');
      }
    } catch {
      setTwoFAError('Netzwerkfehler.');
    } finally {
      setActionLoading(false);
    }
  }

  async function saveDepositMode() {
    setDepositSaving(true);
    setDepositSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'deposit_mode', value: depositMode }),
      });
      setDepositSuccess('Gespeichert!');
      setTimeout(() => setDepositSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setDepositSaving(false);
    }
  }

  async function saveAbandonedCart() {
    setAcSaving(true);
    setAcSuccess('');
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_enabled', value: String(acEnabled) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_delay_hours', value: acDelay }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_discount_enabled', value: String(acDiscountEnabled) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'abandoned_cart_discount_percent', value: acDiscountPercent }),
        }),
      ]);
      setAcSuccess('Gespeichert!');
      setTimeout(() => setAcSuccess(''), 3000);
    } catch {
    } finally {
      setAcSaving(false);
    }
  }

  async function saveTaxConfig() {
    setTaxSaving(true);
    setTaxSuccess('');
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'tax_mode', value: taxMode }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'tax_rate', value: taxRate }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'ust_id', value: ustId }),
        }),
      ]);
      setTaxSuccess('Gespeichert!');
      setTimeout(() => setTaxSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setTaxSaving(false);
    }
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 700 }}>
      <h1 className="font-heading font-bold text-xl mb-1" style={{ color: '#e2e8f0' }}>
        Einstellungen
      </h1>
      <p className="text-sm mb-8" style={{ color: '#64748b' }}>
        Sicherheit und Shop-Konfiguration
      </p>

      {/* Sektion 1: 2FA */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginBottom: 24 }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#06b6d414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-5 h-5" style={{ color: '#06b6d4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
              Zwei-Faktor-Authentifizierung
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Zusätzliche Sicherheit für den Admin-Login
            </p>
          </div>
          {!twoFALoading && (
            <span
              className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
              style={twoFAEnabled
                ? { background: '#10b98114', color: '#10b981' }
                : { background: '#64748b14', color: '#64748b' }
              }
            >
              {twoFAEnabled ? 'Aktiv' : 'Inaktiv'}
            </span>
          )}
        </div>

        {twoFALoading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Laden…</div>
        ) : !twoFAEnabled && !setupMode ? (
          <div>
            <p className="mb-4 text-sm" style={{ color: '#94a3b8' }}>
              Aktiviere 2FA um deinen Admin-Zugang zusätzlich mit einer Authenticator-App zu schützen
              (z.B. Google Authenticator, Authy, 1Password).
            </p>
            <button
              onClick={startSetup}
              disabled={actionLoading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: '#06b6d4', color: 'white' }}
            >
              {actionLoading ? 'Wird geladen…' : '2FA aktivieren'}
            </button>
          </div>
        ) : setupMode ? (
          <div>
            <p className="mb-4 text-sm" style={{ color: '#94a3b8' }}>
              Scanne den QR-Code mit deiner Authenticator-App und gib den angezeigten Code ein:
            </p>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {qrDataUrl && (
                <div style={{ background: 'white', borderRadius: 12, padding: 12, flexShrink: 0 }}>
                  <img src={qrDataUrl} alt="QR-Code" style={{ width: 180, height: 180 }} />
                </div>
              )}
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#64748b' }}>MANUELLER CODE</label>
                  <code
                    className="block text-xs p-2 rounded select-all break-all"
                    style={{ background: '#0a0f1e', color: '#22d3ee', border: '1px solid #1e293b' }}
                  >
                    {totpSecret}
                  </code>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#64748b' }}>BESTÄTIGUNGSCODE</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-stelliger Code"
                    className="w-full text-center text-lg font-mono tracking-[0.5em]"
                    style={{
                      background: '#0a0f1e',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#e2e8f0',
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={confirmSetup}
                    disabled={actionLoading || confirmCode.length !== 6}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: '#10b981', color: 'white' }}
                  >
                    Bestätigen
                  </button>
                  <button
                    onClick={() => { setSetupMode(false); setConfirmCode(''); }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#1e293b', color: '#94a3b8' }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm" style={{ color: '#94a3b8' }}>
              2FA ist aktiv. Zum Deaktivieren gib deinen aktuellen Authenticator-Code ein:
            </p>
            <div className="flex gap-3 items-end">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Code"
                  className="text-center text-lg font-mono tracking-[0.3em]"
                  style={{
                    width: 160,
                    background: '#0a0f1e',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: '#e2e8f0',
                  }}
                />
              </div>
              <button
                onClick={disable2FA}
                disabled={actionLoading || disableCode.length !== 6}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: '#ef4444', color: 'white' }}
              >
                2FA deaktivieren
              </button>
            </div>
          </div>
        )}

        {twoFAError && (
          <p className="mt-3 text-sm" style={{ color: '#ef4444' }}>{twoFAError}</p>
        )}
        {twoFASuccess && (
          <p className="mt-3 text-sm" style={{ color: '#10b981' }}>{twoFASuccess}</p>
        )}
      </div>

      {/* Sektion 2: Kaution & Haftungsschutz */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#10b98114', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-5 h-5" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
              Kaution & Haftungsschutz
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Wähle wie Kunden ihre Buchung absichern
            </p>
          </div>
        </div>

        {depositLoading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Laden…</div>
        ) : (
          <div className="space-y-3">
            {([
              { value: 'kaution', label: 'Nur Kaution (Stripe-Vorautorisierung)', desc: 'Betrag wird auf der Karte blockiert, nicht abgebucht. Freigabe nach Rückgabe.' },
              { value: 'haftung', label: 'Nur Haftungsschutz', desc: 'Kunde bucht eine optionale Haftungsbegrenzung dazu. Keine Kartenblockerung.' },
              { value: 'both', label: 'Beides (Kaution + Haftungsschutz)', desc: 'Kunde kann Haftungsschutz wählen UND es wird eine Kaution blockiert.' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: depositMode === opt.value ? '#06b6d40a' : 'transparent',
                  border: `1px solid ${depositMode === opt.value ? '#06b6d433' : '#1e293b'}`,
                }}
              >
                <input
                  type="radio"
                  name="depositMode"
                  value={opt.value}
                  checked={depositMode === opt.value}
                  onChange={(e) => setDepositMode(e.target.value as DepositMode)}
                  className="mt-1 accent-cyan-400"
                />
                <div>
                  <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                    {opt.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                    {opt.desc}
                  </div>
                </div>
              </label>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveDepositMode}
                disabled={depositSaving}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: '#06b6d4', color: 'white' }}
              >
                {depositSaving ? 'Speichern…' : 'Speichern'}
              </button>
              {depositSuccess && (
                <span className="text-sm" style={{ color: '#10b981' }}>{depositSuccess}</span>
              )}
            </div>

            <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: '#06b6d408', border: '1px solid #06b6d420', color: '#94a3b8' }}>
              <strong style={{ color: '#22d3ee' }}>Hinweis zur Kaution:</strong> Stripe hält den Betrag für max. 7 Tage
              (bei Karten bis 31 Tage). Bei langen Mietzeiten kann der Hold vor der Rückgabe verfallen.
              In diesem Fall muss die Kaution bei Schaden nachträglich eingezogen werden.
            </div>
          </div>
        )}
      </div>

      {/* Sektion 3: Umsatzsteuer */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginTop: 24 }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f59e0b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-5 h-5" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
              Umsatzsteuer
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Steuerliche Einstellungen für Rechnungen und Preisanzeige
            </p>
          </div>
        </div>

        {taxLoading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div>
        ) : (
          <div className="space-y-4">
            {/* Tax Mode Radio */}
            <div className="space-y-3">
              {([
                {
                  value: 'kleinunternehmer' as TaxMode,
                  label: 'Kleinunternehmer (§19 UStG)',
                  desc: 'Keine Umsatzsteuer wird berechnet oder ausgewiesen. Auf Rechnungen erscheint der Hinweis gemäß §19 UStG.',
                },
                {
                  value: 'regelbesteuerung' as TaxMode,
                  label: 'Regelbesteuerung',
                  desc: 'MwSt. wird auf Rechnungen, im Checkout und in der Buchungsübersicht ausgewiesen. Preise bleiben gleich (Bruttopreise inkl. MwSt.).',
                },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: taxMode === opt.value ? '#f59e0b0a' : 'transparent',
                    border: `1px solid ${taxMode === opt.value ? '#f59e0b33' : '#1e293b'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="taxMode"
                    value={opt.value}
                    checked={taxMode === opt.value}
                    onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                    className="mt-1 accent-amber-400"
                  />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                      {opt.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                      {opt.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Regelbesteuerung details */}
            {taxMode === 'regelbesteuerung' && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>MwSt.-Satz (%)</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
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
                    <option value="19">19 % (Standard)</option>
                    <option value="7">7 % (ermäßigt)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>USt-IdNr. (optional)</label>
                  <input
                    type="text"
                    value={ustId}
                    onChange={(e) => setUstId(e.target.value)}
                    placeholder="z.B. DE123456789"
                    style={{
                      background: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#e2e8f0',
                      fontSize: 14,
                      width: '100%',
                      maxWidth: 280,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveTaxConfig}
                disabled={taxSaving}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#0a0a0a' }}
              >
                {taxSaving ? 'Speichern...' : 'Speichern'}
              </button>
              {taxSuccess && (
                <span className="text-sm" style={{ color: '#10b981' }}>{taxSuccess}</span>
              )}
            </div>

            <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: '#f59e0b08', border: '1px solid #f59e0b20', color: '#94a3b8' }}>
              <strong style={{ color: '#fbbf24' }}>Hinweis:</strong> Alle Preise im Shop sind Bruttopreise.
              Bei Regelbesteuerung wird die MwSt. aus dem Bruttopreis herausgerechnet und auf Rechnungen separat ausgewiesen.
              Die Preise für Kunden ändern sich dadurch nicht.
            </div>
          </div>
        )}
      </div>

      {/* Sektion 4: Warenkorb-Erinnerung */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginTop: 24 }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#8b5cf614', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-5 h-5" style={{ color: '#8b5cf6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
              Warenkorb-Erinnerung
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Automatische E-Mail an Kunden die ihren Warenkorb nicht abgeschlossen haben
            </p>
          </div>
          {!acLoading && (
            <span
              className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
              style={acEnabled
                ? { background: '#10b98114', color: '#10b981' }
                : { background: '#64748b14', color: '#64748b' }
              }
            >
              {acEnabled ? 'Aktiv' : 'Inaktiv'}
            </span>
          )}
        </div>

        {acLoading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div>
        ) : (
          <div className="space-y-4">
            {/* An/Aus Toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setAcEnabled(!acEnabled)}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{ background: acEnabled ? '#8b5cf6' : '#334155' }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ left: acEnabled ? 22 : 2 }}
                />
              </div>
              <span className="text-sm" style={{ color: '#e2e8f0' }}>
                Warenkorb-Erinnerungen aktivieren
              </span>
            </label>

            {acEnabled && (
              <>
                {/* Verzögerung */}
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>
                    Erinnerung senden nach
                  </label>
                  <select
                    value={acDelay}
                    onChange={(e) => setAcDelay(e.target.value)}
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

                {/* Rabatt Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setAcDiscountEnabled(!acDiscountEnabled)}
                    className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                    style={{ background: acDiscountEnabled ? '#10b981' : '#334155' }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                      style={{ left: acDiscountEnabled ? 22 : 2 }}
                    />
                  </div>
                  <span className="text-sm" style={{ color: '#e2e8f0' }}>
                    Rabatt-Gutschein in Erinnerungsmail anbieten
                  </span>
                </label>

                {acDiscountEnabled && (
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>
                      Rabatt in Prozent
                    </label>
                    <select
                      value={acDiscountPercent}
                      onChange={(e) => setAcDiscountPercent(e.target.value)}
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
                      Es wird automatisch ein Gutscheincode COMEBACK{acDiscountPercent} erstellt.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveAbandonedCart}
                disabled={acSaving}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: '#8b5cf6', color: 'white' }}
              >
                {acSaving ? 'Speichern...' : 'Speichern'}
              </button>
              {acSuccess && (
                <span className="text-sm" style={{ color: '#10b981' }}>{acSuccess}</span>
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

      {/* Sektion 5: Admin-App installieren */}
      <AdminInstallSection />
    </div>
  );
}

/* ─── Admin-App Install Sektion ──────────────────────────────────────────── */

function AdminInstallSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone);
    setIsStandalone(!!standalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginTop: 24 }}>
      <div className="flex items-center gap-3 mb-4">
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#3b82f614', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg className="w-5 h-5" style={{ color: '#3b82f6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
            Admin-App installieren
          </h2>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Admin-Dashboard als App auf dem Handy speichern
          </p>
        </div>
        {isStandalone && (
          <span className="ml-auto text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#10b98114', color: '#10b981' }}>
            Installiert
          </span>
        )}
      </div>

      {isStandalone || installed ? (
        <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: '#10b9810a', border: '1px solid #10b98133' }}>
          <svg className="w-6 h-6 flex-shrink-0" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Die Admin-App ist bereits installiert. Du kannst sie ueber dein Home-Bildschirm oeffnen.
          </p>
        </div>
      ) : isIOS ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            So installierst du die Admin-App auf deinem iPhone/iPad:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}>
              <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#3b82f620', color: '#3b82f6' }}>1</span>
              <p className="text-sm" style={{ color: '#e2e8f0' }}>
                Tippe unten auf das <strong>Teilen-Symbol</strong>{' '}
                <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}>
              <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#3b82f620', color: '#3b82f6' }}>2</span>
              <p className="text-sm" style={{ color: '#e2e8f0' }}>
                Scrolle und tippe auf <strong>&quot;Zum Home-Bildschirm&quot;</strong>
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}>
              <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#3b82f620', color: '#3b82f6' }}>3</span>
              <p className="text-sm" style={{ color: '#e2e8f0' }}>
                Tippe auf <strong>&quot;Hinzufuegen&quot;</strong> — fertig!
              </p>
            </div>
          </div>
          <div className="p-3 rounded-lg text-xs" style={{ background: '#3b82f608', border: '1px solid #3b82f620', color: '#94a3b8' }}>
            <strong style={{ color: '#60a5fa' }}>Tipp:</strong> Stelle sicher, dass du diese Seite in <strong>Safari</strong> geoeffnet hast.
            In Chrome/Firefox fuer iOS funktioniert &quot;Zum Home-Bildschirm&quot; leider nicht.
          </div>
        </div>
      ) : deferredPrompt ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Installiere die Admin-App fuer schnellen Zugriff direkt vom Home-Bildschirm.
          </p>
          <button
            onClick={handleInstall}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: '#3b82f6', color: 'white' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            App installieren
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Oeffne diese Seite in deinem mobilen Browser und verwende die &quot;Zum Home-Bildschirm hinzufuegen&quot;-Funktion deines Browsers.
          </p>
          <div className="p-3 rounded-lg text-xs" style={{ background: '#3b82f608', border: '1px solid #3b82f620', color: '#94a3b8' }}>
            <strong style={{ color: '#60a5fa' }}>Tipp:</strong> Auf Android: Tippe auf die drei Punkte oben rechts im Browser und waehle &quot;App installieren&quot; oder &quot;Zum Startbildschirm hinzufuegen&quot;.
          </div>
        </div>
      )}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
