'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

type Mode = 'signup' | 'login';
type Step = 'auth' | 'upload' | 'done';

/**
 * Express-Signup / Inline-Login im Checkout mit integriertem Ausweis-Upload.
 *
 * Wird auf der Checkout-Seite gezeigt, wenn der Kunde nicht eingeloggt ist
 * UND das Feature-Flag `expressSignupEnabled` aktiv ist.
 *
 * Zwei-Schritt-Flow fuer Neukunden:
 *   1. 'auth'   — Konto anlegen (oder einloggen)
 *   2. 'upload' — Ausweis hochladen (Vorderseite + Rueckseite)
 *   3. 'done'   — Fertig, AuthProvider hat Session, Checkout geht weiter
 *
 * Nach Upload steht `verification_status='pending'` auf dem Profil. Die
 * Buchung wird trotzdem mit `verification_required=true` geschrieben, bis
 * der Admin den Ausweis freigibt.
 *
 * Fallback: Upload kann uebersprungen werden. Dann greift der normale
 * Reminder-/Auto-Storno-Flow.
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
  const [step, setStep] = useState<Step>('auth');
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(defaultName ?? '');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Upload-Step
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

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

      // Session da — weiter zu Schritt 2: Ausweis-Upload
      setInfo('');
      setStep('upload');
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
      // Bei Login (Bestandskunde) direkt weiter — keine Ausweis-Upload-Pflicht,
      // der hat seinen Status schon (entweder verifiziert oder laeuft schon).
      setInfo('Erfolgreich angemeldet.');
      setStep('done');
      onAuthenticated?.();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Datei zu gross (max. 5 MB).');
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
      setError('Bitte lade Vorder- und Rueckseite deines Ausweises hoch.');
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

  // ─── Step: Upload (Ausweis-Upload nach Signup) ───────────────────────────
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
          Damit wir die Kamera schnell versenden koennen, brauchen wir einmalig eine Kopie deines Ausweises (Vorder- und Rueckseite). Dauert 30 Sekunden.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {/* Vorderseite */}
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
                  <p className="text-xs font-body text-brand-muted">Klicken zum Auswaehlen</p>
                </div>
              )}
            </button>
          </div>

          {/* Rueckseite */}
          <div>
            <label className={labelClass}>Rueckseite *</label>
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
                <img src={backPreview} alt="Rueckseite" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center px-4">
                  <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <p className="text-xs font-body text-brand-muted">Klicken zum Auswaehlen</p>
                </div>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-brand-muted dark:text-gray-500 mb-4">
          JPG, PNG, WebP oder HEIC. Max 5 MB pro Seite. Die Daten werden verschluesselt uebertragen und nur zur Identitaetsprueung gespeichert.
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
          Spaeter hochladen (Versand verzoegert sich)
        </button>
      </div>
    );
  }

  // ─── Step: Done (Spinner kurzzeitig bevor Parent neu rendert) ───────────
  if (step === 'done') {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-heading font-semibold text-brand-black dark:text-white">Alles klar!</p>
        <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1">Du wirst zum Checkout weitergeleitet…</p>
      </div>
    );
  }

  // ─── Step: Auth (Signup oder Login) ──────────────────────────────────────
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
          <>
            <p className="text-xs font-body text-brand-muted dark:text-gray-500 text-center">
              Im naechsten Schritt laedst du deinen Ausweis hoch. Danach geht&apos;s direkt zur Zahlung.
            </p>
            <p className="text-xs text-brand-muted dark:text-gray-500 text-center">
              Mit der Registrierung akzeptierst du unsere <Link href="/agb" className="text-accent-blue underline">AGB</Link> und <Link href="/datenschutz" className="text-accent-blue underline">Datenschutzerklaerung</Link>.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
