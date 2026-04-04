'use client';

import Link from 'next/link';

const C = {
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanLight: '#22d3ee',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
} as const;

export default function AdminDashboardPage() {

  const GROUPS: Array<{
    href: string;
    label: string;
    desc: string;
    color: string;
    bg: string;
    borderColor: string;
    badge: string | null;
    links: Array<{ href: string; label: string }>;
    icon: React.ReactNode;
  }> = [
    {
      href: '/admin/preise',
      label: 'Shop',
      desc: 'Preise, Produkte, Sets & Zubehör verwalten. Versandkosten anpassen.',
      color: C.cyan,
      bg: `rgba(6,182,212,0.08)`,
      borderColor: `rgba(6,182,212,0.25)`,
      badge: null,
      links: [
        { href: '/admin/preise',      label: 'Preise' },
        { href: '/admin/sets',        label: 'Sets' },
        { href: '/admin/zubehoer',    label: 'Zubehör' },
        { href: '/admin/gutscheine',  label: 'Gutscheine' },
        { href: '/admin/rabatte',     label: 'Rabatte' },
      ],
      icon: (
        <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
        </svg>
      ),
    },
    {
      href: '/admin/buchungen',
      label: 'Bestellungen & Kunden',
      desc: 'Buchungen abarbeiten, Versand erstellen, Kundenanfragen bearbeiten.',
      color: C.green,
      bg: `rgba(16,185,129,0.08)`,
      borderColor: `rgba(16,185,129,0.25)`,
      badge: null,
      links: [
        { href: '/admin/buchungen', label: 'Buchungen' },
        { href: '/admin/versand',   label: 'Versand & Labels' },
        { href: '/admin/bewertungen', label: 'Bewertungen' },
      ],
      icon: (
        <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      href: '/admin/blog',
      label: 'Blog & Newsletter',
      desc: 'Blogartikel schreiben, Themen verwalten, Newsletter versenden.',
      color: C.purple,
      bg: `rgba(139,92,246,0.08)`,
      borderColor: `rgba(139,92,246,0.25)`,
      badge: null,
      links: [
        { href: '/admin/blog', label: 'Artikel' },
      ],
      icon: (
        <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      ),
    },
    {
      href: '/admin/analytics',
      label: 'Analytics',
      desc: 'Besucher, Traffic-Quellen, Conversion-Funnel und Kamera-Performance.',
      color: C.yellow,
      bg: `rgba(245,158,11,0.08)`,
      badge: null,
      borderColor: `rgba(245,158,11,0.25)`,
      links: [
        { href: '/admin/analytics', label: 'Dashboard öffnen' },
      ],
      icon: (
        <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          cam<span style={{ color: C.cyan }}>2</span>rent Admin
        </h1>
        <p style={{ fontSize: 13, color: C.textDim }}>
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 4 Group Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 36 }}>
        {GROUPS.map((g) => (
          <Link key={g.href} href={g.href} style={{ textDecoration: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = g.color; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = g.borderColor; }}
          >
            <div style={{ background: g.bg, border: `1px solid ${g.borderColor}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'border-color 0.15s', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ color: g.color }}>{g.icon}</div>
                {g.badge && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: g.color, background: `${g.color}22`, padding: '2px 8px', borderRadius: 20 }}>
                    {g.badge}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{g.label}</div>
                <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>{g.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
