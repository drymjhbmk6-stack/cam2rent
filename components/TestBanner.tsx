'use client';

import { useState, useEffect } from 'react';
import { X, FlaskConical } from 'lucide-react';

export function TestBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const dismissed = localStorage.getItem('cam2rent_beta_banner_dismissed');

    const isBetaEnvironment =
      process.env.NEXT_PUBLIC_IS_BETA === 'true' ||
      (typeof window !== 'undefined' &&
        window.location.hostname.startsWith('test.'));

    if (isBetaEnvironment && !dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('cam2rent_beta_banner_dismissed', 'true');
  };

  if (!isMounted || !isVisible) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 left-0 right-0 z-50 w-full bg-gradient-to-r from-[#0f172a] via-[#0f172a] to-[#06b6d4]/20 border-b border-[#06b6d4]/40 text-white shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-[#06b6d4] rounded-full animate-ping opacity-75" />
          <div className="relative bg-[#06b6d4] rounded-full p-1.5 flex items-center justify-center">
            <FlaskConical className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-medium">
            <span className="font-bold text-[#06b6d4]">TESTUMGEBUNG</span>
            <span className="hidden sm:inline">
              {' '}
              — Keine echten Buchungen, keine Zahlungen. Dein Feedback hilft uns!
            </span>
            <span className="inline sm:hidden"> — Keine echten Kosten</span>
          </p>
        </div>

        <a
          href="/beta-feedback"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#06b6d4] hover:bg-[#0891b2] text-white text-sm font-semibold rounded-md transition-colors flex-shrink-0"
        >
          Feedback geben
        </a>

        <button
          onClick={handleDismiss}
          aria-label="Hinweis schließen"
          className="flex-shrink-0 p-1.5 hover:bg-white/10 rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default TestBanner;
