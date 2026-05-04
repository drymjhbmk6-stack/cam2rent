'use client';

import Link from 'next/link';

const TABS = [
  { href: '/admin/anlagen', label: 'Anlagenverzeichnis', match: (p: string) => p === '/admin/anlagen' || /^\/admin\/anlagen\/(?!wiederbeschaffung)/.test(p) },
  { href: '/admin/anlagen/wiederbeschaffung', label: 'Wiederbeschaffungsliste', match: (p: string) => p.startsWith('/admin/anlagen/wiederbeschaffung') },
];

export default function AnlagenTabs({ pathname }: { pathname: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b' }}>
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              borderBottom: active ? '2px solid #06b6d4' : '2px solid transparent',
              color: active ? '#06b6d4' : '#64748b',
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
