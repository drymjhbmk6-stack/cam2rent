'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    href: '/admin/blog',
    label: 'Dashboard',
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/zeitplan',
    label: 'Zeitplan',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/artikel',
    label: 'Artikel',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/themen',
    label: 'Themen',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/mediathek',
    label: 'Mediathek',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/kommentare',
    label: 'Kommentare',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog/einstellungen',
    label: 'Einstellungen',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function BlogAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14" style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-2">
          <span className="font-heading font-black text-base tracking-tight" style={{ color: 'white' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
          <span className="text-[10px] font-heading font-semibold tracking-widest uppercase" style={{ color: '#475569' }}>Blog</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-9 h-9 flex items-center justify-center rounded-lg"
          style={{ background: '#1e293b' }}
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="#e2e8f0" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="#e2e8f0" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* Mobile Drawer */}
      <div
        className={`lg:hidden fixed top-14 right-0 bottom-0 w-64 z-50 transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#0f172a', borderLeft: '1px solid #1e293b' }}
      >
        <nav className="px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors"
                style={active ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4' } : { color: '#94a3b8' }}
              >
                <span style={active ? { color: '#06b6d4' } : { color: '#475569' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4" style={{ borderTop: '1px solid #1e293b' }}>
          <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg" style={{ color: '#475569' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Zurück zum Admin
          </Link>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col sticky top-0 h-screen" style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }}>
          <div className="px-5 py-6" style={{ borderBottom: '1px solid #1e293b' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-heading font-black text-lg tracking-tight" style={{ color: 'white' }}>
                cam<span style={{ color: '#06b6d4' }}>2</span>rent
              </span>
            </div>
            <span className="text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: '#475569' }}>Blog Admin</span>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors"
                  style={active ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4' } : { color: '#94a3b8' }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
                >
                  <span style={active ? { color: '#06b6d4' } : { color: '#475569' }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 py-4" style={{ borderTop: '1px solid #1e293b' }}>
            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg transition-colors" style={{ color: '#475569' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Zurück zum Admin
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0" style={{ background: '#0f172a' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
