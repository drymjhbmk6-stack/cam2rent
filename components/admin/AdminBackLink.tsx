'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Universelle "Zurück zu..."-Navigation für Admin-Seiten.
 *
 * Varianten:
 * - `href` gesetzt → Link zu fester Seite
 * - `href` nicht gesetzt → Browser-History zurück
 */
export default function AdminBackLink({
  href,
  label = 'Zurück',
}: {
  href?: string;
  label?: string;
}) {
  const router = useRouter();

  const arrow = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12L6 8l4-4" />
    </svg>
  );

  const cls = "inline-flex items-center gap-1 text-sm font-heading font-semibold transition-colors mb-4";

  if (href) {
    return (
      <Link href={href} className={cls} style={{ color: '#06b6d4' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#22d3ee'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#06b6d4'; }}>
        {arrow} {label}
      </Link>
    );
  }

  return (
    <button onClick={() => router.back()} className={cls} style={{ color: '#06b6d4' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#22d3ee'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#06b6d4'; }}>
      {arrow} {label}
    </button>
  );
}
