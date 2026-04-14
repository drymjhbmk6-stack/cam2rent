# cam2rent.de — Claude Code Instructions

## Projekt
Action-Cam Verleih-Shop. Next.js 15 App Router, TypeScript, Tailwind CSS.
Lokaler Pfad: `C:\Cam2Rent\cam2rent`
GitHub: drymjhbmk6-stack/cam2rent (master)
Server: Hetzner CX23 (178.104.117.135) + Coolify → test.cam2rent.de

## Sprache
Alle UI-Texte, Kommentare und Kommunikation auf **Deutsch**.
**Umlaute:** Immer ä/ö/ü verwenden, NIEMALS ae/oe/ue in UI-Texten.

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
ESLint + TypeScript werden auf dem Server beim Build geskippt (RAM-Limit CX23).

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
- Anthropic Claude API (Blog-KI-Generierung)
- OpenAI DALL-E 3 (Blog-Bildgenerierung)

## Architektur-Übersicht (Stand 2026-04-14)

### Datenquellen — ALLES aus DB, keine statischen Fallbacks
- **Kameras:** `admin_config.products` → `getProducts()` (lib/get-products.ts) → `/api/products` → `ProductsProvider` + `useProducts()`
- **Zubehör:** `accessories` Tabelle → `getAccessories()` (lib/get-accessories.ts) → `/api/accessories` → `AccessoriesProvider` + `useAccessories()`
- **Sets:** `sets` Tabelle → `/api/sets`
- **Bilder:** Kommen über ProductsProvider (kein eigener API-Call mehr)
- **Statische Dateien** (`data/products.ts`, `data/accessories.ts`, `data/sets.ts`) enthalten nur noch **Typ-Definitionen** und **Hilfsfunktionen** (`getPriceForDays`, `getAccessoryPrice`, `getMergedSpecs`), KEINE Daten als Fallback.

### Zentralisierte Systeme

#### Brand-Farben-System (dynamisch aus DB)
- **`lib/brand-colors.ts`**: `getBrandStyle(brand, colors?)` → `{ color, bg, border }` inline Styles
- **`hooks/useBrandColors.ts`**: Hook lädt Farben aus `admin_settings` (key: `brand_colors`), cached
- **`components/BrandBadge.tsx`**: Wiederverwendbare Badge-Komponente
- **`components/admin/BrandColorManager.tsx`**: Ausklappbare Karte auf `/admin/preise/kameras` — Marken hinzufügen/löschen + Farben zuweisen (10 Presets + Color-Picker + Hex)
- **Speicherung:** `admin_settings.camera_brands` (Array) + `admin_settings.brand_colors` (Record<string, hex>)
- **Verwendet in:** ProductCard, ProductImageGallery, CompareBar, ProductPreview, alle Admin-Seiten (Kameras, Sets, Zubehör, Verfügbarkeit), Buchungsprozess, Set-Konfigurator, Vergleich, Favoriten

#### Business-Daten (BUSINESS Config)
- **`lib/business-config.ts`**: Zentrale Geschäftsdaten als Proxy-Objekt
- **Felder:** owner, street, zip, city, email, emailKontakt, phone, domain, url, iban, ibanFormatted, bic, bankName, paypalMe
- **Berechnete Properties:** fullAddress, addressLine, whatsappUrl, testUrl, paypalMeUrl(amount), tax.hinweis, tax.hinweisKurz, shipping.*, cancellation.*
- **Verwendung:** Invoice-Templates, AGB, Impressum, Stornierung, Email-Services, Vertrag-PDFs
- **DB-Override:** Kann aus `admin_settings.business_config` geladen werden via `setBusinessOverride()`

#### Format-Utilities
- **`lib/format-utils.ts`**: Zentrale Datum/Preis-Formatierung
- **Funktionen:** `fmtEuro()`, `formatCurrency()`, `fmtDate()`, `fmtDateShort()`, `fmtDateLong()`, `fmtDateTime()`, `fmtDateTimeShort()`, `isoToDE()`
- **Ersetzt** ~40 duplizierte lokale Funktionen in Admin/Kunden/API-Dateien

#### PriceInput-Komponente
- **`components/admin/PriceInput.tsx`**: Ersetzt `<input type="number">` in Admin-Preisfeldern
- **Features:** Komma als Dezimaltrennzeichen, 0 löschbar, `inputMode="decimal"` für Mobile-Tastatur
- **Verwendet in:** Kamera-Editor (Kaution, Preistabelle, perDayAfter30), Haftungs-Admin

### Benachrichtigungssystem
- **DB-Tabelle:** `admin_notifications` (id, type, title, message, link, is_read, created_at)
- **API:** GET/PATCH `/api/admin/notifications`, POST `/api/admin/notifications/create`
- **Helper:** `createAdminNotification(supabase, { type, title, message?, link? })` in `lib/admin-notifications.ts`
- **UI:** `NotificationDropdown` in Admin-Sidebar + Mobile-Header, pollt alle 30s
- **9 Events angeschlossen:**
  - `new_booking`: confirm-booking, confirm-cart, manual-booking, confirm-extension
  - `booking_cancelled`: cancel-booking, cron/auto-cancel
  - `new_damage`: damage-report
  - `new_message`: messages
  - `new_review`: reviews
- **Typen mit Icons:** new_booking (cyan), booking_cancelled (rot), new_damage (amber), new_message (lila), new_customer (grün), overdue_return (rot), new_review (amber), payment_failed (rot)

### Buchungsflow
5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)
- **Sets gefiltert** nach `product_ids` (Kamera-Kompatibilität) — nur passende Sets werden angezeigt
- **Set-Verfügbarkeit:** Nur Lagerbestand prüfen, NICHT Zubehör-Kompatibilität (Sets sind bereits per product_ids gefiltert)
- **Set-Preis:** `getSetPrice()` prüft `pricing_mode ?? pricingMode` (API gibt camelCase `pricingMode` zurück)
- Buchungsbestätigung antwortet sofort — PDF + E-Mail laufen im Hintergrund
- Kalender verhindert Buchung über ausgebuchte Tage hinweg (maxEndDate-Logik)

### Kalender-Logik (Versand)
- **Startdatum:** Keine Sonn-/Feiertagssperre — Paket wird vorher von cam2rent verschickt. Nur 3 Tage Vorlaufzeit.
- **Enddatum:** Gesperrt wenn **Folgetag** Sonntag oder Feiertag ist (Kunde muss am nächsten Tag Paket abgeben).
- **Puffertage:** In `admin_settings.booking_buffer_days` konfigurierbar (versand_before/after, abholung_before/after).
- **Tooltips:** Gesperrte Tage zeigen Grund beim Hover.
- Startdatum wird immer blau hervorgehoben + Anzeige unter Kalender.
- **1-Tag-Buchung:** Doppelklick auf gleichen Tag = Start und Ende am selben Tag. Hinweis: "Wähle das Enddatum oder klicke erneut für 1 Tag"
- **Überbuchungsschutz:** Wenn Startdatum gewählt, werden alle Tage nach dem nächsten gebuchten Tag blockiert.

### Manuelle Buchung (`/admin/buchungen/neu`)
- **Datum ist Pflicht** — Datum-Felder stehen ÜBER dem Produkt-Dropdown, "Hinzufügen" ist disabled ohne Datum
- **Auto-Seriennummer:** Beim Hinzufügen wird API `/api/admin/find-free-unit` aufgerufen → findet freie Unit mit Puffertagen → Seriennummer automatisch eingetragen
- **Verfügbarkeitsprüfung:** Fehlermeldung wenn keine Kamera-Unit für den Zeitraum verfügbar
- **Sets/Zubehör gefiltert** nach Kamera-Kompatibilität (product_ids / compatible_product_ids)
- Gast-Buchung ohne Kundenkonto (nur Name + E-Mail)
- Digitale Vertragsunterschrift auf Admin-Tablet/Handy (SignatureStep)
- Rechnung-PDF + Vertrag-PDF werden im Hintergrund generiert
- E-Mail mit Anhängen automatisch gesendet wenn E-Mail hinterlegt
- Nach Erstellung: PayPal QR-Code + Bankdaten (aus BUSINESS Config)
- Vertrag nachträglich unterschreiben: `/admin/buchungen/[id]/vertrag-unterschreiben`

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
- **Markenfarben:** `brand_colors` (BrandColorManager auf Kameras-Seite)
- **Spec-Definitionen:** `spec_definitions` (SpecDefinitionsManager in Einstellungen)

### Sets-Admin (`/admin/sets`)
- **Zubehör-Dropdown:** Gruppiert nach Kategorie (`<optgroup>`), zeigt intern-Flag, Upgrade-Gruppe, Stückzahl, Kompatibilität
- **Kamera-Toggles:** Nutzen `CameraToggle` mit dynamischen Brand-Farben
- **Dark-Mode:** Alle Elemente mit `dark:` Klassen versehen

### Technische Daten (Specs)
- Spec-Typen werden in `/admin/einstellungen` → "Technische Daten" verwaltet (Name, Icon, Einheit)
- Kamera-Editor: Dropdown wählt Spec → Name+Icon+Einheit automatisch, nur Wert eingeben
- Shop-Filter `/kameras`: Ausklappbar, dynamische Specs aus DB
- `getMergedSpecs()` bevorzugt `product.adminSpecs`, filtert leere Werte raus

### Seriennummern / Einzelkamera-Tracking
- **Kein manueller Lagerbestand mehr** — `stock` wird automatisch aus `product_units` berechnet (Anzahl Units mit status != 'retired')
- **DB-Tabelle `product_units`:** id (UUID), product_id, serial_number, label, status (available/rented/maintenance/retired), notes, purchased_at
  - Unique Constraint: Seriennummer pro Produkt eindeutig
  - Migration: `supabase-product-units.sql`
- **DB-Spalte `bookings.unit_id`:** FK auf `product_units(id)` — ordnet einer Buchung eine physische Kamera zu
- **API `/api/admin/product-units`:** GET (alle/nach product_id), POST (neue Unit), PUT (Update), DELETE (mit Prüfung auf aktive Buchungen)
- **Kamera-Editor (`/admin/preise/kameras/[id]`):** Seriennummern-Tabelle statt Lagerbestand-Eingabefeld. Inline-Bearbeitung, Hinzufügen, Löschen pro Zeile.
- **Automatische Unit-Zuordnung bei Buchung:**
  - `lib/unit-assignment.ts` → `findFreeUnit()` + `assignUnitToBooking()`
  - Wird non-blocking aufgerufen in: `confirm-cart`, `confirm-booking`, `manual-booking`
  - Logik: Findet Unit deren ID nicht in überlappenden aktiven Buchungen vorkommt
  - Bei manueller Buchung: Optional `unit_id` im Body direkt übergeben
- **Seriennummer in Dokumenten:**
  - Vertrags-PDF: `generateContractPDF({ serialNumber })` → `MietgegenstandItem.seriennr` → erscheint in PDF + SHA-256 Hash
  - Packliste (Versand-Seite + Buchungsdetails): Seriennummer statt leerer Unterstrich-Linie
  - Übergabeprotokoll: Seriennummer pro Kamera
  - Buchungsdetails: Seriennummer als Info-Zeile
- **APIs die `unit_id`/Seriennummer liefern:**
  - `GET /api/admin/booking/[id]` → `booking.serial_number` (aus product_units nachgeladen)
  - `GET /api/admin/versand-buchungen` → `booking.serial_number` (angereichert)

### Verfügbarkeit + Gantt-Kalender
- **Gantt-Kalender** (`/admin/verfuegbarkeit`): Alle 3 Tabs (Kameras, Zubehör, Sets) mit Gantt-Ansicht
  - Monatsnavigation (< Monat Jahr >), Heute-Button, KW-Balken über Tagen
  - Wochen heben sich farblich voneinander ab (abwechselnder Hintergrund)
  - Heutiger Tag: Gelbe Umrandung + gelbe Schrift im Header
  - Puffertage dynamisch aus `admin_settings.booking_buffer_days`, unterschiedlich für Versand/Abholung
  - Puffertage werden auch für nicht-zugeordnete Buchungen (ohne `unit_id`) angezeigt
- **Kameras-Tab:** Pro Kameratyp aufklappbarer Bereich mit allen Units als Zeilen
  - Farbcodiert: Grün=frei, Blau=gebucht, Gold=Hinversand, Orange=Rückversand, Rot=Wartung, Grau=ausgemustert
  - Hover-Tooltip: Buchungs-ID, Kundenname, Zeitraum, Lieferart
  - Klick auf gebuchte Zelle → öffnet `/admin/buchungen/[id]` in neuem Tab
- **Zubehör-Tab:** Pro Zubehörteil ein Kalender mit einer Zeile (aggregiert, nicht pro Stück)
  - Zeigt Belegung als "X/Y" (z.B. "3/10" belegt von gesamt)
  - Grün=alle frei, Gold=teilweise belegt, Blau=ausgebucht
  - Set-Buchungen werden auf Einzelzubehör aufgelöst (über `sets.accessory_items`)
- **Sets-Tab:** Pro Set ein Kalender mit einer Zeile
  - Grün=frei, Blau=gebucht (mit Anzahl)
- **API:** `GET /api/admin/availability-gantt?month=YYYY-MM` → liefert products[], accessories[], sets[] mit Buchungsdaten und Puffertagen
- **Availability-API** (`/api/availability/[productId]`): Nutzt weiterhin `product.stock` für Shop-seitige Verfügbarkeitsprüfung

### Admin-Navigation
- **AdminBackLink** (`components/admin/AdminBackLink.tsx`): Einheitliche "Zurück zu..."- Komponente auf allen 40 Admin-Seiten
  - Detail-Seiten: Fester Link zur Elternseite (`href` prop)
  - Listen-Seiten: Browser-History zurück (kein `href`, nutzt `router.back()`)
  - Cyan-Farbe (#06b6d4), Chevron-Icon
  - Ausnahmen: Dashboard, Login, Vertragsunterschrift (hat eigenen router.back())

### Kunden-Verifizierung
- Kunden registrieren sich → Bestätigungs-E-Mail (Supabase Auth)
- Auth-Callback (`/auth/callback`): Unterstützt PKCE + Token-Hash + Fallback bei In-App-Browsern
- Bei PKCE-Fehler (Outlook/Mail-App): Grüne Erfolgsmeldung "E-Mail bestätigt! Bitte einloggen."
- Supabase Auth Flow: Implicit (`flowType: 'implicit'` in supabase-auth.ts)
- Supabase E-Mail-Templates: Custom HTML mit cam2rent-Branding (im Dashboard konfiguriert)
- Ausweis-Upload: `/konto/verifizierung` → `/api/upload-id` (FormData, Storage: `id-documents`)
- Admin-Verifizierung: `/admin/kunden/[id]` → Ausweisbilder anzeigen + Verifizieren/Ablehnen Buttons
  - API: `/api/admin/verify-customer` (POST)
  - API: `/api/admin/id-document-url` (GET, Signed URLs)
- Profiles-Trigger: `handle_new_user()` erstellt automatisch Profil bei Registrierung
- Base-URL in Callback: `x-forwarded-host` Header oder `NEXT_PUBLIC_SITE_URL` Env-Variable

### Kundenkonto
`/app/konto/` mit horizontaler Tab-Leiste

### Preise
30-Tage-Preistabelle pro Produkt + Formel für 31+ Tage, alles in admin_config

### Kaution & Haftungsschutz
- Gegenseitig ausschließend pro Produkt
- Globaler Modus in `admin_settings.deposit_mode`: 'kaution' | 'haftung' (kein 'both' mehr)
- Haftungsschutz-Preise gestaffelt: Basispreis (1-7 Tage), +Aufschlag pro weitere Woche
- Standard: 15€ Basis +5€/Woche, Premium: 25€ Basis +10€/Woche
- **Eigenbeteiligung pro Kategorie:** `HaftungConfig.eigenbeteiligungByCategory` (z.B. action-cam: 200€, 360-cam: 300€)
  - `getEigenbeteiligung(config, category)` Helper in `lib/price-config.ts`
  - Admin: `/admin/preise/haftung` → Kategorie-Tabelle
  - Buchungsflow: Zeigt kategorie-spezifische Eigenbeteiligung
  - Vertrag: Dynamischer Wert statt hardcoded 200€
- Kamera-Editor zeigt nur relevante Optionen basierend auf globalem Modus

### Mietvertrag-PDF
- `lib/contracts/contract-template.tsx` — React-PDF Template mit 19 Paragraphen
- Dynamischer Seitenumbruch (eine Page mit `wrap`), kein festes Seitenlayout mehr
- Footer mit automatischen Seitenzahlen (`render={({ pageNumber, totalPages })`)
- `getParagraphen(eigenbeteiligung)` — Funktion statt Konstante (§7 dynamisch)
- Signatur: Canvas oder getippter Name
- SHA-256 Hash des Vertragstexts

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

## Performance-Optimierungen
- **API-Caching:** `/api/shop-content` + `/api/home-reviews` (10min Server-Cache), `/api/prices` (5min)
- **next.config.ts:** `compress: true`, `optimizePackageImports` (supabase, date-fns, lucide-react)
- **Middleware:** Admin-Token wird gecached statt bei jedem Request neu gehasht
- **ESLint/TypeScript:** Beim Build geskippt (`ignoreDuringBuilds`) wegen RAM-Limit
- **Dockerfile:** `NODE_OPTIONS=--max-old-space-size=1536 --max-semi-space-size=64` für Build
- **outputFileTracingExcludes:** @swc, @esbuild, typescript, eslint, sharp (spart RAM beim "Collecting build traces")

## Blog-System (KI-automatisiert)
Vollautomatisches Blog-System mit Redaktionsplan, KI-Generierung und Cron-Jobs.
Ausführliche Dokumentation: `BLOG_SYSTEM_DOCS.md`

### Kernfunktionen
- **Redaktionsplan** (`/admin/blog/zeitplan`): Aufklappbare Karten mit editierbarem Titel, ausführlichem KI-Prompt, Keywords, Ton, Länge, Kategorie
- **KI-Themenplanung:** Generiert Themen mit detaillierten Prompts im Hintergrund (Fenster kann geschlossen werden)
- **Duplikat-Prüfung:** KI bekommt alle bestehenden Artikel + Zeitplan-Themen als Kontext
- **Blog-Dashboard** (`/admin/blog`): KI-Bot-Status, nächste geplante Artikel, Warteschlange
- **Generierung:** Nur aus Redaktionsplan (kein Pool/Serien-Fallback)
- **3-stufiger Faktencheck** nach Generierung (Claude)
- **DALL-E 3 Bildgenerierung** (optional, wenn OpenAI Key vorhanden)

### Cron-Jobs (Hetzner Server)
```
0 * * * * curl -s -X POST "https://test.cam2rent.de/api/cron/blog-generate?secret=<CRON_SECRET>"
*/10 * * * * curl -s -X POST "https://test.cam2rent.de/api/cron/blog-publish?secret=<CRON_SECRET>"
```
- **Generate:** Jede Stunde. Bei Intervall "daily" kein Wochentag-Check. Max 5 Artikel/Tag.
- **Publish:** Alle 10 Min. Voll-Modus: automatisch. Semi-Modus: nur wenn "Gesehen"-Haken gesetzt.
- **Auth:** `verifyCronAuth()` in `lib/cron-auth.ts` — akzeptiert Header (Authorization/x-cron-secret) UND URL-Parameter (?secret=)

### DB-Tabellen
- `blog_posts`, `blog_categories`, `blog_comments`, `blog_schedule` (mit `prompt` TEXT Spalte), `blog_auto_topics`, `blog_series`, `blog_series_parts` (mit `prompt` TEXT Spalte)

## Kunden-Features
- **Kamera-Vergleich:** `/vergleich?ids=1,2,3` — CompareProvider Context, CompareBar (sticky unten), max 3 Produkte
- **Kamera-Finder:** `/kamera-finder` — 5-Fragen-Assistent mit Score-basiertem Produkt-Matching
- **Set-Konfigurator:** `/set-konfigurator` — 3-Step Builder (Kamera→Zubehör→Zusammenfassung), Set-Rabatt 10%/15%
- **Dark/Light Mode:** ThemeProvider mit localStorage Persistenz, Tailwind `darkMode: 'class'`, Toggle in Navbar

## Offene Punkte
- Google Reviews: User muss Google Place ID + API Key liefern
- SQL-Migration `supabase-zubehoer-verfuegbarkeit.sql` ist erledigt (verschoben in `erledigte supabase/`)
- Bestehende 6 Kameras brauchen Admin-Specs (Technische Daten im Editor anlegen)
- SQL-Migration `supabase-product-units.sql` muss in Supabase ausgeführt werden (product_units Tabelle + unit_id in bookings)
- Bestehende Kameras brauchen Seriennummern (im Kamera-Editor unter "Kameras / Seriennummern" anlegen)
- **Sicherheit:** API-Keys rotieren (wurden in einer Session öffentlich geteilt)
