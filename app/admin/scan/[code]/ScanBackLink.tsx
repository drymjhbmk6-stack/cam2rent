'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Zurueck-Link auf der Scan-Detail-Karte. Geht primaer per
 * router.back() zur vorherigen Seite (z.B. Inventar-Liste, Buchung,
 * Belegungs-Kalender). Fallback auf /admin, wenn der Nutzer direkt
 * via QR-Scan in einem leeren Tab landet (history.length <= 1).
 */
export default function ScanBackLink() {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(true);

  useEffect(() => {
    // window.history.length zaehlt auch den eigenen Eintrag — wenn nur
    // eine einzige Seite da ist, koennen wir nicht zurueckgehen
    if (typeof window !== 'undefined' && window.history.length <= 1) {
      setHasHistory(false);
    }
  }, []);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (hasHistory) {
      router.back();
    } else {
      router.push('/admin');
    }
  }

  return (
    <a
      href="/admin"
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-sm font-semibold py-2"
      style={{ color: '#0891b2' }}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {hasHistory ? 'Zurück' : 'Zurück zum Dashboard'}
    </a>
  );
}
