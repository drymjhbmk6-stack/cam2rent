'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Cookieloser Besucherzähler: feuert pro Browser-Session genau EINMAL einen
// Zähl-Request — unabhängig vom Cookie-Consent. Nutzt sessionStorage als
// Dedupe-Flag (kein Cookie, kein Personenbezug, wird beim Schließen des Tabs
// verworfen). Bewusst NICHT an den Consent gekoppelt: anonyme Aggregat-
// Statistik braucht keine Einwilligung.
export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Admin-Bereich nicht mitzählen.
    if (pathname.startsWith('/admin')) return;

    try {
      if (sessionStorage.getItem('cam2rent_visit_counted') === '1') return;
      sessionStorage.setItem('cam2rent_visit_counted', '1');
    } catch {
      // sessionStorage nicht verfügbar (z.B. Privatmodus-Restriktionen) →
      // trotzdem einmalig zählen, dafür ohne Dedupe.
    }

    fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {});
    // Nur beim ersten Mount der Session zählen — Pfadwechsel lösen kein
    // erneutes Zählen aus (Dedupe-Flag greift bereits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
