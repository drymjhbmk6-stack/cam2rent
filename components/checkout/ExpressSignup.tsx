'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient, recordCustomerLogin } from '@/lib/supabase-auth';
import { shrinkImageFileIfNeeded } from '@/lib/shrink-image-client';
import { CountryField } from '@/components/checkout/CountryField';
import { DEFAULT_COUNTRY, isAllowedCountry, countryName } from '@/lib/allowed-countries';

type Mode = 'signup' | 'login';
type Step = 'auth' | 'collect' | 'upload' | 'done';

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
  requireUpload,
}: {
  onAuthenticated?: () => void;
  /** Wird gefeuert, sobald die Auth-Phase fertig ist und der Upload-Step beginnt. */
  onAuthCompleted?: () => void;
  defaultEmail?: string;
  defaultName?: string;
  initialMode?: Mode;
  /**
   * Wenn true, ist der Ausweis-Upload Pflicht — der „Später hochladen"-Skip
   * wird ausgeblendet. Genutzt auf der Registrierungs-Seite (dort gibt es
   * keinen Zahlungsdruck, der Ausweis kann sofort verlangt werden). Im
   * Checkout bleibt der Skip erhalten (verificationDeferred-Flow).
   */
  requireUpload?: boolean;
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
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
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
  // Wird true, sobald ein Upload fehlschlaegt/timeoutet — gibt dem Kunden eine
  // Ausweich-Option (im Konto nachreichen), damit ein haengender Upload bei
  // Pflicht-Upload (requireUpload) nicht in einer Sackgasse endet.
  const [uploadFailed, setUploadFailed] = useState(false);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  // Separate Inputs fuer Kamera (capture) vs. Galerie/Datei (ohne capture),
  // damit der Nutzer explizit „Foto aufnehmen" oder „Aus Galerie wählen" kann.
  const frontCamRef = useRef<HTMLInputElement>(null);
  const backCamRef = useRef<HTMLInputElement>(null);

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

  // Wird true, sobald in dieser Sitzung das Konto angelegt wurde — damit ein
  // erneuter Klick (z.B. nach fehlgeschlagenem Upload) nicht versucht, das
  // Konto noch einmal anzulegen, sondern nur den Ausweis hochlädt.
  const [accountCreated, setAccountCreated] = useState(false);

  // ─── Signup-Validierung (ohne Konto-Anlage) ──────────────────────────────
  function validateSignupForm(): string | null {
    const trimmedEmail = email.trim().toLowerCase();
    if (!firstName.trim()) return 'Bitte gib deinen Vornamen ein.';
    if (!lastName.trim()) return 'Bitte gib deinen Nachnamen ein.';
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    }
    if (password.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
    if (!street.trim()) return 'Bitte gib Straße und Hausnummer ein.';
    if (!/^\d{5}$/.test(zip.trim())) return 'Bitte gib eine gültige 5-stellige PLZ ein.';
    if (!city.trim()) return 'Bitte gib deine Stadt ein.';
    if (!isAllowedCountry(country)) {
      return `Wir liefern aktuell nur innerhalb ${countryName(DEFAULT_COUNTRY)}s.`;
    }
    if (emailExists) return 'Unter dieser E-Mail gibt es bereits ein Konto. Bitte melde dich an.';
    return null;
  }

  // Legt das Konto an + loggt ein. Gibt true bei Erfolg zurück, sonst false
  // (Fehler/Hinweis ist dann bereits gesetzt). Verändert den Step NICHT.
  async function createAccountAndLogin(): Promise<boolean> {
    const trimmedEmail = email.trim().toLowerCase();
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
        country,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setError(data?.message || 'Zu viele Registrierungen. Bitte später erneut versuchen.');
      return false;
    }
    if (res.status === 403 && data?.error === 'feature_disabled') {
      setError('Registrierung ist derzeit nicht möglich. Bitte versuche es später erneut.');
      return false;
    }
    if (!res.ok && !data?.exists) {
      setError(data?.message || 'Konto konnte nicht erstellt werden.');
      return false;
    }
    if (data?.exists) {
      setMode('login');
      setInfo('Diese E-Mail ist bereits registriert. Bitte melde dich an.');
      return false;
    }

    // Auth-Phase fertig → Eltern informieren BEVOR signIn die Session setzt.
    onAuthCompleted?.();

    const supabase = createAuthBrowserClient();
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (loginErr) {
      setError('Konto angelegt, aber Login fehlgeschlagen: ' + loginErr.message);
      return false;
    }
    recordCustomerLogin(loginData.session?.access_token);
    setInfo('');
    return true;
  }

  // ─── Signup (Standard-Flow: Konto sofort anlegen → Upload-Step) ───────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const err = validateSignupForm();
    if (err) { setError(err); return; }

    setBusy(true);
    try {
      const ok = await createAccountAndLogin();
      if (ok) setStep('upload');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Signup im requireUpload-Modus: erst Ausweis sammeln, dann Konto ──────
  // Klick auf „Weiter: Ausweis hochladen" legt das Konto NOCH NICHT an, sondern
  // wechselt zum Ausweis-Schritt. Das eigentliche „Konto erstellen" passiert
  // erst, wenn Vorder- + Rückseite gewählt sind (handleCreateAndUpload).
  function handleSignupContinue(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const err = validateSignupForm();
    if (err) { setError(err); return; }
    setStep('collect');
  }

  async function handleCreateAndUpload() {
    if (!frontFile || !backFile) {
      setError('Bitte wähle Vorder- und Rückseite deines Ausweises.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (!accountCreated) {
        const ok = await createAccountAndLogin();
        if (!ok) {
          // E-Mail existiert / Fehler → zurück zum Formular (zeigt Hinweis).
          setStep('auth');
          return;
        }
        setAccountCreated(true);
      }
      await handleUpload();
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
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginErr) {
        setError(loginErr.message || 'Login fehlgeschlagen.');
        return;
      }
      recordCustomerLogin(loginData.session?.access_token);
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
    // Grosse Fotos werden vor dem Upload automatisch verkleinert
    // (siehe handleUpload). Erst sehr grosse Dateien hart ablehnen.
    if (file.size > 30 * 1024 * 1024) {
      setError('Datei zu groß (max. 30 MB).');
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

      // Grosse Handy-Fotos vor dem Upload im Browser verkleinern — sonst
      // dauert der Upload auf mobiler Verbindung sehr lang (oder stockt).
      // Schlaegt das Verkleinern fehl (z.B. HEIC), wird das Original genutzt.
      let frontUp = frontFile;
      let backUp = backFile;
      try {
        frontUp = await shrinkImageFileIfNeeded(frontFile, 2_500_000);
        backUp = await shrinkImageFileIfNeeded(backFile, 2_500_000);
      } catch { /* Original verwenden */ }

      const formData = new FormData();
      formData.append('front', frontUp);
      formData.append('back', backUp);

      // Timeout, damit der „Wird hochgeladen…"-Spinner bei schlechter
      // Verbindung nicht endlos dreht.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000);
      let res: Response;
      try {
        res = await fetch('/api/upload-id', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadFailed(true);
        setError(data?.error || 'Upload fehlgeschlagen. Bitte erneut versuchen.');
        return;
      }

      setStep('done');
      onAuthenticated?.();
    } catch (err) {
      setUploadFailed(true);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Der Upload hat zu lange gedauert. Bitte prüfe deine Internetverbindung (am besten WLAN) und versuche es erneut.');
      } else {
        setError('Netzwerkfehler beim Hochladen. Bitte erneut versuchen.');
      }
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

  // Eine Ausweis-Seite (Vorder-/Rückseite) mit Vorschau + zwei Quellen:
  // Kamera (capture="environment") und Galerie/Datei (ohne capture).
  function renderIdSide(side: 'front' | 'back') {
    const isFront = side === 'front';
    const preview = isFront ? frontPreview : backPreview;
    const galleryRef = isFront ? frontRef : backRef;
    const camRef = isFront ? frontCamRef : backCamRef;
    return (
      <div>
        <label className={labelClass}>{isFront ? 'Vorderseite *' : 'Rückseite *'}</label>
        {/* Galerie/Datei (ohne capture → Foto-Mediathek oder Datei) */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(e) => handleFile(side, e)}
          className="hidden"
        />
        {/* Kamera (capture="environment" → Rückkamera direkt) */}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(side, e)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="w-full aspect-[4/3] rounded-[10px] border-2 border-dashed border-brand-border dark:border-white/20 hover:border-accent-blue transition-colors flex items-center justify-center overflow-hidden bg-brand-bg dark:bg-brand-black"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={isFront ? 'Vorderseite' : 'Rückseite'} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center px-4">
              <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <p className="text-xs font-body text-brand-muted">Tippen zum Auswählen</p>
            </div>
          )}
        </button>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={() => camRef.current?.click()}
            className="py-2 px-2 rounded-btn border border-brand-border dark:border-white/10 text-xs font-heading font-semibold text-brand-black dark:text-white hover:border-accent-blue transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
            Foto aufnehmen
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="py-2 px-2 rounded-btn border border-brand-border dark:border-white/10 text-xs font-heading font-semibold text-brand-black dark:text-white hover:border-accent-blue transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            Galerie
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Collect (requireUpload) — Ausweis VOR der Konto-Anlage ─────────
  if (step === 'collect') {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-status-success text-white flex items-center justify-center text-xs font-bold">✓</span>
          <span className="text-sm font-body text-brand-steel dark:text-gray-400">Daten</span>
          <span className="flex-1 border-t border-brand-border dark:border-white/10 mx-2" />
          <span className="w-6 h-6 rounded-full bg-accent-blue text-white flex items-center justify-center text-xs font-bold">2</span>
          <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">Ausweis hochladen</span>
        </div>

        <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">
          Personalausweis hochladen
        </h2>
        <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-5">
          Lade Vorder- und Rückseite deines Ausweises hoch. Erst danach kannst du dein Konto erstellen.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {renderIdSide('front')}
          {renderIdSide('back')}
        </div>

        <p className="text-xs text-brand-muted dark:text-gray-500 mb-4">
          Foto mit der Kamera aufnehmen oder aus der Galerie wählen. JPG, PNG, WebP oder HEIC. Die Daten werden verschlüsselt übertragen und nur zur Identitätsprüfung gespeichert.
        </p>

        {error && (
          <div className="p-3 mb-3 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreateAndUpload}
          disabled={busy || !frontFile || !backFile}
          className="w-full py-3 mb-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Bitte warten…
            </>
          ) : accountCreated ? 'Ausweis hochladen & fertig' : 'Konto erstellen'}
        </button>

        {!frontFile || !backFile ? (
          <p className="text-xs text-brand-muted dark:text-gray-500 text-center mb-1">
            Bitte beide Seiten hochladen, um fortzufahren.
          </p>
        ) : null}

        {/* Notausgang nur, wenn das Konto schon angelegt wurde aber der Upload
            fehlschlägt — dann ist der Kunde eingeloggt und sitzt nicht fest. */}
        {accountCreated && uploadFailed && (
          <button
            type="button"
            onClick={handleSkipUpload}
            disabled={busy}
            className="w-full py-2 text-xs font-body text-brand-muted hover:text-brand-black dark:hover:text-white underline transition-colors"
          >
            Es klappt gerade nicht? Ausweis später im Konto hochladen
          </button>
        )}

        {!accountCreated && (
          <button
            type="button"
            onClick={() => { setStep('auth'); setError(''); }}
            disabled={busy}
            className="w-full py-2 text-xs font-body text-brand-muted hover:text-brand-black dark:hover:text-white underline transition-colors"
          >
            ← Zurück zu den Daten
          </button>
        )}
      </div>
    );
  }

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
          {renderIdSide('front')}
          {renderIdSide('back')}
        </div>

        <p className="text-xs text-brand-muted dark:text-gray-500 mb-4">
          Foto mit der Kamera aufnehmen oder aus der Galerie wählen. JPG, PNG, WebP oder HEIC, max 5 MB pro Seite. Die Daten werden verschlüsselt übertragen und nur zur Identitätsprüfung gespeichert.
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

        {!requireUpload && (
          <button
            type="button"
            onClick={handleSkipUpload}
            disabled={busy}
            className="w-full py-2 text-xs font-body text-brand-muted hover:text-brand-black dark:hover:text-white underline transition-colors"
          >
            Später hochladen (Versand verzögert sich)
          </button>
        )}

        {/* Notausgang: nur wenn der Upload bei Pflicht-Upload fehlgeschlagen ist —
            der Kunde ist bereits eingeloggt und kann den Ausweis im Konto nachreichen. */}
        {requireUpload && uploadFailed && (
          <button
            type="button"
            onClick={handleSkipUpload}
            disabled={busy}
            className="w-full py-2 text-xs font-body text-brand-muted hover:text-brand-black dark:hover:text-white underline transition-colors"
          >
            Es klappt gerade nicht? Ausweis später im Konto hochladen
          </button>
        )}
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

      <form onSubmit={mode === 'login' ? handleLogin : (requireUpload ? handleSignupContinue : handleSignup)} className="space-y-4">
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

            <CountryField
              value={country}
              onChange={setCountry}
              inputClass={inputClass}
              labelClass={labelClass}
            />
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
              {mode === 'signup' ? (requireUpload ? 'Weiter…' : 'Konto wird erstellt…') : 'Wird angemeldet…'}
            </>
          ) : (
            mode === 'signup'
              ? (requireUpload ? 'Weiter: Ausweis hochladen' : 'Konto erstellen & weiter')
              : 'Anmelden & weiter'
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
