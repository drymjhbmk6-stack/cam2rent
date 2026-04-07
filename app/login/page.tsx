'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/konto';
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(urlError ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError('E-Mail oder Passwort ist falsch.');
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  };

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
            Willkommen zurück
          </h1>
          <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
            Melde dich an, um deine Buchungen zu verwalten.
          </p>

          {error && (
            <div className="mb-4 p-4 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-status-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-body font-medium text-brand-black dark:text-white mb-1">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="deine@email.de"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-body font-medium text-brand-black dark:text-white">
                  Passwort
                </label>
                <Link
                  href="/passwort-vergessen"
                  className="text-xs text-accent-blue hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Dein Passwort"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Wird angemeldet…' : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-brand-steel dark:text-gray-400 mt-4">
          Noch kein Konto?{' '}
          <Link
            href="/registrierung"
            className="text-accent-blue hover:underline font-medium"
          >
            Jetzt registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
