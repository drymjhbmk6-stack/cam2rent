'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/passwort-aendern`,
    });

    setLoading(false);

    if (error) {
      setError('Fehler beim Senden der E-Mail. Bitte versuche es erneut.');
    } else {
      setSuccess(true);
    }
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
              E-Mail gesendet
            </h1>
            <p className="text-brand-text dark:text-gray-300 text-sm mb-4">
              Wir haben einen Link zum Zurücksetzen deines Passworts an{' '}
              <strong>{email}</strong> gesendet.
            </p>
            <p className="text-xs text-brand-muted dark:text-gray-500">
              Keine E-Mail erhalten? Schau auch im Spam-Ordner nach oder
              versuche es in ein paar Minuten erneut.
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
            Passwort zurücksetzen
          </h1>
          <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
            Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum
            Zurücksetzen deines Passworts.
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Wird gesendet…' : 'Reset-Link senden'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-brand-steel dark:text-gray-400 mt-4">
          <Link
            href="/login"
            className="text-accent-blue hover:underline font-medium"
          >
            ← Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
