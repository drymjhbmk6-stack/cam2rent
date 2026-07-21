import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid, ClipboardList, FileText, Truck, Users, Camera, CalendarDays,
  ShoppingCart, Tag, Receipt, PenLine, Home, BarChart3, User, UsersRound, Settings,
  Boxes, Cpu, Layers, Package, Star, MessageSquare, Image as ImageIcon, Gift,
  Percent, BadgePercent, Mail, Newspaper, Landmark, Wallet, FileStack, Calculator,
  Rss, Share2, Clapperboard, Globe, Scale, LineChart, TrendingUp, Send, Bug,
  History, StickyNote, AlertTriangle,
} from 'lucide-react';

/* cam2rent Admin 2.0 — komplette Navigations-Struktur (Menü + Untermenü).
   Leaf = direkter Link (Screens mit In-Page-Tabs). Node mit children = aufklappbar,
   damit alle Unterpunkte im Menü bleiben. `perm` steuert (später) Sichtbarkeit. */

export type PermKey =
  | 'tagesgeschaeft' | 'kunden' | 'katalog' | 'preise' | 'content'
  | 'finanzen' | 'berichte' | 'system' | 'mitarbeiter_verwalten';

export type NavLeaf = {
  label: string;
  href: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: number;
  perm?: PermKey;
};
export type NavNode =
  | NavLeaf
  | { label: string; icon?: LucideIcon; perm?: PermKey; children: NavNode[] };

export type NavGroup = { title: string; items: NavNode[] };

export function isLeaf(n: NavNode): n is NavLeaf {
  return (n as { children?: unknown }).children === undefined;
}

export const DASHBOARD_ITEM: NavLeaf = { label: 'Dashboard', href: '/admin', icon: LayoutGrid, exact: true };

export const NAV: NavGroup[] = [
  {
    title: 'Täglich',
    items: [
      { label: 'Tagesgeschäft', href: '/admin/tagesgeschaeft', icon: ClipboardList, perm: 'tagesgeschaeft', badge: 4 },
      { label: 'Buchungen', href: '/admin/buchungen', icon: FileText, perm: 'tagesgeschaeft' },
      { label: 'Versand & Rückgabe', href: '/admin/versand', icon: Truck, perm: 'tagesgeschaeft', badge: 2 },
      { label: 'Kunden & Kommunikation', href: '/admin/kunden', icon: Users, perm: 'kunden', badge: 1 },
    ],
  },
  {
    title: 'Verwalten',
    items: [
      { label: 'Katalog', href: '/admin/katalog', icon: Camera, perm: 'katalog' },
      { label: 'Verfügbarkeit', href: '/admin/verfuegbarkeit', icon: CalendarDays, perm: 'tagesgeschaeft' },
      { label: 'Verkäufe', href: '/admin/verkauf', icon: ShoppingCart, perm: 'tagesgeschaeft' },
      {
        label: 'Rabatte & Aktionen',
        icon: Tag,
        perm: 'preise',
        children: [
          { label: 'Gutscheine', href: '/admin/gutscheine', icon: Gift, perm: 'preise' },
          { label: 'Rabatte', href: '/admin/rabatte', icon: Percent, perm: 'preise' },
          { label: 'Angebote', href: '/admin/angebote', icon: BadgePercent, perm: 'preise' },
          { label: 'Warenkorb-Erinnerung', href: '/admin/warenkorb-erinnerung', icon: Mail, perm: 'preise' },
          { label: 'Newsletter', href: '/admin/newsletter', icon: Newspaper, perm: 'preise' },
        ],
      },
      {
        label: 'Finanzen',
        icon: Receipt,
        perm: 'finanzen',
        children: [
          { label: 'Buchhaltung', href: '/admin/buchhaltung', icon: Landmark, perm: 'finanzen' },
          { label: 'Anlagen', href: '/admin/anlagen', icon: Wallet, perm: 'finanzen' },
          { label: 'Einkauf', href: '/admin/einkauf', icon: ShoppingCart, perm: 'finanzen' },
          { label: 'Belege', href: '/admin/buchhaltung/belege', icon: FileStack, perm: 'finanzen' },
          { label: 'WBW-Konfiguration', href: '/admin/buchhaltung/wbw-config', icon: Calculator, perm: 'finanzen' },
        ],
      },
    ],
  },
  {
    title: 'Wachstum',
    items: [
      {
        label: 'Content',
        icon: PenLine,
        perm: 'content',
        children: [
          {
            label: 'Blog',
            icon: Rss,
            perm: 'content',
            children: [
              { label: 'Blog-Dashboard', href: '/admin/blog', icon: LayoutGrid, exact: true, perm: 'content' },
              { label: 'Artikel', href: '/admin/blog/artikel', icon: FileText, perm: 'content' },
              { label: 'Redaktionsplan', href: '/admin/blog/zeitplan', icon: CalendarDays, perm: 'content' },
              { label: 'KI-Themen', href: '/admin/blog/themen', icon: Star, perm: 'content' },
              { label: 'Kommentare', href: '/admin/blog/kommentare', icon: MessageSquare, perm: 'content' },
              { label: 'Mediathek', href: '/admin/blog/mediathek', icon: ImageIcon, perm: 'content' },
              { label: 'Einstellungen', href: '/admin/content/einstellungen?tab=blog', icon: Settings, perm: 'content' },
            ],
          },
          {
            label: 'Social',
            icon: Share2,
            perm: 'content',
            children: [
              { label: 'Posts', href: '/admin/social/posts', icon: FileText, perm: 'content' },
              { label: 'Neuer Post', href: '/admin/social/neu', icon: PenLine, perm: 'content' },
              { label: 'KI-Plan', href: '/admin/social/plan', icon: Star, perm: 'content' },
              { label: 'Redaktionsplan', href: '/admin/social/zeitplan', icon: CalendarDays, perm: 'content' },
              { label: 'Themen', href: '/admin/social/themen', icon: Layers, perm: 'content' },
              { label: 'Vorlagen', href: '/admin/social/vorlagen', icon: FileStack, perm: 'content' },
              { label: 'Einstellungen', href: '/admin/content/einstellungen?tab=social', icon: Settings, perm: 'content' },
            ],
          },
          {
            label: 'Reels',
            icon: Clapperboard,
            perm: 'content',
            children: [
              { label: 'Übersicht', href: '/admin/social/reels', icon: LayoutGrid, exact: true, perm: 'content' },
              { label: 'Neues Reel', href: '/admin/social/reels/neu', icon: PenLine, perm: 'content' },
              { label: 'Redaktionsplan', href: '/admin/social/reels/zeitplan', icon: CalendarDays, perm: 'content' },
              { label: 'Vorlagen', href: '/admin/social/reels/vorlagen', icon: FileStack, perm: 'content' },
              { label: 'Einstellungen', href: '/admin/social/reels/einstellungen', icon: Settings, perm: 'content' },
            ],
          },
        ],
      },
      {
        label: 'Webseite',
        icon: Home,
        perm: 'content',
        children: [
          { label: 'Startseite', href: '/admin/startseite', icon: Globe, perm: 'content' },
          { label: 'Rechtstexte', href: '/admin/legal', icon: Scale, perm: 'system' },
        ],
      },
      {
        label: 'Berichte',
        icon: BarChart3,
        perm: 'berichte',
        children: [
          { label: 'Statistiken', href: '/admin/analytics', icon: LineChart, perm: 'berichte' },
          { label: 'Buchungsinteresse', href: '/admin/buchungsinteresse', icon: TrendingUp, perm: 'berichte' },
          { label: 'E-Mail-Vorlagen', href: '/admin/emails/vorlagen', icon: FileStack, perm: 'berichte' },
          { label: 'E-Mail-Protokoll', href: '/admin/emails', icon: Send, perm: 'berichte', exact: true },
          { label: 'Beta-Feedback', href: '/admin/beta-feedback', icon: MessageSquare, perm: 'berichte' },
          { label: 'Aktivitätsprotokoll', href: '/admin/aktivitaetsprotokoll', icon: History, perm: 'berichte' },
          { label: 'Client-Fehler', href: '/admin/client-errors', icon: Bug, perm: 'berichte' },
          { label: 'Verfügbarkeits-Alerts', href: '/admin/verfuegbarkeit-alerts', icon: AlertTriangle, perm: 'tagesgeschaeft' },
        ],
      },
      {
        label: 'Mein Bereich',
        icon: User,
        children: [
          { label: 'Meine Notizen', href: '/admin/mein/notizen', icon: StickyNote },
          { label: 'Mein Kalender', href: '/admin/mein/kalender', icon: CalendarDays },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Mitarbeiter', href: '/admin/einstellungen/mitarbeiter', icon: UsersRound, perm: 'mitarbeiter_verwalten' },
      { label: 'Einstellungen', href: '/admin/einstellungen', icon: Settings, perm: 'system' },
    ],
  },
];

/* Mobile Bottom-Tab-Bar — die 4 wichtigsten + Scan (zentral hervorgehoben). */
export const BOTTOM_TABS: { label: string; href: string; icon: LucideIcon; scan?: boolean }[] = [
  { label: 'Heute', href: '/admin/tagesgeschaeft', icon: ClipboardList },
  { label: 'Buchungen', href: '/admin/buchungen', icon: FileText },
  { label: 'Scan', href: '/admin/scan', icon: Boxes, scan: true },
  { label: 'Inventar', href: '/admin/katalog?tab=inventar', icon: Package },
  { label: 'Firmware', href: '/admin/katalog?tab=firmware', icon: Cpu },
];
