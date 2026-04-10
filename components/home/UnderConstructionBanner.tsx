'use client';

import { useEffect, useState } from 'react';

/**
 * "Im Aufbau" Banner — wird auf der Startseite angezeigt solange die Seite
 * noch nicht live ist. Kann im Admin unter Einstellungen deaktiviert werden
 * (admin_settings key: 'show_construction_banner').
 */
export default function UnderConstructionBanner({ serverVisible }: { serverVisible?: boolean }) {
  const [visible, setVisible] = useState(serverVisible ?? false);

  useEffect(() => {
    if (serverVisible !== undefined) return;
    fetch('/api/admin/settings?key=show_construction_banner')
      .then((r) => r.json())
      .then((d) => {
        setVisible(d.value === null || d.value === 'true' || d.value === true);
      })
      .catch(() => setVisible(true));
  }, [serverVisible]);

  if (!visible) return null;

  return (
    <div className="bg-amber-500 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm font-heading font-semibold text-center">
          Diese Seite befindet sich noch im Aufbau. Der Shop ist bald fuer dich verfuegbar!
        </p>
      </div>
    </div>
  );
}
