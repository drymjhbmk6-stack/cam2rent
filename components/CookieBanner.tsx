'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cam2rent_consent');
    if (!consent) {
      setVisible(true);
    }
  }, []);

  function acceptAll() {
    localStorage.setItem('cam2rent_consent', 'all');
    localStorage.removeItem('cam2rent_tracking_optout');
    setVisible(false);
  }

  function acceptNecessary() {
    localStorage.setItem('cam2rent_consent', 'necessary');
    localStorage.setItem('cam2rent_tracking_optout', 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] p-4 sm:p-6 animate-slideUp"
      style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom))` }}
    >
      <div className="max-w-3xl mx-auto bg-brand-black border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-heading font-semibold text-white text-sm mb-1">
              Deine Privatsphäre ist uns wichtig
            </p>
            <p className="font-body text-brand-muted text-xs leading-relaxed">
              Wir verwenden <strong className="text-white">keine Cookies</strong>. Zur Verbesserung unseres
              Angebots erfassen wir anonyme Besuchsstatistiken (ohne persönliche Daten).
              Mehr dazu in unserer{' '}
              <Link href="/cookie-richtlinie" className="text-accent-blue hover:underline">
                Cookie-Richtlinie
              </Link>{' '}
              und{' '}
              <Link href="/datenschutz" className="text-accent-blue hover:underline">
                Datenschutzerklärung
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
            <button
              onClick={acceptNecessary}
              className="px-4 py-2.5 text-xs font-body font-medium text-brand-muted border border-white/20 rounded-btn hover:text-white hover:border-white/40 transition-colors"
            >
              Nur notwendige
            </button>
            <button
              onClick={acceptAll}
              className="px-4 py-2.5 text-xs font-body font-semibold text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
            >
              Alle akzeptieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
