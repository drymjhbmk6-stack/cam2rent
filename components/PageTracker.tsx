'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const currentPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (lastTrackedPath.current === currentPath) return;
    lastTrackedPath.current = currentPath;

    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem('cam2rent_tracking_optout') === 'true') return;
        if (pathname.startsWith('/admin')) return;

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
    }, 100);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  return null;
}
