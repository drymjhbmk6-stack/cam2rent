'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (needs2FA && totpRef.current) {
      totpRef.current.focus();
    }
  }, [needs2FA]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body: Record<string, string> = { password };
      if (needs2FA && totpCode) {
        body.totpCode = totpCode;
      }

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.requires2FA) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? 'Anmeldung fehlgeschlagen.');
        if (needs2FA) setTotpCode('');
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0A0A0A' }}>
      <div className="w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <span className="font-heading font-bold text-2xl tracking-tight" style={{ color: '#e2e8f0' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
          <p className="text-sm font-body mt-1" style={{ color: '#64748b' }}>Admin-Bereich</p>
        </div>

        <div className="rounded-2xl border p-8" style={{ background: '#111827', borderColor: '#1e293b' }}>
          <h1 className="font-heading font-bold text-xl mb-6" style={{ color: '#e2e8f0' }}>
            Anmelden
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-heading font-semibold mb-2"
                style={{ color: '#e2e8f0' }}
              >
                Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin-Passwort eingeben"
                required
                autoFocus={!needs2FA}
                disabled={needs2FA}
                className="w-full px-4 py-3 rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
              />
            </div>

            {/* 2FA Code Input */}
            {needs2FA && (
              <div>
                <label
                  htmlFor="totpCode"
                  className="block text-sm font-heading font-semibold mb-2"
                  style={{ color: '#e2e8f0' }}
                >
                  2FA-Code
                </label>
                <input
                  ref={totpRef}
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-stelliger Code"
                  required
                  className="w-full px-4 py-3 rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-cyan-500 text-center tracking-[0.5em] font-mono text-lg"
                  style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
                />
                <p className="text-xs font-body mt-2" style={{ color: '#64748b' }}>
                  Code aus deiner Authenticator-App eingeben
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm font-body rounded-lg px-3 py-2" style={{ background: '#ef444420', color: '#f87171' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password || (needs2FA && totpCode.length !== 6)}
              className="w-full py-3 font-heading font-semibold text-sm rounded-btn transition-colors disabled:opacity-40"
              style={{ background: '#06b6d4', color: '#0f172a' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Wird geprüft…
                </span>
              ) : needs2FA ? (
                'Code bestätigen'
              ) : (
                'Anmelden'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs font-body mt-6" style={{ color: '#475569' }}>
          Nur für autorisierte Mitarbeiter
        </p>
      </div>
    </div>
  );
}
