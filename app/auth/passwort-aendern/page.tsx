'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

export default function PasswortAendernPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError('Passwort konnte nicht geändert werden. Bitte versuche es erneut.');
    } else {
      router.push('/konto?success=passwort-geaendert');
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="font-heading font-bold text-2xl text-brand-black">
              Cam<span className="text-accent-blue">2</span>Rent
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-card shadow-card p-8">
          <h1 className="font-heading font-bold text-2xl text-brand-black mb-1">
            Neues Passwort setzen
          </h1>
          <p className="text-brand-text text-sm mb-6">
            Wähle ein neues, sicheres Passwort für dein Konto.
          </p>

          {error && (
            <div className="mb-4 p-4 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-body font-medium text-brand-black mb-1">
                Neues Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Mindestens 8 Zeichen"
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-body font-medium text-brand-black mb-1">
                Passwort bestätigen
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Passwort wiederholen"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-brand-black text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Wird gespeichert…' : 'Passwort speichern'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
