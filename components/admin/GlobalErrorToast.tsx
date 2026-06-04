'use client';

import { useEffect, useState } from 'react';

/**
 * Globaler Fehler-Toast für den Admin.
 * Fängt JEDEN nicht abgefangenen Laufzeitfehler (`window.onerror`) und jede
 * nicht behandelte Promise-Rejection (`unhandledrejection`) ab und zeigt eine
 * sichtbare rote Meldung — egal aus welcher Stelle der Fehler kommt. Schreibt
 * den Fehler zusätzlich ins client_errors-Log (best effort).
 *
 * Damit gehen unerwartete Fehler nicht mehr still verloren (z. B. ein
 * fehlgeschlagener Fetch in einem Event-Handler ohne sichtbares Feedback).
 */

interface ToastItem {
  id: number;
  message: string;
}

let counter = 0;

export default function GlobalErrorToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function push(message: string, detail: { stack?: string | null; context: string }) {
      const clean = (message || 'Unbekannter Fehler').toString().slice(0, 300);
      const id = ++counter;
      setToasts((prev) => {
        // Gleiche Meldung nicht mehrfach gleichzeitig stapeln.
        if (prev.some((t) => t.message === clean)) return prev;
        return [...prev, { id, message: clean }].slice(-4);
      });
      // Auto-Dismiss nach 10s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 10000);

      // Best-effort ins Log
      try {
        void fetch('/api/log-client-error', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: clean,
            stack: detail.stack ?? null,
            url: typeof window !== 'undefined' ? window.location.href : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            context: { kind: detail.context },
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* Logging darf nie selbst werfen */
      }
    }

    function onError(e: ErrorEvent) {
      // Ressourcen-Ladefehler (img/script ohne message) ignorieren — die sind
      // i.d.R. nicht handlungsrelevant und würden nur Lärm erzeugen.
      if (!e.message) return;
      push(e.message, { stack: e.error?.stack ?? null, context: 'window_error' });
    }

    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Ein Vorgang ist fehlgeschlagen.';
      const stack = reason instanceof Error ? reason.stack ?? null : null;
      push(msg, { stack, context: 'unhandled_rejection' });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2"
      style={{
        right: 'calc(1rem + env(safe-area-inset-right))',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        maxWidth: 'min(92vw, 420px)',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="flex items-start gap-3 rounded-lg shadow-lg px-4 py-3"
          style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fee2e2' }}
        >
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Fehler</p>
            <p className="text-xs mt-0.5 break-words opacity-90">{t.message}</p>
          </div>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 text-red-200 hover:text-white transition-colors"
            aria-label="Schließen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
