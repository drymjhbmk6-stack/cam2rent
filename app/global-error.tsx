'use client';

import { useEffect } from 'react';

/**
 * Globale Error-Boundary fuer Fehler im Root-Layout (z.B. Provider, Theme).
 * Wird gerendert ohne <html>/<body> aus dem Layout — daher eigene Tags hier.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);

    const url = typeof window !== 'undefined' ? window.location.href : null;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

    void fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        digest: error.digest ?? null,
        message: error.message ?? null,
        stack: error.stack ?? null,
        url,
        userAgent,
        context: { kind: 'global_error_boundary' },
      }),
      keepalive: true,
    }).catch(() => {
      // Logging-Endpoint nicht erreichbar — egal
    });
  }, [error]);

  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0A0A0A', color: '#fff', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
          <div style={{ maxWidth: '32rem', width: '100%', background: '#1a1a1a', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Etwas ist schiefgelaufen</h1>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.
            </p>
            {error.digest && (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
                Fehler-ID: <code style={{ fontFamily: 'monospace' }}>{error.digest}</code>
              </div>
            )}
            <button
              onClick={reset}
              style={{ padding: '0.75rem 1.5rem', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
