'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NotificationDropdown from '@/components/admin/NotificationDropdown';
import { useAutoLogout } from '@/hooks/useAutoLogout';

// 30 Minuten Inaktivität für Admin
const ADMIN_TIMEOUT_MS = 30 * 60 * 1000;

type NavItem = { href: string; label: string; exact?: boolean; icon: React.ReactNode };

// ============================================================
// SVG Icons
// ============================================================
const iconBuchungen = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
);
const iconPlus = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
);
const iconCalendar = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
);
const iconTruck = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
);
const iconReturn = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
);
const iconWarning = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
);
const iconUsers = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
);
const iconMessage = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
);
const iconStar = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
);
const iconCamera = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const iconSets = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
);
const iconAccessory = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
);
const iconCart = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
);
const iconPriceTag = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
);
const iconTicket = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
);
const iconDiscount = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" /></svg>
);
const iconHome = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
);
const iconBlog = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
);
const iconChevron = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
);
const iconFinance = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const iconChart = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
);
const iconMail = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
);
const iconFeedback = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
);
const iconClipboard = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
);
const iconLegal = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const iconCog = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const iconDashboard = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
);

// ============================================================
// Navigation groups
// ============================================================

const TAGESGESCHAEFT_ITEMS: NavItem[] = [
  { href: '/admin/buchungen', label: 'Buchungen', icon: iconBuchungen },
  { href: '/admin/buchungen/neu', label: 'Manuelle Buchung', exact: true, icon: iconPlus },
  { href: '/admin/verfuegbarkeit', label: 'Kalender', icon: iconCalendar },
  { href: '/admin/versand', label: 'Versand', icon: iconTruck },
  { href: '/admin/retouren', label: 'Retouren', icon: iconReturn },
  { href: '/admin/schaeden', label: 'Schadensmeldungen', icon: iconWarning },
];

const KUNDEN_ITEMS: NavItem[] = [
  { href: '/admin/kunden', label: 'Kunden', icon: iconUsers },
  { href: '/admin/nachrichten', label: 'Kundenanfragen', icon: iconMessage },
  { href: '/admin/bewertungen', label: 'Produktbewertungen', icon: iconStar },
];

const KATALOG_ITEMS: NavItem[] = [
  { href: '/admin/preise/kameras', label: 'Kameras', icon: iconCamera },
  { href: '/admin/sets', label: 'Sets', icon: iconSets },
  { href: '/admin/zubehoer', label: 'Zubehör', icon: iconAccessory },
  { href: '/admin/einkauf', label: 'Einkauf', icon: iconCart },
];

const PREISE_ITEMS: NavItem[] = [
  { href: '/admin/preise', label: 'Versand & Haftung', exact: true, icon: iconPriceTag },
  { href: '/admin/gutscheine', label: 'Gutscheine', icon: iconTicket },
  { href: '/admin/rabatte', label: 'Rabatte', icon: iconDiscount },
];

const CONTENT_STARTSEITE: NavItem = {
  href: '/admin/startseite',
  label: 'Startseite',
  icon: iconHome,
};

const BLOG_ITEMS: NavItem[] = [
  { href: '/admin/blog', label: 'Blog-Dashboard', exact: true, icon: iconDashboard },
  { href: '/admin/blog/artikel', label: 'Artikel', icon: iconBuchungen },
  { href: '/admin/blog/zeitplan', label: 'Redaktionsplan', icon: iconCalendar },
  { href: '/admin/blog/themen', label: 'KI-Themen', icon: iconStar },
  { href: '/admin/blog/kommentare', label: 'Kommentare', icon: iconMessage },
  { href: '/admin/blog/mediathek', label: 'Mediathek', icon: iconBlog },
  { href: '/admin/blog/einstellungen', label: 'Blog-Einstellungen', icon: iconCog },
];

const FINANZEN_ITEMS: NavItem[] = [
  { href: '/admin/buchhaltung', label: 'Buchhaltung', icon: iconFinance },
];

const BERICHTE_ITEMS: NavItem[] = [
  { href: '/admin/analytics', label: 'Statistiken', icon: iconChart },
  { href: '/admin/emails/vorlagen', label: 'E-Mail-Vorlagen', icon: iconMail },
  { href: '/admin/emails', label: 'E-Mail-Protokoll', exact: true, icon: iconMail },
  { href: '/admin/beta-feedback', label: 'Beta-Feedback', icon: iconFeedback },
  { href: '/admin/aktivitaetsprotokoll', label: 'Admin-Protokoll', icon: iconClipboard },
];

const SYSTEM_ITEMS: NavItem[] = [
  { href: '/admin/legal', label: 'Rechtstexte', icon: iconLegal },
  { href: '/admin/einstellungen', label: 'Einstellungen', icon: iconCog },
];

// ============================================================
// Components
// ============================================================

function NavLinkItem({ item, pathname, onNavClick }: { item: NavItem; pathname: string; onNavClick?: () => void }) {
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  return (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavClick}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1"
      style={active
        ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }
        : { color: '#94a3b8' }
      }
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
    >
      <span style={active ? { color: '#06b6d4' } : { color: '#475569' }}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

function NavSection({ label, items, pathname, onNavClick }: { label: string; items: NavItem[]; pathname: string; onNavClick?: () => void }) {
  return (
    <div className="mb-1">
      <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '10px 12px 4px' }}>
        {label}
      </div>
      {items.map((item) => (
        <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
      ))}
    </div>
  );
}

function BlogCollapse({ pathname, onNavClick }: { pathname: string; onNavClick?: () => void }) {
  const isBlogPath = pathname.startsWith('/admin/blog');
  const [open, setOpen] = useState<boolean>(isBlogPath);

  // Initial: localStorage oder Auto-Expand bei Blog-Pfad
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isBlogPath) {
      setOpen(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem('admin_blog_collapsed');
      if (raw !== null) setOpen(raw === 'false');
    } catch {
      // localStorage nicht verfügbar
    }
  }, [isBlogPath]);

  // Auto-Expand bei Navigation in Blog-Bereich
  useEffect(() => {
    if (isBlogPath && !open) setOpen(true);
  }, [isBlogPath, open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem('admin_blog_collapsed', next ? 'false' : 'true');
    } catch {
      // localStorage nicht verfügbar
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1 text-left"
        style={{ color: isBlogPath ? '#06b6d4' : '#94a3b8', background: isBlogPath ? 'rgba(6,182,212,0.15)' : 'transparent' }}
        onMouseEnter={(e) => { if (!isBlogPath) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
        onMouseLeave={(e) => { if (!isBlogPath) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
      >
        <span style={{ color: isBlogPath ? '#06b6d4' : '#475569' }}>{iconBlog}</span>
        <span className="flex-1">Blog</span>
        <span
          style={{
            color: isBlogPath ? '#06b6d4' : '#475569',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          {iconChevron}
        </span>
      </button>
      {open && (
        <div className="ml-4 pl-2 mt-0.5 space-y-0" style={{ borderLeft: '1px solid #1e293b' }}>
          {BLOG_ITEMS.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ pathname, isDashboard, onNavClick, handleLogout }: {
  pathname: string;
  isDashboard: boolean;
  onNavClick?: () => void;
  handleLogout: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <Link href="/admin" onClick={onNavClick} className="block px-5 py-5" style={{ borderBottom: '1px solid #1e293b', textDecoration: 'none' }}>
        <div className="mb-0.5">
          <span className="font-heading font-black text-lg tracking-tight" style={{ color: 'white' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
        </div>
        <span className="text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: '#475569' }}>
          Admin
        </span>
      </Link>

      {/* Dashboard (standalone) */}
      <div style={{ padding: '10px 4px 6px' }}>
        <Link
          href="/admin"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1"
          style={isDashboard
            ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }
            : { color: '#94a3b8' }
          }
          onMouseEnter={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
          onMouseLeave={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
        >
          <span style={isDashboard ? { color: '#06b6d4' } : { color: '#475569' }}>{iconDashboard}</span>
          Dashboard
        </Link>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#1e293b', margin: '4px 12px' }} />

      {/* Navigation groups */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <NavSection label="Tagesgeschäft" items={TAGESGESCHAEFT_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="Kunden & Kommunikation" items={KUNDEN_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="Katalog" items={KATALOG_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="Preise & Aktionen" items={PREISE_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        {/* Content (Startseite + Blog-Collapse) */}
        <div className="mb-1">
          <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '10px 12px 4px' }}>
            Content
          </div>
          <NavLinkItem item={CONTENT_STARTSEITE} pathname={pathname} onNavClick={onNavClick} />
          <BlogCollapse pathname={pathname} onNavClick={onNavClick} />
        </div>
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="Finanzen" items={FINANZEN_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="Berichte" items={BERICHTE_ITEMS} pathname={pathname} onNavClick={onNavClick} />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />

        <NavSection label="System" items={SYSTEM_ITEMS} pathname={pathname} onNavClick={onNavClick} />
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 space-y-0.5" style={{ borderTop: '1px solid #1e293b' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <NotificationDropdown position="sidebar" />
          <span style={{ color: '#475569', fontSize: 12, fontWeight: 500 }}>Benachrichtigungen</span>
        </div>
        <Link
          href="/"
          onClick={onNavClick}
          className="flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg transition-colors"
          style={{ color: '#475569' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Zum Shop
        </Link>
        <button
          onClick={() => { onNavClick?.(); handleLogout(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg transition-colors text-left"
          style={{ color: '#475569' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Abmelden
        </button>
      </div>
    </>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }, [router]);

  const isLoginOrBlog = pathname === '/admin/login' || pathname.startsWith('/admin/blog');

  // Auto-Logout nach Inaktivität (nicht auf Login-Seite)
  useAutoLogout({
    timeoutMs: ADMIN_TIMEOUT_MS,
    onLogout: handleLogout,
    enabled: !isLoginOrBlog,
  });

  if (isLoginOrBlog) return <>{children}</>;

  const isDashboard = pathname === '/admin';
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex" style={{ background: '#0a0f1e' }}>
      {/* Mobile header with hamburger — respektiert iOS Safe-Area-Top */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-4"
        style={{
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg transition-colors shrink-0"
          style={{ color: '#06b6d4' }}
          aria-label="Menü öffnen"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/admin" className="ml-3 flex-1 min-w-0" style={{ textDecoration: 'none' }}>
          <span className="font-heading font-black text-base tracking-tight" style={{ color: 'white' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
          <span className="text-xs font-heading font-semibold tracking-widest uppercase ml-2" style={{ color: '#475569' }}>
            Admin
          </span>
        </Link>
        <div className="ml-auto shrink-0">
          <NotificationDropdown position="mobile" />
        </div>
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — Mobile: slide-in drawer, Desktop: permanent */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-56 flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }}
      >
        {/* Mobile close button */}
        <div className="lg:hidden absolute top-3 right-3 z-10">
          <button
            onClick={closeSidebar}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#475569' }}
            aria-label="Menü schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarContent
          pathname={pathname}
          isDashboard={isDashboard}
          onNavClick={closeSidebar}
          handleLogout={handleLogout}
        />
      </aside>

      {/* Main Content — overflow-x-hidden verhindert Body-Scroll wenn
          eine Unterseite zu breite Elemente hat. pt auf Mobile
          berücksichtigt Safe-Area (Notch). */}
      <main
        className="admin-dark flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0"
        style={{ background: '#0a0f1e', color: '#e2e8f0' }}
      >
        {children}
      </main>
    </div>
  );
}
