'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getConsentDecision,
  setConsentDecision,
  CONSENT_EVENT,
} from '@/lib/consent';

/**
 * Einwilligungs-Banner (§ 25 Abs. 1 TDDDG). Erscheint beim ersten Besuch bzw.
 * solange keine (gültige) Entscheidung vorliegt. Zwei GLEICHWERTIGE Buttons
 * „Zustimmen" / „Ablehnen" — identische Größe, Prominenz und Klickdistanz,
 * keine Vorauswahl, kein Dark Pattern. Ohne Zustimmung findet keine
 * Reichweitenmessung statt (siehe lib/consent.ts).
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(getConsentDecision() === null);
    sync();
    // Falls die Entscheidung anderswo geändert/zurückgesetzt wird (z. B. über
    // die Datenschutz-Einstellungen), Banner-Sichtbarkeit nachziehen.
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  function accept() {
    setConsentDecision('all');
    setVisible(false);
  }

  function reject() {
    setConsentDecision('necessary');
    setVisible(false);
  }

  if (!visible) return null;

  // Beide Buttons teilen sich EXAKT dieselben Klassen (gleiche Größe/Gewicht/
  // Farbe), damit keine Option optisch bevorzugt wird.
  const equalBtn =
    'flex-1 px-4 py-2.5 text-xs font-body font-semibold text-brand-black bg-white rounded-btn hover:bg-white/90 transition-colors';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] p-4 sm:p-6 animate-slideUp"
      style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom))` }}
      role="dialog"
      aria-label="Einwilligung zur Reichweitenmessung"
    >
      <div className="max-w-3xl mx-auto bg-brand-black border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-heading font-semibold text-white text-sm mb-1">
              Deine Privatsphäre ist uns wichtig
            </p>
            <p className="font-body text-brand-muted text-xs leading-relaxed">
              Wir verwenden <strong className="text-white">keine Cookies</strong>. Mit deiner
              Zustimmung messen wir anonym die Reichweite unserer Seiten (welche Seiten aufgerufen
              werden, Gerätetyp, Herkunftsseite), um unser Angebot zu verbessern. Ohne Zustimmung
              findet keine Reichweitenmessung statt. Details in der{' '}
              <Link href="/cookie-richtlinie" className="text-accent-blue hover:underline">
                Cookie-Richtlinie
              </Link>{' '}
              und{' '}
              <Link href="/datenschutz" className="text-accent-blue hover:underline">
                Datenschutzerklärung
              </Link>
              . Deine Wahl kannst du jederzeit in den Datenschutz-Einstellungen ändern.
            </p>
          </div>
          <div className="flex flex-row gap-2 sm:shrink-0 sm:w-64">
            <button onClick={reject} className={equalBtn}>
              Ablehnen
            </button>
            <button onClick={accept} className={equalBtn}>
              Zustimmen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
