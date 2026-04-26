'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'cam2rent_customer_push_dismissed';

/**
 * Dezentes Banner unten rechts: bittet Endkunden um Web-Push-Erlaubnis,
 * damit cam2rent bei neuen Kameras / Saison-Aktionen direkt benachrichtigen
 * kann. Verschwindet permanent nach Klick auf "X" oder nach Aktivierung.
 *
 * Wird nur gezeigt wenn:
 *   - Browser unterstuetzt Service-Worker + PushManager
 *   - User hat noch keine Permission erteilt
 *   - User hat das Banner nicht bereits weggeklickt
 */
export default function CustomerPushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

    // Erst nach 8s anzeigen, damit nicht gleich aufdringlich
    const t = setTimeout(() => setShow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    setError('');
    try {
      // VAPID-Public-Key laden (Public-Endpoint, kein Login)
      const keyRes = await fetch('/api/customer-push/vapid-key');
      const keyData = await keyRes.json();
      if (!keyData.publicKey) throw new Error('Server nicht bereit.');

      // Service Worker registrieren
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Du hast die Berechtigung abgelehnt.');
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey).buffer as ArrayBuffer,
      });

      const res = await fetch('/api/customer-push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, topics: ['all'] }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Anmeldung fehlgeschlagen.');
      }

      setDone(true);
      localStorage.setItem(DISMISS_KEY, '1');
      setTimeout(() => setShow(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Etwas ist schiefgelaufen.');
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-40 bg-white dark:bg-brand-dark rounded-card shadow-2xl border border-brand-border dark:border-white/10 p-4 animate-in fade-in slide-in-from-bottom-2">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-brand-muted hover:text-brand-black dark:hover:text-white text-lg leading-none w-6 h-6 flex items-center justify-center"
        aria-label="Schließen"
      >
        ×
      </button>

      {!done ? (
        <>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
              🔔
            </div>
            <div>
              <p className="font-heading font-bold text-sm text-brand-black dark:text-white">
                Nichts mehr verpassen
              </p>
              <p className="font-body text-xs text-brand-steel dark:text-gray-400 mt-0.5">
                Sag uns Bescheid bei neuen Kameras und Saison-Aktionen — kein Spam, ehrlich.
              </p>
            </div>
          </div>

          <button
            onClick={enable}
            disabled={busy}
            className="w-full py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-white font-heading font-semibold text-sm rounded-btn disabled:opacity-50 transition-colors"
          >
            {busy ? 'Aktiviere…' : 'Benachrichtigungen aktivieren'}
          </button>

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </>
      ) : (
        <div className="text-center py-2">
          <p className="font-heading font-bold text-sm text-emerald-600 dark:text-emerald-400 mb-1">
            ✓ Aktiviert
          </p>
          <p className="font-body text-xs text-brand-steel dark:text-gray-400">
            Wir melden uns, sobald es Neues gibt.
          </p>
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
