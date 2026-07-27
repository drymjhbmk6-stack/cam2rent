'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackingAllowed, CONSENT_EVENT } from '@/lib/consent';

/**
 * Reichweitenmessung (ID-basiert). Läuft NUR bei erteilter Einwilligung
 * (§ 25 Abs. 1 TDDDG, vormals TTDSG). Ohne Zustimmung wird das Modul gar nicht
 * scharf geschaltet: keine Besucher-/Session-ID im Endgerät, kein `/api/track`.
 * Nach nachträglicher Zustimmung (über Banner/Einstellungen) startet das
 * Tracking OHNE Reload (Reaktion auf `CONSENT_EVENT`); ein Widerruf stoppt es
 * sofort (dann greift der `trackingAllowed()`-Guard).
 */
export default function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPath = useRef<string | null>(null);

  const trackCurrent = useCallback(() => {
    const currentPath =
      pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (lastTrackedPath.current === currentPath) return;

    try {
      // Ohne Einwilligung: nichts speichern, nichts senden.
      if (!trackingAllowed()) return;
      if (pathname.startsWith('/admin')) return;
      // Admin-Self-Exclude: Toggle in /admin/einstellungen setzt diesen Marker,
      // damit eigene Test-Besuche der Live-Seite nicht in den Analytics landen.
      if (localStorage.getItem('cam2rent_no_track') === '1') return;

      lastTrackedPath.current = currentPath;

      let visitorId = localStorage.getItem('cam2rent_vid');
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('cam2rent_vid', visitorId);
      }

      let sessionId = sessionStorage.getItem('cam2rent_sid');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('cam2rent_sid', sessionId);
      }

      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: visitorId,
          session_id: sessionId,
          path: pathname,
          referrer: document.referrer || null,
          utm_source: searchParams.get('utm_source'),
          utm_medium: searchParams.get('utm_medium'),
          utm_campaign: searchParams.get('utm_campaign'),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      console.debug('Tracking skipped:', e);
    }
  }, [pathname, searchParams]);

  // Track bei Navigation (nur mit Einwilligung).
  useEffect(() => {
    const timer = setTimeout(trackCurrent, 100);
    return () => clearTimeout(timer);
  }, [trackCurrent]);

  // Nachträgliche Zustimmung → aktuelle Seite ohne Reload erfassen.
  useEffect(() => {
    const onConsentChanged = () => {
      if (trackingAllowed()) {
        // Erneut die aktuelle Seite zulassen (frische Zustimmung).
        lastTrackedPath.current = null;
        trackCurrent();
      }
    };
    window.addEventListener(CONSENT_EVENT, onConsentChanged);
    return () => window.removeEventListener(CONSENT_EVENT, onConsentChanged);
  }, [trackCurrent]);

  return null;
}
