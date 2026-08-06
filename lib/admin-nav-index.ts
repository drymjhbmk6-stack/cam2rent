/**
 * Flache Navigations-Liste für die Admin-Command-Palette (Cmd+K, Schritt 4).
 *
 * Reine Daten (kein JSX) → von der Palette importierbar ohne Zirkular-Import in
 * den Shell (`AdminLayoutClient`). Spiegelt die Sidebar-Ziele; Icons/Gruppen-
 * Aufklapp-Logik bleiben in der Sidebar. `perm` steuert die Sichtbarkeit (gleiche
 * Semantik wie `canSee` in der Sidebar: kein perm = immer sichtbar, Owner sieht
 * alles). `keywords` verbessern die Fuzzy-Suche (Synonyme/Umlaute).
 *
 * ⚠️ Bei neuen Admin-Seiten hier UND in der Sidebar ergänzen. Wird in Schritt 9
 * (Sidebar-Refactor) zu einer gemeinsamen Quelle zusammengeführt.
 */

export type AdminNavPerm =
  | 'tagesgeschaeft' | 'kunden' | 'katalog' | 'preise'
  | 'content' | 'finanzen' | 'berichte' | 'system' | 'mitarbeiter_verwalten';

export interface AdminNavEntry {
  label: string;
  href: string;
  group: string;
  perm?: AdminNavPerm;
  keywords?: string;
  /** Aktion (z.B. „Neue …") — in der Palette optisch als Schnell-Aktion markiert. */
  action?: boolean;
}

export const ADMIN_NAV_INDEX: AdminNavEntry[] = [
  { label: 'Dashboard', href: '/admin', group: 'Allgemein', keywords: 'start übersicht home' },

  // Mein Bereich
  { label: 'Meine Notizen', href: '/admin/mein/notizen', group: 'Mein Bereich', keywords: 'todo aufgaben' },
  { label: 'Mein Kalender', href: '/admin/mein/kalender', group: 'Mein Bereich', keywords: 'termine' },

  // Tagesgeschäft
  { label: 'Buchungen', href: '/admin/buchungen', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'orders bestellungen miete' },
  { label: 'Neue manuelle Buchung', href: '/admin/buchungen/neu', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', action: true, keywords: 'anlegen erstellen order' },
  { label: 'Reservierungen (48h)', href: '/admin/reservierungen', group: 'Tagesgeschäft', perm: 'tagesgeschaeft' },
  { label: 'Preisrechner', href: '/admin/preisrechner', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'angebot quote' },
  { label: 'Verkäufe', href: '/admin/verkauf', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'verkauf' },
  { label: 'Kalender', href: '/admin/verfuegbarkeit', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'verfügbarkeit gantt' },
  { label: 'Auftragskalender', href: '/admin/auftragskalender', group: 'Tagesgeschäft', perm: 'tagesgeschaeft' },
  { label: 'Versand & Rückgabe', href: '/admin/retouren', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'retouren versand rückgabe etikett' },
  { label: 'Paketverfolgung', href: '/admin/sendungen', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'tracking sendungen dhl dpd' },
  { label: 'Verfügbarkeits-Alerts', href: '/admin/verfuegbarkeit-alerts', group: 'Tagesgeschäft', perm: 'tagesgeschaeft' },
  { label: 'Schadensmeldungen', href: '/admin/schaeden', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'schaden damage' },

  // Kunden & Kommunikation
  { label: 'Kunden', href: '/admin/kunden', group: 'Kunden', perm: 'kunden', keywords: 'customers kundschaft' },
  { label: 'Kundenanfragen', href: '/admin/nachrichten', group: 'Kunden', perm: 'kunden', keywords: 'nachrichten messages inbox e-mail' },
  { label: 'Warteliste', href: '/admin/warteliste', group: 'Kunden', perm: 'kunden' },
  { label: 'Kundenmaterial', href: '/admin/kunden-material', group: 'Kunden', perm: 'kunden', keywords: 'ugc fotos' },
  { label: 'Produktbewertungen', href: '/admin/bewertungen', group: 'Kunden', perm: 'kunden', keywords: 'reviews sterne' },

  // Katalog
  { label: 'Kameras', href: '/admin/preise/kameras', group: 'Katalog', perm: 'katalog', keywords: 'produkte gopro dji insta360' },
  { label: 'Sets', href: '/admin/sets', group: 'Katalog', perm: 'katalog', keywords: 'bundle' },
  { label: 'Zubehör', href: '/admin/zubehoer', group: 'Katalog', perm: 'katalog', keywords: 'akku karte stativ' },
  { label: 'Inventar', href: '/admin/inventar', group: 'Katalog', perm: 'katalog', keywords: 'seriennummer exemplar bestand' },
  { label: 'Verbrauch', href: '/admin/verbrauch', group: 'Katalog', perm: 'katalog' },
  { label: 'Firmware-Updates', href: '/admin/firmware', group: 'Katalog', perm: 'katalog' },

  // Rabatte & Aktionen
  { label: 'Gutscheine', href: '/admin/gutscheine', group: 'Rabatte & Aktionen', perm: 'preise', keywords: 'coupon code' },
  { label: 'Rabatte', href: '/admin/rabatte', group: 'Rabatte & Aktionen', perm: 'preise' },
  { label: 'Angebote', href: '/admin/angebote', group: 'Rabatte & Aktionen', perm: 'preise' },
  { label: 'Warenkorb-Erinnerung', href: '/admin/warenkorb-erinnerung', group: 'Rabatte & Aktionen', perm: 'preise' },
  { label: 'Newsletter', href: '/admin/newsletter', group: 'Rabatte & Aktionen', perm: 'preise' },

  // Content
  { label: 'Startseite', href: '/admin/startseite', group: 'Content', perm: 'content' },
  { label: 'Blog-Dashboard', href: '/admin/blog', group: 'Content', perm: 'content' },
  { label: 'Blog-Artikel', href: '/admin/blog/artikel', group: 'Content', perm: 'content' },
  { label: 'Redaktionsplan (Blog)', href: '/admin/blog/zeitplan', group: 'Content', perm: 'content' },
  { label: 'Social Posts', href: '/admin/social/posts', group: 'Content', perm: 'content' },
  { label: 'Neuer Post', href: '/admin/social/neu', group: 'Content', perm: 'content', action: true },
  { label: 'Reels', href: '/admin/social/reels', group: 'Content', perm: 'content' },

  // Finanzen
  { label: 'Buchhaltung', href: '/admin/buchhaltung', group: 'Finanzen', perm: 'finanzen', keywords: 'rechnungen euer datev' },
  { label: 'Belege', href: '/admin/buchhaltung/belege', group: 'Finanzen', perm: 'finanzen' },
  { label: 'Anlagen', href: '/admin/buchhaltung/anlagen', group: 'Finanzen', perm: 'finanzen', keywords: 'afa anlagenverzeichnis' },

  // Berichte
  { label: 'Statistiken', href: '/admin/analytics', group: 'Berichte', perm: 'berichte', keywords: 'analytics besucher' },
  { label: 'Buchungsinteresse', href: '/admin/buchungsinteresse', group: 'Berichte', perm: 'berichte' },
  { label: 'E-Mail-Vorlagen', href: '/admin/emails/vorlagen', group: 'Berichte', perm: 'berichte' },
  { label: 'E-Mail-Protokoll', href: '/admin/emails', group: 'Berichte', perm: 'berichte' },
  { label: 'Beta-Feedback', href: '/admin/beta-feedback', group: 'Berichte', perm: 'berichte' },
  { label: 'Admin-Protokoll', href: '/admin/aktivitaetsprotokoll', group: 'Berichte', perm: 'berichte', keywords: 'audit log' },
  { label: 'Frontend-Fehler', href: '/admin/client-errors', group: 'Berichte', perm: 'berichte' },

  // System
  { label: 'Mitarbeiter', href: '/admin/einstellungen/mitarbeiter', group: 'System', perm: 'mitarbeiter_verwalten' },
  { label: 'Rechtstexte', href: '/admin/legal', group: 'System', perm: 'system' },
  { label: 'Einstellungen', href: '/admin/einstellungen', group: 'System', perm: 'system' },
];
