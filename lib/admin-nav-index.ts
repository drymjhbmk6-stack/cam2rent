/**
 * Flache Navigations-Liste für die Admin-Command-Palette (Cmd+K, Schritt 4).
 *
 * Reine Daten (kein JSX) → von der Palette importierbar ohne Zirkular-Import in
 * den Shell (`AdminLayoutClient`). Spiegelt die Sidebar-Ziele; Icons/Gruppen-
 * Aufklapp-Logik bleiben in der Sidebar. `perm` steuert die Sichtbarkeit (gleiche
 * Semantik wie `canSee` in der Sidebar: kein perm = immer sichtbar, Owner sieht
 * alles). `keywords` verbessern die Fuzzy-Suche (Synonyme/Umlaute).
 *
 * ⚠️ Bei neuen Admin-Seiten hier UND in der Sidebar (`AdminLayoutClient.tsx`)
 * ergänzen — Gruppen-Labels hier spiegeln die Sidebar-Gruppen 1:1. Ziel: die
 * Palette findet jede Sidebar-Seite.
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

  // Privat (nur Owner — die Seite lehnt Mitarbeiter serverseitig ab)
  { label: 'Projektablage', href: '/admin/projektablage', group: 'Privat', keywords: 'dateien upload projekt code archiv zip ordner stand backup' },

  // Tagesgeschäft
  { label: 'Tagesgeschäft-Übersicht', href: '/admin/tagesgeschaeft', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'übersicht start' },
  { label: 'Buchungen', href: '/admin/buchungen', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'orders bestellungen miete' },
  { label: 'Neue manuelle Buchung', href: '/admin/buchungen/neu', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', action: true, keywords: 'anlegen erstellen order' },
  { label: 'Versand & Rückgabe', href: '/admin/retouren', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'retouren versand rückgabe etikett packen' },
  { label: 'Paketverfolgung', href: '/admin/sendungen', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'tracking sendungen dhl dpd' },
  { label: 'Versand-Werkzeuge (Packliste/Lieferschein)', href: '/admin/versand', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'versand packliste lieferschein als versendet markieren' },
  { label: 'Schadensmeldungen', href: '/admin/schaeden', group: 'Tagesgeschäft', perm: 'tagesgeschaeft', keywords: 'schaden damage' },

  // Kalender & Verfügbarkeit
  { label: 'Kalender', href: '/admin/verfuegbarkeit', group: 'Kalender & Verfügbarkeit', perm: 'tagesgeschaeft', keywords: 'verfügbarkeit gantt belegung' },
  { label: 'Auftragskalender', href: '/admin/auftragskalender', group: 'Kalender & Verfügbarkeit', perm: 'tagesgeschaeft', keywords: 'termine planung' },
  { label: 'Verfügbarkeits-Alerts', href: '/admin/verfuegbarkeit-alerts', group: 'Kalender & Verfügbarkeit', perm: 'tagesgeschaeft', keywords: 'warnung ausgebucht' },

  // Verkauf & Reservierung
  { label: 'Preisrechner', href: '/admin/preisrechner', group: 'Verkauf & Reservierung', perm: 'tagesgeschaeft', keywords: 'angebot quote preis' },
  { label: 'Reservierungen (48h)', href: '/admin/reservierungen', group: 'Verkauf & Reservierung', perm: 'tagesgeschaeft', keywords: 'reservierung hold' },
  { label: 'Verkäufe', href: '/admin/verkauf', group: 'Verkauf & Reservierung', perm: 'tagesgeschaeft', keywords: 'verkauf verkaufen' },
  { label: 'Neuer Verkauf', href: '/admin/verkauf/neu', group: 'Verkauf & Reservierung', perm: 'tagesgeschaeft', action: true, keywords: 'verkaufen anlegen' },

  // Kunden
  { label: 'Kunden-Übersicht', href: '/admin/kunden-uebersicht', group: 'Kunden', perm: 'kunden', keywords: 'übersicht' },
  { label: 'Kunden', href: '/admin/kunden', group: 'Kunden', perm: 'kunden', keywords: 'customers kundschaft' },
  { label: 'Kundenanfragen', href: '/admin/nachrichten', group: 'Kunden', perm: 'kunden', keywords: 'nachrichten messages inbox e-mail' },
  { label: 'Warteliste', href: '/admin/warteliste', group: 'Kunden', perm: 'kunden' },
  { label: 'Kundenmaterial', href: '/admin/kunden-material', group: 'Kunden', perm: 'kunden', keywords: 'ugc fotos' },
  { label: 'Produktbewertungen', href: '/admin/bewertungen', group: 'Kunden', perm: 'kunden', keywords: 'reviews sterne' },

  // Katalog
  { label: 'Kameras', href: '/admin/preise/kameras', group: 'Katalog', perm: 'katalog', keywords: 'produkte gopro dji insta360 preise' },
  { label: 'Sets', href: '/admin/sets', group: 'Katalog', perm: 'katalog', keywords: 'bundle' },
  { label: 'Zubehör', href: '/admin/zubehoer', group: 'Katalog', perm: 'katalog', keywords: 'akku karte stativ' },
  { label: 'Inventar', href: '/admin/inventar', group: 'Katalog', perm: 'katalog', keywords: 'seriennummer exemplar bestand' },
  { label: 'Verbrauch', href: '/admin/verbrauch', group: 'Katalog', perm: 'katalog', keywords: 'verbrauchsmaterial' },
  { label: 'Firmware-Updates', href: '/admin/firmware', group: 'Katalog', perm: 'katalog', keywords: 'firmware update' },

  // Marketing & Aktionen
  { label: 'Gutscheine', href: '/admin/gutscheine', group: 'Marketing & Aktionen', perm: 'preise', keywords: 'coupon code' },
  { label: 'Rabatte', href: '/admin/rabatte', group: 'Marketing & Aktionen', perm: 'preise', keywords: 'discount frühbucher mengenrabatt' },
  { label: 'Angebote', href: '/admin/angebote', group: 'Marketing & Aktionen', perm: 'preise', keywords: 'bündel aktion' },
  { label: 'Warenkorb-Erinnerung', href: '/admin/warenkorb-erinnerung', group: 'Marketing & Aktionen', perm: 'preise', keywords: 'abandoned cart' },
  { label: 'Newsletter', href: '/admin/newsletter', group: 'Marketing & Aktionen', perm: 'preise', keywords: 'newsletter abonnenten' },

  // Content
  { label: 'Startseite', href: '/admin/startseite', group: 'Content', perm: 'content', keywords: 'homepage hero inhalte' },
  { label: 'Rechtstexte', href: '/admin/legal', group: 'Content', perm: 'system', keywords: 'agb datenschutz impressum widerruf' },
  { label: 'Blog-Dashboard', href: '/admin/blog', group: 'Content', perm: 'content', keywords: 'blog' },
  { label: 'Blog-Artikel', href: '/admin/blog/artikel', group: 'Content', perm: 'content', keywords: 'artikel post' },
  { label: 'Redaktionsplan (Blog)', href: '/admin/blog/zeitplan', group: 'Content', perm: 'content', keywords: 'redaktionsplan zeitplan' },
  { label: 'KI-Themen (Blog)', href: '/admin/blog/themen', group: 'Content', perm: 'content', keywords: 'themen ki' },
  { label: 'Blog-Kommentare', href: '/admin/blog/kommentare', group: 'Content', perm: 'content', keywords: 'kommentare' },
  { label: 'Blog-Mediathek', href: '/admin/blog/mediathek', group: 'Content', perm: 'content', keywords: 'mediathek bilder' },
  { label: 'Social-Übersicht', href: '/admin/social', group: 'Content', perm: 'content', keywords: 'social media facebook instagram' },
  { label: 'Social Posts', href: '/admin/social/posts', group: 'Content', perm: 'content', keywords: 'posts' },
  { label: 'Neuer Post', href: '/admin/social/neu', group: 'Content', perm: 'content', action: true, keywords: 'post erstellen' },
  { label: 'Social Themen & Serien', href: '/admin/social/themen', group: 'Content', perm: 'content', keywords: 'themen serien' },
  { label: 'Social Redaktionsplan', href: '/admin/social/zeitplan', group: 'Content', perm: 'content', keywords: 'zeitplan redaktionsplan kalender' },
  { label: 'Wiederkehrende Social-Zeitpläne', href: '/admin/social/redaktionsplan', group: 'Content', perm: 'content', keywords: 'wiederkehrend serie täglich wöchentlich zeitplan' },
  { label: 'Social KI-Plan (Bulk)', href: '/admin/social/plan', group: 'Content', perm: 'content', keywords: 'ki plan bulk' },
  { label: 'Social Vorlagen', href: '/admin/social/vorlagen', group: 'Content', perm: 'content', keywords: 'vorlagen templates' },
  { label: 'Reels', href: '/admin/social/reels', group: 'Content', perm: 'content', keywords: 'reels video' },
  { label: 'Neues Reel', href: '/admin/social/reels/neu', group: 'Content', perm: 'content', action: true, keywords: 'reel erstellen' },
  { label: 'Reels-Redaktionsplan', href: '/admin/social/reels/zeitplan', group: 'Content', perm: 'content', keywords: 'reels zeitplan' },
  { label: 'Reels-Vorlagen', href: '/admin/social/reels/vorlagen', group: 'Content', perm: 'content', keywords: 'reels vorlagen' },
  { label: 'Content-Einstellungen', href: '/admin/content/einstellungen?tab=blog', group: 'Content', perm: 'content', keywords: 'blog-ki social-ki einstellungen' },

  // Finanzen
  { label: 'Buchhaltung', href: '/admin/buchhaltung', group: 'Finanzen', perm: 'finanzen', keywords: 'rechnungen euer datev cockpit' },
  { label: 'Belege', href: '/admin/buchhaltung/belege', group: 'Finanzen', perm: 'finanzen', keywords: 'belege rechnung eingang' },
  { label: 'Anlagen (Steuersicht)', href: '/admin/buchhaltung/anlagen', group: 'Finanzen', perm: 'finanzen', keywords: 'afa steuersicht abschreibung' },
  { label: 'Anlagenverzeichnis (Zeitwert)', href: '/admin/anlagen', group: 'Finanzen', perm: 'finanzen', keywords: 'anlagenverzeichnis wbw wiederbeschaffung zeitwert' },
  { label: 'Einkauf', href: '/admin/einkauf', group: 'Finanzen', perm: 'finanzen', keywords: 'einkauf ocr rechnung upload' },

  // Berichte
  { label: 'Statistiken', href: '/admin/analytics', group: 'Berichte', perm: 'berichte', keywords: 'analytics besucher' },
  { label: 'Buchungsinteresse', href: '/admin/buchungsinteresse', group: 'Berichte', perm: 'berichte', keywords: 'nachfrage interesse' },
  { label: 'E-Mail-Vorlagen', href: '/admin/emails/vorlagen', group: 'Berichte', perm: 'berichte', keywords: 'e-mail vorlagen templates' },
  { label: 'E-Mail-Protokoll', href: '/admin/emails', group: 'Berichte', perm: 'berichte', keywords: 'e-mail protokoll log' },
  { label: 'Beta-Feedback', href: '/admin/beta-feedback', group: 'Berichte', perm: 'berichte', keywords: 'feedback' },
  { label: 'Admin-Protokoll', href: '/admin/aktivitaetsprotokoll', group: 'Berichte', perm: 'berichte', keywords: 'audit log aktivität' },
  { label: 'Frontend-Fehler', href: '/admin/client-errors', group: 'Berichte', perm: 'berichte', keywords: 'fehler errors' },

  // System
  { label: 'Mitarbeiter', href: '/admin/einstellungen/mitarbeiter', group: 'System', perm: 'mitarbeiter_verwalten', keywords: 'mitarbeiter team rechte' },
  { label: 'Einstellungen', href: '/admin/einstellungen', group: 'System', perm: 'system', keywords: 'einstellungen settings' },
];
