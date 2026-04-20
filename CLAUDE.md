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
- **10 Events angeschlossen:**
  - `new_booking`: confirm-booking, confirm-cart, manual-booking, confirm-extension
  - `booking_cancelled`: cancel-booking, cron/auto-cancel
  - `new_damage`: damage-report
  - `new_message`: messages
  - `new_review`: reviews
  - `new_waitlist`: api/waitlist
- **Typen mit Icons:** new_booking (cyan), booking_cancelled (rot), new_damage (amber), new_message (lila), new_customer (grün), overdue_return (rot), new_review (amber), payment_failed (rot), new_waitlist (cyan)

### Buchungsflow
5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)
- **Sets gefiltert** nach `product_ids` (Kamera-Kompatibilität) — nur passende Sets werden angezeigt
- **Set-Verfügbarkeit:** Nur Lagerbestand prüfen, NICHT Zubehör-Kompatibilität (Sets sind bereits per product_ids gefiltert)
- **Set-Preis:** `getSetPrice()` prüft `pricing_mode ?? pricingMode` (API gibt camelCase `pricingMode` zurück)
- Buchungsbestätigung antwortet sofort — PDF + E-Mail laufen im Hintergrund
- Kalender verhindert Buchung über ausgebuchte Tage hinweg (maxEndDate-Logik)

### Widerrufsrecht-Zustimmung § 356 Abs. 4 BGB
Wenn eine Buchung vor Ablauf der 14-tägigen Widerrufsfrist beginnt, muss der Kunde im Checkout ausdrücklich zustimmen, dass cam2rent vor Fristende mit der Leistung beginnt und dass sein Widerrufsrecht dadurch erlischt.
- **Checkbox** (3. im Checkout, conditional): Nur sichtbar wenn frühester `rentalFrom` < 14 Tage von heute. Buchen-Button disabled bis angekreuzt.
- **DB-Spalten** in `bookings` (Migration `supabase-widerruf-consent.sql`): `early_service_consent_at` (timestamptz) + `early_service_consent_ip` (text).
- **APIs:** `checkout-intent` speichert IP zusätzlich im Checkout-Context; `confirm-cart` + `create-pending-booking` schreiben Timestamp + IP in `bookings`.
- **Buchungsbestätigungs-E-Mail** enthält bei vorliegender Zustimmung einen zusätzlichen Satz in der Storno-Box: „Zustimmung zur vorzeitigen Leistungserbringung gemäß § 356 Abs. 4 BGB erteilt am TT.MM.JJJJ um HH:MM Uhr."
- **Vertragsparagraph § 13** („Widerrufsrecht") um einen zweiten Absatz ergänzt, der auf § 356 Abs. 4 BGB und die Zustimmung im Buchungsprozess verweist.
- Checkbox-Wortlaut: „Ich verlange ausdrücklich, dass cam2rent vor Ablauf der 14-tägigen Widerrufsfrist mit der Ausführung der Dienstleistung beginnt. Mir ist bekannt, dass mein Widerrufsrecht mit vollständiger Vertragserfüllung durch cam2rent erlischt (§ 356 Abs. 4 BGB)."

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
  - Block ist **immer sichtbar** (auch wenn noch kein Ausweis hochgeladen — dann Hinweis „Keine Ausweisbilder hochgeladen" und keine Buttons)
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

### Push-Notifications (Admin-PWA, Stand 2026-04-17)
Web-Push-Notifications für die Admin-PWA. Alle Events, die `createAdminNotification()` triggern (neue Buchung, Stornierung, Schaden, Nachricht, Bewertung), erzeugen automatisch auch eine Push-Notification — auch wenn die PWA gerade nicht offen ist.

- **Library:** `web-push` (npm) für VAPID-Push
- **DB:** `push_subscriptions` (id, endpoint UNIQUE, p256dh, auth, user_agent, device_label, created_at, last_used_at) — Migration `supabase-push-subscriptions.sql`
- **Lib:** `lib/push.ts` → `sendPushToAdmins({ title, body, url, tag })` — non-blocking, räumt expired Subscriptions automatisch auf (404/410)
- **APIs:**
  - `GET  /api/admin/push/vapid-key` (öffentlicher Key fürs Subscribe im Browser)
  - `POST /api/admin/push/subscribe` (speichert Endpoint per upsert)
  - `POST /api/admin/push/unsubscribe` (löscht Endpoint)
  - `POST /api/admin/push/test` (Test-Push an alle Geräte)
- **Service-Worker** (`public/sw.js`): `push` + `notificationclick` Handler — fokussiert bestehende Admin-Tabs oder öffnet neuen
- **UI:** `components/admin/PushNotificationsSection.tsx` in `/admin/einstellungen` — Subscribe/Unsubscribe/Test-Buttons, erkennt Browser-Support + Permission-Status + VAPID-Konfiguration
- **Hook:** `lib/admin-notifications.ts` ruft nach jedem `createAdminNotification` automatisch `sendPushToAdmins()` auf
- **Setup-Reihenfolge** (Go-Live):
  1. `npx web-push generate-vapid-keys`
  2. Coolify-Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:kontakt@cam2rent.de`
  3. SQL-Migration `supabase-push-subscriptions.sql` ausführen
  4. Admin-PWA installieren (Homescreen) → `/admin/einstellungen` → "Push aktivieren"

### Social-Media-Modul: FB + IG Auto-Posting (Stand 2026-04-19)
Vollautomatisches Posten auf Facebook-Page + Instagram-Business-Account über die Meta Graph API. Rein organisches Publishing — keine bezahlten Ads. KI-generierte Captions (Claude) + optional Bilder (DALL-E 3).

#### Architektur
- **DB-Tabellen** (`supabase-social.sql`):
  - `social_accounts` (id, platform, external_id, name, username, access_token, token_expires_at, linked_account_id, is_active)
  - `social_posts` (caption, hashtags, media_urls, media_type, link_url, platforms, fb/ig_account_id, fb/ig_post_id, status, scheduled_at, published_at, source_type, source_id, template_id, ai_generated, ai_prompt, error_message, retry_count)
  - `social_templates` (name, trigger_type, platforms, caption_prompt, image_prompt, default_hashtags, is_active) — 6 Seed-Vorlagen (Blog, Produkt, Set, Gutschein, Sommer, Winter)
  - `social_schedule` (name, template_id, frequency, day_of_week, day_of_month, hour_of_day, minute, next_run_at) — Redaktionsplan für wiederkehrende Posts
  - `social_insights` (post_id, platform, reach, impressions, likes, comments, shares, saves, clicks)
  - RLS aktiv, nur Service-Role-Zugriff
- **Lib (`lib/meta/`)**:
  - `graph-api.ts` — Meta Graph API Client (v21.0): OAuth, FB-Posting (Text/Photo/Album), IG zwei-Stufen-Publishing (Container + Publish), Insights, Long-Lived-Token-Exchange
  - `publisher.ts` — Orchestriert Cross-Posting FB+IG, Status-Tracking, Error-Handling pro Plattform (success/partial/failed)
  - `ai-content.ts` — `generateCaption()` (Claude Sonnet 4.6), `generateImage()` (DALL-E 3, 1:1), `generateFromTemplate()` Helper. Nutzt `admin_settings.blog_settings.anthropic_api_key` + `openai_api_key`
  - `auto-post.ts` — `autoPost(trigger, sourceId, variables)` non-blocking Helper. Erstellt Entwurf oder geplanten Post (Modus aus `admin_settings.social_settings.auto_post_mode`)
- **Admin-APIs** (`/api/admin/social/*`): accounts, posts, posts/[id], templates, templates/[id], schedule, schedule/[id], oauth, publish, generate, insights
- **Cron** (`/api/cron/social-publish`): Veröffentlicht fällige scheduled Posts, arbeitet Redaktionsplan-Einträge ab (KI-generiert), Re-Try fehlgeschlagener Posts (max 2). Crontab: `*/5 * * * *`

#### OAuth-Flow
- `/admin/social/einstellungen` → „Mit Facebook verbinden" → `/api/admin/social/oauth?action=start` → State-Cookie + Redirect zu Meta
- Meta-Callback → `/api/admin/social/oauth?code=...` → exchangeCodeForToken → exchangeLongLivedUserToken → getUserPages → für jede Page IG-Account ermitteln + alle als `social_accounts` upserten (60d Gültigkeit)
- Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `read_insights`, `business_management`

#### Auto-Trigger
- **Blog-Publish** (`/api/cron/blog-publish`): Hook ruft `autoPost('blog_publish', ...)` für jeden frisch veröffentlichten Artikel — non-blocking
- **Geplant:** Produkt-Trigger (neue Kamera/Set), Gutschein-Trigger — Hook in Admin-Routen einzubauen

#### Admin-UI
- **Sidebar:** Neuer Eintrag „Social Media" als Collapse unter „Content" (parallel zu Blog), state in `localStorage.admin_social_collapsed`
- **`/admin/social`** — Dashboard: KPI-Karten (Veröffentlicht/Geplant/Entwürfe/Fehler), verbundene Konten, letzte Posts
- **`/admin/social/posts`** — Liste mit Status-Filter, Bild-Vorschau, KI-Badge, Source-Type-Badge
- **`/admin/social/posts/[id]`** — Post-Editor: Caption/Hashtags/Bild/Link/Schedule bearbeiten, Sofort-Veröffentlichen, Insights-Sync, Löschen (lokal + remote optional)
- **`/admin/social/neu`** — Neuer Post: Template-Auswahl + Variablen-Eingabe + KI-Generierung (Claude+DALL-E), Sofort/Plan/Entwurf
- **`/admin/social/redaktionsplan`** — Wiederkehrende Posts (täglich/wöchentlich/monatlich + Uhrzeit), Pause/Aktivieren
- **`/admin/social/vorlagen`** — Vorlagen-Verwaltung: Trigger-Typ, Caption-Prompt, Bild-Prompt, Default-Hashtags
- **`/admin/social/einstellungen`** — Verbindungen-Seite mit OAuth-Button, Account-Liste pro Plattform, Trennen-Button

#### Voraussetzungen für Go-Live
1. **SQL-Migration** `supabase-social.sql` ausführen (5 Tabellen + Trigger + RLS + 6 Seed-Vorlagen)
2. **Meta Developer App** (`developers.facebook.com`):
   - App-Typ: Business
   - Redirect-URI: `https://cam2rent.de/api/admin/social/oauth`
   - Produkte: Facebook Login for Business + Instagram Graph API
3. **Coolify Env-Variablen:** `META_APP_ID`, `META_APP_SECRET`
4. **Business-Verifizierung** im Meta Business Manager (Handelsregister + Ausweis, 1-5 Werktage)
5. **App Review** für Permissions `pages_manage_posts`, `instagram_content_publish` (2-7 Werktage, Screencast erforderlich)
6. **Crontab Hetzner:** `*/5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/social-publish`
7. **Instagram-Account** als Business-Konto + mit FB-Page verknüpft (sonst kann die API nicht posten)

#### Kosten
- Meta Graph API: kostenlos
- Claude (Caption-Generierung): ~1-3 €/Monat bei 30 Posts
- DALL-E 3 (Bilder, optional): ~2-5 €/Monat bei 30 Posts
- **Summe: ~3-8 €/Monat** (KEINE bezahlten Ads — alles organisch)

#### Blog-Prinzip auf Social übertragen (Stand 2026-04-19, Phase 2)
Komplette Parallele zum Blog-System mit Themenpool, Serien, Redaktionsplan, Voll/Semi-Modus, 3-stufigem Faktencheck. Migration: `supabase-social-extended.sql`.

**Neue Tabellen:**
- `social_topics` (analog `blog_auto_topics`): Themenpool mit `used`-Flag, Kategorie (produkt/tipp/inspiration/aktion/bts/community/ankuendigung), Keywords, Plattformen, With-Image-Flag
- `social_series` + `social_series_parts` (analog blog_series): Mehrteilige Post-Serien mit Fortschrittszähler
- `social_editorial_plan` (analog blog_schedule): Konkreter Plan mit Datum/Uhrzeit + Status-Workflow `planned → generating → generated → reviewed → published`, inkl. `post_id`-Verknüpfung, Serien-Part-Link, `error_message` für Retry-Anzeige

**Neue APIs** (alle `/api/admin/social/*`):
- `topics` + `topics/[id]` (CRUD)
- `series` + `series/[id]` (CRUD, nested parts)
- `editorial-plan` + `editorial-plan/[id]` (CRUD, bei `scheduled_date`/`scheduled_time`-Änderung wird verknüpftes `social_posts.scheduled_at` mitaktualisiert)
- `editorial-plan/[id]/generate` (POST) — sofort-Generierung ohne Scheduler-Check
- `templates/seed` — idempotente Standard-Vorlagen-Import (Community/UGC, Ankündigung, Frage, Testimonial)
- `upload-image` — Datei-Upload (multipart, max 10 MB) in Supabase Storage Bucket `blog-images`
- `settings` — `admin_settings.social_settings` read/write
- `generate-plan` (Background-Job mit Status-Polling via `admin_settings.social_plan_job`): Bulk-Generierung mit Cancel-Möglichkeit, Fortschritt live sichtbar

**Neuer Cron `/api/cron/social-generate`** (stündlich, `0 * * * *`):
- Scheduler-Checks: Wochentag + Zeitfenster aus `social_settings`
- Vorlaufzeit `schedule_days_before` (default 2 Tage)
- Re-Entry-Schutz 10 Min via `admin_settings.social_generation_status`
- 3-stufiger Faktencheck (Brand-Wächter + Stil-Prüfer, `fact_check_enabled`)
- Voll-Modus: Post direkt `scheduled` → `social-publish` postet automatisch
- Semi-Modus: Post als `draft` → Admin muss freigeben
- Kern-Logik extrahiert in `lib/meta/generate-plan-entry.ts`, wird auch vom Sofort-Generate-Button aufgerufen

**Neue Admin-UI-Seiten:**
- `/admin/social/themen` — Tabs Einzelthemen + Serien (anlegen/löschen/verwalten, Fortschrittsbalken)
- `/admin/social/zeitplan` — 3-Spalten-Layout: Import-Datum + offene Themen + Serien | Plan-Liste mit Datum-Kachel
  - Kachel klickbar → Inline-Edit für Datum + Uhrzeit
  - Buttons: `⚡ Jetzt generieren` (bei `planned`), `🚀 Jetzt posten` (bei `generated`), `✓ gesehen`, `Überspringen`, `Löschen`, `Mehr` (Keywords/Prompt/Timestamps)
  - Post-Preview mit Caption + Bearbeiten-Link wenn generiert
- `/admin/social/plan` — KI-Bulk-Generator: N Tage, M Posts/Woche, Uhrzeit, Plattformen, with_images-Toggle
  - Background-Job, Seite darf verlassen werden, Progress-Bar + Live-Log der letzten 10 Schritte
  - Berücksichtigt letzte 200 Captions aus letzten 180 Tagen als "bereits behandelt" (Topic-Dedupe)

**Dashboard erweitert** (`/admin/social`):
- Live-Ampel (🟢/🟡/🔴) mit KI-Bot-Status, pollt alle 5 Sek
- `Neu laden`-Button oben rechts
- Nächste 5 Plan-Einträge als Teaser

**Einstellungen erweitert** (`/admin/social/einstellungen`):
- Block "Automatische Generierung" (Toggle + Modus Semi/Voll + Vorlaufzeit + Wochentage-Pills + Zeitfenster + Faktencheck-Toggle)
- Block "KI-Konfiguration": Standard-Ton, Zusatz-Kontext (Textarea), Globale Standard-Hashtags
- Button `⚡ Empfohlene Einstellungen laden` füllt Felder mit optimalen cam2rent-Vorgaben
- Auto-Post-Modus (draft/scheduled/published) + Delay-Minuten + pro-Trigger-Toggle

**Sidebar:** Social-Collapse um `Themen & Serien`, `Redaktionsplan` (= `/zeitplan`), `KI-Plan (Bulk)` erweitert.

**Freitext-Modus im Neuer-Post-Editor:**
- Wenn keine Vorlage gewählt: großes Textfeld für Ankündigungen/Community-Posts/Feature-Updates
- Placeholder zeigt UGC-Beispiele (Foto-Contest, Umfrage, Team-Update)
- Checkbox "Bild mit DALL-E generieren"
- Button "KI-Post erstellen" → Claude schreibt fertigen Post inkl. Hashtags

**Foto-Realismus-Booster** (`enhanceForPhotoRealism` in `ai-content.ts`):
- Hängt automatisch Anti-KI-Hints an jeden DALL-E-Prompt (iPhone 15 Pro, 35mm, keine 3D/CGI/illustration, natural skin)
- Greift nur wenn User-Prompt keinen expliziten Stil vorgibt
- Deutlich realistischere Bilder (weniger KI-Marketing-Look)

**Bild-Upload:**
- Button `📷 Hochladen` in `/admin/social/neu` + `/admin/social/posts/[id]` neben der Bild-URL
- Neue Standard-Vorlagen (via `/api/admin/social/templates/seed`): Community/UGC, Website-Ankündigung, Frage an die Community, Erfolgsgeschichte/Testimonial
- Button "↓ Standard-Vorlagen importieren" in `/admin/social/vorlagen` (idempotent)

#### Post-Permalinks (Stand 2026-04-19)
Meta gibt nach Publish nur nummerische Media-IDs zurück. Instagram-URLs brauchen aber Shortcodes (`/p/DAbC_123xy/`), keine numerischen IDs. Unser Link-UI führte deshalb zu "Beitrag nicht verfügbar".
- **Migration:** `supabase-social-permalinks.sql` — zwei Spalten `fb_permalink` + `ig_permalink` auf `social_posts`
- **Graph-API-Helper:** `getFacebookPermalink(postId, token)` (nutzt `?fields=permalink_url`) + `getInstagramPermalink(mediaId, token)` (`?fields=permalink`)
- **Publisher:** Nach erfolgreichem Publish werden pro Plattform die Permalinks geholt und in die DB gespeichert
- **UI:** "Auf FB/IG ansehen"-Links nutzen den Permalink; Fallback-Hinweis bei alten Posts: "(Link wird beim nächsten Post erfasst)"
- **Go-Live TODO:** SQL-Migration ausführen

#### Dev-Mode vs. Live-Mode (Meta-App)
Solange die App im "Development Mode" ist, sehen Posts nur App-Admins + Tester. Für öffentliche Sichtbarkeit muss die App auf "Live" geschaltet werden: Meta Developer Dashboard → Seitenpunkt "Veröffentlichen" → Button "App veröffentlichen". Voraussetzung: Datenschutz-URL, AGB-URL, Kategorie, App-Domain sind gesetzt (haben wir). Standard-Access auf Permissions reicht für eigene Kanäle — **kein App Review nötig** solange nur cam2rent-eigene FB-Page + IG-Business bespielt werden.

#### Saison-Guard (Stand 2026-04-20)
Claude bekommt sonst kein Datum mit und erfindet z.B. Ski-Posts im April. Drei Stellen wurden gehärtet:
- **`lib/meta/season.ts`** — `seasonPromptBlock(date)` + `isTopicOutOfSeason(text, date)` + `getSeasonContext(date)`. Kennt Winter (Dez-Feb), Frühling (Mär-Mai), Sommer (Jun-Aug), Herbst (Sep-Nov) mit passenden Aktivitäten + Verbotsliste (z.B. "Skitour" im Frühling/Sommer/Herbst).
- **`generateCaption()` in `lib/meta/ai-content.ts`** — nimmt optional `postDate` und hängt den Saison-Block ("Heutiges Datum: …, Saison: Frühling. Verbot: Skitour, Schnee, …") an den System-Prompt. Standard: `new Date()`.
- **`generate-plan-entry.ts`** — übergibt `scheduled_date` als `postDate` und setzt saisonfremde Einträge auf `status='skipped'` statt zu generieren.
- **`/api/admin/social/generate-plan`** (KI-Themenplanung) — Saison-Block im Topic-Prompt + defensives Nachfiltern pro Datum; droppt saisonfremde Ideen und zeigt das im Job-Status.

#### Unabhaengige Bild-Positionierung pro Plattform (Stand 2026-04-20)
FB und IG zeigen Bilder in unterschiedlichen Aspect-Ratios (FB 4:5 portrait, IG 1:1 square). Der Admin kann jetzt den Bildausschnitt pro Plattform getrennt setzen — Vorschau UND echter Post folgen der Wahl.
- **DB-Migration:** `supabase-social-image-position.sql` — zwei TEXT-Spalten `fb_image_position` + `ig_image_position` auf `social_posts`, Default `'center center'`. Format: CSS object-position ("50% 30%").
- **UI:** `components/admin/ImagePositionPicker.tsx` — 9-Punkt-Raster (3x3) zum Anklicken. In beiden Editoren (`/admin/social/neu` + `/admin/social/posts/[id]`) direkt unter der Vorschau. "← IG-Position uebernehmen"-Link wenn beide Plattformen aktiv.
- **Preview:** `SocialPostPreview` nimmt `fbImagePosition` + `igImagePosition` und setzt sie als `style={{ objectPosition }}` auf das jeweilige `<img>`.
- **Publish:** `lib/meta/publisher.ts` → `cropImageForPlatform(url, aspect, position)` laedt das Bild, croppt mit sharp rund um den Focal-Point und lud das Ergebnis in `blog-images/social-crop-*.jpg`. FB kriegt 4:5, IG 1:1. Bei Position='center center' wird das Original unveraendert uebergeben (kein unnoetiges Re-Upload).
- **Go-Live TODO:** SQL-Migration ausfuehren.

#### Media-Library-Picker (Stand 2026-04-20)
Drei Bildquellen im Post-Editor (`/admin/social/neu` + `/admin/social/posts/[id]`): KI (bestehend), 📚 Bibliothek (neu), 📷 vom PC.
- **API:** `GET /api/admin/social/media-library` liefert kategorisierte Bildliste: Produkte (aus `admin_config.products`), Sets (`sets.image_url`), Blog (`blog_posts.featured_image`, 60 neueste), Social-Uploads (Storage `blog-images`, Prefix `social-`, 200 neueste).
- **Komponente:** `components/admin/MediaLibraryPicker.tsx` — Modal mit 4 Tabs + Suche + Thumbnail-Grid (4 Spalten auf Desktop). Klick auf Thumbnail uebernimmt die URL ins Bild-Feld.
- **Button:** "📚 Bibliothek" steht links neben "📷 Hochladen" in beiden Editoren. Beide Quellen gleichberechtigt.

#### Bild-KI mit Produktbild als Referenz (Stand 2026-04-20)
DALL-E 3 erfand sonst 20-Jahre-alte Kompaktkameras. Neu: Echte Shop-Produktbilder werden als Referenz an `gpt-image-1` (OpenAI, April 2025) übergeben, damit die generierte Szene die **exakte** Kamera enthält.
- **`lib/meta/product-image-resolver.ts`** — `resolveProductForPost(text)` scored Topic+Angle+Keywords gegen alle Shop-Produkte (Name/Brand/Model/Slug/Token-Matching, Threshold 10 = mindestens Modell-Match). Liefert bis zu 3 Produktbilder als Referenz. Reine Marken-Erwähnungen matchen nicht (zu unscharf).
- **`generateImageWithProductReference()`** in `ai-content.ts` — `gpt-image-1` edit-Endpoint, lädt Produktbilder via `toFile()` und baut sie in eine neue Szene ein. Prompt zwingt die KI, Kamera-Design, Proportionen, Farbe, Linsen-Position aus der Vorlage zu übernehmen. Output als `b64_json`, landet via `uploadToSocialStorage()` im `blog-images`-Bucket.
- **`generateSocialImage(scenePrompt, sourceText)`** — Smart-Wrapper: versucht erst `gpt-image-1` mit Referenz, fällt bei Fehler/ohne Match auf DALL-E 3 zurück. DALL-E bekommt dann den `modernCameraHint()` ("muss aussehen wie Hero 12 / Osmo Action 5 Pro / X4, NIEMALS retro Camcorder").
- **Eingebaut in:** `generateFromTemplate` (Auto-Post-Trigger), `generate-plan-entry.ts` (manuelle + Cron-Einzel-Generierung), `/api/admin/social/generate-plan` (Bulk-Plan), `/api/cron/social-generate` (stündlicher Cron).
- **Kosten:** `gpt-image-1` kostet ~$0.04-0.19 pro Bild (high quality). Bei 30 Posts/Monat ~1-6 €, DALL-E 3 vergleichbar. Fallback auf DALL-E bleibt erhalten, falls OpenAI gpt-image-1 blockt.

#### Post-Editor: KI-Neu-Generierung + Unsplash-Picker (Stand 2026-04-20)
Im Social-Post-Editor (`/admin/social/posts/[id]` + `/admin/social/neu`) stehen fünf Bildquellen zur Verfügung: 🎨 KI neu, 📸 Unsplash, 📚 Bibliothek, 📷 Hochladen, ✕ entfernen.

- **KI-Neu-Generierung:** `POST /api/admin/social/generate-image` — ruft intern `generateSocialImage(scenePrompt, caption)` auf (gpt-image-1 mit Produkt-Referenz, Fallback DALL-E 3). Rate-Limit: 20/h pro IP (Kosten-Schutz gegen Doppelklick-Spam). Button erfordert Caption (sonst grau). Confirm-Dialog mit Kosten-Hinweis (~0,04–0,19 €) vor dem Call.
- **Unsplash-Picker:** `components/admin/UnsplashPicker.tsx` — Modal mit Suche + Thumbnail-Grid. Vorschlags-Suchbegriff = erste 3 Worte der Caption. Nutzt `orientation=squarish` für Social-geeignete 1:1-Formate.
  - `GET /api/admin/social/unsplash?query=…&orientation=squarish` — Suche (12 Ergebnisse).
  - `POST /api/admin/social/unsplash` — lädt Bild in `blog-images`-Bucket, triggert Unsplash-Download-Event (API-Richtlinien-Pflicht), gibt öffentliche Supabase-URL zurück.
  - Recycelt den Access-Key aus `admin_settings.blog_settings.unsplash_access_key` — gleicher Key wie für Blog.
  - Fotografen-Credit wird pro Thumbnail + im Modal-Footer angezeigt.

#### KI-Plan Staleness-Detection + Reset (Stand 2026-04-20)
Der KI-Plan-Generator (`/admin/social/plan`) lief als Fire-and-Forget im Hintergrund. Wenn Next.js den Prozess killte (Deploy, OOM, Timeout), blieb `admin_settings.social_plan_job` ewig auf `status='running'` — User konnte keinen neuen Plan starten, UI zeigte „Läuft im Hintergrund…" für immer.
- **Staleness-Detection in `/api/admin/social/generate-plan` POST:** Jobs > 10 Min alt gelten als stale und dürfen überschrieben werden (kein 409 mehr).
- **DELETE `?reset=1`:** Kompletter Status-Reset auf idle — auch bei error/completed/cancelled/stale. Löscht nur die Status-Row in `admin_settings`, bereits erstellte Posts bleiben.
- **UI:** `JobStatusPanel` zeigt amber-gelbes Banner bei stale + "Zurücksetzen"-Button bei allen Endzuständen. Fallback-Text „Keine Details verfügbar" statt leerer roter Box.
- **Route-Config:** `export const runtime = 'nodejs'; export const maxDuration = 300;` — reduziert (aber eliminiert nicht) Serverless-Kills des Hintergrund-Teils.
- **Sofort-Reset per SQL** falls Zombie-State vor Deploy: `DELETE FROM admin_settings WHERE key = 'social_plan_job';`

#### Analytics-Dashboard Defaults + dynamischer Chart (Stand 2026-04-20)
- **Default-Zeitraum:** `DEFAULT_FILTERS.timeRange` von `'30tage'` auf `'heute'` geändert — beim Öffnen von `/admin/analytics` ist sofort „Heute" aktiv.
- **Bar-Chart folgt dem Filter:** Die Card „Aufrufe…" zeigt jetzt je nach Zeitraum-Filter:
  - Heute → 24 Stunden-Balken (HourlyChart, wie bisher)
  - 7 Tage / 30 Tage → pro-Tag-Balken über den gewählten Zeitraum
  - Monat → pro-Tag-Balken vom 1. des Monats bis heute
  - Jahr → 12 Monats-Balken (Jan-Dez)
- **Neue Komponente:** `LabeledBarChart` (Balken mit Datum-Labels, Tick-Dichte passt sich an)
- **Helper:** `getViewsChartTitle(tr)` + `buildFilteredViews(tr, history)` — aggregiert History-Daten in die passenden Buckets.
- **API:** `/api/admin/analytics?type=history` akzeptiert jetzt `?days=N` (max 400, für Jahresansicht). Live-Tab fetcht History automatisch nach, wenn `timeRange !== 'heute'`.

#### Timezone-Fix: Berlin-Zeit überall (Stand 2026-04-20)
Der Hetzner-Server läuft in UTC. Ohne explizite `timeZone`-Option nutzen `toLocaleDateString`, `getHours`, `getDate`, `toISOString().slice(0,10)` die Server-Timezone → zwischen 22:00-02:00 Berlin landen Daten auf dem UTC-Tag (Vortag/Vorwoche/Vorjahr/Vormonat). Hat sich u.a. als „Aufrufe heute 22-24 Uhr obwohl erst 01:23" gezeigt.
- **`lib/format-utils.ts`:** alle `fmtDate*`-Varianten nutzen jetzt `timeZone: 'Europe/Berlin'` → zentraler Fix für Rechnungen, Verträge, Admin-UI, E-Mails, alle PDFs.
- **`lib/timezone.ts`:** neue Helper `getBerlinHour(date)` + `getBerlinDateKey(date)` für Server-Aggregation.
- **`lib/booking-id.ts`:** Buchungsnummer (Jahr+KW) in Berlin-Zeit berechnet → Rechnungsnummer (abgeleitet) automatisch mitgefixt. Keine Silvester-/Wochenwechsel-Bugs mehr.
- **Analytics:** Hourly-Chart, History-Gruppierung, Buchungstrend, Blog-Tagesaggregate nutzen Berlin-Stunde/-Tag.
- **Buchhaltung:** Umsatzverlauf 12 Monate mit Berlin-Monatsgrenzen (Dezember-Umsatz rutschte sonst in Silvester-Nacht in Januar). Gutschriftnummer-Jahr in Berlin (Silvester-Bug).
- **Buchungen/Mietdauer:** `extend-booking`, `cron/auto-cancel`, `dashboard-data`, `utilization` nutzen Berlin-„heute".
- **Crons:** `reminder-emails`, `dunning-check`, `social-generate`, `blog-generate` berechnen „heute" + Offsets in Berlin.
- **E-Mails:** `booking/send-email` Mietzeitraum-Anzeige, `lib/email.ts` Rechnungsdatum + BGB-Zustimmungszeit, `lib/legal-pdf.tsx` Stand-Datum, `components/LegalPage.tsx` Stand-Datum — alles Berlin.

#### Resilienz gegen Supabase-Ausfälle (Stand 2026-04-20)
Bei Supabase-522 (Free-Tier-Compute-Overload) ist die Admin-UI + der Docker-Build sonst sehr anfällig. Zwei Härtungen:
- **NotificationDropdown Backoff:** Statt stur alle 30s zu pollen, verdoppelt sich das Intervall bei Fehlern (30s→60s→120s→240s→300s). Reset bei Erfolg. Polling pausiert wenn Tab im Hintergrund (`visibilityState`). 8s AbortController-Timeout verhindert gestapelte Pending-Calls. Entschärft 522-Kaskaden und senkt Free-Tier-Traffic drastisch.
- **Legal-Page Build-Timeout-Fallback:** `lib/get-legal-content.ts` wrappt jede Supabase-Query in `Promise.race` mit 5s-Timeout. Bei Timeout/Fehler → `null` → `components/LegalPage.tsx` rendert die hardcoded JSX-Version. Vorher: `/agb` und `/haftungsbedingungen` haben den Docker-Build mit 60s×3 Retries komplett abgewürgt, wenn Supabase hängte.

### Warteliste für Kameras ohne Seriennummer (Stand 2026-04-18)
Interesse an neuen Kameras testen, bevor sie eingekauft werden: Sobald für eine Kamera noch keine `product_unit` mit `status != 'retired'` angelegt ist, zeigt der Shop statt "Jetzt mieten" eine "Benachrichtige mich"-Box mit E-Mail-Formular.

- **DB-Tabelle:** `waitlist_subscriptions` (id, product_id, email, source, created_at, notified_at, UNIQUE(product_id, email)) — Migration `supabase-waitlist.sql`, RLS aktiviert (nur Service-Role)
- **API:** `POST /api/waitlist` (`{ productId, email, source }`) — idempotent bei Duplikaten, legt automatisch Admin-Notification `new_waitlist` an (inkl. Push)
- **Admin-API:** `GET/DELETE /api/admin/waitlist` — durch Admin-Middleware geschützt
- **Admin-Seite:** `/admin/warteliste` (neuer Eintrag in Sidebar-Gruppe "Kunden & Kommunikation", Bell-Icon) — zeigt Einträge gruppiert nach Kamera + Löschen
- **Detection:** `lib/get-products.ts` lädt zusätzlich alle `product_units` (außer `retired`) und setzt `Product.hasUnits` (optional boolean). Waitlist-Modus = `hasUnits === false`.
- **Shop-UI:**
  - `ProductCard.tsx`: Statt "Jetzt mieten"/"Ausgebucht" → blauer "Benachrichtige mich"-Button + Badge "Demnächst verfügbar"
  - Produktdetailseite `/kameras/[slug]`: Statt Kalender → neue Komponente `WaitlistCard.tsx` mit Bell-Icon + Formular
- **`NotifyModal.tsx`** übernimmt jetzt `productId` + `source` (`'card' | 'detail'`) und postet echt gegen `/api/waitlist` — Loading-/Error-States ergänzt
- **Notifications:** `new_waitlist`-Typ im `NotificationDropdown` (cyan Bell-Icon)

### Seriennummern-Scanner
QR-/Barcode-Scanner für die Admin-PWA, nutzt native `BarcodeDetector`-API (Chrome/Edge/Safari ≥ 17), Fallback auf manuelle Texteingabe. Erkennt: QR, EAN-13/8, Code128, Code39, Code93, Codabar, DataMatrix, ITF, UPC.

- **Komponente:** `components/admin/SerialScanner.tsx` — Modal mit `open/onResult/onClose/title` Props, stoppt Kamera-Stream automatisch bei Close
- **Eingebunden in:** `/admin/buchungen/neu` — Button neben dem Seriennummer-Feld pro Kamera
- **Erweiterungen geplant:** Versand-Druck-Seite (Übergabebestätigung), Buchungsdetails

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
- **E-Mails:** Header-Logo als gehostete PNG (`https://cam2rent.de/favicon/icon-dark-64.png`) in allen 12 Resend-Headern (`lib/email.ts`, `lib/reminder-emails.ts`, `lib/contracts/send-contract-email.ts`)
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
- **Dockerfile:** `NODE_OPTIONS=--max-old-space-size=2560 --max-semi-space-size=64` für Build (nach Server-Upgrade auf CPX32 mit 8 GB RAM hochgesetzt)
- **outputFileTracingExcludes:** @swc, @esbuild, typescript, eslint, sharp (spart RAM beim "Collecting build traces")
- **Sitemap dynamic:** `app/sitemap.ts` nutzt `dynamic = 'force-dynamic'` + `revalidate = 3600` + `withTimeout(5s)` für DB-Calls. Wird nicht mehr beim Build generiert (sonst Build-Timeout bei langsamer Supabase).
- **Server:** Hetzner Cloud CPX32 (4 vCPU AMD, 8 GB RAM) — Upgrade von CX23 am 2026-04-19 wegen Build-OOM bei großen Dependency-Trees (Social-Modul).

## Timezone-Helper (`lib/timezone.ts`, Stand 2026-04-19)
Kritischer Fix: `new Date().setHours(0,0,0,0).toISOString()` verschiebt das Datum um die Server-TZ-Differenz (Server läuft UTC, aber App denkt Berlin). Analytics-Queries für "heute" lieferten deshalb 0, weil sie ab 22:00 UTC des Vortags filterten.
- `getBerlinDayStart(date?)` — Mitternacht in Berlin-Zeit als UTC-Date (mit Sommer-/Winterzeit-Handling via `Intl.DateTimeFormat timeZoneName='longOffset'`)
- `getBerlinDayStartISO(date?)` — dasselbe als ISO-String für Supabase `.gte()`
- `getBerlinDaysAgoISO(n)` — Start vor N Tagen in Berlin-TZ
- `utcToBerlinLocalInput(iso)` — UTC-ISO → `YYYY-MM-DDTHH:mm` für `<input type="datetime-local">`
- `berlinLocalInputToUTC(input)` — Umkehrung (Input ist in Berlin-Zeit gemeint) → UTC-ISO
- Eingesetzt in `analytics/route.ts` (live/today/bookings), `daily-report/route.ts`, `editorial-plan/[id]/route.ts`, Post-Editor (neu + detail)

## Analytics-Fixes (Stand 2026-04-19)
- **Live-Tab respektiert Zeitraum-Filter**: API `type=live` nimmt `range=today|7d|30d|month`, Kacheln zeigen dynamische Labels ("Seitenaufrufe — 30 Tage"). `active_count` bleibt letzte 5 Min (Echtzeit).
- **Timezone-Bug** in 3 Stellen (live/today/bookings) behoben, nutzt jetzt `getBerlinDayStartISO()`
- **Track-Endpoint loggt DB-Fehler** (vorher silent catch) — bei fehlender Tabelle / RLS-Problem sofort in Coolify-Logs sichtbar

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
0 * * * *    curl -s -X POST "https://test.cam2rent.de/api/cron/blog-generate?secret=<CRON_SECRET>"
*/10 * * * * curl -s -X POST "https://test.cam2rent.de/api/cron/blog-publish?secret=<CRON_SECRET>"
30 18 * * 0  curl -s -X POST -H "x-cron-secret: <CRON_SECRET>" "https://test.cam2rent.de/api/cron/weekly-report"
```
- **Generate:** Jede Stunde. Bei Intervall "daily" kein Wochentag-Check. Max 5 Artikel/Tag.
- **Publish:** Alle 10 Min. Voll-Modus: automatisch. Semi-Modus: nur wenn "Gesehen"-Haken gesetzt.
- **Weekly-Report:** Jeden Sonntag 18:30 (Server-Zeit). Holt letzte-7-Tage-Metriken, baut PDF + HTML-Email und schickt an `admin_settings.weekly_report_config.email` (Default: `BUSINESS.emailKontakt`). Ein-/Ausschalter + Empfänger unter `/admin/einstellungen`. Kann deaktiviert werden, ohne den Crontab-Eintrag anfassen zu müssen.
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
- **Muster-Vertrag-PDF:** Button „Muster-Vertrag als PDF öffnen" generiert einen Beispiel-Mietvertrag mit Dummy-Daten (Max Mustermann, GoPro Hero13 Black, 7 Tage). Nutzt dieselbe Pipeline wie echte Buchungen (`generateContractPDF`) inkl. der aktuell gespeicherten Vertragsparagraphen aus `admin_settings`. API: `GET /api/admin/legal/sample-contract`.
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
- `GET /api/admin/legal/sample-contract` — Muster-Mietvertrag als PDF mit Dummy-Daten
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

### Wochenbericht (Stand 2026-04-20)
Automatische E-Mail mit **PDF-Anhang** jeden Sonntag 18:30 Uhr Server-Zeit. Sammelt Kennzahlen der letzten 7 Tage + Vergleich zur Vorwoche.

- **Datensammlung:** `lib/weekly-report.ts` → `collectWeeklyReportData()`. 14 parallele Supabase-Queries, typisiert als `WeeklyReportData`. Metriken:
  - **Finanzen:** Umsatz vs. Vorwoche, bezahlte + offene Rechnungen, überfälliger Betrag
  - **Buchungen:** neue vs. Vorwoche, Stornierungen, Top-5-Produkte, nächste 7 Tage Versand/Rückgabe
  - **Kunden:** Neuregistrierungen, offene Verifizierungen, neue Waitlist-Einträge
  - **Operativ:** neue Schäden, Kameras in Wartung
  - **Content:** veröffentlichte Blog-Artikel + Social-Posts
  - **Warnungen:** abgelaufene/bald ablaufende Social-Tokens (< 14 Tage)
- **PDF:** `lib/weekly-report-pdf.tsx` — @react-pdf/renderer mit KPI-Karten, Produkt-/Versand-/Rückgabe-Tabellen, Warn-Box. Dateiname: `cam2rent-wochenbericht-KW{week}-{year}.pdf`.
- **E-Mail:** `sendWeeklyReport(toEmail?)` in `lib/email.ts` — HTML-Zusammenfassung inline mit Trend-Anzeige (grün/rot) + PDF als Attachment. Loggt in `email_log` (emailType: `weekly_report`).
- **Cron:** `GET/POST /api/cron/weekly-report` (verifyCronAuth). Respektiert `admin_settings.weekly_report_config.enabled` — kann per UI deaktiviert werden ohne den Crontab-Eintrag anzufassen.
- **Test:** `POST /api/admin/weekly-report/test` → Sofort-Versand an konfigurierten Empfänger oder Body-Email.
- **Admin-UI:** `components/admin/WeeklyReportSection.tsx` in `/admin/einstellungen`. Toggle (an/aus), Empfänger-Mail, „Test-Bericht jetzt senden"-Button.
- **Setting-Key:** `admin_settings.weekly_report_config = { enabled: boolean, email: string }`. Default: aktiv, Empfänger = `BUSINESS.emailKontakt`.

### Security-/Stabilitäts-Fixes (2026-04-17)
- **Shop-Updater Eingabe-Bug:** `loadSections` normalisiert jetzt alle 4 Sections (hero, news_banner, usps, reviews_config) beim Laden. Vorher: `updateSectionLocal` nutzte `prev.map`, wenn die DB-Row fehlte oder `content` leer war, verpufften Tastatureingaben. Jetzt garantiert die Load-Normalisierung die Existenz im State + Merge mit Feld-Defaults.
- **IDOR Fix `/api/invoice/[bookingId]`:** Auth-Check wie in `/api/rental-contract`. Nur eingeloggter Besitzer der Buchung (oder Admin via `checkAdminAuth`) darf die Rechnung laden. Vorher war die URL ein DSGVO-Leak (Name, Adresse, Zahlungsdaten).
- **Race Condition Unit-Zuweisung:** `assignUnitToBooking` nutzt jetzt die Postgres-Funktion `assign_free_unit` mit `pg_advisory_xact_lock` (serialisiert parallele Zuweisungen pro Produkt). Fallback auf die alte Logik, falls die Migration noch nicht ausgeführt wurde.
- **Stripe-Webhook Idempotenz:** `.like()` → `.eq()` — `payment_intent_id` wird exakt gespeichert, Wildcard war unnötig.

### Security- & Performance-Audit-Fixes (2026-04-20)
Umfassendes Audit mit paralleler Agent-Analyse (Security/Code-Quality/Performance/Business-Logic). Alle Findings (außer `TEST_MODE` — Go-Live-Blocker, wird am 01.05. gekippt) wurden behoben:

- **Prompt-Injection-Sanitizer** `lib/prompt-sanitize.ts` — neutralisiert User-Input vor Einbau in System-Prompts: Backticks, Injection-Sequenzen (`ignore previous instructions`, `<|...|>`, `system:`), Control-Chars, Längen-Cap. Angewendet in [blog/generate](app/api/admin/blog/generate/route.ts) (`topic`, `keywords`, `referenceProducts`) + [meta/ai-content.ts](lib/meta/ai-content.ts) (Template-Variablen).
- **Magic-Byte-Check** `lib/file-type-check.ts` — prüft echte Binär-Signatur (JPEG/PNG/WebP/HEIC/GIF), Client-MIME wird ignoriert. Angewendet in [upload-id](app/api/upload-id/route.ts), [product-images](app/api/product-images/route.ts), [set-images](app/api/set-images/route.ts).
- **Preis-Plausibilitätsprüfung** — zwei-stufig: [checkout-intent](app/api/checkout-intent/route.ts) blockt präventiv, [confirm-cart](app/api/confirm-cart/route.ts) prüft `intent.amount` (echte Stripe-Wahrheit) gegen server-berechneten Basispreis aus DB (`calcPriceFromTable`). 70 % Rabatt-Puffer. Fängt Client-Manipulation (z.B. `amountCents: 100` statt 50.000).
- **Admin-Cookie `sameSite: 'strict'`** in [login](app/api/admin/login/route.ts:86) + [logout](app/api/admin/logout/route.ts) — CSRF-Surface geschlossen.
- **Unit-Assignment Fallback entfernt** in [lib/unit-assignment.ts](lib/unit-assignment.ts) — RPC `assign_free_unit` ist Pflicht; Fehler wirft jetzt sauber, statt in race-anfällige Alt-Logik zu fallen (`.catch()` der Aufrufer fangen's).
- **Rate-Limit Hard-Cap** [lib/rate-limit.ts](lib/rate-limit.ts) — Map begrenzt auf 10k Einträge (FIFO-Eviction), schützt gegen IP-Rotation-DoS des In-Memory-Stores.
- **test-email Rate-Limit** [test-email](app/api/admin/test-email/route.ts) — 10/min pro IP als Defense-in-Depth falls Admin-Cookie kompromittiert.
- **Gantt-API N+1 Fix** [availability-gantt](app/api/admin/availability-gantt/route.ts) — 3× `.filter()` in Produkt-Loop → Gruppen-Maps in O(n). Zubehör/Set-Auflösung: eine Pass statt `accessories × bookings × setItems`.
- **Hot-Path `.select('*')`** → Spaltenlisten in [admin/kunden](app/api/admin/kunden/route.ts) (Ausweis-Bilder nicht mehr in Liste), Gantt `product_units`.
- **DB-Indizes** `supabase-performance-indizes.sql` — 8 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (bookings.user_id, bookings.created_at, bookings(product_id, rental_from, rental_to), email_log.booking_id, blog_posts(status, created_at), social_posts(status, scheduled_at), waitlist_subscriptions.product_id, rental_agreements.booking_id).

### Mobile-Fixes (2026-04-17)
- **Viewport-Export** in `app/layout.tsx`: `device-width`, `initialScale: 1`, `viewportFit: 'cover'` (iOS Safe-Area aktiv) — Next.js 15 Pattern.
- **CookieBanner z-[60]** + `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`: liegt jetzt über CompareBar, iOS Home-Indicator überlagert nicht mehr.
- **CompareBar safe-area-inset-bottom**: Content verschwindet nicht mehr hinter iOS Home-Indicator.
- **Checkout-Inputs** `text-sm` → `text-base` (16px): verhindert iOS Safari Auto-Zoom beim Input-Fokus.
- **ProductCard Favoriten-/Vergleich-Buttons** `p-1.5` → `p-2.5`: Touch-Targets jetzt ~44px (Apple HIG).

## Offene Punkte

### Check-Tool
- **`supabase-migrationen-status-check.sql`** — Read-only SQL-Script im Repo-Root. Listet je Migration "ERLEDIGT" oder "OFFEN". Nach jedem Deploy neuer Migrationen einfach nochmal laufen lassen und erledigte manuell nach `erledigte supabase/` verschieben.

### Ausgeführte Migrationen (erledigt)
- ~~Google Reviews: Places API (New) eingebunden~~
- ~~`supabase-zubehoer-verfuegbarkeit.sql`~~
- ~~`supabase-widerruf-consent.sql`~~ (§ 356 Abs. 4 BGB Consent)
- ~~`supabase-product-units.sql`~~ (Seriennummern-Tracking)
- ~~`supabase-unit-assignment-lock.sql`~~ (race-sichere Unit-Zuweisung)
- ~~`supabase-push-subscriptions.sql`~~ + VAPID-Keys (Admin-PWA-Push live)
- ~~`supabase-social.sql` + `-extended` + `-image-position` + `-permalinks`~~ (Social-Modul komplett)
- ~~`supabase-waitlist.sql`~~ (Benachrichtige-mich-Liste)
- ~~`supabase-coupon-atomic-increment.sql`~~ (Gutschein-Race-Fix)
- ~~`supabase-invoice-numbers-gobd.sql`~~ (GoBD-Counter angelegt, Code-Umstellung folgt separat zum Jahreswechsel mit Steuerberater-Rücksprache)
- ~~`supabase-storage-rls.sql`~~ (Bucket-RLS contracts/id-documents/damage-photos)
- ~~`supabase-performance-indizes.sql`~~ (8 Indizes: bookings.user_id, bookings.created_at, bookings(product_id,rental_from,rental_to), email_log.booking_id, blog_posts(status,created_at), social_posts(status,scheduled_at), waitlist_subscriptions.product_id, rental_agreements.booking_id)

### Noch offen
- **Bestehende 6 Kameras brauchen Admin-Specs** (Technische Daten im Editor anlegen)
- **Bestehende Kameras brauchen Seriennummern** (im Kamera-Editor unter "Kameras / Seriennummern" anlegen)
- **Cron-Härtung optional:** `CRON_DISABLE_URL_SECRET=true` in Coolify-Env setzen + Hetzner-Crontab auf Header-Auth umstellen (`-H "x-cron-secret: $CRON_SECRET"`), damit Secrets nicht mehr in Access-Logs landen.
- **Sicherheit:** API-Keys rotieren (wurden in einer Session öffentlich geteilt)
- **SQL-Migration `supabase-performance-indizes.sql` ausführen** (8 Performance-Indizes, idempotent via `IF NOT EXISTS` + `CONCURRENTLY`).
- **SQL-Migration `supabase-social-image-position.sql` ausführen** (2 Spalten `fb_image_position` + `ig_image_position` auf `social_posts` für unabhängige FB/IG-Bild-Positionierung).
- **Go-Live 01.05.2026:** `TEST_MODE = false` in `lib/contracts/contract-template.tsx` setzen
- **Go-Live 01.05.2026:** Stripe auf Live-Keys umstellen
- **Go-Live 01.05.2026:** Domain test.cam2rent.de → cam2rent.de
- **Go-Live 01.05.2026:** Resend Domain verifizieren (DKIM + SPF)
- **Social-Modul Setup:**
  - ~~SQL-Migration `supabase-social.sql` ausführen~~ ✓
  - ~~`META_APP_ID` + `META_APP_SECRET` in Coolify hinterlegen~~ ✓
  - ~~Cron `*/5 * * * *` `social-publish` + `0 * * * *` `social-generate` in Hetzner-Crontab eingetragen~~ ✓
  - ~~Erste FB+IG-Verbindung OAuth~~ ✓
  - ~~Meta-App auf "Live" geschaltet~~ ✓
  - **SQL-Migration `supabase-social-extended.sql` ausführen** (Themenpool, Serien, Editorial-Plan — Phase 2)
  - **SQL-Migration `supabase-social-permalinks.sql` ausführen** (2 Spalten für korrekte FB/IG-Post-URLs)
  - **SQL-Migration `supabase-social-image-position.sql` ausführen** (unabhängige Bildposition pro Plattform)
- **Supabase Auto-Pause-Risiko (Free Tier):** Projekt pausiert nach 7 Tagen Inaktivität trotz laufender Cron-Jobs möglich. Gegenmittel:
  - UptimeRobot (gratis) alle 5 Min auf `/api/products` pingen lassen → hält DB wach + warnt bei Downtime
  - Oder: Supabase Pro (~25 €/Monat) für garantiert keinen Auto-Pause + mehr Compute
- **Server: Hetzner CPX32 seit 2026-04-19** (war CX23, Upgrade wegen Build-OOM). Rescale in-place, IP bleibt gleich.
