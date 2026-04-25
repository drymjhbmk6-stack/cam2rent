'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

export default function RegistrierungPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [resetMinutes, setResetMinutes] = useState(0);
  const [emailExists, setEmailExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Rate-Limit beim Laden prüfen
  useEffect(() => {
    fetch('/api/auth/signup')
      .then(r => r.json())
      .then(d => {
        if (!d.allowed) {
          setRateLimited(true);
          setResetMinutes(Math.ceil((d.resetInSeconds || 3600) / 60));
        }
      })
      .catch(() => {});
  }, []);

  // Countdown für Rate-Limit
  useEffect(() => {
    if (!rateLimited || resetMinutes <= 0) return;
    const interval = setInterval(() => {
      setResetMinutes(prev => {
        if (prev <= 1) {
          setRateLimited(false);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [rateLimited, resetMinutes]);

  // Prueft beim Verlassen des E-Mail-Felds, ob die Adresse bereits
  // registriert ist. Supabase's signUp gibt diese Info nicht zuverlaessig
  // zurueck (Privacy-Schutz), deshalb fragen wir die Admin-API.
  const checkEmailExists = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailExists(false);
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      setEmailExists(!!data?.exists);
    } catch {
      // Netzwerkfehler → nicht blocken, Submit-Handler faengt es ab
      setEmailExists(false);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);

    // Rate-Limit prüfen + Zähler erhöhen
    const limitRes = await fetch('/api/auth/signup', { method: 'POST' });
    if (!limitRes.ok) {
      const limitData = await limitRes.json();
      if (limitData.rateLimited) {
        setRateLimited(true);
        setResetMinutes(Math.ceil((limitData.resetInSeconds || 3600) / 60));
        setLoading(false);
        return;
      }
    }

    const supabase = createAuthBrowserClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Unter dieser E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an oder nutze "Passwort vergessen".');
      } else if (error.status === 429 || error.message.includes('rate')) {
        setRateLimited(true);
        setResetMinutes(60);
      } else {
        setError(`Fehler: ${error.message}`);
      }
      return;
    }

    // Supabase-Privacy-Falle: Bei bereits registrierter E-Mail gibt signUp
    // keinen Fehler zurueck (Schutz gegen E-Mail-Enumeration), sondern ein
    // User-Objekt mit leerem `identities`-Array. Das ist das dokumentierte
    // Signal "E-Mail existiert schon".
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('Unter dieser E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an oder nutze "Passwort vergessen".');
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-status-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
              Bestätigungs-E-Mail gesendet
            </h1>
            <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
              Wir haben eine E-Mail an <strong>{email}</strong> geschickt.
              Bitte klicke auf den Link in der E-Mail, um dein Konto zu
              aktivieren.
            </p>
            <p className="text-xs text-brand-muted dark:text-gray-500">
              Keine E-Mail erhalten? Schau auch im Spam-Ordner nach.
            </p>
          </div>
          <p className="text-center text-sm text-brand-steel dark:text-gray-400 mt-4">
            <Link
              href="/login"
              className="text-accent-blue hover:underline font-medium"
            >
              Zurück zur Anmeldung
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="font-heading font-bold text-2xl text-brand-black dark:text-white">
              Cam<span className="text-accent-blue">2</span>Rent
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8">
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-1">
            Konto erstellen
          </h1>
          <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
            Verwalte deine Buchungen bequem an einem Ort.
          </p>

          {rateLimited && (
            <div className="mb-4 p-4 rounded-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
              <p className="font-semibold mb-1">Registrierung vorübergehend nicht möglich</p>
              <p>Aufgrund hoher Nachfrage können aktuell keine neuen Konten erstellt werden. Bitte versuche es in ca. {resetMinutes} {resetMinutes === 1 ? 'Minute' : 'Minuten'} erneut.</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-status-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-body font-medium text-brand-black dark:text-white mb-1">
                Vollständiger Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Max Mustermann"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-body font-medium text-brand-black dark:text-white mb-1">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailExists) setEmailExists(false); }}
                onBlur={checkEmailExists}
                className={`w-full px-4 py-3 rounded-[10px] border ${emailExists ? 'border-status-error' : 'border-brand-border dark:border-white/10'} bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors`}
                placeholder="deine@email.de"
                required
                autoComplete="email"
              />
              {checkingEmail && (
                <p className="mt-1 text-xs text-brand-muted dark:text-gray-500">Pruefe E-Mail…</p>
              )}
              {emailExists && (
                <div className="mt-2 p-3 rounded-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
                  Unter dieser E-Mail gibt es bereits ein Konto.{' '}
                  <Link href={`/login?email=${encodeURIComponent(email)}`} className="underline font-semibold">
                    Jetzt anmelden
                  </Link>{' '}
                  oder <Link href="/passwort-vergessen" className="underline font-semibold">Passwort zurücksetzen</Link>.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-body font-medium text-brand-black dark:text-white mb-1">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Mindestens 8 Zeichen"
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-body font-medium text-brand-black dark:text-white mb-1">
                Passwort bestätigen
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Passwort wiederholen"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || rateLimited || emailExists || checkingEmail}
              className="w-full py-3 px-6 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Wird registriert…' : rateLimited ? 'Bitte warten…' : emailExists ? 'E-Mail bereits registriert' : 'Konto erstellen'}
            </button>
          </form>

          <p className="text-xs text-brand-muted dark:text-gray-500 text-center mt-4">
            Mit der Registrierung stimmst du unseren{' '}
            <Link href="/agb" className="underline hover:text-brand-text dark:hover:text-gray-300">
              AGB
            </Link>{' '}
            und der{' '}
            <Link
              href="/datenschutz"
              className="underline hover:text-brand-text dark:hover:text-gray-300"
            >
              Datenschutzerklärung
            </Link>{' '}
            zu.
          </p>
        </div>

        <p className="text-center text-sm text-brand-steel dark:text-gray-400 mt-4">
          Bereits ein Konto?{' '}
          <Link
            href="/login"
            className="text-accent-blue hover:underline font-medium"
          >
            Jetzt anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
