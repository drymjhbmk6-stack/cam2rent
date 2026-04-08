'use client';

import Link from 'next/link';

interface BlogCTAProps {
  title?: string;
  text?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export default function BlogCTA({
  title = 'Vor dem Kauf testen?',
  text = 'Bei cam2rent kannst du Action-Kameras flexibel mieten — perfekt um verschiedene Modelle auszuprobieren, bevor du dich entscheidest.',
  primaryLabel = 'Kameras entdecken',
  primaryHref = '/kameras',
  secondaryLabel,
  secondaryHref,
}: BlogCTAProps) {
  return (
    <div className="my-10 rounded-xl overflow-hidden bg-accent-teal/[0.06] dark:bg-gradient-to-br dark:from-cyan-500/10 dark:to-purple-500/[0.06] border border-accent-teal/20 dark:border-cyan-500/18">
      <div className="px-6 py-8 sm:px-8 sm:py-10 text-center">
        <h3 className="font-heading font-bold text-xl sm:text-2xl mb-3 text-brand-black dark:text-white">
          {title}
        </h3>
        <p className="text-sm font-body mb-6 max-w-lg mx-auto text-brand-steel dark:text-gray-400">
          {text}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primaryHref}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-btn font-heading font-semibold text-sm transition-colors bg-brand-black dark:bg-cyan-500 text-white dark:text-[#0f172a] hover:opacity-90"
          >
            {primaryLabel}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center px-6 py-3 rounded-btn font-heading font-semibold text-sm transition-colors border border-brand-black dark:border-cyan-500/40 text-brand-black dark:text-cyan-400 hover:bg-brand-bg dark:hover:bg-white/5"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
