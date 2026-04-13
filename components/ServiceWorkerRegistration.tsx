'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'activated' &&
                navigator.serviceWorker.controller
              ) {
                // New version available — will be used on next reload
                console.debug('[SW] Neues Update verfügbar');
              }
            });
          });
        })
        .catch((err) => console.debug('[SW] Registrierung fehlgeschlagen:', err));
    }
  }, []);

  return null;
}
