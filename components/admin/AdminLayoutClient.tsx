'use client';

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NotificationDropdown from '@/components/admin/NotificationDropdown';
import EnvModeBadge from '@/components/admin/EnvModeBadge';
import GlobalErrorToast from '@/components/admin/GlobalErrorToast';
import AdminCommandPalette from '@/components/admin/AdminCommandPalette';
import { FeedbackProvider } from '@/components/admin/ui/FeedbackProvider';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import { NotificationsProvider } from '@/contexts/NotificationsContext';

// 1 Stunde Inaktivität für Admin (gleich wie Shop/Kunden)
const ADMIN_TIMEOUT_MS = 60 * 60 * 1000;

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
const iconFilm = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" /></svg>
);
const iconVerbrauch = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
);

// ============================================================
// Navigation groups
// ============================================================

const MEIN_BEREICH_ITEMS: NavItem[] = [
  { href: '/admin/mein/notizen', label: 'Meine Notizen', icon: iconClipboard },
  { href: '/admin/mein/kalender', label: 'Mein Kalender', icon: iconCalendar },
];

const TAGESGESCHAEFT_ITEMS: NavItem[] = [
  { href: '/admin/tagesgeschaeft', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'tagesgeschaeft' },
  { href: '/admin/buchungen', label: 'Buchungen', icon: iconBuchungen, perm: 'tagesgeschaeft' },
  { href: '/admin/buchungen/neu', label: 'Manuelle Buchung', exact: true, icon: iconPlus, perm: 'tagesgeschaeft' },
  { href: '/admin/retouren', label: 'Versand & Rückgabe', icon: iconTruck, perm: 'tagesgeschaeft' },
  { href: '/admin/sendungen', label: 'Paketverfolgung', icon: iconTruck, perm: 'tagesgeschaeft' },
  { href: '/admin/schaeden', label: 'Schadensmeldungen', icon: iconWarning, perm: 'tagesgeschaeft' },
];

const KALENDER_ITEMS: NavItem[] = [
  { href: '/admin/verfuegbarkeit', label: 'Kalender', icon: iconCalendar, perm: 'tagesgeschaeft' },
  { href: '/admin/auftragskalender', label: 'Auftragskalender', icon: iconCalendar, perm: 'tagesgeschaeft' },
  { href: '/admin/verfuegbarkeit-alerts', label: 'Verfügbarkeits-Alerts', icon: iconWarning, perm: 'tagesgeschaeft' },
];

const VERKAUF_ITEMS: NavItem[] = [
  { href: '/admin/preisrechner', label: 'Preisrechner', icon: iconPlus, perm: 'tagesgeschaeft' },
  { href: '/admin/reservierungen', label: 'Reservierungen (48h)', icon: iconCalendar, perm: 'tagesgeschaeft' },
  { href: '/admin/verkauf', label: 'Verkäufe', icon: iconCart, perm: 'tagesgeschaeft' },
];

const KUNDEN_ITEMS: NavItem[] = [
  { href: '/admin/kunden-uebersicht', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'kunden' },
  { href: '/admin/kunden', label: 'Kunden', icon: iconUsers, perm: 'kunden' },
  { href: '/admin/nachrichten', label: 'Kundenanfragen', icon: iconMessage, perm: 'kunden' },
  { href: '/admin/warteliste', label: 'Warteliste', icon: iconBell, perm: 'kunden' },
  { href: '/admin/kunden-material', label: 'Kundenmaterial', icon: iconGallery, perm: 'kunden' },
  { href: '/admin/bewertungen', label: 'Produktbewertungen', icon: iconStar, perm: 'kunden' },
];

const KATALOG_ITEMS: NavItem[] = [
  { href: '/admin/preise/kameras', label: 'Kameras', icon: iconCamera, perm: 'katalog' },
  { href: '/admin/sets', label: 'Sets', icon: iconSets, perm: 'katalog' },
  { href: '/admin/zubehoer', label: 'Zubehör', icon: iconAccessory, perm: 'katalog' },
  { href: '/admin/inventar', label: 'Inventar', icon: iconSets, perm: 'katalog' },
  { href: '/admin/verbrauch', label: 'Verbrauch', icon: iconVerbrauch, perm: 'katalog' },
  { href: '/admin/firmware', label: 'Firmware-Updates', icon: iconCog, perm: 'katalog' },
];

const PREISE_ITEMS: NavItem[] = [
  { href: '/admin/gutscheine', label: 'Gutscheine', icon: iconTicket, perm: 'preise' },
  { href: '/admin/rabatte', label: 'Rabatte', icon: iconDiscount, perm: 'preise' },
  { href: '/admin/angebote', label: 'Angebote', icon: iconTicket, perm: 'preise' },
  { href: '/admin/warenkorb-erinnerung', label: 'Warenkorb-Erinnerung', icon: iconCart, perm: 'preise' },
  { href: '/admin/newsletter', label: 'Newsletter', icon: iconMail, perm: 'preise' },
];

// Content-Kopf-Einträge (Startseite + Rechtstexte) — direkt in der Content-Gruppe
// über den Blog/Posts/Reels-Sub-Collapses. Die frühere eigene Gruppe „Webseite"
// (2 Einträge) ist hier aufgegangen.
const CONTENT_TOP_ITEMS: NavItem[] = [
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
  { href: '/admin/content/einstellungen?tab=blog', label: 'Einstellungen', icon: iconCog, perm: 'content' },
];

const POSTS_ITEMS: NavItem[] = [
  { href: '/admin/social', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'content' },
  { href: '/admin/social/posts', label: 'Posts', icon: iconBuchungen, perm: 'content' },
  { href: '/admin/social/neu', label: 'Neuer Post', icon: iconPlus, perm: 'content' },
  { href: '/admin/social/themen', label: 'Themen & Serien', icon: iconStar, perm: 'content' },
  { href: '/admin/social/zeitplan', label: 'Redaktionsplan', icon: iconCalendar, perm: 'content' },
  { href: '/admin/social/plan', label: 'KI-Plan (Bulk)', icon: iconBlog, perm: 'content' },
  { href: '/admin/social/vorlagen', label: 'Vorlagen', icon: iconClipboard, perm: 'content' },
  { href: '/admin/content/einstellungen?tab=posts', label: 'Einstellungen', icon: iconCog, perm: 'content' },
];

const REELS_ITEMS: NavItem[] = [
  { href: '/admin/social/reels', label: 'Übersicht', exact: true, icon: iconDashboard, perm: 'content' },
  { href: '/admin/social/reels/neu', label: 'Neues Reel', icon: iconPlus, perm: 'content' },
  { href: '/admin/social/reels/zeitplan', label: 'Redaktionsplan', icon: iconCalendar, perm: 'content' },
  { href: '/admin/social/reels/vorlagen', label: 'Vorlagen', icon: iconClipboard, perm: 'content' },
  { href: '/admin/content/einstellungen?tab=reels', label: 'Einstellungen', icon: iconCog, perm: 'content' },
];

const FINANZEN_ITEMS: NavItem[] = [
  { href: '/admin/buchhaltung', label: 'Buchhaltung', icon: iconFinance, perm: 'finanzen' },
  { href: '/admin/buchhaltung/belege', label: 'Belege', icon: iconCart, perm: 'finanzen' },
  { href: '/admin/buchhaltung/anlagen', label: 'Anlagen', icon: iconCamera, perm: 'finanzen' },
  { href: '/admin/einkauf', label: 'Einkauf', icon: iconClipboard, perm: 'finanzen' },
];

const BERICHTE_ITEMS: NavItem[] = [
  { href: '/admin/analytics', label: 'Statistiken', icon: iconChart, perm: 'berichte' },
  { href: '/admin/buchungsinteresse', label: 'Buchungsinteresse', icon: iconChart, perm: 'berichte' },
  { href: '/admin/emails/vorlagen', label: 'E-Mail-Vorlagen', icon: iconMail, perm: 'berichte' },
  { href: '/admin/emails', label: 'E-Mail-Protokoll', exact: true, icon: iconMail, perm: 'berichte' },
  { href: '/admin/beta-feedback', label: 'Beta-Feedback', icon: iconFeedback, perm: 'berichte' },
  { href: '/admin/aktivitaetsprotokoll', label: 'Admin-Protokoll', icon: iconClipboard, perm: 'berichte' },
  { href: '/admin/client-errors', label: 'Frontend-Fehler', icon: iconClipboard, perm: 'berichte' },
];

const SYSTEM_ITEMS: NavItem[] = [
  { href: '/admin/einstellungen/mitarbeiter', label: 'Mitarbeiter', icon: iconUsers, perm: 'mitarbeiter_verwalten' },
  { href: '/admin/einstellungen', label: 'Einstellungen', exact: true, icon: iconCog, perm: 'system' },
];

// Flache Liste aller Nav-Items — nur zum Auflösen gepinnter Favoriten-Hrefs
// (href → Item mit Icon/Label/Permission). Reihenfolge egal.
const ALL_NAV_ITEMS: NavItem[] = [
  ...MEIN_BEREICH_ITEMS, ...TAGESGESCHAEFT_ITEMS, ...KALENDER_ITEMS, ...VERKAUF_ITEMS,
  ...KUNDEN_ITEMS, ...KATALOG_ITEMS, ...PREISE_ITEMS, ...CONTENT_TOP_ITEMS,
  ...BLOG_ITEMS, ...POSTS_ITEMS, ...REELS_ITEMS,
  ...FINANZEN_ITEMS, ...BERICHTE_ITEMS, ...SYSTEM_ITEMS,
];

// ── Favoriten/Pins ──────────────────────────────────────────────────────────
// Pro Gerät in localStorage; ein Modul-Store hält Desktop- + Mobile-Sidebar
// synchron (useSyncExternalStore, kein Prop-Threading durch die Nav-Bäume).
const PIN_KEY = 'admin_pinned_nav';
const EMPTY_PINS: string[] = [];
let pinnedCache: string[] | null = null;
const pinListeners = new Set<() => void>();

function readPins(): string[] {
  if (pinnedCache) return pinnedCache;
  if (typeof window === 'undefined') { pinnedCache = EMPTY_PINS; return pinnedCache; }
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    pinnedCache = Array.isArray(parsed) ? parsed.filter((h) => typeof h === 'string') : [];
  } catch { pinnedCache = []; }
  return pinnedCache;
}
function writePins(next: string[]) {
  pinnedCache = next;
  try { window.localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch { /* localStorage n/a */ }
  pinListeners.forEach((l) => l());
}
function togglePin(href: string) {
  const cur = readPins();
  writePins(cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href]);
}
function subscribePins(cb: () => void) { pinListeners.add(cb); return () => { pinListeners.delete(cb); }; }
function usePins(): string[] {
  return useSyncExternalStore(subscribePins, readPins, () => EMPTY_PINS);
}

function PinStar({ pinned }: { pinned: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ============================================================
// Components
// ============================================================

function NavLinkItem({ item, pathname, onNavClick }: { item: NavItem; pathname: string; onNavClick?: () => void }) {
  const hrefPath = item.href.split('?')[0];
  const active = item.exact ? pathname === hrefPath : pathname.startsWith(hrefPath);
  const pins = usePins();
  const pinned = pins.includes(item.href);
  return (
    <div className="relative group/nav mx-1">
      <Link
        href={item.href}
        onClick={onNavClick}
        className="flex items-center gap-3 pl-3 pr-9 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
        style={active
          ? { background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)' }
          : { color: 'var(--admin-muted)' }
        }
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--admin-text)'; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted)'; }}
      >
        <span style={active ? { color: 'var(--admin-accent)' } : { color: 'var(--admin-muted-2)' }}>{item.icon}</span>
        {item.label}
      </Link>
      <button
        type="button"
        aria-label={pinned ? `${item.label} aus Favoriten entfernen` : `${item.label} zu Favoriten hinzufügen`}
        aria-pressed={pinned}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(item.href); }}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity ${pinned ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100'}`}
        style={{ color: pinned ? 'var(--admin-accent)' : 'var(--admin-muted-2)' }}
      >
        <PinStar pinned={pinned} />
      </button>
    </div>
  );
}

function NavSection({ label, items, pathname, onNavClick, me }: { label: string; items: NavItem[]; pathname: string; onNavClick?: () => void; me: MeInfo | null }) {
  const visible = items.filter((i) => canSee(me, i));
  if (visible.length === 0) return null;
  return (
    <div className="mb-1">
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--admin-faint)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '10px 12px 4px' }}>
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
        style={{ color: isActivePath ? 'var(--admin-accent)' : 'var(--admin-muted)', background: isActivePath ? 'var(--admin-accent-soft)' : 'transparent' }}
        onMouseEnter={(e) => { if (!isActivePath) (e.currentTarget as HTMLElement).style.color = 'var(--admin-text)'; }}
        onMouseLeave={(e) => { if (!isActivePath) (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted)'; }}
      >
        <span style={{ color: isActivePath ? 'var(--admin-accent)' : 'var(--admin-muted-2)' }}>{icon}</span>
        <span className="flex-1">{label}</span>
        <span
          style={{
            color: isActivePath ? 'var(--admin-accent)' : 'var(--admin-muted-2)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          {iconChevron}
        </span>
      </button>
      {open && (
        <div className="ml-4 pl-2 mt-0.5 space-y-0" style={{ borderLeft: '1px solid var(--admin-border)' }}>
          {visibleItems?.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Generische, aufklappbare Sub-Navigation (Blog / Posts / Reels). Ersetzt die
 * drei fast identischen `*Collapse`-Komponenten — reiner Refactor, Verhalten
 * 1:1: Collapse-State pro `storageKey` in localStorage, Auto-Expand wenn
 * `active` (aktueller Pfad im Bereich), gleiche Optik/Hover/Chevron.
 * `hideWhenEmpty`: bei 0 sichtbaren Items nichts rendern (Posts/Reels) vs.
 * Header trotzdem zeigen (Blog).
 */
function SubNavCollapse({ label, icon, items, storageKey, active, pathname, onNavClick, me, hideWhenEmpty }: {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  storageKey: string;
  active: boolean;
  pathname: string;
  onNavClick?: () => void;
  me: MeInfo | null;
  hideWhenEmpty?: boolean;
}) {
  const visibleItems = items.filter((i) => canSee(me, i));
  const [open, setOpen] = useState<boolean>(active);

  // Initial: Auto-Expand bei aktivem Bereich, sonst localStorage-Stand.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (active) { setOpen(true); return; }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setOpen(raw === 'false');
    } catch { /* localStorage nicht verfügbar */ }
  }, [active, storageKey]);

  // Auto-Expand bei Navigation in den Bereich.
  useEffect(() => {
    if (active && !open) setOpen(true);
  }, [active, open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(storageKey, next ? 'false' : 'true'); } catch { /* localStorage nicht verfügbar */ }
  }

  if (hideWhenEmpty && visibleItems.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1 text-left"
        style={{ color: active ? 'var(--admin-accent)' : 'var(--admin-muted)', background: active ? 'var(--admin-accent-soft)' : 'transparent' }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--admin-text)'; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted)'; }}
      >
        <span style={{ color: active ? 'var(--admin-accent)' : 'var(--admin-muted-2)' }}>{icon}</span>
        <span className="flex-1">{label}</span>
        <span
          style={{
            color: active ? 'var(--admin-accent)' : 'var(--admin-muted-2)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          {iconChevron}
        </span>
      </button>
      {open && (
        <div className="ml-4 pl-2 mt-0.5 space-y-0" style={{ borderLeft: '1px solid var(--admin-border)' }}>
          {visibleItems.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Favoriten-Sektion oben in der Sidebar — nur sichtbar, wenn der User Items
 *  angepinnt hat (Stern an einem Nav-Item). Auflösung href → Item über
 *  ALL_NAV_ITEMS, permission-gefiltert wie überall. */
function FavoritesSection({ me, pathname, onNavClick }: { me: MeInfo | null; pathname: string; onNavClick?: () => void }) {
  const pins = usePins();
  if (pins.length === 0) return null;
  const items = pins
    .map((href) => ALL_NAV_ITEMS.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i && canSee(me, i));
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--admin-faint)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '10px 12px 4px' }}>
        ★ Favoriten
      </div>
      {items.map((item) => (
        <NavLinkItem key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
      ))}
    </div>
  );
}

function SidebarContent({ pathname, isDashboard, onNavClick, handleLogout, me, theme, onToggleTheme }: {
  pathname: string;
  isDashboard: boolean;
  onNavClick?: () => void;
  handleLogout: () => void;
  me: MeInfo | null;
  theme: AdminTheme;
  onToggleTheme: () => void;
}) {
  const blogVisible = BLOG_ITEMS.some((i) => canSee(me, i));
  const postsVisible = POSTS_ITEMS.some((i) => canSee(me, i));
  const reelsVisible = REELS_ITEMS.some((i) => canSee(me, i));

  // Accordion: genau eine Gruppe darf offen sein. Bei Pfadwechsel wird die
  // zugehoerige Gruppe automatisch ausgeklappt; Klick auf eine andere
  // schliesst die bisherige.
  const GROUP_MATCH: Record<string, string[]> = {
    mein: ['/admin/mein'],
    tagesgeschaeft: ['/admin/tagesgeschaeft', '/admin/buchungen', '/admin/versand', '/admin/retouren', '/admin/sendungen', '/admin/schaeden'],
    kalender: ['/admin/verfuegbarkeit', '/admin/auftragskalender', '/admin/verfuegbarkeit-alerts'],
    verkauf: ['/admin/preisrechner', '/admin/reservierungen', '/admin/verkauf'],
    kunden: ['/admin/kunden-uebersicht', '/admin/kunden', '/admin/nachrichten', '/admin/warteliste', '/admin/kunden-material', '/admin/bewertungen'],
    katalog: ['/admin/preise/kameras', '/admin/sets', '/admin/zubehoer', '/admin/inventar', '/admin/verbrauch', '/admin/firmware'],
    preise: ['/admin/gutscheine', '/admin/rabatte', '/admin/angebote', '/admin/warenkorb-erinnerung', '/admin/newsletter'],
    content: ['/admin/blog', '/admin/social', '/admin/content', '/admin/startseite', '/admin/legal'],
    finanzen: ['/admin/buchhaltung', '/admin/einkauf', '/admin/anlagen'],
    berichte: ['/admin/analytics', '/admin/buchungsinteresse', '/admin/emails', '/admin/beta-feedback', '/admin/aktivitaetsprotokoll', '/admin/client-errors'],
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
      <Link href="/admin" onClick={onNavClick} className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: '1px solid var(--admin-border)', textDecoration: 'none' }}>
        <img src="/logo/mark.svg" alt="" aria-hidden="true" width={40} height={27} style={{ height: 28, width: 'auto', flexShrink: 0 }} />
        <div className="flex flex-col leading-tight">
          <span className="font-heading font-black text-lg tracking-tight" style={{ color: 'var(--admin-logo-text)' }}>
            cam<span style={{ color: 'var(--admin-accent)' }}>2</span>rent
          </span>
          <span className="text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: 'var(--admin-muted-2)' }}>
            Admin
          </span>
        </div>
        <div className="ml-auto">
          <EnvModeBadge />
        </div>
      </Link>

      {/* Schnellsuche (öffnet Command-Palette) */}
      <div style={{ padding: '10px 12px 2px' }}>
        <button
          type="button"
          onClick={openCommandPalette}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body"
          style={{ background: 'var(--admin-hover)', color: 'var(--admin-muted)', border: '1px solid var(--admin-border)' }}
          aria-label="Schnellsuche öffnen"
        >
          <span style={{ color: 'var(--admin-muted)' }}>{iconSearch}</span>
          <span className="flex-1 text-left">Suchen…</span>
          <kbd style={{ fontSize: 10, color: 'var(--admin-muted-2)', border: '1px solid var(--admin-border)', borderRadius: 5, padding: '1px 5px' }}>⌘K</kbd>
        </button>
      </div>

      {/* Dashboard (standalone) */}
      <div style={{ padding: '10px 4px 6px' }}>
        <Link
          href="/admin"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-heading font-semibold transition-all mx-1"
          style={isDashboard
            ? { background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)' }
            : { color: 'var(--admin-muted)' }
          }
          onMouseEnter={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = 'var(--admin-text)'; }}
          onMouseLeave={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted)'; }}
        >
          <span style={isDashboard ? { color: 'var(--admin-accent)' } : { color: 'var(--admin-muted-2)' }}>{iconDashboard}</span>
          Dashboard
        </Link>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--admin-border)', margin: '4px 12px' }} />

      {/* Navigation groups — Accordion: es ist immer nur eine Gruppe offen */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <FavoritesSection me={me} pathname={pathname} onNavClick={onNavClick} />
        {me && me.id !== 'legacy-env' && (
          <NavGroupCollapse
            label="Mein Bereich"
            icon={iconUsers}
            items={MEIN_BEREICH_ITEMS}
            matchPaths={GROUP_MATCH.mein}
            storageKey="mein"
            pathname={pathname}
            onNavClick={onNavClick}
            me={me}
            open={openGroup === 'mein'}
            onToggle={() => toggleGroup('mein')}
          />
        )}
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
          label="Kalender & Verfügbarkeit"
          icon={iconCalendar}
          items={KALENDER_ITEMS}
          matchPaths={GROUP_MATCH.kalender}
          storageKey="kalender"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'kalender'}
          onToggle={() => toggleGroup('kalender')}
        />
        <NavGroupCollapse
          label="Verkauf & Reservierung"
          icon={iconCart}
          items={VERKAUF_ITEMS}
          matchPaths={GROUP_MATCH.verkauf}
          storageKey="verkauf"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          open={openGroup === 'verkauf'}
          onToggle={() => toggleGroup('verkauf')}
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
          label="Rabatte & Aktionen"
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
          items={CONTENT_TOP_ITEMS}
          matchPaths={GROUP_MATCH.content}
          storageKey="content"
          pathname={pathname}
          onNavClick={onNavClick}
          me={me}
          hasVisibleChildren={blogVisible || postsVisible || reelsVisible}
          open={openGroup === 'content'}
          onToggle={() => toggleGroup('content')}
        >
          <SubNavCollapse label="Blog" icon={iconBlog} items={BLOG_ITEMS} storageKey="admin_blog_collapsed" active={pathname.startsWith('/admin/blog')} pathname={pathname} onNavClick={onNavClick} me={me} />
          <SubNavCollapse label="Posts" icon={iconSocial} items={POSTS_ITEMS} storageKey="admin_posts_collapsed" active={pathname.startsWith('/admin/social') && !pathname.startsWith('/admin/social/reels')} pathname={pathname} onNavClick={onNavClick} me={me} hideWhenEmpty />
          <SubNavCollapse label="Reels" icon={iconFilm} items={REELS_ITEMS} storageKey="admin_reels_collapsed" active={pathname.startsWith('/admin/social/reels')} pathname={pathname} onNavClick={onNavClick} me={me} hideWhenEmpty />
        </NavGroupCollapse>
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
        <div style={{ height: 1, background: 'var(--admin-border)', margin: '6px 12px' }} />
        <NavSection label="System" items={SYSTEM_ITEMS} pathname={pathname} onNavClick={onNavClick} me={me} />
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 space-y-0.5" style={{ borderTop: '1px solid var(--admin-border)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <NotificationDropdown position="sidebar" />
          <span style={{ color: 'var(--admin-muted-2)', fontSize: 12, fontWeight: 500 }}>Benachrichtigungen</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <span style={{ color: 'var(--admin-muted-2)', fontSize: 12, fontWeight: 500 }}>
            {theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
          </span>
        </div>
        <Link
          href="/"
          onClick={onNavClick}
          className="flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg transition-colors"
          style={{ color: 'var(--admin-muted-2)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted-2)'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Zum Shop
        </Link>
        <button
          onClick={() => { onNavClick?.(); handleLogout(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-body rounded-lg transition-colors text-left"
          style={{ color: 'var(--admin-muted-2)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--admin-danger)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--admin-muted-2)'; }}
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

const iconSun = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
);
const iconMoon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
);
const iconSearch = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
);

/** Öffnet die Command-Palette (Custom-Event; die Palette lauscht darauf). */
function openCommandPalette() {
  window.dispatchEvent(new Event('admin:command-palette'));
}

type AdminTheme = 'dark' | 'light';

function ThemeToggle({ theme, onToggle }: { theme: AdminTheme; onToggle: () => void }) {
  const label = theme === 'dark' ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln';
  return (
    <button
      type="button"
      onClick={onToggle}
      className="p-2 rounded-lg transition-colors shrink-0"
      style={{ color: 'var(--admin-accent)' }}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? iconSun : iconMoon}
    </button>
  );
}

function PageRefreshButton() {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      onClick={() => {
        setSpinning(true);
        window.location.reload();
      }}
      className="p-2 rounded-lg transition-colors shrink-0"
      style={{ color: 'var(--admin-accent)' }}
      aria-label="Seite aktualisieren"
      title="Seite aktualisieren"
    >
      <svg
        className={`w-5 h-5${spinning ? ' animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<MeInfo | null>(null);

  // Admin-Theme (Light/Dark). Default 'dark' (= bisheriges Verhalten). Nach dem
  // Mount aus localStorage laden — vermeidet Hydration-Mismatch (SSR rendert
  // immer 'dark'). Persistenz pro Geraet, konsistent zu allen anderen
  // Admin-UI-Praeferenzen (Sidebar-Gruppen, Ansichtsmodi).
  const [theme, setTheme] = useState<AdminTheme>('dark');
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('admin_theme');
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch { /* empty */ }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: AdminTheme = prev === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem('admin_theme', next); } catch { /* empty */ }
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }, [router]);

  // Identität/Permissions einmal beim Mount laden — NICHT bei jeder Navigation
  // (die Middleware erzwingt Rechte weiterhin serverseitig bei jedem Request;
  // `me` steuert nur die Sidebar-Sichtbarkeit). Spart pro Klick 1 DB-Read +
  // 1 last_used_at-Write.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.user) setMe(d.user as MeInfo); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Druck-/QR-/Scan-Seiten haben ein eigenes Layout (weisser Hintergrund,
  // kein Sidebar/Header) — das Admin-Shell wuerde sie sonst zerquetschen.
  const isStandalone =
    pathname === '/admin/login'
    || pathname.startsWith('/admin/blog')
    || pathname.endsWith('/qr-codes')
    || pathname.startsWith('/admin/scan/');
  const isLoginOrBlog = isStandalone;

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
    <NotificationsProvider>
    <div className="admin-shell min-h-screen flex" data-admin-theme={theme} style={{ background: 'var(--admin-bg)' }}>
    <FeedbackProvider>
      {/* Mobile header with hamburger — respektiert iOS Safe-Area-Top */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-4"
        style={{
          background: 'var(--admin-sidebar-bg)',
          borderBottom: '1px solid var(--admin-border)',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg transition-colors shrink-0"
          style={{ color: 'var(--admin-accent)' }}
          aria-label="Menü öffnen"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/admin" className="ml-3 flex-1 min-w-0 flex items-center gap-2" style={{ textDecoration: 'none' }}>
          <img src="/logo/mark.svg" alt="" aria-hidden="true" width={32} height={22} style={{ height: 22, width: 'auto', flexShrink: 0 }} />
          <span className="font-heading font-black text-base tracking-tight" style={{ color: 'var(--admin-logo-text)' }}>
            cam<span style={{ color: 'var(--admin-accent)' }}>2</span>rent
          </span>
          <span className="hidden sm:inline text-xs font-heading font-semibold tracking-widest uppercase" style={{ color: 'var(--admin-muted-2)' }}>
            Admin
          </span>
        </Link>
        <div className="ml-auto shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className="p-2 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--admin-accent)' }}
            aria-label="Schnellsuche öffnen"
            title="Suchen"
          >
            {iconSearch}
          </button>
          <EnvModeBadge />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <PageRefreshButton />
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
        style={{ background: 'var(--admin-sidebar-bg)', borderRight: '1px solid var(--admin-border)' }}
      >
        {/* Mobile close button */}
        <div className="lg:hidden absolute top-3 right-3 z-10">
          <button
            onClick={closeSidebar}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--admin-muted-2)' }}
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
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </aside>

      {/* Main Content — overflow-x-hidden verhindert Body-Scroll wenn
          eine Unterseite zu breite Elemente hat. pt auf Mobile
          berücksichtigt Safe-Area (Notch). */}
      <main
        className="admin-dark flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0"
        style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}
      >
        {children}
      </main>

      <GlobalErrorToast />
      <AdminCommandPalette me={me} />
    </FeedbackProvider>
    </div>
    </NotificationsProvider>
  );
}
