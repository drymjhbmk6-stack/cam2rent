'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

interface Profile {
  full_name: string;
  phone: string;
  address_street: string;
  address_zip: string;
  address_city: string;
}

export default function ProfilPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>({
    full_name: '',
    phone: '',
    address_street: '',
    address_zip: '',
    address_city: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (!user) return;

    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            full_name: data.full_name ?? user.user_metadata?.full_name ?? '',
            phone: data.phone ?? '',
            address_street: data.address_street ?? '',
            address_zip: data.address_zip ?? '',
            address_city: data.address_city ?? '',
          });
        } else {
          // No profile row yet — pre-fill from auth metadata
          setProfile((p) => ({
            ...p,
            full_name: user.user_metadata?.full_name ?? '',
          }));
        }
        setLoading(false);
      });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSaving(true);

    const supabase = createAuthBrowserClient();

    // Upsert profile row
    const { error: dbError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: profile.full_name,
        phone: profile.phone,
        address_street: profile.address_street,
        address_zip: profile.address_zip,
        address_city: profile.address_city,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // Also update display name in auth metadata
    if (!dbError) {
      await supabase.auth.updateUser({
        data: { full_name: profile.full_name },
      });
    }

    setSaving(false);

    if (dbError) {
      setError('Profil konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push('/konto?success=profil-gespeichert');
      }, 800);
    }
  };

  const handleChange = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((p) => ({ ...p, [field]: e.target.value }));
    setSuccess(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-card shadow-card p-6">
        <h1 className="font-heading font-bold text-xl text-brand-black mb-1">
          Profil bearbeiten
        </h1>
        <p className="text-brand-text text-sm">
          Diese Daten werden beim Checkout vorausgefüllt.
        </p>
      </div>

      <div className="bg-white rounded-card shadow-card p-6">
        {error && (
          <div className="mb-6 p-4 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 rounded-[10px] bg-green-50 border border-green-200 text-status-success text-sm">
            Profil erfolgreich gespeichert.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">
              Vollständiger Name
            </label>
            <input
              type="text"
              value={profile.full_name}
              onChange={handleChange('full_name')}
              className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
              placeholder="Max Mustermann"
              autoComplete="name"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">
              E-Mail-Adresse
            </label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-brand-bg text-brand-steel cursor-not-allowed"
            />
            <p className="text-xs text-brand-muted mt-1">
              E-Mail-Adresse kann nicht geändert werden.
            </p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">
              Telefonnummer
            </label>
            <input
              type="tel"
              value={profile.phone}
              onChange={handleChange('phone')}
              className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
              placeholder="+49 170 1234567"
              autoComplete="tel"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">
              Straße und Hausnummer
            </label>
            <input
              type="text"
              value={profile.address_street}
              onChange={handleChange('address_street')}
              className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
              placeholder="Musterstraße 42"
              autoComplete="street-address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-body font-medium text-brand-black mb-1">
                PLZ
              </label>
              <input
                type="text"
                value={profile.address_zip}
                onChange={handleChange('address_zip')}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="12345"
                autoComplete="postal-code"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-sm font-body font-medium text-brand-black mb-1">
                Stadt
              </label>
              <input
                type="text"
                value={profile.address_city}
                onChange={handleChange('address_city')}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors"
                placeholder="Berlin"
                autoComplete="address-level2"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-brand-black text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Wird gespeichert…' : 'Profil speichern'}
            </button>
          </div>
        </form>
      </div>

      {/* Password section */}
      <div className="bg-white rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black mb-1">
          Passwort ändern
        </h2>
        <p className="text-sm text-brand-text mb-4">
          Fordere einen Passwort-Reset-Link per E-Mail an.
        </p>
        <a
          href="/passwort-vergessen"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-brand-border text-brand-text font-body font-medium text-sm rounded-btn hover:border-brand-black hover:text-brand-black transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
          Passwort-Reset anfordern
        </a>
      </div>
    </div>
  );
}
