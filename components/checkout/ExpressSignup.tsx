'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

type Mode = 'signup' | 'login';

/**
 * Express-Signup / Inline-Login im Checkout.
 *
 * Wird auf der Checkout-Seite gezeigt, wenn der Kunde nicht eingeloggt ist
 * UND das Feature-Flag `expressSignupEnabled` aktiv ist. Nach erfolgreicher
 * Kontoanlage oder Login aktualisiert der AuthProvider automatisch den
 * `user`-State, sodass die bestehende Checkout-UI weitergehen kann.
 *
 * Die Komponente hat zwei Modi (Tabs):
 *   - signup: Neu registrieren (Email + Passwort + Name)
 *   - login:  Bestehendes Konto nutzen
 * Wenn die E-Mail beim Signup schon existiert, wird automatisch auf
 * login umgeschaltet.
 */
export default function ExpressSignup({
  onAuthenticated,
  defaultEmail,
  defaultName,
}: {
  onAuthenticated?: () => void;
  defaultEmail?: string;
  defaultName?: string;
}) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(defaultName ?? '');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Bitte gib eine gueltige E-Mail-Adresse ein.');
      return;
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/express-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, fullName: fullName.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setError(data?.message || 'Zu viele Registrierungen. Bitte spaeter erneut versuchen.');
        return;
      }
      if (res.status === 403 && data?.error === 'feature_disabled') {
        setError('Registrierung im Checkout ist derzeit nicht moeglich. Bitte nutze die Registrierungs-Seite.');
        return;
      }
      if (!res.ok && !data?.exists) {
        setError(data?.message || 'Konto konnte nicht erstellt werden.');
        return;
      }

      if (data?.exists) {
        setMode('login');
        setInfo('Diese E-Mail ist bereits registriert. Bitte melde dich an.');
        return;
      }

      // Account angelegt — jetzt einloggen, damit die Session im Browser aktiv ist.
      const supabase = createAuthBrowserClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (loginErr) {
        setError('Konto angelegt, aber Login fehlgeschlagen: ' + loginErr.message);
        return;
      }

      setInfo('Konto erstellt — du bist angemeldet.');
      onAuthenticated?.();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const supabase = createAuthBrowserClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginErr) {
        setError(loginErr.message || 'Login fehlgeschlagen.');
        return;
      }
      setInfo('Erfolgreich angemeldet.');
      onAuthenticated?.();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-base';
  const labelClass = 'block text-sm font-body font-medium text-brand-black dark:text-white mb-1';

  return (
    <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
          className={`flex-1 py-2 text-sm font-heading font-semibold rounded-btn transition-colors ${
            mode === 'signup'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-brand-bg dark:bg-white/5 text-brand-steel dark:text-gray-400'
          }`}
        >
          Neu registrieren
        </button>
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); setInfo(''); }}
          className={`flex-1 py-2 text-sm font-heading font-semibold rounded-btn transition-colors ${
            mode === 'login'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-brand-bg dark:bg-white/5 text-brand-steel dark:text-gray-400'
          }`}
        >
          Anmelden
        </button>
      </div>

      <form onSubmit={mode === 'signup' ? handleSignup : handleLogin} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className={labelClass}>Dein Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Max Mustermann"
              autoComplete="name"
              required
            />
          </div>
        )}

        <div>
          <label className={labelClass}>E-Mail *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="max@email.de"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className={labelClass}>Passwort *</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder={mode === 'signup' ? 'Mindestens 8 Zeichen' : 'Dein Passwort'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-heading font-semibold text-brand-muted hover:text-brand-black dark:hover:text-white"
            >
              {showPw ? 'Ausblenden' : 'Anzeigen'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {info && !error && (
          <div className="p-3 rounded-[10px] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
            {info}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {mode === 'signup' ? 'Konto wird erstellt…' : 'Wird angemeldet…'}
            </>
          ) : (
            mode === 'signup' ? 'Konto erstellen & weiter' : 'Anmelden & weiter'
          )}
        </button>

        {mode === 'signup' && (
          <p className="text-xs text-brand-muted dark:text-gray-500 text-center">
            Mit der Registrierung akzeptierst du unsere <Link href="/agb" className="text-accent-blue underline">AGB</Link> und <Link href="/datenschutz" className="text-accent-blue underline">Datenschutzerklaerung</Link>.
          </p>
        )}
      </form>
    </div>
  );
}
