# cam2rent.de — Claude Code Instructions

## Projekt
Action-Cam Verleih-Shop. Next.js 15 App Router, TypeScript, Tailwind CSS.
Lokaler Pfad: `C:\Cam2Rent\cam2rent`
GitHub: drymjhbmk6-stack/cam2rent (master)
Server: Hetzner CX23 (178.104.117.135) + Coolify → test.cam2rent.de

## Sprache
Alle UI-Texte, Kommentare und Kommunikation auf **Deutsch**.

## Git-Workflow
Immer direkt auf **`master`** committen und pushen. Keine Feature-Branches verwenden.

## Wichtige Regeln

### Haftungsschutz — NIEMALS "Versicherung" sagen
Die Haftungsoptionen (15 € Standard / 25 € Premium) dürfen NICHT als "Versicherung", "versichert" oder "Vollversichert" bezeichnet werden.
Immer verwenden: "Haftungsschutz", "Haftungsbegrenzung", "Haftungsoption", "abgesichert".
**Warum:** cam2rent ist kein Versicherungsunternehmen. Die Prämien bilden ein eigenes Reparaturdepot.

### Expressversand ist immer kostenpflichtig
Expressversand kostet immer 12,99 € — auch wenn der Gratis-Versand-Schwellwert erreicht ist.
In `data/shipping.ts` → `calcShipping()`: Express-Zweig prüft NICHT den `freeShippingThreshold`.

### Vor jedem Push: TypeScript + ESLint prüfen
`npx tsc --noEmit` UND `npx next lint` ausführen. Erst pushen wenn 0 Errors.
`npx next build` funktioniert in der Cloud-Umgebung NICHT (kein Google Fonts Zugang).

## Tech-Stack
- Next.js 15.2.4 (App Router, output: 'standalone')
- TypeScript
- Tailwind CSS (Primärfarbe: #FF5C00, Dark: #0A0A0A)
- Fonts: Sora (Headings) + DM Sans (Body)
- Supabase (Auth, DB, Storage)
- Stripe (Payments + Kaution Pre-Auth)
- Resend (E-Mails)
- @react-pdf/renderer (Rechnungen, Mietverträge)
- react-markdown (Produktbeschreibungen im Admin + Detailseite)
- react-day-picker v8 + date-fns (--legacy-peer-deps)
- Docker + Coolify Deployment

## Architektur-Übersicht (Stand 2026-04-07)

### Datenquellen — ALLES aus DB, keine statischen Fallbacks
- **Kameras:** `admin_config.products` → `getProducts()` (lib/get-products.ts) → `/api/products` → `ProductsProvider` + `useProducts()`
- **Zubehör:** `accessories` Tabelle → `getAccessories()` (lib/get-accessories.ts) → `/api/accessories` → `AccessoriesProvider` + `useAccessories()`
- **Sets:** `sets` Tabelle → `/api/sets`
- **Bilder:** Kommen über ProductsProvider (kein eigener API-Call mehr)
- **Statische Dateien** (`data/products.ts`, `data/accessories.ts`, `data/sets.ts`) enthalten nur noch **Typ-Definitionen** und **Hilfsfunktionen** (`getPriceForDays`, `getAccessoryPrice`, `getMergedSpecs`), KEINE Daten als Fallback.

### Buchungsflow
5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)

### Kalender-Logik (Versand)
- **Startdatum:** Keine Sonn-/Feiertagssperre — Paket wird vorher von cam2rent verschickt. Nur 3 Tage Vorlaufzeit.
- **Enddatum:** Gesperrt wenn **Folgetag** Sonntag oder Feiertag ist (Kunde muss am nächsten Tag Paket abgeben).
- **Puffertage:** In `admin_settings.booking_buffer_days` konfigurierbar (versand_before/after, abholung_before/after).
- **Tooltips:** Gesperrte Tage zeigen Grund beim Hover.
- Startdatum wird immer blau hervorgehoben + Anzeige unter Kalender.

### Admin-Sidebar Struktur
- **Produkte & Katalog:** Kameras, Sets, Zubehör, Verfügbarkeit
- **Bestellungen:** Buchungen, Neue Buchung, Versand & Labels, Retouren, Schäden
- **Kunden:** Kundenliste, Nachrichten, Bewertungen
- **Marketing & Preise:** Gutscheine, Rabatte, Shop Updater, Blog
- **Finanzen & Daten:** Buchhaltung, Analytics, Aktivitätsprotokoll, Einkauf

### Dynamische Admin-Dropdowns
Alle Dropdowns laden aus `admin_settings` und können neue Einträge hinzufügen:
- **Marken:** `camera_brands` (DynamicSelect via BrandSelect)
- **Zubehör-Kategorien:** `accessory_categories` (DynamicSelect)
- **Set-Badges:** `set_badges` (in Sets-Seite)
- **Spec-Definitionen:** `spec_definitions` (SpecDefinitionsManager in Einstellungen)

### Technische Daten (Specs)
- Spec-Typen werden in `/admin/einstellungen` → "Technische Daten" verwaltet (Name, Icon, Einheit)
- Kamera-Editor: Dropdown wählt Spec → Name+Icon+Einheit automatisch, nur Wert eingeben
- Shop-Filter `/kameras`: Ausklappbar, dynamische Specs aus DB
- `getMergedSpecs()` bevorzugt `product.adminSpecs`, filtert leere Werte raus

### Verfügbarkeit
- 3 Tabs: Kameras, Sets, Zubehör
- Kameras aus `useProducts()` (DB), gelöschte verschwinden sofort
- Availability-API berücksichtigt Puffertage + Viewer delivery_mode

### Kundenkonto
`/app/konto/` mit horizontaler Tab-Leiste

### Preise
30-Tage-Preistabelle pro Produkt + Formel für 31+ Tage, alles in admin_config

### Kaution & Haftungsschutz
- Gegenseitig ausschließend pro Produkt
- Globaler Modus in `admin_settings.deposit_mode`: 'kaution' | 'haftung' (kein 'both' mehr)
- Haftungsschutz-Preise gestaffelt: Basispreis (1-7 Tage), +Aufschlag pro weitere Woche
- Standard: 15€ Basis +5€/Woche, Premium: 25€ Basis +10€/Woche
- Kamera-Editor zeigt nur relevante Optionen basierend auf globalem Modus

### next/image
- ProductCard + ProductImageGallery nutzen `next/image` (WebP, Lazy Loading)
- `next.config.ts`: Supabase + cam2rent.de Domains für Bilder erlaubt

## Steuer
Steuer-Modus umschaltbar im Admin (/admin/einstellungen):
- `admin_settings.tax_mode`: 'kleinunternehmer' (default) oder 'regelbesteuerung'
- API: GET /api/tax-config → { taxMode, taxRate, ustId }
- Preise sind immer Bruttopreise, MwSt wird nur herausgerechnet bei Regelbesteuerung

## Buchungsverlängerung
- Stripe Redirect-Flow (nicht in-Modal): Payment → Redirect zu /konto/buchungen?extend_confirm=1 → confirm-extension API
- Extension-Context wird in sessionStorage gespeichert ('cam2rent_extension')

## Kunden-Features
- **Kamera-Vergleich:** `/vergleich?ids=1,2,3` — CompareProvider Context, CompareBar (sticky unten), max 3 Produkte
- **Kamera-Finder:** `/kamera-finder` — 5-Fragen-Assistent mit Score-basiertem Produkt-Matching
- **Set-Konfigurator:** `/set-konfigurator` — 3-Step Builder (Kamera→Zubehör→Zusammenfassung), Set-Rabatt 10%/15%
- **Dark/Light Mode:** ThemeProvider mit localStorage Persistenz, Tailwind `darkMode: 'class'`, Toggle in Navbar

## Offene Punkte
- Google Reviews: User muss Google Place ID + API Key liefern
- SQL-Migration `supabase-zubehoer-verfuegbarkeit.sql` ist erledigt (verschoben in `erledigte supabase/`)
- Bestehende 6 Kameras brauchen Admin-Specs (Technische Daten im Editor anlegen)
