'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NotificationDropdown from '@/components/admin/NotificationDropdown';
import EnvModeBadge from '@/components/admin/EnvModeBadge';
import { useAutoLogout } from '@/hooks/useAutoLogout';

// 30 Minuten Inaktivität für Admin
const ADMIN_TIMEOUT_MS = 30 * 60 * 1000;

type PermKey =
  | 'tagesgeschaeft' | 'kunden' | 'katalog' | 'preise'
  | 'content' | 'finanzen' | 'berichte' | 'system' | 'mitarbeiter_verwalten';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
  perm?: PermKey; // wenn gesetzt: nur sichtbar wenn User diese Permission hat (Owner sieht immer)
};

interface MeInfo {
  id: string;
  role: 'owner' | 'employee';
  permissions: PermKey[];
}

function canSee(me: MeInfo | null, item: NavItem): boolean {
  if (!item.perm) return true;
  if (!me) return true; // solange unbekannt: zeigen (verhindert Flackern)
  if (me.role === 'owner') return true;
  return me.permissions.includes(item.perm);
}

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
const iconBell = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
);
const iconGallery = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
);
const iconSocial = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
);

// ============================================================
// Navigation groups
// ============================================================

const TAGESGESCHAEFT_ITEMS: NavItem[] = [
  { href: '/admin/tagesgeschaeft', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'tagesgeschaeft' },
  { href: '/admin/buchungen', label: 'Buchungen', icon: iconBuchungen, perm: 'tagesgeschaeft' },
  { href: '/admin/buchungen/neu', label: 'Manuelle Buchung', exact: true, icon: iconPlus, perm: 'tagesgeschaeft' },
  { href: '/admin/verfuegbarkeit', label: 'Kalender', icon: iconCalendar, perm: 'tagesgeschaeft' },
  { href: '/admin/versand', label: 'Versand', icon: iconTruck, perm: 'tagesgeschaeft' },
  { href: '/admin/retouren', label: 'Retouren', icon: iconReturn, perm: 'tagesgeschaeft' },
];

const KUNDEN_ITEMS: NavItem[] = [
  { href: '/admin/kunden-uebersicht', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'kunden' },
  { href: '/admin/kunden', label: 'Kunden', icon: iconUsers, perm: 'kunden' },
  { href: '/admin/nachrichten', label: 'Kundenanfragen', icon: iconMessage, perm: 'kunden' },
  { href: '/admin/warteliste', label: 'Warteliste', icon: iconBell, perm: 'kunden' },
  { href: '/admin/kunden-material', label: 'Kundenmaterial', icon: iconGallery, perm: 'kunden' },
  { href: '/admin/bewertungen', label: 'Produktbewertungen', icon: iconStar, perm: 'kunden' },
  { href: '/admin/schaeden', label: 'Schadensmeldungen', icon: iconWarning, perm: 'kunden' },
];

const KATALOG_ITEMS: NavItem[] = [
  { href: '/admin/preise/kameras', label: 'Kameras', icon: iconCamera, perm: 'katalog' },
  { href: '/admin/sets', label: 'Sets', icon: iconSets, perm: 'katalog' },
  { href: '/admin/zubehoer', label: 'Zubehör', icon: iconAccessory, perm: 'katalog' },
];

const PREISE_ITEMS: NavItem[] = [
  { href: '/admin/gutscheine', label: 'Gutscheine', icon: iconTicket, perm: 'preise' },
  { href: '/admin/rabatte', label: 'Rabatte', icon: iconDiscount, perm: 'preise' },
];

const WEBSEITE_ITEMS: NavItem[] = [
  { href: '/admin/startseite', label: 'Startseite', icon: iconHome, perm: 'content' },
  { href: '/admin/legal', label: 'Rechtstexte', icon: iconLegal, perm: 'system' },
];

const BLOG_ITEMS: NavItem[] = [
  { href: '/admin/blog', label: 'Blog-Dashboard', exact: true, icon: iconDashboard, perm: 'content' },
  { href: '/admin/blog/artikel', label: 'Artikel', icon: iconBuchungen, perm: 'content' },
  { href: '/admin/blog/zeitplan', label: 'Redaktionsplan', icon: iconCalendar, perm: 'content' },
  { href: '/admin/blog/themen', label: 'KI-Themen', icon: iconStar, perm: 'content' },
  { href: '/admin/blog/kommentare', label: 'Kommentare', icon: iconMessage, perm: 'content' },
  { href: '/admin/blog/mediathek', label: 'Mediathek', icon: iconBlog, perm: 'content' },
];

const SOCIAL_ITEMS: NavItem[] = [
  { href: '/admin/social', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'content' },
  { href: '/admin/social/posts', label: 'Posts', icon: iconBuchungen, perm: 'content' },
  { href: '/admin/social/neu', label: 'Neuer Post', icon: iconPlus, perm: 'content' },
  { href: '/admin/social/reels', label: 'Reels', icon: iconCamera, perm: 'content' },
  { href: '/admin/social/themen', label: 'Themen & Serien', icon: iconStar, perm: 'content' },
  { href: '/admin/social/zeitplan', label: 'Redaktionsplan', icon: iconCalendar, perm: 'content' },
  { href: '/admin/social/plan', label: 'KI-Plan (Bulk)', icon: iconBlog, perm: 'content' },
  { href: '/admin/social/vorlagen', label: 'Vorlagen', icon: iconClipboard, perm: 'content' },
];

const FINANZEN_ITEMS: NavItem[] = [
  { href: '/admin/buchhaltung', label: 'Buchhaltung', icon: iconFinance, perm: 'finanzen' },
  { href: '/admin/einkauf', label: 'Einkauf', icon: iconCart, perm: 'finanzen' },
  { href: '/admin/anlagen', label: 'Anlagenverzeichnis', icon: iconCamera, perm: 'finanzen' },
];

const BERICHTE_ITEMS: NavItem[] = [
  { href: '/admin/analytics', label: 'Statistiken', icon: iconChart, perm: 'berichte' },
  { href: '/admin/emails/vorlagen', label: 'E-Mail-Vorlagen', icon: iconMail, perm: 'berichte' },
  { href: '/admin/emails', label: 'E-Mail-Protokoll', exact: true, icon: iconMail, perm: 'berichte' },
  { href: '/admin/beta-feedback', label: 'Beta-Feedback', icon: iconFeedback, perm: 'berichte' },
  { href: '/admin/aktivitaetsprotokoll', label: 'Admin-Protokoll', icon: iconClipboard, perm: 'berichte' },
];

const SYSTEM_ITEMS: NavItem[] = [
  { href: '/admin/einstellungen/mitarbeiter', label: 'Mitarbeiter', icon: iconUsers, perm: 'mitarbeiter_verwalten' },
  { href: '/admin/einstellungen', label: 'Einstellungen', exact: true, icon: iconCog, perm: 'system' },
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

function NavSection({ label, items, pathname, onNavClick, me }: { label: string; items: NavItem[]; pathname: string; onNavClick?: () => void; me: MeInfo | null }) {
  const visible = items.filter((i) => canSee(me, i));
  if (visible.length === 0) return null;
  return (
    <div className="mb-1">
      <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '10px 12px 4px' }}>
        {label}
      </div>
      {visible.map((item) => (
        <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
      ))}
    </div>
  );
}

/**
 * Aufklappbare Navigations-Gruppe.
 * Collapse-State persistiert in localStorage (Key: `admin_group_${storageKey}_collapsed`).
 * Auto-Expand: Wenn aktuelle URL matchPaths-Prefix enthaelt oder href eines Items ist.
 */
function NavGroupCollapse({
  label,
  icon,
  items,
  children,
  matchPaths,
  storageKey,
  pathname,
  onNavClick,
  me,
  hasVisibleChildren,
  open,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  items?: NavItem[];
  children?: React.ReactNode;
  matchPaths: string[];
  storageKey: string;
  pathname: string;
  onNavClick?: () => void;
  me: MeInfo | null;
  hasVisibleChildren?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const isActivePath = matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    || (items?.some((it) => it.exact ? pathname === it.href : pathname.startsWith(it.href)) ?? false);

  const visibleItems = items ? items.filter((i) => canSee(me, i)) : undefined;

  // Gesamte Gruppe ausblenden wenn weder eigene Items noch Kinder sichtbar sind.
  const hasOwnItems = visibleItems && visibleItems.length > 0;
  const hasSomething = hasOwnItems || hasVisibleChildren || (!items && !!children);
  if (!hasSomething) return null;

  return (
    <div className="mb-1" data-storage-key={storageKey}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1 text-left"
        style={{ color: isActivePath ? '#06b6d4' : '#94a3b8', background: isActivePath ? 'rgba(6,182,212,0.15)' : 'transparent' }}
        onMouseEnter={(e) => { if (!isActivePath) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
        onMouseLeave={(e) => { if (!isActivePath) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
      >
        <span style={{ color: isActivePath ? '#06b6d4' : '#475569' }}>{icon}</span>
        <span className="flex-1">{label}</span>
        <span
          style={{
            color: isActivePath ? '#06b6d4' : '#475569',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          {iconChevron}
        </span>
      </button>
      {open && (
        <div className="ml-4 pl-2 mt-0.5 space-y-0" style={{ borderLeft: '1px solid #1e293b' }}>
          {visibleItems?.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

function SocialCollapse({ pathname, onNavClick, me }: { pathname: string; onNavClick?: () => void; me: MeInfo | null }) {
  const visibleItems = SOCIAL_ITEMS.filter((i) => canSee(me, i));
  const isSocialPath = pathname.startsWith('/admin/social');
  const [open, setOpen] = useState<boolean>(isSocialPath);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSocialPath) {
      setOpen(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem('admin_social_collapsed');
      if (raw !== null) setOpen(raw === 'false');
    } catch { /* empty */ }
  }, [isSocialPath]);

  useEffect(() => {
    if (isSocialPath && !open) setOpen(true);
  }, [isSocialPath, open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem('admin_social_collapsed', next ? 'false' : 'true');
    } catch { /* empty */ }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1 text-left"
        style={{ color: isSocialPath ? '#06b6d4' : '#94a3b8', background: isSocialPath ? 'rgba(6,182,212,0.15)' : 'transparent' }}
        onMouseEnter={(e) => { if (!isSocialPath) (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; }}
        onMouseLeave={(e) => { if (!isSocialPath) (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
      >
        <span style={{ color: isSocialPath ? '#06b6d4' : '#475569' }}>{iconSocial}</span>
        <span className="flex-1">Social Media</span>
        <span
          style={{
            color: isSocialPath ? '#06b6d4' : '#475569',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          {iconChevron}
        </span>
      </button>
      {open && (
        <div className="ml-4 pl-2 mt-0.5 space-y-0" style={{ borderLeft: '1px solid #1e293b' }}>
          {visibleItems.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlogCollapse({ pathname, onNavClick, me }: { pathname: string; onNavClick?: () => void; me: MeInfo | null }) {
  const visibleItems = BLOG_ITEMS.filter((i) => canSee(me, i));
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
          {visibleItems.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ pathname, isDashboard, onNavClick, handleLogout, me }: {
  pathname: string;
  isDashboard: boolean;
  onNavClick?: () => void;
  handleLogout: () => void;
  me: MeInfo | null;
}) {
  const blogVisible = BLOG_ITEMS.some((i) => canSee(me, i));
  const socialVisible = SOCIAL_ITEMS.some((i) => canSee(me, i));

  // Accordion: genau eine Gruppe darf offen sein. Bei Pfadwechsel wird die
  // zugehoerige Gruppe automatisch ausgeklappt; Klick auf eine andere
  // schliesst die bisherige.
  const GROUP_MATCH: Record<string, string[]> = {
    tagesgeschaeft: ['/admin/tagesgeschaeft', '/admin/buchungen', '/admin/verfuegbarkeit', '/admin/versand', '/admin/retouren'],
    kunden: ['/admin/kunden-uebersicht', '/admin/kunden', '/admin/nachrichten', '/admin/warteliste', '/admin/kunden-material', '/admin/bewertungen', '/admin/schaeden'],
    katalog: ['/admin/preise/kameras', '/admin/sets', '/admin/zubehoer'],
    preise: ['/admin/gutscheine', '/admin/rabatte'],
    content: ['/admin/blog', '/admin/social'],
    webseite: ['/admin/startseite', '/admin/legal'],
    finanzen: ['/admin/buchhaltung', '/admin/einkauf', '/admin/anlagen'],
    berichte: ['/admin/analytics', '/admin/emails', '/admin/beta-feedback', '/admin/aktivitaetsprotokoll'],
  };

  function groupForPath(p: string): string | null {
    // Laengste Uebereinstimmung gewinnt (z.B. /admin/preise/kameras -> katalog statt preise)
    let best: { key: string; len: number } | null = null;
    for (const [key, paths] of Object.entries(GROUP_MATCH)) {
      for (const prefix of paths) {
        if (p === prefix || p.startsWith(prefix + '/')) {
          if (!best || prefix.length > best.len) best = { key, len: prefix.length };
        }
      }
    }
    return best?.key ?? null;
  }

  const pathGroup = groupForPath(pathname);
  const [openGroup, setOpenGroup] = useState<string | null>(pathGroup);

  // Initial: aus localStorage laden (falls nichts aus Pfad kommt)
  useEffect(() => {
    if (typeof window === 'undefined' || pathGroup) return;
    try {
      const raw = window.localStorage.getItem('admin_sidebar_open_group');
      if (raw) setOpenGroup(raw);
    } catch { /* empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pfadwechsel: passende Gruppe ausklappen (andere schliessen)
  useEffect(() => {
    if (pathGroup && pathGroup !== openGroup) setOpenGroup(pathGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathGroup]);

  function toggleGroup(key: string) {
    const next = openGroup === key ? null : key;
    setOpenGroup(next);
    try {
      if (next) window.localStorage.setItem('admin_sidebar_open_group', next);
      else window.localStorage.removeItem('admin_sidebar_open_group');
    } catch { /* empty */ }
  }

  return (
    <>
      {/* Logo */}
      <Link href="/admin" onClick={onNavClick} className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: '1px solid #1e293b', textDecoration: 'none' }}>
        <img src="/logo/mark.svg" alt="" aria-hidden="true" width={40} height={27} style={{ height: 28, width: 'auto', flexShrink: 0 }} />
        <div className="flex flex-col leading-tight">
          <span className="font-heading font-black text-lg tracking-tight" style={{ color: 'white' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
          <span className="text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: '#475569' }}>
            Admin
          </span>
        </div>
        <div className="ml-auto">
          <EnvModeBadge />
        </div>
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

      {/* Navigation groups — Accordion: es ist immer nur eine Gruppe offen */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <NavGroupCollapse
          label="Tagesgeschäft"
          icon={iconBuchungen}
          items={TAGESGESCHAEFT_ITEMS}
          matchPaths={GROUP_MATCH.tagesgeschaeft}
          storageKey="tagesgeschaeft"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'tagesgeschaeft'}
          onToggle={() => toggleGroup('tagesgeschaeft')}
        />
        <NavGroupCollapse
          label="Kunden & Kommunikation"
          icon={iconUsers}
          items={KUNDEN_ITEMS}
          matchPaths={GROUP_MATCH.kunden}
          storageKey="kunden"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'kunden'}
          onToggle={() => toggleGroup('kunden')}
        />
        <NavGroupCollapse
          label="Katalog"
          icon={iconCamera}
          items={KATALOG_ITEMS}
          matchPaths={GROUP_MATCH.katalog}
          storageKey="katalog"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'katalog'}
          onToggle={() => toggleGroup('katalog')}
        />
        <NavGroupCollapse
          label="Preise & Aktionen"
          icon={iconPriceTag}
          items={PREISE_ITEMS}
          matchPaths={GROUP_MATCH.preise}
          storageKey="preise"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'preise'}
          onToggle={() => toggleGroup('preise')}
        />
        <NavGroupCollapse
          label="Content"
          icon={iconBlog}
          matchPaths={GROUP_MATCH.content}
          storageKey="content"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          hasVisibleChildren={blogVisible || socialVisible}
          open={openGroup === 'content'}
          onToggle={() => toggleGroup('content')}
        >
          <BlogCollapse pathname={pathname} onNavClick={onNavClick} me={me} />
          <SocialCollapse pathname={pathname} onNavClick={onNavClick} me={me} />
        </NavGroupCollapse>
        <NavGroupCollapse
          label="Webseite"
          icon={iconHome}
          items={WEBSEITE_ITEMS}
          matchPaths={GROUP_MATCH.webseite}
          storageKey="webseite"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'webseite'}
          onToggle={() => toggleGroup('webseite')}
        />
        <NavGroupCollapse
          label="Finanzen"
          icon={iconFinance}
          items={FINANZEN_ITEMS}
          matchPaths={GROUP_MATCH.finanzen}
          storageKey="finanzen"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'finanzen'}
          onToggle={() => toggleGroup('finanzen')}
        />
        <NavGroupCollapse
          label="Berichte"
          icon={iconChart}
          items={BERICHTE_ITEMS}
          matchPaths={GROUP_MATCH.berichte}
          storageKey="berichte"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'berichte'}
          onToggle={() => toggleGroup('berichte')}
        />
        <div style={{ height: 1, background: '#1e293b', margin: '6px 12px' }} />
        <NavSection label="System" items={SYSTEM_ITEMS} pathname={pathname} onNavClick={onNavClick} me={me} />
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
  const [me, setMe] = useState<MeInfo | null>(null);

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.user) setMe(d.user as MeInfo); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

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
        <Link href="/admin" className="ml-3 flex-1 min-w-0 flex items-center gap-2" style={{ textDecoration: 'none' }}>
          <img src="/logo/mark.svg" alt="" aria-hidden="true" width={32} height={22} style={{ height: 22, width: 'auto', flexShrink: 0 }} />
          <span className="font-heading font-black text-base tracking-tight" style={{ color: 'white' }}>
            cam<span style={{ color: '#06b6d4' }}>2</span>rent
          </span>
          <span className="text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: '#475569' }}>
            Admin
          </span>
        </Link>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          <EnvModeBadge />
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
          me={me}
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
