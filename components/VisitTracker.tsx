'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackingAllowed, CONSENT_EVENT } from '@/lib/consent';

/**
 * Cookieloser Besucherzähler (Aggregat-Statistik ohne Personenbezug).
 *
 * EINWILLIGUNGSPFLICHTIG: Die Datenschutzerklärung (Ziffer „Webanalyse") sagt
 * „Ohne Einwilligung findet keine Reichweitenmessung statt." Dieser Zähler IST
 * Reichweitenmessung und setzt außerdem ein sessionStorage-Dedupe-Flag
 * (`cam2rent_visit_counted`) — beides nicht „unbedingt erforderlich" i. S. d.
 * § 25 Abs. 2 Nr. 2 TDDDG. Er läuft daher nur nach „Zustimmen" und zählt pro
 * Browser-Session genau einmal. (Frühere Annahme „braucht keine Einwilligung"
 * verworfen — der Rechtstext ist maßgeblich.)
 */
export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Admin-Bereich nie mitzählen.
    if (pathname.startsWith('/admin')) return;

    const countOnce = () => {
      if (pathname.startsWith('/admin')) return;
      if (!trackingAllowed()) return;
      try {
        if (sessionStorage.getItem('cam2rent_visit_counted') === '1') return;
        sessionStorage.setItem('cam2rent_visit_counted', '1');
      } catch {
        // sessionStorage gesperrt (Privatmodus) → ohne Dedupe zählen, aber nur
        // mit Einwilligung (oben geprüft).
      }
      fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {});
    };

    // Beim Mount zählen (falls bereits zugestimmt).
    countOnce();

    // Nachträgliche Zustimmung ohne Reload berücksichtigen.
    window.addEventListener(CONSENT_EVENT, countOnce);
    return () => window.removeEventListener(CONSENT_EVENT, countOnce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
