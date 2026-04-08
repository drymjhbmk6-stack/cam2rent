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
    <div className="my-10 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(6,182,212,0.18)' }}>
      <div className="px-6 py-8 sm:px-8 sm:py-10 text-center">
        <h3 className="font-heading font-bold text-xl sm:text-2xl mb-3" style={{ color: '#e2e8f0' }}>
          {title}
        </h3>
        <p className="text-sm font-body mb-6 max-w-lg mx-auto" style={{ color: '#94a3b8' }}>
          {text}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primaryHref}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors"
            style={{ background: '#06b6d4', color: '#0f172a' }}
          >
            {primaryLabel}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors"
              style={{ background: 'transparent', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.4)' }}
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
