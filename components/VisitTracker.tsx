'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Cookieloser Besucherzähler (rein anonyme Aggregat-Statistik).
 *
 * Zählt JEDEN Besuch — unabhängig von der Cookie-Einwilligung. Das ist zulässig
 * ohne Einwilligung, weil hier
 *   • NICHTS im Endgerät gespeichert oder gelesen wird (kein Cookie, kein
 *     localStorage/sessionStorage) → § 25 Abs. 1 TDDDG nicht berührt, und
 *   • KEIN Personenbezug entsteht (der Endpunkt `/api/visit` speichert nur
 *     eine Tages-/Stunden-Zählzahl in `site_visits`, keine IP, keine ID).
 *
 * Ohne Geräte-Dedupe wird pro vollständigem Seitenaufruf (Mount) einmal
 * gezählt — bewusst, um jede Geräte-Speicherung zu vermeiden. Der ID-basierte
 * Reichweiten-Tracker (`PageTracker` → `page_views`) bleibt weiterhin
 * einwilligungspflichtig; nur dieser anonyme Zähler zählt alle.
 */
export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Admin-Bereich nie mitzählen (server-seitig zusätzlich per
    // cam2rent_no_track-Cookie abgesichert).
    if (pathname.startsWith('/admin')) return;
    fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {});
    // Nur beim ersten Mount der Seite zählen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
