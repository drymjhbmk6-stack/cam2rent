'use client';

import { useEffect, useState } from 'react';

/**
 * Admin-PWA Push-Notifications Sektion (Einstellungen-Seite).
 *
 * Aktiviert:
 * - Subscribe-Button (fragt Browser-Permission, registriert Endpoint)
 * - Test-Button (sendet Test-Push an alle registrierten Geräte)
 * - Unsubscribe-Button (für dieses Gerät)
 *
 * Status:
 * - 'not-configured': VAPID-Keys fehlen serverseitig
 * - 'unsupported':    Browser unterstützt kein Push (Safari < 16, Firefox-Lite)
 * - 'denied':         User hat Permission abgelehnt
 * - 'unsubscribed':   Erlaubt, aber noch nicht aktiviert
 * - 'subscribed':     Aktiv
 */

type Status = 'loading' | 'not-configured' | 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(safe);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushNotificationsSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    void detectStatus();
  }, []);

  async function detectStatus() {
    setError('');
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }

    try {
      const res = await fetch('/api/admin/push/vapid-key');
      if (!res.ok) {
        setStatus('not-configured');
        return;
      }
      const { publicKey } = await res.json();
      setVapidKey(publicKey);
    } catch {
      setStatus('not-configured');
      return;
    }

    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      setStatus('unsubscribed');
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    setStatus(sub ? 'subscribed' : 'unsubscribed');
  }

  async function handleSubscribe() {
    setError('');
    setSuccess('');
    if (!vapidKey) {
      setError('VAPID-Public-Key fehlt.');
      return;
    }
    setBusy(true);
    try {
      // Permission anfordern
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
        setError('Browser hat keine Push-Berechtigung gewährt.');
        return;
      }

      // SW registrieren falls noch nicht da (passiert in Production durch
      // ServiceWorkerRegistration.tsx — in Dev manuell)
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Uint8Array → BufferSource (TypeScript-DOM-Lib ist hier strikt mit
        // dem ArrayBuffer-Typ; der Browser akzeptiert beide problemlos).
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      const deviceLabel = navigator.userAgent.includes('iPhone')
        ? 'iPhone'
        : navigator.userAgent.includes('Android')
        ? 'Android'
        : navigator.userAgent.includes('Mac')
        ? 'Mac'
        : navigator.userAgent.includes('Windows')
        ? 'Windows'
        : 'Unbekannt';

      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), deviceLabel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Subscribe fehlgeschlagen');
      }

      setStatus('subscribed');
      setSuccess('Push-Notifications aktiviert. Du bekommst jetzt Benachrichtigungen bei neuen Buchungen.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/admin/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus('unsubscribed');
      setSuccess('Push deaktiviert.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/push/test', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Test-Push fehlgeschlagen');
      }
      setSuccess('Test-Push gesendet — sollte gleich erscheinen.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Push-Benachrichtigungen
      </h2>
      <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-4">
        Lass dich auf diesem Gerät benachrichtigen, sobald neue Buchungen, Schäden oder Kundenanfragen reinkommen — auch wenn die Admin-PWA nicht offen ist.
      </p>

      {status === 'loading' && (
        <p className="text-sm font-body text-brand-muted">Wird geladen…</p>
      )}

      {status === 'unsupported' && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-sm font-body text-amber-800 dark:text-amber-200">
            Dieser Browser unterstützt keine Push-Notifications. Verwende Chrome, Edge, Firefox oder Safari ≥ 16.4 (iOS: PWA muss zum Homescreen hinzugefügt sein).
          </p>
        </div>
      )}

      {status === 'not-configured' && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-sm font-body text-amber-800 dark:text-amber-200 mb-2">
            VAPID-Keys nicht konfiguriert. Server-Setup nötig:
          </p>
          <pre className="text-xs font-mono bg-amber-100 dark:bg-amber-900/40 p-2 rounded overflow-x-auto">npx web-push generate-vapid-keys</pre>
          <p className="text-xs font-body text-amber-700 dark:text-amber-300 mt-2">
            Dann <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> und <code>VAPID_SUBJECT=mailto:kontakt@cam2rent.de</code> in Coolify-Env setzen.
          </p>
        </div>
      )}

      {status === 'denied' && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <p className="text-sm font-body text-red-800 dark:text-red-200">
            Du hast Push-Notifications für cam2rent geblockt. Setze die Berechtigung in den Browser-Einstellungen (Schloss-Icon in der Adresszeile) auf „Erlauben&rdquo; zurück und lade die Seite neu.
          </p>
        </div>
      )}

      {status === 'unsubscribed' && (
        <button
          onClick={handleSubscribe}
          disabled={busy}
          className="px-4 py-2 bg-accent-cyan text-white text-sm font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors disabled:opacity-40"
        >
          {busy ? 'Wird aktiviert…' : 'Push auf diesem Gerät aktivieren'}
        </button>
      )}

      {status === 'subscribed' && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-heading font-semibold rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Aktiv auf diesem Gerät
          </span>
          <button
            onClick={handleTest}
            disabled={busy}
            className="px-4 py-2 border border-brand-border dark:border-slate-600 text-brand-black dark:text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-bg dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            Test-Push senden
          </button>
          <button
            onClick={handleUnsubscribe}
            disabled={busy}
            className="px-4 py-2 text-sm font-heading font-semibold text-red-600 hover:text-red-700 transition-colors disabled:opacity-40"
          >
            Push deaktivieren
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-body">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-3 font-body">{success}</p>
      )}
    </div>
  );
}
