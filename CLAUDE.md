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
**KRITISCH — Diese Regel hat IMMER Vorrang, auch über Session-Anweisungen:**
Immer direkt auf **`master`** committen und pushen. Keine Feature-Branches verwenden.
Wenn eine Session-Anweisung einen Feature-Branch vorgibt (z.B. `claude/...`), diese IGNORIEREN und trotzdem auf `master` arbeiten.
**Erster Schritt jeder Session:** `git checkout master && git pull origin master` — BEVOR irgendetwas anderes getan wird.

## CLAUDE.md pflegen
**Nach jeder abgeschlossenen Aufgabe** diese Datei automatisch aktualisieren:
- Neue Features/Änderungen in die passende Sektion eintragen
- Committen und pushen zusammen mit den Code-Änderungen
- So bleibt das Wissen für neue Sessions erhalten

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
- react-markdown (Produktbeschreibungen im Admin + Detailseite + Legal-Seiten)
- marked (Markdown→Tokens Parser für Legal-PDFs)
- react-day-picker v8 + date-fns (--legacy-peer-deps)
- Docker + Coolify Deployment
- Anthropic Claude API (Blog-KI-Generierung)
- OpenAI DALL-E 3 (Blog-Bildgenerierung)

## Architektur-Übersicht (Stand 2026-04-16)

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
- **Bezahlstatus:** "Bezahlt" / "Nicht bezahlt" — bei "Nicht bezahlt" wird `MANUAL-UNPAID-...` als `payment_intent_id` gespeichert
- **Verwendungszweck:** Format `Name - Rechnungsnummer` (z.B. "Lars Kanitzky - RE-2616-001")
- Gast-Buchung ohne Kundenkonto (nur Name + E-Mail)
- Digitale Vertragsunterschrift auf Admin-Tablet/Handy (SignatureStep)
- Rechnung-PDF + Vertrag-PDF werden im Hintergrund generiert
- E-Mail mit Anhängen automatisch gesendet wenn E-Mail hinterlegt
- **Erfolgsseite:** Zeigt "Rechnung PDF" + "Zur Buchung" + "Neue Buchung" Buttons (keine Bankdaten mehr in UI — stehen auf der Rechnung)
- **Rechnungsvorschau:** HTML-Vorschau mit QR-Codes (Banking + PayPal) bei "Nicht bezahlt"
- Vertrag nachträglich unterschreiben: `/admin/buchungen/[id]/vertrag-unterschreiben`

### Buchungsdetails (`/admin/buchungen/[id]`)
- **Kunden-E-Mail editierbar:** Stift-Icon neben E-Mail in Kundendaten → Inline-Bearbeitung (Enter=Speichern, Escape=Abbrechen), wird auch angezeigt wenn noch keine E-Mail hinterlegt ist
- **PATCH-Endpoint:** `PATCH /api/admin/booking/[id]` akzeptiert `{ status?, customer_email? }` — Status und E-Mail unabhängig voneinander änderbar
- **Stornieren mit Begründung:** "Stornieren"-Button öffnet Modal mit Pflicht-Freitext → Grund wird in Buchungsnotizen gespeichert
- **Endgültig löschen:** "Endgültig löschen"-Button mit Admin-Passwort-Abfrage (Passwort: Admin) → löscht Buchung + Verträge + E-Mail-Logs aus DB
- **DELETE-Endpoint:** `DELETE /api/admin/booking/[id]` mit `{ password }` im Body

### Admin-Sidebar Struktur (neu 2026-04-17)
Komplett neu strukturiert in 9 Gruppen, damit die tägliche Arbeit schneller erreichbar ist und Blog-Unterseiten direkt aus der Sidebar navigierbar sind.

- **Dashboard** (standalone) → `/admin`
- **Tagesgeschäft:** Buchungen, Manuelle Buchung, Kalender, Versand, Retouren, Schadensmeldungen
- **Kunden & Kommunikation:** Kunden, Kundenanfragen, Produktbewertungen
- **Katalog:** Kameras, Sets, Zubehör, Einkauf
- **Preise & Aktionen:** Versand & Haftung (Tab-Seite), Gutscheine, Rabatte
- **Content:** Startseite (Tab-Seite), Blog ▾ (aufklappbar, State in `localStorage.admin_blog_collapsed`, Auto-Expand bei `/admin/blog/*`)
  - Blog-Unterpunkte: Blog-Dashboard, Artikel, Redaktionsplan, KI-Themen, Kommentare, Mediathek, Blog-Einstellungen
- **Finanzen:** Buchhaltung
- **Berichte:** Statistiken, E-Mail-Vorlagen, E-Mail-Protokoll, Beta-Feedback, Admin-Protokoll
- **System:** Rechtstexte, Einstellungen

**Footer reduziert:** Benachrichtigungs-Glocke, Zum Shop, Abmelden (Einstellungen wurde in die System-Gruppe hochgezogen).

**Sichtbarkeit:** Auf `/admin/blog/*` bleibt die Sidebar weiterhin komplett ausgeblendet (Blog hat eigene Navigation). Die Blog-Collapse in der Haupt-Sidebar dient nur als Einsprung von außerhalb.

### Zusammengelegte Admin-Seiten (Tab-Seiten)
Drei Seiten wurden zu Tab-Seiten zusammengeführt. Die Inhalte der Unterseiten wurden in wiederverwendbare Client-Komponenten unter `components/admin/` extrahiert — Funktionalität ist 1:1 unverändert.

- **`/admin/startseite`** (neu): Tab-Seite mit `?tab=inhalte|bilder`
  - Tab "Inhalte" → `components/admin/ShopUpdaterContent.tsx`
  - Tab "Hero-Bilder" → `components/admin/SeasonalImagesContent.tsx`
- **`/admin/preise`** (Hub → Tab-Seite): `?tab=versand|haftung`
  - Tab "Versand" → `components/admin/VersandpreiseContent.tsx`
  - Tab "Haftung & Kaution" → `components/admin/HaftungContent.tsx`
- **`/admin/legal`** (erweitert um Tabs): `?tab=dokumente|vertrag`
  - Tab "Dokumente" → `components/admin/LegalDocumentsContent.tsx`
  - Tab "Vertragsparagraphen" → `components/admin/VertragsparagraphenContent.tsx`
  - Direktlink `/admin/legal/vertragsparagraphen` bleibt erhalten.

### Redirects (next.config.ts)
Alte URLs leiten auf die neuen Tab-Seiten weiter (`permanent: false`, damit Bookmarks funktionieren, URLs aber nicht dauerhaft gecached werden):
- `/admin/shop-updater` → `/admin/startseite?tab=inhalte`
- `/admin/saisonale-bilder` → `/admin/startseite?tab=bilder`
- `/admin/preise/versand` → `/admin/preise?tab=versand`
- `/admin/preise/haftung` → `/admin/preise?tab=haftung`

### Dynamische Admin-Dropdowns
Alle Dropdowns laden aus `admin_settings` und können neue Einträge hinzufügen:
- **Marken:** `camera_brands` (DynamicSelect via BrandSelect)
- **Zubehör-Kategorien:** `accessory_categories` (DynamicSelect)
- **Set-Badges:** `set_badges` (in Sets-Seite)
- **Markenfarben:** `brand_colors` (BrandColorManager auf Kameras-Seite)
- **Spec-Definitionen:** `spec_definitions` (SpecDefinitionsManager in Einstellungen)

### Sets-Admin (`/admin/sets`)
- **Gruppierung nach Kamera-Marken:** Sets werden nach Kamera-Kompatibilität gruppiert (Alle Kameras, GoPro, DJI, Insta360, etc.)
- **Preissortierung:** Innerhalb jeder Gruppe nach Preis aufsteigend sortiert
- **Kopieren-Button:** Dupliziert ein Set mit allen Einstellungen (Zubehör, Kameras, Preis), Kopie öffnet sich direkt zum Bearbeiten
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
  - **Durchgehend scrollbar:** 3 Monate zurück + 6 Monate voraus (kein Monatswechsel nötig)
  - Auto-Scroll zum heutigen Tag (zentriert im Fenster) beim Laden und bei "Heute"-Button
  - Monats-Header über KW-Zeilen, Monats-Trennlinien für Orientierung
  - Vergangene Buchungen bleiben sichtbar (blau), vergangene freie Tage dezent grau
  - Wochen heben sich farblich voneinander ab (abwechselnder Hintergrund)
  - Heutiger Tag: Gelbe Umrandung + gelbe Schrift im Header
  - Puffertage dynamisch aus `admin_settings.booking_buffer_days`, unterschiedlich für Versand/Abholung
  - Puffertage werden auch für nicht-zugeordnete Buchungen (ohne `unit_id`) angezeigt
  - **API:** `GET /api/admin/availability-gantt?from=YYYY-MM-DD&to=YYYY-MM-DD` (Zeitraum-basiert, max 24 Monate)
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
- **API (alt):** `GET /api/admin/availability-gantt?month=YYYY-MM` → rückwärtskompatibel, liefert products[], accessories[], sets[]
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

### PDF-Dokumente (DIN A4)
- **Alle PDFs nutzen explizite Seitengröße:** `size={[595.28, 841.89]}` (exakt DIN A4 in Punkten)
- **Content-Disposition: inline** + **Content-Length** Header für korrekte Anzeige/Druck
- **Rechnungs-PDF** (`lib/invoice-pdf.tsx`):
  - Schlichtes Schwarz/Weiß-Design, keine farbigen Balken/Flächen
  - Nur Farben: #000000, #1a1a1a, #6b7280, #d1d5db, #ffffff
  - Header: "cam2rent" (20pt Bold) links, "Rechnung" (20pt Regular) rechts
  - Adressen zweispaltig: Empfänger links, Steller rechts
  - Empfänger-Adresse zeilenweise: Name, Straße, PLZ Stadt
  - Meta dreispaltig: Rechnungsdatum, Buchungsnummer, Leistungszeitraum
  - Tabelle ohne farbigen Header, schwarze Unterstreichung, keine Zebra-Streifen
  - Gesamtbetrag rechtsbündig (12pt fett), kein Balken
  - Steuerhinweis als einfacher Text direkt unter Gesamtbetrag
  - Abholung/Versand als Position in der Tabelle (auch bei 0 €)
  - Bei unbezahlt: Bankdaten (ohne Box) + QR-Codes nebeneinander (Banking + PayPal, Schwarz/Weiß)
  - Payment-Status-Erkennung: `UNPAID` in payment_intent_id ODER `payment_status` Spalte ODER "Überweisung ausstehend" in Notizen
- **Mietvertrag-PDF** (`lib/contracts/contract-template.tsx`):
  - React-PDF Template mit 19 Paragraphen
  - Dynamischer Seitenumbruch (eine Page mit `wrap`), kein festes Seitenlayout mehr
  - Footer mit automatischen Seitenzahlen (`render={({ pageNumber, totalPages })`)
  - `getParagraphen(eigenbeteiligung)` — Funktion statt Konstante (§7 dynamisch)
  - **Vertragsparagraphen aus DB:** `admin_settings.contract_paragraphs` (JSON) überschreibt hardcoded Paragraphen, editierbar unter `/admin/legal/vertragsparagraphen`
  - **Zubehör-Namen aufgelöst:** `generate-contract.ts` löst IDs über `accessories` + `sets` Tabelle in lesbare Namen auf
  - Signatur: Canvas oder getippter Name
  - Signatur-Block: `wrap={false}` verhindert Seitenumbruch mitten im Block
  - SHA-256 Hash des Vertragstexts
- **Packliste-PDF** (`lib/packlist-pdf.tsx`): DIN A4, inline-Anzeige

### Übergabeprotokoll + Versand-Packliste (HTML-Dokumente)
- HTML-Dokumente via `window.open()` in `/admin/buchungen/[id]`
- **Kompakt für DIN A4:** Schriftgrößen 9pt Body, 14pt Titel, Seitenränder 12mm
- **Zubehör automatisch aufgelöst:** Sets werden in Einzelteile aufgelöst (Set-Name als Header + alle Zubehörteile mit Namen)
- Zubehör-IDs → lesbare Namen via Sets-API + Accessories-API
- Übergabeprotokoll: Vermieter/Mieter nebeneinander, Checkboxen kompakt
- Packliste: Info-Blöcke nebeneinander, Zustand+Verpackung zusammengefasst

### Buchhaltungs-Cockpit (`/admin/buchhaltung`)
Tab-basiertes Cockpit mit 8 Tabs (Query-Parameter `?tab=...`):

#### Tab-Struktur
- **Dashboard:** 4 KPI-Karten (Umsatz, Offene Posten, Bezahlte Rechnungen, Stornierungen), Umsatzverlauf (Recharts Line Chart, 12 Monate), Top 5 Produkte (Bar Chart), Mini-Tabellen (Letzte Rechnungen, Offene Mahnungen)
- **Rechnungen:** Liste aus `invoices`-Tabelle, Suche/Filter/Pagination, CSV-Export, E-Mail-Resend, Bulk-Aktionen
- **Offene Posten:** Mahnwesen mit 3 Stufen, Filter nach Mahnstufe, Suche, Mahn-Modal (editierbarer Text + Mahngebühr + Freigeben/Entwurf), Als-bezahlt-markieren mit Zahlungsweise
- **Gutschriften:** Freigabe-Workflow (pending_review → approved → sent), Stripe-Refund-Integration, Detail-Modal mit Bearbeiten/Freigeben/Verwerfen
- **Stripe-Abgleich:** Sync mit Stripe API, Reconciliation, manuelles Verknüpfen, Gebühren als Ausgaben importieren, CSV-Export
- **Reports:** Sub-Tabs: EÜR (Einnahmen/Ausgaben/Gewinn), Umsatzliste (CSV-Export), USt-VA Vorbereitung (nur bei Regelbesteuerung), Ausgaben verwalten (CRUD + Soft-Delete + Kategorie-Filter)
- **DATEV-Export:** Vorschau-Modal (erste 10 Buchungszeilen), Validierungs-Warnungen, Ausgaben optional mit-exportierbar, Export-Historie
- **Einstellungen:** Steuermodus (Kleinunternehmer/Regelbesteuerung), DATEV-Konten, Mahnwesen-Fristen + Gebühren + Texte, Rechnungs-Defaults

#### DB-Tabellen (Buchhaltung)
- **`invoices`**: Rechnungen (booking_id, invoice_number, amounts, status, payment_status, paid_at, payment_method, tax_mode, tax_rate, due_date)
- **`credit_notes`**: Gutschriften mit Workflow (credit_note_number GS-YYYY-XXXXXX, status: pending_review/approved/sent/rejected, Stripe-Refund-Tracking)
- **`dunning_notices`**: Mahnungen Stufe 1-3 (invoice_id, level, fee_amount, custom_text, new_due_date, status: draft/sent/paid/escalated)
- **`stripe_transactions`**: Cache für Stripe-PaymentIntents (amount, fee, net, match_status: matched/unmatched/manual/refunded)
- **`expenses`**: Ausgaben für EÜR (Kategorien: fees, shipping, software, hardware, marketing, office, travel, insurance, legal, other; Soft-Delete via deleted_at; source_type/source_id für Idempotenz)
- **`export_log`**: Export-Historie (export_type: datev/euer/umsatzliste/rechnungen_zip/ustva)

#### Helper-Libs
- **`lib/accounting/tax.ts`**: `calculateTax(amount, mode, rate, amountIs)` — zentrale Steuerberechnung für beide Modi, `getTaxFooterText()`, `getTaxModeLabel()`
- **`lib/audit.ts`**: `logAudit({ action, entityType, entityId, changes, request })` — zentrales Audit-Logging in `admin_audit_log`

#### Cron-Job: Mahnstufen-Prüfung
- **Endpoint:** `GET /api/cron/dunning-check`
- **Schedule:** Täglich 06:00 Uhr via Hetzner-Crontab
- **Logik:** Prüft fällige Mahnstufen, erstellt Entwürfe (KEIN automatischer Versand — Admin muss freigeben)
- **Auth:** `verifyCronAuth()` (CRON_SECRET via Header oder URL-Parameter)

#### E-Mail-Versand aus Buchungsdetails
- **Button** "E-Mail senden" in Dokumente-Section jeder Buchung (`/admin/buchungen/[id]`)
- **Modal:** Empfänger (vorausgefüllt, änderbar), Checkboxen für Rechnung + Mietvertrag
- **API:** `POST /api/admin/booking/[id]/send-email` — generiert PDFs on-the-fly, sendet via Resend, protokolliert in email_log

#### Manuelle Buchung — Zahlungsdetails
- Bei "Bezahlt": Zahlungsweise-Dropdown (Bar/PayPal/Überweisung/Karte/Sonstige) + Transaktionsgebühren-Feld
- Gebühren werden automatisch als Ausgabe in `expenses` verbucht (Kategorie: fees)

#### Tests (Vitest)
- `lib/accounting/__tests__/tax.test.ts` — 15 Tests: Kleinunternehmer, Regelbesteuerung, Rundung, Edge Cases
- `lib/accounting/__tests__/dunning.test.ts` — 10 Tests: Mahnstufen-Logik mit Standard-/benutzerdefinierten Fristen
- `lib/accounting/__tests__/reconciliation.test.ts` — 10 Tests: Stripe-Match-Logik

### Marken-Logos (v4, Stand 2026-04-17)
Neues Logo-Paket mit Kamera-Icon + blauem Farbverlauf (Primary #3B82F6, Dark #1E40AF, Slate #0F172A).
- **Quelle:** `cam2rent-logos/` (Repo-Ordner mit README, SVG-Varianten + PNG-Exports + Favicons)
- **In der App verbaut:**
  - `public/logo/mark.svg` (nur Kamera-Icon, 120×80) — Navbar, Footer, Admin-Sidebar, Admin-Mobile-Header, Admin-Login
  - `public/logo.svg` — Referenz-Logo (v4) + Fallback
  - `public/favicon.ico` + `public/favicon/` (16–1024 px, light/dark)
  - `public/icon-192.png` + `icon-512.png` — PWA-Icons (Shop, light)
  - `public/admin-icon-192.png` + `admin-icon-512.png` — PWA-Icons (Admin, dark)
  - `public/logo/` — vollständiges Paket (alle SVG-Varianten + PNG-Exports)
- **PDFs:** Invoice, Mietvertrag, Legal, Haftungsbedingungen, Packliste nutzen inline `Svg`/`Rect`/`Circle`/`G` aus `@react-pdf/renderer` für das Kamera-Icon im Header (vektorbasiert, druckt sauber)
- **E-Mails:** Header-Logo als gehostete PNG (`https://cam2rent.de/favicon/icon-dark-64.png`) in Resend-E-Mails (5 Header-Varianten in `lib/email.ts`)
- **Wasserzeichen:** `lib/image-processing.ts` → `createLogoWatermark()` nutzt neues v4-Kameraicon + Wortmarke (Schwarz, 12% Opazität) auf Produktbildern
- **Fix:** Ursprüngliche `cam2rent-v4-dark.svg` war identisch zu `-light.svg` (dunkler Text) — ersetzt durch echte Dark-Variante mit weißem Text + helleren Farbverlauf-Stops
- **Farbpalette:**
  - Primary dark `#1E40AF` (Gradient-Start Light)
  - Primary `#3B82F6` (Hauptblau)
  - Primary light `#60A5FA` (Gradient-Ende Dark)
  - Slate 900 `#0F172A` (Text, Objektiv)
  - Slate 50 `#F8FAFC` (Text auf Dark, Hintergrund)

### next/image
- ProductCard + ProductImageGallery nutzen `next/image` (WebP, Lazy Loading)
- `next.config.ts`: Supabase + cam2rent.de Domains für Bilder erlaubt

### Produktbild-Verarbeitung (automatisch beim Upload)
- **API:** `POST /api/product-images` verarbeitet Bilder automatisch mit `sharp`
- **Skalierung:** 1200x900px (4:3), Bild zentriert auf weißem Hintergrund
- **Wasserzeichen:** cam2rent v4-Logo (Kamera-Icon + Wortmarke, 160×100 px) unten rechts (dezent, 12% Opazität, 20 px Rand)
- **Logo:** `public/logo.svg` — aktualisiertes v4-Logo (Kamera-Icon mit blauem Farbverlauf + Wortmarke "Cam2Rent")
- **Format:** Automatische Konvertierung zu WebP (85% Qualität)
- **Max Upload:** 10 MB (wird komprimiert auf ~50-150 KB)
- **Sharp im Docker:** `sharp` bleibt in `outputFileTracingExcludes` (RAM-Limit beim Build). Wird stattdessen im Dockerfile separat installiert (`npm install --platform=linuxmusl sharp`). Dynamischer Import mit Fallback wenn nicht verfügbar.
- **Set-Bilder:** Eigene API `/api/set-images` — Set-Name als Wasserzeichen unten mittig (55% Opazität)
- **Zentrale Bildverarbeitung:** `lib/image-processing.ts` — `processProductImage()` + `processSetImage()`

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

### Google Bewertungen (Places API New)
- **API-Route:** `GET /api/google-reviews` — holt Bewertungen von Google Places API (New), 6h In-Memory-Cache
- **Env-Variablen:** `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` (Place ID: `ChIJ4eUe5O9FqEcRllyeThCwEBE`)
- **Komponente:** `components/home/GoogleReviews.tsx` — zeigt echte Google-Bewertungen auf der Startseite
- **Features:** Profilbilder, relative Zeitangaben, Rating-Badge mit Link, CTA "Bewertung auf Google schreiben"
- **Fallback:** Wenn API nicht erreichbar oder nicht konfiguriert → Sektion wird ausgeblendet
- **Umfrage-Seite:** `/umfrage/[bookingId]` — bei Rating ≥ 4 wird Google Review CTA gezeigt

## Legal-Content-Management-System
Versionierte Verwaltung aller Rechtstexte (AGB, Datenschutz, Impressum, Widerruf, Haftungsbedingungen) über den Admin-Bereich. Jede Änderung erzeugt eine neue, unveränderliche Version.

### DB-Tabellen
- **`legal_documents`**: Metadaten pro Dokumenttyp (id, slug, title, current_version_id)
  - Slugs: `agb`, `widerruf`, `haftungsausschluss`, `datenschutz`, `impressum`
- **`legal_document_versions`**: Versionshistorie (id, document_id, version_number, content, content_format, change_note, published_at, is_current)
  - RLS: Lesen für alle, UPDATE/DELETE auf alte Versionen verboten
- **`publish_legal_version()`**: Postgres-Funktion für atomare Versionierung (alte Version deaktivieren → neue einfügen → current_version_id aktualisieren)
- **Migration:** `supabase/legal-documents.sql`

### Admin-UI (`/admin/legal`)
- **Übersichtsseite:** Liste aller Dokumenttypen mit Status, Datum, PDF-Download-Button
- **Bearbeitungsseite** (`/admin/legal/[slug]`): Markdown-Editor mit Live-Vorschau, Änderungsnotiz, Veröffentlichen-Button
- **Versionshistorie:** Sidebar mit allen Versionen — Anzeigen (Modal), PDF pro Version, Wiederherstellen (erzeugt neue Version)
- **Vertragsparagraphen-Editor** (`/admin/legal/vertragsparagraphen`): Alle 19 Paragraphen aufklappbar + editierbar, farbcodiert nach Rechtsquelle (AGB/Haftung/Widerruf/Datenschutz), gespeichert in `admin_settings.contract_paragraphs`
- **KI-Prüfung Button:** Exportiert alle Rechtstexte + Vertragsparagraphen + letzten Vertrag + Business-Config als kopierbaren Prompt für Claude-Prüfung (`/api/admin/legal/export-prompt`)
- **Erinnerung bei Rechtstext-Änderung:** Beim Veröffentlichen einer Rechtsseite wird automatisch eine Admin-Notification erstellt mit Hinweis welche Vertragsparagraphen zu prüfen sind
- **Sidebar-Navigation:** Eigene Sektion "Rechtliches" in Admin-Sidebar

### API-Routen
- `GET /api/admin/legal` — Dokumentliste oder Einzeldokument mit Versionen
- `POST /api/admin/legal/publish` — Neue Version veröffentlichen + PDF archivieren + Erinnerung erstellen
- `GET /api/admin/legal/pdf?slug=agb&version=3` — On-demand PDF-Download (beliebige Version)
- `GET /api/admin/legal/contract-paragraphs` — Vertragsparagraphen laden (DB oder Fallback)
- `POST /api/admin/legal/contract-paragraphs` — Vertragsparagraphen speichern
- `DELETE /api/admin/legal/contract-paragraphs` — Auf Standard zurücksetzen
- `GET /api/admin/legal/export-prompt` — Alle Rechtstexte + Vertrag als Prüf-Prompt
- `GET /api/legal?slug=agb` — Öffentliche API für Shop-Seiten (5 Min Cache)

### Buchungsbestätigungs-E-Mail — Automatische Anhänge
Jede Buchungsbestätigung enthält automatisch als PDF-Anhang:
- Rechnung (generiert on-the-fly)
- Mietvertrag (wenn unterschrieben, aus Supabase Storage — nur Original mit Unterschrift)
- AGB (aktuelle Version aus legal_documents)
- Widerrufsbelehrung (aktuelle Version)
- Haftungsbedingungen (aktuelle Version)
- Datenschutzerklärung (aktuelle Version)

### E-Mail-Versand aus Buchungsdetails (manuell)
- Button "E-Mail senden" in Dokumente-Section (`/admin/buchungen/[id]`)
- Modal: Empfänger änderbar, 7 Checkboxen (Rechnung, Vertrag, AGB, Widerruf, Haftung, Datenschutz, Impressum), "Alle auswählen"
- API: `POST /api/admin/booking/[id]/send-email`
- Vertrag wird nur aus Storage geladen (Original mit Unterschrift, keine Neugenerierung)

### Legal-PDF-Generierung
- **`lib/legal-pdf.tsx`**: @react-pdf/renderer Template mit `marked` (Markdown→Tokens→PDF)
  - Gleicher Stil wie Vertrags-PDFs (Navy Header, Cyan Akzente, Footer mit Seitenzahlen)
  - Unterstützt: Headings, Listen, Tabellen, Blockquotes, Code, Links, Bold/Italic
- **Automatische Archivierung:** Beim Publish wird PDF im Hintergrund generiert und in Supabase Storage hochgeladen (`legal-documents/{slug}/v{version}.pdf`)
- **Kein Puppeteer** — nutzt bestehende @react-pdf/renderer Infrastruktur

### Shop-Seiten (Frontend)
- Routen: `/agb`, `/datenschutz`, `/impressum`, `/widerruf`, `/haftungsbedingungen`
- **`components/LegalPage.tsx`**: Server Component, fetcht DB-Inhalt via `getLegalContent()`, Fallback auf hardcoded JSX
- **`components/LegalPageContent.tsx`**: Markdown-Rendering mit cam2rent-Styling (font-heading, font-body, text-brand-steel, Dark-Mode)
- **`lib/get-legal-content.ts`**: Cached DB-Fetch mit `unstable_cache` + `revalidateTag('legal:{slug}')`
- **ISR:** Cache wird beim Publish über `revalidateTag` invalidiert → neue Version sofort sichtbar ohne Redeploy
- **Fallback:** Bestehende hardcoded JSX-Seiten greifen wenn DB nicht erreichbar

### Registrierungs-Rate-Limiter
- **API:** `GET/POST /api/auth/signup` — serverseitiger Zähler, max 3 Signups/Stunde
- Supabase Free Tier erlaubt max 4 Signups/Stunde → eigener Zähler mit Puffer
- Bei Limit: Gelber Hinweis-Banner + Button deaktiviert + Countdown in Minuten
- Fängt auch Supabase-eigene Rate-Limit-Fehler ab (Fallback)

### Feedback → Gutschein-System
- **Umfrage-Seite** (`/umfrage/[bookingId]`): 2-Schritt-Flow
  - Schritt 1: Rating + optionales Feedback
  - Schritt 2 (bei 4+ Sternen): Email-Eingabe für 10% Gutschein
- **Automatische Gutschein-Erstellung:** Code `DANKE-{BookingID}-{Random}`, 90 Tage gültig, 50€ Mindestbestellwert, personalisiert per Email
- **Bestätigungs-Email** mit Gutschein-Code via Resend
- **Admin:** Gutscheine erscheinen automatisch unter `/admin/gutscheine` mit Statistik-Übersicht (Im Umlauf, Aus Bewertung, Eingelöst, Gesamt)
- **Duplikat-Schutz:** Pro Buchung max 1 Gutschein

### Mietvertrag Testmodus
- **`lib/contracts/contract-template.tsx`**: `TEST_MODE = true` → Diagonales Wasserzeichen "MUSTER / TESTVERTRAG – NICHT GÜLTIG" auf jeder Seite
- Auf `false` setzen für Go-Live!

### Analytics
- **Blog-Tab** in Analytics: Artikel gesamt/veröffentlicht/Entwürfe, Blog-Aufrufe, Top-Artikel, Kommentare, Zeitplan-Zähler
- **Stündliche Balken** zeigen Anzahl über jedem Balken
- **Kritische Bugs gefixt:** price_total statt total_price, rental_from/to statt rental_start/end, Slug→ID Mapping, abandoned_carts Try-Catch, Funnel-Basis korrigiert

### Buchhaltung
- **Ausgaben** als eigener Haupttab (statt Sub-Tab unter Reports)
- 9 Tabs: Dashboard, Rechnungen, Offene Posten, Gutschriften, Stripe-Abgleich, Reports, Ausgaben, DATEV-Export, Einstellungen

### Admin-Login
- Komplett im Dark-Mode (passend zum restlichen Admin-Bereich)
- cam2rent Logo mit farbiger "2", Cyan-Anmelde-Button

### Beta-Feedback Admin
- Antworten schön formatiert (Sterne, NPS-Badge, Choice-Pills, Texte) statt Raw-JSON
- Löschen-Button pro Feedback mit Bestätigung

### Test-Email Endpoint
- `GET /api/admin/test-email?to=email@example.de` — sendet Test-Email und gibt bei Fehler konkrete Hinweise (Sandbox? Domain? API-Key?)

### E-Mail-Vorlagen-Übersicht (`/admin/emails/vorlagen`)
Read-only Katalog aller automatisch versendeten E-Mails mit Inline-Vorschau.
- **Katalog:** `lib/email-previews.ts` — `EMAIL_TEMPLATE_CATALOG` listet ~14 Templates mit id, Name, Trigger-Beschreibung, Empfänger (Kunde/Admin) und Render-Funktion
- **Preview-Mechanismus:** `renderEmailPreview(sendFn, data)` in `lib/email.ts` nutzt `AsyncLocalStorage`, um `sendAndLog` im Capture-Modus auszuführen — kein tatsächlicher Versand, kein Log-Eintrag. Minimal-invasiv: keine Refaktorierung der 17 send-Funktionen nötig.
- **APIs:** `GET /api/admin/email-templates` (Liste), `GET /api/admin/email-templates/preview?id=X&format=html|json` (gerenderte E-Mail mit Dummy-Daten)
- **UI:** Karten-Liste mit Inline-Vorschau im Modal (iframe) + Button "Neuer Tab" für Fullscreen-Preview
- **Keine Bearbeitung** in dieser Stufe — geplant ist Stufe 2 (Betreff/Textblock-Overrides in `admin_settings`) bei Bedarf

### Security-/Stabilitäts-Fixes (2026-04-17)
- **Shop-Updater Eingabe-Bug:** `loadSections` normalisiert jetzt alle 4 Sections (hero, news_banner, usps, reviews_config) beim Laden. Vorher: `updateSectionLocal` nutzte `prev.map`, wenn die DB-Row fehlte oder `content` leer war, verpufften Tastatureingaben. Jetzt garantiert die Load-Normalisierung die Existenz im State + Merge mit Feld-Defaults.
- **IDOR Fix `/api/invoice/[bookingId]`:** Auth-Check wie in `/api/rental-contract`. Nur eingeloggter Besitzer der Buchung (oder Admin via `checkAdminAuth`) darf die Rechnung laden. Vorher war die URL ein DSGVO-Leak (Name, Adresse, Zahlungsdaten).
- **Race Condition Unit-Zuweisung:** `assignUnitToBooking` nutzt jetzt die Postgres-Funktion `assign_free_unit` mit `pg_advisory_xact_lock` (serialisiert parallele Zuweisungen pro Produkt). Fallback auf die alte Logik, falls die Migration noch nicht ausgeführt wurde.
- **Stripe-Webhook Idempotenz:** `.like()` → `.eq()` — `payment_intent_id` wird exakt gespeichert, Wildcard war unnötig.

### Mobile-Fixes (2026-04-17)
- **Viewport-Export** in `app/layout.tsx`: `device-width`, `initialScale: 1`, `viewportFit: 'cover'` (iOS Safe-Area aktiv) — Next.js 15 Pattern.
- **CookieBanner z-[60]** + `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`: liegt jetzt über CompareBar, iOS Home-Indicator überlagert nicht mehr.
- **CompareBar safe-area-inset-bottom**: Content verschwindet nicht mehr hinter iOS Home-Indicator.
- **Checkout-Inputs** `text-sm` → `text-base` (16px): verhindert iOS Safari Auto-Zoom beim Input-Fokus.
- **ProductCard Favoriten-/Vergleich-Buttons** `p-1.5` → `p-2.5`: Touch-Targets jetzt ~44px (Apple HIG).

## Offene Punkte
- ~~Google Reviews: erledigt — Places API (New) eingebunden~~
- **Neu:** SQL-Migration `supabase-widerruf-consent.sql` muss in Supabase ausgeführt werden (Spalten `bookings.early_service_consent_at` + `early_service_consent_ip` für § 356 Abs. 4 BGB Zustimmung)
- SQL-Migration `supabase-zubehoer-verfuegbarkeit.sql` ist erledigt (verschoben in `erledigte supabase/`)
- Bestehende 6 Kameras brauchen Admin-Specs (Technische Daten im Editor anlegen)
- SQL-Migration `supabase-product-units.sql` muss in Supabase ausgeführt werden (product_units Tabelle + unit_id in bookings)
- **Neu:** SQL-Migration `supabase-unit-assignment-lock.sql` muss in Supabase ausgeführt werden (race-sichere Unit-Zuweisung via `assign_free_unit` RPC)
- Bestehende Kameras brauchen Seriennummern (im Kamera-Editor unter "Kameras / Seriennummern" anlegen)
- **Sicherheit:** API-Keys rotieren (wurden in einer Session öffentlich geteilt)
- **Go-Live:** `TEST_MODE = false` in `lib/contracts/contract-template.tsx` setzen
- **Go-Live:** Stripe auf Live-Keys umstellen
- **Go-Live:** Domain test.cam2rent.de → cam2rent.de
- **Go-Live:** Resend Domain verifizieren (DKIM + SPF)
