'use client';

import { useEffect, useState } from 'react';
import {
  getConsentDecision,
  getConsentTimestamp,
  setConsentDecision,
  revokeConsent,
  CONSENT_EVENT,
  type ConsentDecision,
} from '@/lib/consent';

/**
 * Datenschutz-Einstellungen (über den Footer erreichbar). Der Nutzer kann seine
 * Einwilligung zur Reichweitenmessung jederzeit erteilen ODER widerrufen —
 * genauso einfach wie die Erteilung (Art. 7 Abs. 3 DSGVO). Ein Widerruf löscht
 * die gesetzten Kennungen sofort und stoppt das Tracking ohne Reload.
 */
export default function ConsentSettings() {
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => {
      setDecision(getConsentDecision());
      setSince(getConsentTimestamp());
    };
    sync();
    setMounted(true);
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  const formattedSince = (() => {
    if (!since) return null;
    try {
      return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(new Date(since));
    } catch {
      return null;
    }
  })();

  const status =
    decision === 'all'
      ? { label: 'Reichweitenmessung erlaubt', color: 'text-status-success' }
      : decision === 'necessary'
        ? { label: 'Reichweitenmessung abgelehnt', color: 'text-status-error' }
        : { label: 'Noch keine Entscheidung getroffen', color: 'text-brand-muted' };

  // Beide Buttons identisch (gleiche Größe/Prominenz) — keine Bevorzugung.
  const btn =
    'flex-1 px-5 py-2.5 text-sm font-body font-semibold rounded-btn transition-colors text-center';

  return (
    <div
      id="datenschutz-einstellungen"
      className="scroll-mt-24 rounded-card border border-brand-border dark:border-slate-700 bg-brand-bg dark:bg-brand-dark p-5"
    >
      <p className="font-heading font-semibold text-brand-black dark:text-white mb-1">
        Datenschutz-Einstellungen
      </p>
      <p className="font-body text-sm text-brand-steel dark:text-gray-300 mb-1">
        Aktueller Status:{' '}
        <span className={`font-semibold ${status.color}`}>{mounted ? status.label : '…'}</span>
      </p>
      {mounted && formattedSince && (
        <p className="font-body text-xs text-brand-muted dark:text-gray-400 mb-4">
          Zuletzt geändert am {formattedSince} Uhr
        </p>
      )}
      {mounted && !formattedSince && <div className="mb-4" />}

      <div className="flex flex-col sm:flex-row gap-2 max-w-md">
        <button
          onClick={() => setConsentDecision('all')}
          className={`${btn} text-brand-black bg-white border border-brand-border hover:bg-white/90 dark:text-brand-black`}
        >
          Reichweitenmessung erlauben
        </button>
        <button
          onClick={() => revokeConsent()}
          className={`${btn} text-brand-black bg-white border border-brand-border hover:bg-white/90 dark:text-brand-black`}
        >
          Reichweitenmessung ablehnen
        </button>
      </div>
      <p className="font-body text-xs text-brand-muted dark:text-gray-400 mt-3">
        Ein Widerruf löscht die im Browser gespeicherte Besucher- und Session-Kennung sofort und
        stoppt die Messung umgehend — ohne Neuladen der Seite.
      </p>
    </div>
  );
}
