'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

type Mode = 'signup' | 'login';
type Step = 'auth' | 'upload' | 'done';

/**
 * Express-Signup / Inline-Login mit integriertem Ausweis-Upload.
 *
 * Drei-Schritt-Flow für Neukunden:
 *   1. 'auth'   — Konto anlegen (Stammdaten + Adresse) oder einloggen
 *   2. 'upload' — Ausweis hochladen (Vorder- + Rückseite)
 *   3. 'done'   — Fertig, AuthProvider hat Session, onAuthenticated wird gerufen
 *
 * Wichtig: `onAuthenticated` wird ERST nach dem Upload (oder „Später hochladen"-Skip)
 * gerufen. Eltern-Komponenten dürfen während der Upload-Phase NICHT aufgrund von
 * `user`-Updates ExpressSignup unmounten — sonst ist der Upload-Step weg, sobald
 * signInWithPassword die Session setzt.
 */
export default function ExpressSignup({
  onAuthenticated,
  onAuthCompleted,
  defaultEmail,
  defaultName,
  initialMode,
}: {
  onAuthenticated?: () => void;
  /** Wird gefeuert, sobald die Auth-Phase fertig ist und der Upload-Step beginnt. */
  onAuthCompleted?: () => void;
  defaultEmail?: string;
  defaultName?: string;
  initialMode?: Mode;
}) {
  const [step, setStep] = useState<Step>('auth');
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signup');

  // Stammdaten
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Adresse
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [zipLookupBusy, setZipLookupBusy] = useState(false);
  const [zipLookupError, setZipLookupError] = useState('');

  // Email-Existenz-Check
  const [emailExists, setEmailExists] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Vorname/Nachname aus defaultName (Best-Effort, falls Aufrufer einen Namen mitgibt)
  useEffect(() => {
    if (defaultName && !firstName && !lastName) {
      const parts = defaultName.trim().split(/\s+/);
      if (parts.length === 1) {
        setFirstName(parts[0]);
      } else {
        setFirstName(parts.slice(0, -1).join(' '));
        setLastName(parts[parts.length - 1]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultName]);

  // Upload-Step
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // ─── PLZ-Autofill ────────────────────────────────────────────────────────
  // Sobald 5 Ziffern eingegeben sind, Stadt von /api/plz-lookup nachladen.
  // Debounced über useEffect-Cleanup. Stadt nur überschreiben wenn leer
  // (sonst zerstören wir manuelle Eingaben).
  useEffect(() => {
    setZipLookupError('');
    if (!/^\d{5}$/.test(zip)) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setZipLookupBusy(true);
      try {
        const res = await fetch(`/api/plz-lookup?plz=${zip}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.city) {
          if (!city.trim()) setCity(data.city);
        } else if (res.status === 404) {
          setZipLookupError('PLZ nicht gefunden — bitte Stadt manuell eintragen.');
        }
      } catch {
        // Netzwerkfehler stillschweigend — Stadt-Feld bleibt manuell editierbar
      } finally {
        setZipLookupBusy(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip]);

  // ─── E-Mail-Existenz-Check beim Blur ─────────────────────────────────────
  async function checkEmailExists() {
    if (mode !== 'signup') return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailExists(false);
      return;
    }
    setEmailChecking(true);
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      setEmailExists(!!data?.exists);
    } catch {
      setEmailExists(false);
    } finally {
      setEmailChecking(false);
    }
  }

  // ─── Signup ──────────────────────────────────────────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!firstName.trim()) return setError('Bitte gib deinen Vornamen ein.');
    if (!lastName.trim()) return setError('Bitte gib deinen Nachnamen ein.');
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return setError('Bitte gib eine gültige E-Mail-Adresse ein.');
    }
    if (password.length < 8) return setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
    if (!street.trim()) return setError('Bitte gib Straße und Hausnummer ein.');
    if (!/^\d{5}$/.test(zip.trim())) return setError('Bitte gib eine gültige 5-stellige PLZ ein.');
    if (!city.trim()) return setError('Bitte gib deine Stadt ein.');
    if (emailExists) return setError('Unter dieser E-Mail gibt es bereits ein Konto. Bitte melde dich an.');

    setBusy(true);
    try {
      const res = await fetch('/api/auth/express-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
          street: street.trim(),
          zip: zip.trim(),
          city: city.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setError(data?.message || 'Zu viele Registrierungen. Bitte später erneut versuchen.');
        return;
      }
      if (res.status === 403 && data?.error === 'feature_disabled') {
        setError('Registrierung ist derzeit nicht möglich. Bitte versuche es später erneut.');
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

      // Auth-Phase fertig → Eltern informieren BEVOR signIn die Session setzt,
      // sonst rendert die Eltern-Komponente uns u.U. weg und wir verlieren
      // den Upload-Step.
      onAuthCompleted?.();

      const supabase = createAuthBrowserClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (loginErr) {
        setError('Konto angelegt, aber Login fehlgeschlagen: ' + loginErr.message);
        return;
      }

      setInfo('');
      setStep('upload');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      // Auch beim Bestandskunden-Login informieren wir den Parent VOR dem
      // Session-Setzen, damit er nicht aus Versehen das Upload-Step-Lifecycle
      // killt (selbst wenn beim Login direkt 'done' kommt).
      onAuthCompleted?.();

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
      setStep('done');
      onAuthenticated?.();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Upload ──────────────────────────────────────────────────────────────
  function handleFile(side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Datei zu groß (max. 5 MB).');
      return;
    }
    const url = URL.createObjectURL(file);
    if (side === 'front') {
      setFrontFile(file);
      setFrontPreview(url);
    } else {
      setBackFile(file);
      setBackPreview(url);
    }
    setError('');
  }

  async function handleUpload() {
    if (!frontFile || !backFile) {
      setError('Bitte lade Vorder- und Rückseite deines Ausweises hoch.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = createAuthBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Session abgelaufen. Bitte neu einloggen.');
        return;
      }

      const formData = new FormData();
      formData.append('front', frontFile);
      formData.append('back', backFile);

      const res = await fetch('/api/upload-id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Upload fehlgeschlagen.');
        return;
      }

      setStep('done');
      onAuthenticated?.();
    } catch {
      setError('Netzwerkfehler beim Hochladen.');
    } finally {
      setBusy(false);
    }
  }

  function handleSkipUpload() {
    setStep('done');
    onAuthenticated?.();
  }

  const inputClass =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-base';
  const labelClass = 'block text-sm font-body font-medium text-brand-black dark:text-white mb-1';

  // ─── Step: Upload ────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-status-success text-white flex items-center justify-center text-xs font-bold">✓</span>
          <span className="text-sm font-body text-brand-steel dark:text-gray-400">Konto erstellt</span>
          <span className="flex-1 border-t border-brand-border dark:border-white/10 mx-2" />
          <span className="w-6 h-6 rounded-full bg-accent-blue text-white flex items-center justify-center text-xs font-bold">2</span>
          <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">Ausweis hochladen</span>
        </div>

        <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">
          Personalausweis hochladen
        </h2>
        <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-5">
          Damit wir die Kamera schnell versenden können, brauchen wir einmalig eine Kopie deines Ausweises (Vorder- und Rückseite). Dauert 30 Sekunden.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Vorderseite *</label>
            <input
              ref={frontRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(e) => handleFile('front', e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => frontRef.current?.click()}
              className="w-full aspect-[4/3] rounded-[10px] border-2 border-dashed border-brand-border dark:border-white/20 hover:border-accent-blue transition-colors flex items-center justify-center overflow-hidden bg-brand-bg dark:bg-brand-black"
            >
              {frontPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frontPreview} alt="Vorderseite" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center px-4">
                  <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <p className="text-xs font-body text-brand-muted">Klicken zum Auswählen</p>
                </div>
              )}
            </button>
          </div>

          <div>
            <label className={labelClass}>Rückseite *</label>
            <input
              ref={backRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(e) => handleFile('back', e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backRef.current?.click()}
              className="w-full aspect-[4/3] rounded-[10px] border-2 border-dashed border-brand-border dark:border-white/20 hover:border-accent-blue transition-colors flex items-center justify-center overflow-hidden bg-brand-bg dark:bg-brand-black"
            >
              {backPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={backPreview} alt="Rückseite" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center px-4">
                  <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <p className="text-xs font-body text-brand-muted">Klicken zum Auswählen</p>
                </div>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-brand-muted dark:text-gray-500 mb-4">
          JPG, PNG, WebP oder HEIC. Max 5 MB pro Seite. Die Daten werden verschlüsselt übertragen und nur zur Identitätsprüfung gespeichert.
        </p>

        {error && (
          <div className="p-3 mb-3 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={busy || !frontFile || !backFile}
          className="w-full py-3 mb-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Wird hochgeladen…
            </>
          ) : 'Hochladen & weiter'}
        </button>

        <button
          type="button"
          onClick={handleSkipUpload}
          disabled={busy}
          className="w-full py-2 text-xs font-body text-brand-muted hover:text-brand-black dark:hover:text-white underline transition-colors"
        >
          Später hochladen (Versand verzögert sich)
        </button>
      </div>
    );
  }

  // ─── Step: Done ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-heading font-semibold text-brand-black dark:text-white">Alles klar!</p>
        <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1">Du wirst weitergeleitet…</p>
      </div>
    );
  }

  // ─── Step: Auth ──────────────────────────────────────────────────────────
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
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Vorname *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                placeholder="Max"
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Nachname *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                placeholder="Mustermann"
                autoComplete="family-name"
                required
              />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>E-Mail *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailExists) setEmailExists(false); }}
            onBlur={checkEmailExists}
            className={`${inputClass} ${emailExists ? 'border-red-400 dark:border-red-600' : ''}`}
            placeholder="max@email.de"
            autoComplete="email"
            required
          />
          {emailChecking && (
            <p className="mt-1 text-xs text-brand-muted dark:text-gray-500">Prüfe E-Mail…</p>
          )}
          {emailExists && mode === 'signup' && (
            <div className="mt-2 p-3 rounded-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
              Diese E-Mail ist bereits registriert.{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setEmailExists(false); setError(''); setInfo(''); }}
                className="underline font-semibold"
              >
                Jetzt anmelden
              </button>
            </div>
          )}
        </div>

        {mode === 'signup' && (
          <div>
            <label className={labelClass}>Telefon</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="+49 170 1234567"
              autoComplete="tel"
            />
          </div>
        )}

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

        {mode === 'signup' && (
          <>
            <div>
              <label className={labelClass}>Straße und Hausnummer *</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className={inputClass}
                placeholder="Musterstraße 42"
                autoComplete="street-address"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>PLZ *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  className={inputClass}
                  placeholder="12345"
                  autoComplete="postal-code"
                  required
                />
                {zipLookupBusy && (
                  <p className="mt-1 text-xs text-brand-muted dark:text-gray-500">Suche Stadt…</p>
                )}
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Stadt *</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                  placeholder="Berlin"
                  autoComplete="address-level2"
                  required
                />
              </div>
            </div>
            {zipLookupError && (
              <p className="text-xs text-amber-600 dark:text-amber-400 -mt-2">{zipLookupError}</p>
            )}
          </>
        )}

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
          disabled={busy || (mode === 'signup' && emailExists)}
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
          <>
            <p className="text-xs font-body text-brand-muted dark:text-gray-500 text-center">
              Im nächsten Schritt lädst du deinen Ausweis hoch.
            </p>
            <p className="text-xs text-brand-muted dark:text-gray-500 text-center">
              Mit der Registrierung akzeptierst du unsere <Link href="/agb" className="text-accent-blue underline">AGB</Link> und <Link href="/datenschutz" className="text-accent-blue underline">Datenschutzerklärung</Link>.
            </p>
          </>
        )}

        {mode === 'login' && (
          <p className="text-xs text-brand-muted dark:text-gray-500 text-center">
            Passwort vergessen? <Link href="/passwort-vergessen" className="text-accent-blue underline">Hier zurücksetzen</Link>
          </p>
        )}
      </form>
    </div>
  );
}
