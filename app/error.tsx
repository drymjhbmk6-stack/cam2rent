'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-full bg-status-error/10 flex items-center justify-center mx-auto mb-6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-10 h-10 text-status-error">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
          Etwas ist schiefgelaufen
        </h1>
        <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut oder kontaktiere uns wenn das Problem bestehen bleibt.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors"
          >
            Erneut versuchen
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-bg dark:hover:bg-brand-black transition-colors text-center"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
