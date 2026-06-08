'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'cam2rent_newsletter_popup';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const SHOW_DELAY_MS = 10000; // 10 Sekunden

// Pfade, auf denen das Popup nicht stoeren soll (Checkout, Konto, Auth, Admin)
const BLOCKED_PREFIXES = [
  '/checkout',
  '/konto',
  '/login',
  '/registrierung',
  '/auth',
  '/admin',
  '/umfrage',
];

/**
 * Zentriertes Newsletter-Popup, das 10 Sekunden nach Seitenaufruf erscheint.
 * Double-Opt-In: Eingabe → Bestaetigungsmail → Klick → aktiv.
 *
 * Wird gezeigt wenn:
 *   - aktueller Pfad keine Checkout-/Konto-/Auth-/Admin-Seite ist
 *   - noch keine erfolgreiche Anmeldung erfolgt ist
 *   - das Popup nicht innerhalb der letzten 30 Tage weggeklickt wurde
 */
export default function NewsletterPopup() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState('');
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'already' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (BLOCKED_PREFIXES.some((p) => pathname?.startsWith(p))) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'subscribed') return;
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!Number.isNaN(ts) && Date.now() - ts < COOLDOWN_MS) return;
    }

    const t = setTimeout(() => setShow(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [pathname]);

  // ESC schliesst + Body-Scroll-Lock waehrend offen
  useEffect(() => {
    if (!show) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  function close() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setShow(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!accept) {
      setError('Bitte stimme der Verarbeitung zu.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'popup' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Anmeldung fehlgeschlagen.');
      setStatus(data.alreadySubscribed ? 'already' : 'success');
      localStorage.setItem(STORAGE_KEY, 'subscribed');
      setTimeout(() => setShow(false), 3000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-brand-dark rounded-card shadow-2xl border border-brand-border dark:border-white/10 p-6 sm:p-8 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-3 right-3 text-brand-muted hover:text-brand-black dark:hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
          aria-label="Schließen"
        >
          ×
        </button>

        <div className="text-center">
          <span className="inline-block text-xs font-heading font-bold uppercase tracking-wide bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full mb-4">
            📬 Newsletter
          </span>
          <h2 className="font-heading font-bold text-xl sm:text-2xl mb-2 text-brand-black dark:text-white">
            Sei zuerst dabei
          </h2>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 max-w-sm mx-auto mb-6">
            Neue Kameras, saisonale Aktionen und gelegentlich ein exklusiver Rabatt-Code — kein Spam, nur das Gute.
          </p>

          {status === 'success' && (
            <div className="bg-emerald-500/15 border border-emerald-400/40 rounded-xl p-5">
              <p className="font-heading font-bold text-emerald-600 dark:text-emerald-300 mb-1">
                Fast geschafft!
              </p>
              <p className="font-body text-sm text-emerald-700/90 dark:text-emerald-100/90">
                Wir haben dir gerade eine Bestätigungsmail geschickt. Bitte klicke den Link darin — danach bist du dabei.
              </p>
            </div>
          )}

          {status === 'already' && (
            <div className="bg-blue-500/15 border border-blue-400/40 rounded-xl p-5">
              <p className="font-body text-sm text-blue-700 dark:text-blue-100">
                Diese Adresse ist schon angemeldet — danke, dass du dabei bist!
              </p>
            </div>
          )}

          {status === 'idle' && (
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                className="w-full px-4 py-3 rounded-btn bg-brand-bg dark:bg-white/10 border border-brand-border dark:border-white/20 text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-accent-blue text-base"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 text-white font-heading font-semibold rounded-btn disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sendet…' : 'Anmelden'}
              </button>

              <label className="flex items-start gap-2 mt-3 text-left cursor-pointer">
                <input
                  type="checkbox"
                  checked={accept}
                  onChange={(e) => setAccept(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-accent-blue flex-shrink-0"
                />
                <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-relaxed">
                  Ich möchte den Cam2Rent-Newsletter erhalten und stimme der Verarbeitung meiner E-Mail-Adresse zu diesem Zweck zu. Abmeldung jederzeit per Link in jeder Mail. Details in der{' '}
                  <a href="/datenschutz" target="_blank" className="underline hover:text-accent-blue">
                    Datenschutzerklärung
                  </a>
                  .
                </span>
              </label>

              {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </form>
          )}

          {status === 'error' && (
            <div>
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error || 'Etwas ist schiefgelaufen.'}</p>
              <button
                onClick={() => setStatus('idle')}
                className="px-5 py-2 bg-brand-bg dark:bg-white/10 hover:bg-brand-border dark:hover:bg-white/20 rounded-btn text-sm font-body text-brand-black dark:text-white"
              >
                Nochmal versuchen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
