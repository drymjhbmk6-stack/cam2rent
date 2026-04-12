'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function DownloadIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

export default function AppInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Pruefen ob bereits als PWA installiert
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone);
    setIsStandalone(!!standalone);

    // iOS erkennen
    const ua = window.navigator.userAgent;
    const iosCheck = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iosCheck);

    // Android/Chrome Install-Prompt abfangen
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  // Nicht anzeigen wenn bereits installiert
  if (isStandalone || installed) return null;

  return (
    <section className="py-12 sm:py-16 bg-white dark:bg-gray-900" aria-labelledby="app-install-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-black to-brand-dark dark:from-gray-800 dark:to-gray-900 p-8 sm:p-12">
          {/* Dekorative Elemente */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-accent-blue/10 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-accent-blue/5 blur-2xl" aria-hidden="true" />

          <div className="relative flex flex-col sm:flex-row items-center gap-8">
            {/* Icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-20 h-20 rounded-2xl bg-accent-blue/20 text-accent-blue">
              <PhoneIcon />
            </div>

            {/* Text */}
            <div className="flex-1 text-center sm:text-left">
              <h2 id="app-install-heading" className="font-heading font-bold text-xl sm:text-2xl text-white mb-2">
                cam2rent als App installieren
              </h2>

              {isIOS ? (
                <p className="font-body text-white/70 text-sm sm:text-base max-w-lg">
                  Tippe auf <ShareIcon /> <strong className="text-white">Teilen</strong> und dann auf <strong className="text-white">&quot;Zum Home-Bildschirm&quot;</strong> — fuer schnellen Zugriff wie eine echte App.
                </p>
              ) : (
                <p className="font-body text-white/70 text-sm sm:text-base max-w-lg">
                  Installiere cam2rent auf deinem Handy — fuer schnellen Zugriff, Offline-Modus und eine App-aehnliche Erfahrung.
                </p>
              )}
            </div>

            {/* Button */}
            {deferredPrompt ? (
              <button
                onClick={handleInstall}
                className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20"
              >
                <DownloadIcon />
                Jetzt installieren
              </button>
            ) : isIOS ? (
              <div className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white/80 font-heading font-semibold text-sm rounded-[10px] border border-white/20">
                <ShareIcon />
                Über Safari teilen
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
