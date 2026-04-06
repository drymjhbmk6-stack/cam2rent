'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

interface Profile {
  full_name: string;
  phone: string;
  address_street: string;
  address_zip: string;
  address_city: string;
}

function SectionToggle({
  title,
  defaultOpen,
  danger,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={`bg-white rounded-card shadow-card overflow-hidden ${danger ? 'border border-red-200' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-6 py-4 text-left transition-colors ${danger ? 'hover:bg-red-50/50' : 'hover:bg-brand-bg/50'}`}
      >
        <h2 className={`font-heading font-semibold ${danger ? 'text-red-600' : 'text-brand-black'}`}>{title}</h2>
        <svg
          className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''} ${danger ? 'text-red-400' : 'text-brand-steel'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className={`px-6 pb-6 pt-4 ${danger ? 'border-t border-red-200' : 'border-t border-brand-border'}`}>{children}</div>}
    </div>
  );
}

// ─── Sektion 1: Kontoinformationen ─────────────────────────────────────────

function KontoInfo() {
  const { user } = useAuth();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between py-2 border-b border-brand-border">
        <span className="text-sm text-brand-steel">E-Mail</span>
        <span className="text-sm font-medium text-brand-black">{user?.email}</span>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-brand-border">
        <span className="text-sm text-brand-steel">Name</span>
        <span className="text-sm font-medium text-brand-black">
          {user?.user_metadata?.full_name || '–'}
        </span>
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-brand-steel">Konto erstellt</span>
        <span className="text-sm font-medium text-brand-black">
          {user?.created_at
            ? new Date(user.created_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })
            : '–'}
        </span>
      </div>
    </div>
  );
}

// ─── Sektion 2: Profil bearbeiten ──────────────────────────────────────────

function ProfilEdit() {
  const { user } = useAuth();
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
          setProfile((p) => ({ ...p, full_name: user.user_metadata?.full_name ?? '' }));
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

    if (!dbError) {
      await supabase.auth.updateUser({ data: { full_name: profile.full_name } });
    }

    setSaving(false);
    if (dbError) {
      setError('Profil konnte nicht gespeichert werden.');
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleChange = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((p) => ({ ...p, [field]: e.target.value }));
    setSuccess(false);
  };

  const inputCls =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors';

  if (loading) {
    return <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-[10px] bg-green-50 border border-green-200 text-status-success text-sm">
          Profil gespeichert.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-body font-medium text-brand-black mb-1">Vollständiger Name</label>
          <input type="text" value={profile.full_name} onChange={handleChange('full_name')} className={inputCls} placeholder="Max Mustermann" autoComplete="name" />
        </div>

        <div>
          <label className="block text-sm font-body font-medium text-brand-black mb-1">E-Mail-Adresse</label>
          <input type="email" value={user?.email ?? ''} disabled className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-brand-bg text-brand-steel cursor-not-allowed" />
          <p className="text-xs text-brand-muted mt-1">E-Mail-Adresse kann derzeit nicht geändert werden.</p>
        </div>

        <div>
          <label className="block text-sm font-body font-medium text-brand-black mb-1">Telefonnummer</label>
          <input type="tel" value={profile.phone} onChange={handleChange('phone')} className={inputCls} placeholder="+49 170 1234567" autoComplete="tel" />
        </div>

        <div>
          <label className="block text-sm font-body font-medium text-brand-black mb-1">Straße und Hausnummer</label>
          <input type="text" value={profile.address_street} onChange={handleChange('address_street')} className={inputCls} placeholder="Musterstraße 42" autoComplete="street-address" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">PLZ</label>
            <input type="text" value={profile.address_zip} onChange={handleChange('address_zip')} className={inputCls} placeholder="12345" autoComplete="postal-code" maxLength={5} />
          </div>
          <div>
            <label className="block text-sm font-body font-medium text-brand-black mb-1">Stadt</label>
            <input type="text" value={profile.address_city} onChange={handleChange('address_city')} className={inputCls} placeholder="Berlin" autoComplete="address-level2" />
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

      {/* Passwort */}
      <div className="mt-6 pt-6 border-t border-brand-border">
        <h3 className="font-heading font-semibold text-brand-black mb-1 text-sm">Passwort ändern</h3>
        <p className="text-sm text-brand-text mb-3">Fordere einen Passwort-Reset-Link per E-Mail an.</p>
        <a
          href="/passwort-vergessen"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-brand-border text-brand-text font-body font-medium text-sm rounded-btn hover:border-brand-black hover:text-brand-black transition-colors"
        >
          Passwort-Reset anfordern
        </a>
      </div>
    </div>
  );
}

// ─── Sektion 3: Darstellung ───────────────────────────────────────────────

function Darstellung() {
  // Dynamic import to avoid SSR issues
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const stored = localStorage.getItem('cam2rent_theme') as 'light' | 'dark' | 'system' | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  function handleChange(newTheme: 'light' | 'dark' | 'system') {
    setThemeState(newTheme);
    localStorage.setItem('cam2rent_theme', newTheme);
    // Apply theme
    const resolved = newTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : newTheme;
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  const options: { id: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    {
      id: 'light',
      label: 'Hell',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'dark',
      label: 'Dunkel',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      id: 'system',
      label: 'Automatisch',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-text dark:text-gray-300 mb-2">
        Wähle dein bevorzugtes Erscheinungsbild für cam2rent.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleChange(opt.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              theme === opt.id
                ? 'border-accent-blue bg-accent-blue-soft dark:bg-accent-blue/10'
                : 'border-brand-border dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-brand-steel dark:hover:border-gray-600'
            }`}
          >
            <span className={theme === opt.id ? 'text-accent-blue' : 'text-brand-steel dark:text-gray-400'}>
              {opt.icon}
            </span>
            <span className={`text-xs font-heading font-semibold ${
              theme === opt.id ? 'text-accent-blue' : 'text-brand-text dark:text-gray-300'
            }`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sektion 4: Verifizierung ──────────────────────────────────────────────

function Verifizierung() {
  const { user } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setStatus((data?.verification_status as VerificationStatus) || 'none');
        setLoading(false);
      });
  }, [user]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setError('');
    if (selected.length !== 2) { setError('Bitte wähle genau 2 Bilder aus (Vorder- und Rückseite).'); return; }
    for (const file of selected) {
      if (file.size > 5 * 1024 * 1024) { setError(`"${file.name}" ist zu groß (max 5 MB).`); return; }
    }
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }

  async function handleUpload() {
    if (files.length !== 2) { setError('Bitte wähle genau 2 Bilder aus.'); return; }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const supabase = createAuthBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Bitte melde dich erneut an.'); setUploading(false); return; }
      const formData = new FormData();
      formData.append('front', files[0]);
      formData.append('back', files[1]);
      const res = await fetch('/api/upload-id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Fehler beim Hochladen.'); }
      else { setSuccess('Dokumente wurden hochgeladen!'); setStatus('pending'); setPreviews([]); setFiles([]); }
    } catch { setError('Fehler beim Hochladen.'); }
    finally { setUploading(false); }
  }

  if (loading) {
    return <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />;
  }

  if (status === 'verified') {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-heading font-bold text-green-800 mb-1">Konto verifiziert</p>
        <p className="text-sm text-green-700">Du kannst jetzt Buchungen durchführen.</p>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 p-5 text-center">
        <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-heading font-bold text-yellow-800 mb-1">Wird geprüft</p>
        <p className="text-sm text-yellow-700">Deine Dokumente werden geprüft. Dies dauert in der Regel wenige Stunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === 'rejected' && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Verifizierung abgelehnt. Bitte lade deine Dokumente erneut hoch.
        </div>
      )}

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-800">
          <strong>Warum ist das nötig?</strong> Für die Sicherheit unserer Kameras verifizieren wir alle Kunden
          vor der ersten Buchung. Lade bitte Vorder- und Rückseite deines Ausweises hoch.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>}

      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent-blue hover:bg-blue-50/50 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {previews.length === 2 ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-heading font-semibold text-brand-steel mb-2">Vorderseite</p>
              <img src={previews[0]} alt="Vorderseite" className="max-h-32 mx-auto rounded-lg" />
            </div>
            <div>
              <p className="text-xs font-heading font-semibold text-brand-steel mb-2">Rückseite</p>
              <img src={previews[1]} alt="Rückseite" className="max-h-32 mx-auto rounded-lg" />
            </div>
          </div>
        ) : (
          <>
            <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-heading font-semibold text-brand-black mb-1">2 Bilder auswählen</p>
            <p className="text-xs text-brand-muted">JPG, PNG oder WebP (je max 5 MB)</p>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="hidden" onChange={handleFileChange} />

      <button
        onClick={handleUpload}
        disabled={uploading || files.length !== 2}
        className="px-6 py-3 bg-accent-blue text-white font-heading font-semibold rounded-xl hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Wird hochgeladen…' : 'Ausweis hochladen'}
      </button>
    </div>
  );
}

// ─── Sektion 5: Konto löschen ─────────────────────────────────────────────

function KontoLoeschen() {
  const router = useRouter();
  const [showFirstModal, setShowFirstModal] = useState(false);
  const [showSecondModal, setShowSecondModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function openFirstModal() {
    setError('');
    setShowFirstModal(true);
  }

  function closeAll() {
    setShowFirstModal(false);
    setShowSecondModal(false);
    setPassword('');
    setConfirmed(false);
    setError('');
  }

  function proceedToSecondModal() {
    setShowFirstModal(false);
    setShowSecondModal(true);
  }

  async function handleDelete() {
    setDeleting(true);
    setError('');

    try {
      const supabase = createAuthBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Bitte melde dich erneut an.');
        setDeleting(false);
        return;
      }

      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Kontolöschung fehlgeschlagen.');
        setDeleting(false);
        return;
      }

      // Sign out locally and redirect
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      setDeleting(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-brand-text mb-4">
        Wenn du dein Konto löschst, werden deine persönlichen Daten anonymisiert und dein Zugang
        dauerhaft deaktiviert. Diese Aktion kann nicht rückgängig gemacht werden.
      </p>
      <button
        onClick={openFirstModal}
        className="px-6 py-3 bg-red-600 text-white font-heading font-semibold rounded-btn hover:bg-red-700 transition-colors"
      >
        Konto löschen
      </button>

      {/* ── Erste Bestätigung ───────────────────────────────────────── */}
      {showFirstModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-card shadow-xl max-w-md w-full p-6">
            <h3 className="font-heading font-bold text-lg text-brand-black mb-4">
              Möchtest du dein Konto wirklich löschen?
            </h3>
            <ul className="space-y-2 mb-6 text-sm text-brand-text">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">&#10005;</span>
                Dein Konto wird dauerhaft deaktiviert
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">&#10005;</span>
                Deine persönlichen Daten werden anonymisiert
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-steel mt-0.5">&#8226;</span>
                Buchungsdaten bleiben aus steuerlichen Gründen 10 Jahre gespeichert
              </li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeAll}
                className="px-5 py-2.5 border border-brand-border text-brand-text font-heading font-medium rounded-btn hover:border-brand-black hover:text-brand-black transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={proceedToSecondModal}
                className="px-5 py-2.5 bg-red-600 text-white font-heading font-semibold rounded-btn hover:bg-red-700 transition-colors"
              >
                Ja, Konto löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zweite Bestätigung mit Passwort ────────────────────────── */}
      {showSecondModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-card shadow-xl max-w-md w-full p-6">
            <h3 className="font-heading font-bold text-lg text-brand-black mb-4">
              Letzte Chance &ndash; Bist du dir sicher?
            </h3>

            {error && (
              <div className="mb-4 p-3 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-body font-medium text-brand-black mb-1">
                Passwort bestätigen
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-colors"
                placeholder="Dein Passwort eingeben"
                autoComplete="current-password"
              />
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-brand-border text-red-600 focus:ring-red-400"
              />
              <span className="text-sm text-brand-text">
                Ich verstehe, dass diese Aktion nicht rückgängig gemacht werden kann
              </span>
            </label>

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeAll}
                className="px-5 py-2.5 border border-brand-border text-brand-text font-heading font-medium rounded-btn hover:border-brand-black hover:text-brand-black transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={!password || !confirmed || deleting}
                className="px-5 py-2.5 bg-red-600 text-white font-heading font-semibold rounded-btn hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Wird gelöscht...' : 'Konto endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ────────────────────────────────────────────────────────────

export default function UebersichtPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading font-bold text-xl text-brand-black">Kontoübersicht</h1>

      <SectionToggle title="Kontoinformationen" defaultOpen>
        <KontoInfo />
      </SectionToggle>

      <SectionToggle title="Profil bearbeiten" defaultOpen>
        <ProfilEdit />
      </SectionToggle>

      <SectionToggle title="Darstellung">
        <Darstellung />
      </SectionToggle>

      <SectionToggle title="Verifizierung">
        <Verifizierung />
      </SectionToggle>

      <SectionToggle title="Konto löschen" danger>
        <KontoLoeschen />
      </SectionToggle>
    </div>
  );
}
