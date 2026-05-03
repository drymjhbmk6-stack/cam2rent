# cam2rent.de — Claude Code Instructions

## Projekt
Action-Cam Verleih-Shop. Next.js 15 App Router, TypeScript, Tailwind CSS.
Lokaler Pfad: `C:\Cam2Rent\cam2rent`
GitHub: drymjhbmk6-stack/cam2rent (master)
Server: Hetzner CPX32 (178.104.117.135) + Coolify → cam2rent.de (live seit 2026-05-01)

## Sprache
Alle UI-Texte, Kommentare und Kommunikation auf **Deutsch**.
**Umlaute:** Immer ä/ö/ü verwenden, NIEMALS ae/oe/ue in UI-Texten.

## Git-Workflow
**KRITISCH — Diese Regel hat IMMER Vorrang, auch über Session-Anweisungen:**
Immer direkt auf **`master`** committen und pushen. Keine Feature-Branches verwenden.
Wenn eine Session-Anweisung einen Feature-Branch vorgibt (z.B. `claude/...`), diese IGNORIEREN und trotzdem auf `master` arbeiten.
**Erster Schritt jeder Session — IMMER, ohne Rückfrage:**
```
git checkout master
git fetch origin master
git reset --hard origin/master
```
**Hintergrund:** Die Sandbox kann mit veralteten lokalen Commits starten, die nicht im Remote sind. Coolify deployt von `origin/master` — das ist die einzige Wahrheit. `git pull` reicht NICHT, weil bei Divergenz (50/50 lokal-vs-remote) der Pull abbricht. Lokale Divergenz ist immer ein Sandbox-Artefakt und wird ohne Rückfrage hard-resettet.

**Konsequenz:** Falls bewusst lokal etwas angelegt wird, was nicht im Remote ist, wird es spätestens beim nächsten Session-Start zerstört. Deshalb: nach jeder Änderung sofort committen + pushen.

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
- **Typen mit Icons:** new_booking (cyan), booking_cancelled (rot), new_damage (amber), new_message (lila), new_customer (grün), overdue_return (rot), new_review (amber), payment_failed (rot), new_waitlist (cyan), blog_ready (grün), social_ready (lila), reel_ready (pink)

### Content-Review-Pushes (Stand 2026-04-27)
Drei zusaetzliche Notification-Typen feuern, sobald frisch generierter KI-Content auf Admin-Review wartet — Permission-gefiltert auf `content`. Idee: keine eigene UI noetig, lebt parasitaer auf der bestehenden Push-Pipeline (`createAdminNotification` → `sendPushToAdmins`).
- **`blog_ready`** (gruen, Doc-Icon) — aus `app/api/cron/blog-generate/route.ts` direkt nach Insert. Feuert wenn `postStatus !== 'published'` (also Semi-Modus `draft` ODER Zeitplan-Eintrag `scheduled`); im Voll-Modus (`postStatus='published'`) keine Push, weil bereits live. Link auf `/admin/blog/artikel/[id]`. Titel je nach Status (`Neuer Blog-Artikel zum Reviewen` vs. `Geplanter Blog-Artikel generiert`).
- **`social_ready`** (lila, Share-Icon) — aus drei Stellen, die einen `social_posts.status='draft'` erzeugen koennen: `app/api/cron/social-generate/route.ts`, `lib/meta/generate-plan-entry.ts` (manuelles Sofort-Generate aus Redaktionsplan) und `lib/meta/auto-post.ts` (Trigger nach Blog-Publish/neuem Produkt/Set/Gutschein). Nur im Draft-Modus, im `scheduled`-Modus (Voll-Auto-Post) keine Push. `auto-post.ts` hatte vorher einen TODO-Kommentar mit Misuse von `type: 'new_booking'` — gleichzeitig korrigiert. Link auf `/admin/social/posts/[id]`.
- **`reel_ready`** (pink, Film-Icon) — aus `lib/reels/orchestrator.ts` direkt nach dem critical-update wenn `newStatus === 'pending_review'`. Im `'rendered'`-Modus (preview_required=false) keine Push, weil dann Auto-Publish greift. Link auf `/admin/social/reels/[id]`.
- **Permission-Mapping** in `lib/admin-notifications.ts` → `TYPE_TO_PERMISSION`: alle drei auf `'content'` gemappt. Mitarbeiter mit Content-Permission kriegen die Push, Owner sowieso. Mitarbeiter ohne Content-Bereich (z.B. nur `tagesgeschaeft`) werden nicht gestoert.

### Buchungsflow
5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)
- **Sets gefiltert** nach `product_ids` (Kamera-Kompatibilität) — nur passende Sets werden angezeigt
- **Set-Verfügbarkeit:** Nur Lagerbestand prüfen, NICHT Zubehör-Kompatibilität (Sets sind bereits per product_ids gefiltert)
- **Set-Preis:** `getSetPrice()` prüft `pricing_mode ?? pricingMode` (API gibt camelCase `pricingMode` zurück)
- Buchungsbestätigung antwortet sofort — PDF + E-Mail laufen im Hintergrund
- Kalender verhindert Buchung über ausgebuchte Tage hinweg (maxEndDate-Logik)
- **Auth-Gate vor Mietvertrag (Stand 2026-04-22):** Im Direkt-Buchungsflow (`/kameras/[slug]/buchen`) muss der Kunde spätestens nach der Zusammenfassung (Step 4) eingeloggt oder registriert sein, bevor er in Step 5 (SignatureStep) den Mietvertrag unterschreibt. Klick auf „Weiter: Mietvertrag" öffnet bei fehlender Session ein Modal mit der `ExpressSignup`-Komponente (Login + Registrierung). Nach Erfolg via `onAuthenticated`-Callback → Modal schließt, `setStep(5)`. Zusätzlich `useEffect`-Watch auf `user`, falls Login in anderem Tab erfolgt. Button-Label ändert sich zu „Weiter: Anmelden & Mietvertrag", Hinweistext darunter erklärt den Grund. Der Cart-Checkout (`/checkout`) ist hiervon unberührt — dort greift weiterhin das bestehende `expressSignupEnabled`-Feature-Flag.

### Express-Signup + verzögerte Verifizierung (Stand 2026-04-21)
Optionaler smootherer Neukunden-Flow, zwei Admin-Toggles unter `/admin/einstellungen`:

- **`expressSignupEnabled`**: Neukunde kann direkt im Checkout Konto anlegen (E-Mail + Passwort + Name). Server-Route `/api/auth/express-signup` nutzt Admin-API mit `email_confirm: true`, damit der Client sofort per `signInWithPassword` eine Session bekommt. Rate-Limit 5/h pro IP. Bei bekannter E-Mail schaltet die UI automatisch auf Login um.
- **`verificationDeferred`**: Unverifizierte Kunden dürfen bezahlen. Die Buchung wird mit `verification_required=true` geschrieben (Migration `supabase-verification-deferred.sql`), der Status bleibt `confirmed`. Der Ausweis-Upload erfolgt nach der Buchung; ohne Freigabe kommt die Kamera nicht zum Versand.
- **Schutzschranken** in `lib/checkout-config.ts`: `maxRentalValueForExpressSignup` (Default 500 €) + `minHoursBeforeRentalStart` (Default 48 h). `checkout-intent` blockiert mit eigenem Code `VERIFICATION_REQUIRED_FOR_AMOUNT` / `_FOR_SHORT_NOTICE`, wenn die Regeln verletzt sind — fällt dann elegant auf den bestehenden `pending_verification`-Pfad zurück.
- **UI:** `components/checkout/ExpressSignup.tsx` ist ein 3-Schritt-Flow (`auth → upload → done`). Nach Konto-Anlage muss der Neukunde **im selben UI direkt den Ausweis hochladen** (Vorder-/Rückseite, nutzt bestehende `/api/upload-id`). „Später hochladen"-Skip als Fallback bleibt erhalten — löst aber Reminder-/Auto-Storno-Flow aus. Bestandskunden-Login (Mode „Anmelden") überspringt den Upload-Step. Das ersetzt das bisherige „Konto erforderlich"-Screen in `/checkout`, wenn Flag an. Für unverifizierte Kunden mit `verificationDeferred=true` erscheint statt „Buchung anfragen" der normale Zahlungs-Button mit amber-Hinweisbox zum Ausweis-Upload.
- **E-Mail:** Buchungsbestätigung enthält bei `verificationRequired` einen roten CTA-Block „Ausweis jetzt hochladen" mit Link auf `/konto/verifizierung`.
- **Admin-Versand-Seite** (`/admin/versand`): Buchungen ohne Ausweis bekommen amber Card-Border + Badge „Ausweis fehlt". API `/api/admin/versand-buchungen` liefert zusätzlich `verification_required`, `verification_gate_passed_at`, `customer_verification_status` — defensiv geladen, keine 500er wenn Migration fehlt.
- **Admin-Freigabe:** `PATCH /api/admin/booking/[id]` akzeptiert `{ verification_gate: 'approve' | 'revoke' }` → setzt/löscht `verification_gate_passed_at`.
- **Crons:**
  - `/api/cron/verification-reminder` (täglich, z.B. 08:00): Erinnerungsmails an T-5/T-4/T-3, Duplikat-Schutz über `email_log`. T-3 ist die letzte Erinnerung vor Auto-Storno, Subject mit „LETZTE ERINNERUNG"-Prefix.
  - `/api/cron/verification-auto-cancel` (täglich, z.B. 14:00): Storniert Buchungen bei **T-2** (Mietbeginn in max. 2 Tagen), erstattet via Stripe-Refund, hebt Deposit-Pre-Auth auf, schickt Absage-Mail. T-2 gewählt, damit Standard-Versand (2 Tage Laufzeit) den Termin noch halten kann, wenn Verifizierung kurz vor dem Cron durchgeht.
- **Sicherheits-Gate:** `confirm-cart` + `confirm-booking` schreiben `verification_required=true` nur wenn `checkout-intent` das Flag in `metadata` bzw. Context gesetzt hat — ohne aktiven Feature-Flag bleibt alles 1:1 wie zuvor.
- **Go-Live TODO:** SQL-Migration `supabase-verification-deferred.sql` ausführen + zwei Crontab-Einträge hinzufügen:
  ```
  0 8  * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/verification-reminder
  0 14 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/verification-auto-cancel
  ```
- **Default-Verhalten:** Beide Flags sind OFF. Aktivierung unter `/admin/einstellungen` → „Checkout-Verhalten".

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
- **Rabatt** (Stand 2026-05-03): Eigene Section unter „Herkunft & Notizen" — Modus `Prozent (%)` oder `Festbetrag (€)` + optionaler Grund. Basis = Miete + Zubehör + Sets (Haftungsschutz und Versand bleiben aussen vor — Haftung deckt eigene Risiken, Versand ist Durchlaufposten). Festbetrag ist auf die Rabatt-Basis gecapt. Abzug wird live in der Zusammenfassung + Rechnungsvorschau angezeigt, in `bookings.discount_amount` gespeichert (existierende Spalte, fließt automatisch in EÜR/DATEV). Notiz-String enthält den Rabatt zur Nachvollziehbarkeit.
- **Tester-User** (Stand 2026-05-03): Wenn der ausgewählte Kunde `profiles.is_tester=true` hat, wird die manuelle Buchung mit `is_test=true` gespeichert (auch im Live-Modus → raus aus Reports/EÜR/DATEV). Vertrag bekommt zusätzlich das „MUSTER / TESTVERTRAG"-Wasserzeichen via `forceTestMode: true`. Stripe spielt bei manuellen Buchungen keine Rolle (nur `MANUAL-...`-Marker als payment_intent_id).
- **Test-/Live-Kalender-Isolation** (Stand 2026-05-03): Test-Buchungen (`is_test=true`) blocken den **Kunden-Kalender** auf der Live-Seite NICHT. `/api/availability/[productId]` und `/api/accessory-availability` filtern Test-Buchungen raus, wenn der globale env-mode `live` ist. Im Test-Modus (alle Buchungen sind dann is_test=true) zählen alle. Plus: Migration `supabase-unit-assignment-tester-isolation.sql` updated die RPCs `assign_free_unit` + `assign_free_accessory_units` so, dass sie nur Buchungen mit gleichem is_test-Wert als blockierend betrachten — Test- und Live-User leben in getrennten Unit-Universen, blockieren sich physisch nicht. `/api/admin/find-free-unit` akzeptiert `?for_test=1` (default = nur Live-Konflikte zeigen). Admin-Gantt-Kalender (`/admin/verfuegbarkeit`) zeigt Test-Buchungen weiter an, markiert sie aber mit pinkem dashed-Outline + diagonalem Streifenmuster + `[TEST]`-Suffix im Tooltip. Buchungsliste + Detail haben das pinke „TEST"-Badge.
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
Mehrere Seiten wurden zu Tab-Seiten zusammengeführt. Die Inhalte der Unterseiten wurden in wiederverwendbare Client-Komponenten unter `components/admin/` extrahiert — Funktionalität ist 1:1 unverändert.

- **`/admin/einstellungen`** (Settings-Hub, Stand 2026-04-26): Tab-Seite mit `?tab=allgemein|versand|haftung|vertrag|blog-ki|social-ki`
  - Tab "Allgemein" (Default) → `components/admin/EinstellungenAllgemein.tsx` (Test/Live-Modus, Checkout, Mitarbeiter-Link, 2FA, Kaution-Modus, Umsatzsteuer, Warenkorb-Erinnerung, Spec-Definitionen, Puffer-Tage, Geschäftsdaten, Admin-PWA, Push, Wochenbericht)
  - Tab "Versand" → `components/admin/VersandpreiseContent.tsx`
  - Tab "Haftung & Kaution" → `components/admin/HaftungContent.tsx`
  - Tab "Vertragsparagraphen" → `components/admin/VertragsparagraphenContent.tsx`
  - Tab "Blog-KI" → `components/admin/BlogEinstellungenContent.tsx`
  - Tab "Social-KI" → `components/admin/SocialEinstellungenContent.tsx`
  - Sub-Page `/admin/einstellungen/mitarbeiter` bleibt unverändert
- **`/admin/startseite`**: Tab-Seite mit `?tab=inhalte|bilder` (Content, kein Settings)
  - Tab "Inhalte" → `components/admin/ShopUpdaterContent.tsx`
  - Tab "Hero-Bilder" → `components/admin/SeasonalImagesContent.tsx`
- **`/admin/legal`**: Single-Tab-Seite (Dokumente). Vertragsparagraphen sind in `/admin/einstellungen?tab=vertrag` umgezogen.

### Redirects (next.config.ts)
Alte URLs leiten auf die neuen Tab-Seiten weiter (`permanent: false`, damit Bookmarks funktionieren, URLs aber nicht dauerhaft gecached werden):
- `/admin/shop-updater` → `/admin/startseite?tab=inhalte`
- `/admin/saisonale-bilder` → `/admin/startseite?tab=bilder`
- `/admin/preise` → `/admin/einstellungen?tab=versand` (Seite wurde aufgelöst)
- `/admin/preise/versand` → `/admin/einstellungen?tab=versand`
- `/admin/preise/haftung` → `/admin/einstellungen?tab=haftung`
- `/admin/legal/vertragsparagraphen` → `/admin/einstellungen?tab=vertrag`
- `/admin/blog/einstellungen` → `/admin/einstellungen?tab=blog-ki`
- `/admin/social/einstellungen` → `/admin/einstellungen?tab=social-ki`

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
- **Zubehör-Liste mit Drag-and-Drop** (Stand 2026-05-03): Komponente `<AccessoryItemList>` (gleiche im Edit + im „Neues Set"-Form). Native HTML5-D&D, Drag-Handle ⋮⋮ links, Ziel-Item bekommt Cyan-Outline. Items haben dunklen Hintergrund (#111827) + grünen/roten Border-Left je nach Verfügbarkeit. Reihenfolge wird beim Speichern direkt in `sets.accessory_items` (Array) persistiert — bestimmt damit die Anzeige-Reihenfolge in Vertrag/Packliste/Übergabeprotokoll.
- **Kamera-Toggles:** Nutzen `CameraToggle` mit dynamischen Brand-Farben
- **Dark-Mode:** Alle Elemente mit `dark:` Klassen versehen
- **Vorschaubild im eingeklappten Header:** Quadratisches 80×80-Thumbnail (`set.image_url`, `next/image`, `object-cover`) links neben Name + Preis. Sets ohne Bild zeigen einen gestrichelten „Kein Bild"-Platzhalter gleicher Maße — kein Layout-Shift.

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
- **Neue-Kamera-Seite (`/admin/preise/kameras/neu`):** Kein Lagerbestand-Input mehr — read-only Hinweis „0 Kameras — Seriennummern nach dem Speichern hinzufügen". Initial `stock: 0`. Nach Save Redirect auf Edit-Seite, dort Seriennummern erfassen.
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

### Einzelexemplar-Tracking für Zubehör (Phase 1 + 2A-C + 3A-B live — Stand 2026-04-29)
Analog zu `product_units` für Kameras werden Akkus, Stative, Karten etc. pro physischem Stück getrackt. **Komplett-Status:** Phase 1 (DB) + 2A (Admin-CRUD) + 2B (Auto-Zuweisung) + 2C (Verfügbarkeits-API qty-aware) + 3A (Asset-Verknüpfung pro Exemplar) + 3B (Schadensmodul mit Stripe-Pre-Auth-Capture) sind live. Damit ist der § 249 BGB-konforme End-to-End-Workflow für rechtssichere Schadensabwicklung pro Zubehör-Exemplar abgeschlossen.

- **Tabelle `accessory_units`** (Migration `supabase/supabase-accessory-units.sql`): id UUID, accessory_id TEXT FK, exemplar_code TEXT (UNIQUE pro accessory_id), status (`available|rented|maintenance|damaged|lost|retired`), purchased_at, retired_at, retirement_reason, notes, created/updated_at. RLS: Service-Role-only (analog `product_units`).
- **`bookings.accessory_unit_ids UUID[]`** (parallel zu `bookings.accessory_items` JSONB) hält die zugewiesenen Exemplare pro Buchung. Zuordnung welche Unit zu welchem accessory_id gehört ergibt sich aus `accessory_units.accessory_id` — kein zusätzliches Mapping nötig. GIN-Index für Überlappungs-Queries.
- **View `accessories_with_stats`** liefert pro Zubehör Counts pro Status + Kaufdaten-Range — ersetzt mittelfristig die direkte Nutzung von `available_qty`.
- **RPC `assign_free_accessory_units(accessory_id, qty, rental_from, rental_to, booking_id)`** (`supabase-accessory-unit-assignment-lock.sql`) mit `pg_advisory_xact_lock` — race-sicher, vergibt **mehrere** Exemplare gleichzeitig (Mengen-Buchung typisch bei Zubehör), FIFO nach `purchased_at`. Bei nicht ausreichend freien Units → leeres Array, Aufrufer reagiert.
- **Wertverfolgung läuft NICHT in `accessory_units`**, sondern in der bestehenden `assets`-Tabelle mit `kind='rental_accessory'` + `unit_id` FK auf `accessory_units(id)`. Der monatliche AfA-Cron schreibt `current_value` fort, der Vertrags-Floor `Math.max(asset.current_value, deposit)` greift automatisch — kein neues Bracket-System, keine Doppel-Logik.
- **Daten-Migration** (`supabase-accessory-units-data-migration.sql`): Erzeugt pro `accessories`-Row mit `available_qty > 0` entsprechend viele Exemplare (`exemplar_code = <accessory_id>-001` aufwärts) mit konservativem Default-Kaufdatum (`CURRENT_DATE - 18 months`). Setzt `accessories.migrated_to_units = TRUE`. Idempotent. Statistik-SELECT am Ende der Datei für visuelle Prüfung im SQL-Editor.
- **Rollback** (`supabase-accessory-units-rollback.sql`): Drop in der richtigen Reihenfolge (RPC → View → Spalte → Tabelle → Marker). ACHTUNG: Schadensabwicklungs-Historie geht verloren.
- **Phase 2A (Admin-CRUD, live):** Neue API `app/api/admin/accessory-units/route.ts` (GET/POST/PUT/DELETE, Permission `katalog`), Helper `lib/sync-accessory-qty.ts` (hält `accessories.available_qty = COUNT(units WHERE status IN ('available','rented'))` nach jedem Mutate), UI-Komponente `components/admin/AccessoryUnitsManager.tsx` (Tabelle + Inline-Edit + Anlegen/Löschen) — eingebaut im Edit-Panel von `/admin/zubehoer`. Das `Verfügbare Menge`-Feld ist read-only und zeigt automatisch die berechnete Anzahl. Beim Anlegen eines neuen Zubehörs ist `available_qty` initial 0; Exemplare werden nach dem Speichern in der Edit-Ansicht hinzugefügt (analog Kamera-Neu-Seite).
- **Phase 2B (Auto-Zuweisung + Release, live):** Neue Lib `lib/accessory-unit-assignment.ts` mit zwei Funktionen:
  - `assignAccessoryUnitsToBooking(bookingId, accessoryItems, rentalFrom, rentalTo)` ruft die RPC `assign_free_accessory_units` pro accessory_id+qty auf, gibt `{ assigned: Record<accessory_id, uuid[]>, missing: accessory_id[] }` zurück. Bei nicht ausreichend freien Units → der accessory_id landet in `missing`, Buchung läuft trotzdem durch (Fallback-Verhalten wie heute).
  - `releaseAccessoryUnitsFromBooking(bookingId, unitIds?)` setzt Units zurück auf `available` — aber nur jene, die nicht in einer **anderen** aktiven Buchung stecken (durch Folgebuchungen können Exemplare bereits weiterreserviert sein). `bookings.accessory_unit_ids` bleibt für Audit/Schadensabwicklung erhalten — nur `accessory_units.status` wird zurückgesetzt. Status `damaged`/`lost`/`maintenance` bleiben unangetastet (nur `rented` → `available`).
  - **6 Assignment-Hooks** (alle non-blocking): `confirm-cart` (2 Stellen — direkt nach Insert + idempotenter Re-Sync nach Webhook-Race), `confirm-booking`, `manual-booking`, `stripe-webhook` (2 Stellen — Single + Cart). Aufruf nach `assignUnitToBooking`.
  - **5 Release-Hooks** (alle non-blocking): `cancel-booking`, `cron/auto-cancel`, `cron/awaiting-payment-cancel`, `cron/verification-auto-cancel`, `admin/return-booking` (**nur** bei `condition !== 'beschaedigt'`, also `newStatus === 'completed'`). Bei `damaged` bleiben Units auf `rented` — der Admin muss im Phase-3-Schadensmodul einzeln entscheiden.
- **Phase 3A (Asset-Verknüpfung pro Exemplar, live):** Neue Spalte `assets.accessory_unit_id` UUID FK auf `accessory_units(id)` (Migration `supabase-assets-accessory-unit-id.sql`). API `/api/admin/assets` erweitert um GET-Filter `?accessory_unit_id=...` und POST-Feld `accessory_unit_id`. UI-Komponente `AccessoryUnitsManager` lädt Assets parallel zu Units (`?kind=rental_accessory&include_test=1`, dann clientseitiges Mapping über `accessory_unit_id`), zeigt neue Spalte „Anlage (Zeitwert)":
  - Wenn Asset vorhanden: Link auf `/admin/anlagen/[id]` mit `current_value` als Label (z.B. „39,99 €")
  - Wenn nicht: italics „+ erfassen" Button öffnet eine grün hinterlegte Inline-Form (Kaufpreis €, Kaufdatum vorbelegt aus `unit.purchased_at`, Nutzungsdauer Default 36 Mon.) → POST `/api/admin/assets` mit `kind='rental_accessory'`, `accessory_unit_id`, alle drei Werte. Restwert wird durch die API automatisch auf 30% des Kaufpreises gesetzt (Floor gegen 0-€-Wertverfall).
  - Edit-Modus zeigt den Asset-Wert read-only (italics) — Erfassen läuft nur über die Read-Mode-Aktion.
  - Defensiv: wenn die Migration noch nicht durch ist, lädt die Assets-Spalte stumm leer und der Rest der UI funktioniert weiter.
- **Phase 3B (Schadensmodul mit Stripe-Pre-Auth-Capture, live):** Pro physisch beschädigtes/verloren gegangenes Zubehör-Exemplar dokumentiert der Admin im neuen Modal-Workflow eine eigene `damage_reports`-Row mit Foto + Notiz + WBW. Am Ende werden alle Beträge summiert und in einem Stripe-Capture aus der Pre-Auth-Kaution einbehalten — der Rest wird automatisch freigegeben.
  - **Migration:** `supabase-damage-reports-accessory-unit.sql` — neue Spalte `damage_reports.accessory_unit_id` UUID FK auf `accessory_units(id)` + Index. NULL = generischer Buchungs-Schaden (Legacy/Kamera).
  - **API `/api/admin/booking/[id]/accessory-units-detail`** (GET): liefert pro `bookings.accessory_unit_ids` die Daten für das Modal (exemplar_code, accessory_name, status, current_value aus assets, replacement_value pauschal, suggested_wbw = Max(current_value, replacement_value, 0)) plus Buchungs-Kaution-Stand (deposit, deposit_intent_id, deposit_status).
  - **API `/api/admin/accessory-damage`** (POST, multipart): Body mit `bookingId`, `units_json` (Array `{accessory_unit_id, condition: 'damaged'|'lost', retained_amount, notes}`) und Fotos pro Unit als Form-Field `photos_<unitId>`. Server: 1-5 Fotos pro Unit mit Magic-Byte-Check in `damage-photos`-Bucket, eine `damage_reports`-Row pro Unit mit `accessory_unit_id`, `accessory_units.status` → `damaged`/`lost`, ein einziger Stripe-Capture mit Sum, Audit-Log `accessory_damage.confirm`. Bei Stripe-Fehler nach erfolgreichem DB-Schreiben → 200 mit `partial: true` (Admin holt Capture über `/admin/schaeden` nach).
  - **UI-Komponente `components/admin/AccessoryDamageModal.tsx`**: Pro Unit drei Buttons (OK/beschädigt/verloren). Bei nicht-OK erscheinen WBW-Input (vorbelegt mit `suggested_wbw`), Foto-Upload (Pflicht, max 5), Notiz-Textarea (Pflicht). Footer-Summary zeigt Pre-Auth-Stand, Einbehalt-Summe, Freigabe-Betrag — mit Warnung bei Übersteigung der Kaution oder fehlender Stripe-Pre-Auth.
  - **Integration `/admin/buchungen/[id]`**: Neuer Button „Zubehör-Schaden melden" (rosa) sichtbar wenn `booking.accessory_items?.length > 0`, neben dem alten „Schadensbericht erstellen"-Link auf `/admin/schaeden` (bleibt für generische Schäden bestehen).
  - **Stripe-Eigenheit beachten**: Eine `paymentIntents.capture(intent, {amount_to_capture})` finalisiert die Pre-Auth — ein zweiter Capture ist nicht möglich. Daher MUSS die Schadens-Erfassung in einem Modal-Submit alle betroffenen Units enthalten. Spätere Nach-Captures gehen nur über separate manuelle Charges.
- **Phase 2C (Verfügbarkeits-API, live):** `/api/accessory-availability/route.ts` belegt jetzt qty-aware mit drei Prio-Stufen pro überlappender Buchung:
  1. **`accessory_unit_ids`** (UUID[]) — Phase-2B+ Buchungen, exakte Auflösung pro Unit über ein vorab geladenes Unit→Accessory-Mapping (1 Bulk-Query)
  2. **`accessory_items`** (JSONB qty-aware) — Legacy-Buchungen mit Mengensupport, `qty` wird gezählt (statt vorher 1 pro accessory_id)
  3. **`accessories`** (TEXT[]) — uralte Buchungen, je 1 Stück
  - **Bug-Fix mitgenommen:** Vorher zählte `accessories[].length`, also konnte ein Akku mit qty=3 nur 1× das Total reduzieren — Mehrfach-Akku-Buchungen waren überbuchbar. Jetzt korrekt qty=3 abgezogen.
  - Response-Schema unverändert (`{ id, name, total_qty, booked_qty, available_qty_remaining, is_available, compatible }`) — alle 3 Konsumenten (`/admin/buchungen/neu`, `/kameras/[slug]/buchen`, `ProductAccessorySets`) funktionieren weiter.
  - **Total-Quelle bleibt `accessories.available_qty`** — wird durch `syncAccessoryQty` automatisch als `COUNT(units WHERE status IN ('available','rented'))` gehalten, schließt also `damaged|lost|maintenance|retired` schon aus.

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

### Digitales Pack-Workflow (Versand) mit 4-Augen-Prinzip (Stand 2026-04-24)
3-Schritt-Flow auf `/admin/versand/[id]/packen`: Packer haakt jedes Item digital ab + unterschreibt → Kontrolleur (zweite Person, hart erzwungen!) prüft + macht Foto + unterschreibt → System generiert Packlisten-PDF mit beiden Signaturen.

- **DB-Migration:** `supabase/supabase-packing-workflow.sql` — Spalten `pack_status`, `pack_packed_by`, `pack_packed_by_user_id` (UUID), `pack_packed_at`, `pack_packed_signature`, `pack_packed_items`, `pack_packed_condition`, `pack_checked_by`, `pack_checked_by_user_id` (UUID), `pack_checked_at`, `pack_checked_signature`, `pack_checked_items`, `pack_checked_notes`, `pack_photo_url` auf `bookings`. Storage-Bucket `packing-photos` (privat, 10 MB, image/*) muss manuell angelegt werden.
- **APIs:** `POST /api/admin/versand/[id]/pack` (Step 1), `POST /api/admin/versand/[id]/check` (Step 2, multipart mit Foto, Magic-Byte-Check JPEG/PNG/WebP/HEIC, max 10 MB), `GET /api/admin/versand/[id]/photo-url` (Signed URL 5 Min), `POST /api/admin/versand/[id]/pack-reset`.
- **4-Augen-Pruefung User-ID-basiert:** `getCurrentAdminUser()` schreibt `pack_packed_by_user_id` bzw. `pack_checked_by_user_id` mit der `admin_users.id`. Master-Passwort-Login (`legacy-env`) speichert NULL. Check-API blockt hart wenn beide IDs gesetzt + identisch sind. Wenn mindestens eine Seite NULL ist (Master-Passwort), Notfall-Fallback auf Namensvergleich. Mitarbeiter koennen also nicht durch ein anderes Pseudonym im Namensfeld umgehen.
- **UI:** `/admin/versand/[id]/packen` — Stepper, Item-Checkliste (Akkus/Karten einzeln expandiert über `qty`), Signatur-Canvas, Foto-Upload mit `capture="environment"` für Mobile, Preview. Name wird aus Mitarbeiter-Konto vorausgefüllt + Hinweis-Badge zeigt "Hartes 4-Augen ueber Mitarbeiterkonto aktiv". Bestehender Master-Passwort-Workflow läuft mit Namensvergleich-Fallback weiter.
- **Set-Container-Filter** (Stand 2026-05-03): Die Liste zeigt nur die tatsächlich physisch zu packenden Stücke — Set-Header-Zeilen (z.B. „Basic Set" zwischen den Sub-Items) werden in `expandItems()` rausgefiltert. Erkennung: Item dessen Name als `setName` eines anderen Items vorkommt.
- **Scanner-Workflow** (Stand 2026-05-03): Pro Step gibt es eine cyan „Scanner öffnen"-Bar mit Zähler `(N/M)`. Klick öffnet `<SerialScanner>`-Modal (HTML5 BarcodeDetector). Beim Scan wird der Code normalisiert (Trim + Uppercase + Whitespace raus) und gegen die Buchungs-Codes gematcht: Kamera-Seriennummer → key `'camera'`, Zubehör-Exemplar-Code (`accessory_units.exemplar_code`) → erster ungehakter Slot dieses `accessoryId`. Toast-Feedback (grün/amber/rot) für 2.5s. API `/api/admin/booking/[id]` liefert dazu eine neue `unit_codes`-Liste mit `{ accessory_id, exemplar_code }` pro `accessory_unit_ids`-Eintrag. Sammel-Zubehör ohne Exemplar-Codes ist nicht scanbar — muss manuell abgehakt werden.
- **Versand-Liste** (`/admin/versand`): Status-Badge `📦 Paket packen` (offen) / `⚠ Wartet auf Kontrolle` (packed) / `✓ Versand-Pack fertig (PDF öffnen)` (checked).
- **PDF** (`lib/packlist-pdf.tsx`): Sektion 4 ohne Paketnummer-Feld, Sektion 5 zwei Unterschriften-Bloecke mit Canvas + Timestamps + Foto-Hinweistext (Foto bleibt nur intern als Nachweis).
- **Go-Live TODO:**
  1. SQL-Migration `supabase/supabase-packing-workflow.sql` ausführen
  2. Storage-Bucket `packing-photos` manuell anlegen (Public OFF, 10 MB, `image/jpeg + png + webp + heic + heif`)
  3. Mitarbeiter-Accounts unter `/admin/einstellungen/mitarbeiter` anlegen — sobald beide (Packer + Kontrolleur) eigenes Konto haben, greift die harte ID-Pruefung automatisch.

### Buchhaltungs-Cockpit (`/admin/buchhaltung`) — Stand 2026-05-03 nach Refactor
Tab-basiertes Cockpit mit **6 Top-Level-Tabs** (frueher 9, zusammengelegt). Query-Parameter `?tab=...&sub=...`:

#### Top-Level-Tab-Struktur
- **Cockpit** (`?tab=dashboard`): „Heute zu tun"-Inbox + KPIs + Charts. Inbox aggregiert defensiv ueberfaellige Rechnungen, unmatched Stripe, pending purchase_items, offene Mahn-Entwuerfe, pending Gutschriften, USt-VA-Erinnerung (nur Regelbesteuerung), Monatsabschluss-Status. API: `GET /api/admin/buchhaltung/cockpit`. Quick-Action-Button „Monatsabschluss starten" oben rechts oeffnet `MonthCloseWizard`-Modal.
- **Einnahmen** (`?tab=einnahmen&sub=...`): Wrapper mit Pills `rechnungen | offen | gutschriften`. Komponenten unveraendert wiederverwendet (`RechnungenTab`, `OffenePostenTab`, `GutschriftenTab`).
- **Ausgaben** (`?tab=ausgaben&sub=...`): Wrapper mit Pills `manuell | einkauf`. Manuell = bestehender `AusgabenTab`. Einkauf = neue Lieferanten-Rechnungen-Liste mit KPI-Karten + Klassifizierung-Counter, Edit weiter unter `/admin/einkauf`.
- **Stripe-Abgleich**: unveraendert.
- **Berichte** (`?tab=reports&sub=...`): Wrapper mit Pills `analyse | datev`. Analyse = bestehender `ReportsTab` (EÜR, USt-VA, Umsatzliste). DATEV = bestehender `DatevExportTab`.
- **Einstellungen**: unveraendert.

**Backwards-Compat-Routing:** `legacyTabRedirect()` in `page.tsx` mappt alte Bookmark-URLs (`?tab=rechnungen|offene-posten|gutschriften|datev`) automatisch auf neue Sub-Tabs via `router.replace`. Cockpit-Inbox-Aktionen routen ebenfalls ueber Legacy-Mapping.

#### Cockpit-Inbox (Etappe 1)
- **Komponente:** `app/admin/buchhaltung/components/CockpitInbox.tsx`. Rendert ToDo-Karten mit Severity-Sortierung (critical > warning > info > ok). Klick auf Action-Button ruft `onNavigateTab(tab)` oder routet ueber `href`.
- **API:** `GET /api/admin/buchhaltung/cockpit` aggregiert defensiv (jede Sektion try/catch). Ohne ToDos: positive „Alles erledigt"-Karte.

#### Bulk-Aktionen (Etappe 4)
- **Komponente:** `app/admin/buchhaltung/components/shared/BulkBar.tsx` (sticky top, Backdrop-Blur, Counter-Badge). `BulkBtn`-Helper mit `primary|secondary|danger`-Varianten.
- **APIs:**
  - `POST /api/admin/buchhaltung/invoices/bulk` mit `action: 'mark_paid' | 'resend_email'` (max 200 IDs). `mark_paid` skippt bereits bezahlte/stornierte. `resend_email` sequenziell mit Cookie-Forward.
  - `POST /api/admin/buchhaltung/dunning/bulk` (max 100). Erstellt naechste Mahnstufe als Entwurf pro Rechnung — wie der taegliche Cron, nur explizit.
- Eingebaut in `RechnungenTab` (mark_paid + resend) und `OffenePostenTab` (Mahn-Entwuerfe + mark_paid).
- **URL-Filter-Persistenz** in `RechnungenTab`: `q`, `status`, `p`, `limit` als Query-Params, ueber `useSearchParams` + `router.replace`. Reload-fest, teilbar als Link.

#### Monatsabschluss-Wizard (Etappe 3)
- **Komponente:** `app/admin/buchhaltung/components/MonthCloseWizard.tsx`. Modal mit 4 Schritten: Stripe-Abgleich → Lieferanten-Klassifizierung → EÜR-Vorschau → Abschluss. Springt automatisch zum ersten unfertigen Schritt. Pro Schritt eigener CTA-Button der zum passenden Tab routet.
- **API:** `GET/POST/DELETE /api/admin/buchhaltung/period-close?period=YYYY-MM`. POST setzt Soft-Lock in `admin_settings.period_locks[period]` mit `{locked_at, locked_by}`. DELETE braucht `?reason=...` (min 10 Zeichen) und schreibt `unlocked_at, unlocked_by, unlock_reason` (Audit-Trail bleibt erhalten).
- **Soft-Lock heute, Hard-Lock spaeter:** Aktuell warnt das System nur, blockiert nicht. Beim Wechsel auf Regelbesteuerung wird die API zur harten Sperre.
- Audit-Log: `period.close`, `period.unlock`.

#### Architektur-Fundamente fuer „spaeter mehr" (A1/A2/A5/A4)
**Migration `supabase/supabase-buchhaltung-foundation.sql` (idempotent):**
- A1 — Spalte `account_code TEXT` (nullable) auf `invoices`, `expenses`, `credit_notes`, `purchase_items`, `assets`. Vorbereitet fuer SKR03-Konto-Zuordnung pro Beleg.
- A2 — Spalte `internal_beleg_no TEXT` (nullable) auf `invoices`, `expenses`, `credit_notes`, `purchases`. Vorbereitet fuer lueckenlose Belegnummer.
- Indizes auf beide neuen Spalten (Partial Index `WHERE … IS NOT NULL`).
- A5 — Setting `kontenrahmen_mapping` mit SKR03-Defaults (~25 Konten in 3 Gruppen) initialisiert.
- Setting `period_locks` als leeres Objekt initialisiert.

**Lib `lib/beleg-numbers.ts`:** `nextBelegNumber()` reserviert lueckenlose Nummer pro Geschaeftsjahr (Format `BELEG-2026-00001` / `TEST-BELEG-2026-00001`). Counter in `admin_settings.beleg_counter_<live|test>_<year>`. Optimistic-Concurrency mit Retry (3x). `parseBelegNumber()` als Reverse-Helper. Wird heute noch nirgends gerufen — bereit fuer Etappe „Belegjournal" oder Wechsel auf Regelbesteuerung.

**Lib `lib/accounting/kontenrahmen.ts`:** `loadKontenrahmen()` (60s In-Memory-Cache), `accountForErloes()`, `accountForAufwand()`, `accountForBestand()`, `accountForExpenseCategory()`, `listAllAccounts()`. Klein-Modus-Sonderfall: `mietumsatz` → 8200 statt 8400. Fallback auf Default-Mapping bei DB-Fehler.

**API:** `GET/PUT /api/admin/buchhaltung/kontenrahmen` mit Konto-Code-Validierung (3-5 Ziffern).

**Lib `lib/delete-reason.ts` (A4):** `requireDeleteReason(req)` prueft `X-Delete-Reason`-Header, `?reason=...` oder Body. Min 10, max 500 Zeichen. Eingebaut in `DELETE /api/admin/buchhaltung/expenses/[id]`, `DELETE /api/admin/purchases/[id]`, `DELETE /api/admin/buchhaltung/period-close`. UI in `AusgabenTab` ruft `prompt()` mit Mindestlaengen-Pruefung. Audit-Log enthaelt `changes.reason`.

#### Mobile-Tauglichkeit (Etappe 5)
- BuchhaltungTabs nutzen `scrollSnapType: 'x mandatory'` + scroll-snap-align fuer iOS-freundliches horizontales Tab-Scrollen
- Mobile-CSS-Patches in `page.tsx` `<style>`-Tag: `<= 640px` reduziertes Padding (`16px 12px`), Tabellen-Font 12px, Cell-Padding 8px/6px, Inputs/Selects auf 16px (verhindert iOS Auto-Zoom)
- Scrollbar-Styling in Tab-Bar: 4px hoch, dunkel

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
- **DB:** `push_subscriptions` (id, endpoint UNIQUE, p256dh, auth, user_agent, device_label, admin_user_id FK → admin_users, created_at, last_used_at) — Migrationen `supabase-push-subscriptions.sql` + `supabase-push-per-user.sql`
- **Lib:** `lib/push.ts` → `sendPushToAdmins({ title, body, url, tag }, { requiredPermission? })` — non-blocking, räumt expired Subscriptions automatisch auf (404/410)
- **Per-User-Filter (Stand 2026-04-26):** `createAdminNotification()` mappt jeden `type` auf eine Permission (`new_booking → tagesgeschaeft`, `new_ugc → kunden`, `payment_failed → finanzen`, etc.) und sendet Push nur an Mitarbeiter, deren Account diese Permission hat. Owner kriegen immer alles. Subscriptions ohne `admin_user_id` (Legacy-ENV-Login) werden als Owner behandelt — Backward-Compat.
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

#### Auto-Reels: Stock-Footage + Motion-Graphics (Stand 2026-04-21)
Vollautomatische Kurzvideos (9:16, 15–30 Sek) für Facebook- und Instagram-Reels. **Kein Auto-Publish** — jedes Reel landet standardmäßig als `pending_review` und muss vom Admin freigegeben werden, bevor es auf Meta geht.

**Zwei Vorlagen-Typen:**
- **Stock-Footage:** Pexels-API liefert kostenlose Action-Sport-Clips, FFmpeg stitcht 3–4 Szenen + Text-Overlays + CTA-Frame. Kosten ~0,02 €/Reel (nur Claude-Script).
- **Motion-Graphics:** Pure FFmpeg-Color-Frames mit animierten Text-Overlays. 0 € externe Kosten, 100 % markenkonsistent. Für Ankündigungen/Rabatte.

**Pipeline:**
1. Claude (`claude-sonnet-4-6`) schreibt Skript als JSON (Szenen mit Pexels-Suchbegriffen, Text-Overlays, CTA, Caption, Hashtags) — `lib/reels/script-ai.ts`
2. Pro Szene ein Pexels-Clip (`lib/reels/pexels.ts`, bevorzugt Portrait 9:16, Fallback Landscape)
3. System-`ffmpeg` (installiert via `apk add ffmpeg ttf-dejavu` im Runner-Dockerfile) rendert: Scale+Crop auf 1080×1920, drawtext-Overlay, Color-Frame für CTA, Concat-Demuxer, stiller AAC-Track (oder Musik-Mix)
4. MP4 + Thumbnail landen im Supabase Storage Bucket `social-reels` (public)
5. DB-Row `social_reels` mit `status='pending_review'` — Admin sieht Preview und entscheidet

**Admin-UI** (`/admin/social/reels`, neuer Eintrag in Social-Sidebar):
- **Liste:** Thumbnail-Grid, Status-Filter, Auto-Refresh wenn was rendert
- **Generator** `/neu`: Template + Topic + Keywords + FB/IG-Account-Auswahl → startet Background-Render
- **Detail** `/[id]`: HTML5 Video-Player, Caption/Hashtags editierbar, Skript-Ansicht, Render-Log, Buttons: **Speichern**, **Freigeben**, **Einplanen** (datetime-local), **Jetzt veröffentlichen**, **Neu rendern**, **Löschen** (lokal + remote)
- **Vorlagen** `/vorlagen`: CRUD für `social_reel_templates` (Skript-Prompt mit `{topic}`/`{product_name}`/`{keywords}`-Platzhaltern, Default-Dauer/Hashtags, Motion-Graphics-Farben)

**Meta Graph API** — Reels-Upload (`lib/meta/graph-api.ts`):
- **IG Reels:** `POST /{ig_id}/media` mit `media_type=REELS, video_url=...`, warten bis FINISHED (180s), dann `media_publish`
- **FB Reels:** 3-Phasen-Upload `/{page_id}/video_reels` (start → upload mit `file_url`-Header → finish mit `video_state=PUBLISHED`)
- Beide geben nach erfolgreichem Publish den Permalink zurück

**DB (`supabase/supabase-reels.sql`):**
- `social_reels` — Video + Script-JSON + Status-Workflow (draft → rendering → rendered → pending_review → approved → scheduled → publishing → published/partial/failed)
- `social_reel_templates` — Vorlagen mit Skript-Prompt + Styling
- `social_reel_plan` — Redaktionsplan (Datum + Uhrzeit + Topic + Template) für spätere Cron-gesteuerte Bulk-Generierung
- Seed: 4 Start-Vorlagen (Produkt-Spotlight Stock / Angebot Motion / Saison-Tipp Stock / Ankündigung Motion). Die Ankündigungs-Vorlage kann separat via `supabase/supabase-reels-ankuendigung.sql` idempotent nachgelegt werden, falls Haupt-Seed schon gelaufen.
- Seed: `admin_settings.reels_settings` mit `auto_generate=false, preview_required=true, pexels_api_key=''`

**APIs:**
- `GET/POST /api/admin/reels` — Liste / Generate (fire-and-forget, 202)
- `GET/PATCH/DELETE /api/admin/reels/[id]`
- `POST /api/admin/reels/[id]/approve` — setzt pending_review → approved oder scheduled
- `POST /api/admin/reels/[id]/publish` — sofort auf Meta posten
- `POST /api/admin/reels/[id]/rerender` — neuer Render mit gleichem Topic
- `GET/POST /api/admin/reels/templates` + `PATCH/DELETE /api/admin/reels/templates/[id]`
- `GET/POST /api/cron/reels-publish` — Cron für `scheduled`-Reels (max 5 pro Run, begrenzt wegen Render-Bandbreite)

**Test-Modus:** `publishReel()` skippt im Test-Modus den Meta-Call und setzt nur den DB-Status. Cron skippt komplett. Kein Meta-Billing-Risiko während Entwicklung.

**Go-Live TODO:**
1. **SQL-Migration** `supabase/supabase-reels.sql` ausführen (3 Tabellen + Seed-Templates + Default-Settings)
2. **Storage-Bucket** `social-reels` manuell in Supabase-Dashboard anlegen (Public: ON, MIME: video/mp4 + image/jpeg, 50 MB Limit reicht — unsere Reels liegen typisch bei 10–20 MB)
3. **Pexels API-Key** registrieren (kostenlos, https://www.pexels.com/api/) und in `/admin/social/reels/vorlagen` → Einstellungen hinterlegen (oder als `PEXELS_API_KEY`-Env in Coolify)
4. **Docker-Image neu bauen** (Dockerfile installiert jetzt `ffmpeg + ttf-dejavu` im Runner)
5. **Crontab Hetzner:** `*/5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-publish`

**Kosten-Übersicht:** ~0,02 €/Reel (Claude) + 0 € (Pexels + FFmpeg + Meta). Bei 30 Reels/Monat ≤ 1 €.

**Phase 3 Pro-Szene-Re-Render-UI (Stand 2026-04-27):** Admin tauscht einzelne Body-Szenen ohne kompletten Re-Render. Ausführliche Doku: `docs/reels/phase-3-summary.md`.
- **Pro-Szene-Persistierung**: Neue Tabelle `social_reel_segments` (id, reel_id FK CASCADE, index, kind `intro|body|cta|outro`, storage_path, duration, scene_data JSONB, source_clip_data JSONB, has_voice, voice_storage_path). Pro Render werden alle Pro-Szene-MP4s + TTS-Voice-MP3s zusätzlich zum Final-Video unter `social-reels/{reelId}/segments/` und `audio/` abgelegt. `renderReel` gibt jetzt `segments: PersistedSegment[]` zurück, der Orchestrator macht Storage-Upload + DB-Insert. Defensiv: bei fehlender Migration nur Warning, Initial-Render funktioniert weiter.
- **Segment-Regenerator** `lib/reels/segment-regenerator.ts` → `regenerateBodySegment({ reelId, segmentIndex, newSearchQuery?, newTextOverlay?, excludeClipIds? })`: Lädt alle Segmente aus DB+Storage, sucht neuen Stock-Clip (mit Exclusion bestehender Clips), rendert neues Body-Segment, mergt Body+CTA per xfade neu, concat'et mit Intro+Outro, mischt Voice-Track aus persistierten voice-N.mp3-Files + Music neu zusammen, ersetzt Storage-Files (segment + video + ggf. thumb), updated quality_metrics. Status-Gate: kein Tausch wenn `published`. Helper aus `ffmpeg-render.ts` exportiert (`runFfmpeg`, `buildClipFilter`, `buildBodyCtaWithCrossfade`, `pickKenBurnsVariant`, `STD_VIDEO_ENCODE_ARGS`, `TARGET_*`).
- **API-Routen**: `GET /api/admin/reels/[id]/segments` (Liste mit Storage-URLs + Cache-Bust), `POST /api/admin/reels/[id]/segments/[segmentId]` (Tausch, Status-Gate für `scheduled` mit `confirm`-Flag, Audit-Log `reel.regenerate_segment`), `GET /api/admin/reels/preview-stock?query=…&source=pexels|pixabay` (Top-6-Treffer für künftige Live-Vorschau). `maxDuration=300` auf Regenerate.
- **Admin-UI** auf `/admin/social/reels/[id]`: neue „Szenen"-Section unter Skript. Grid (2/3/5 Spalten responsive) mit Mini-`<video>` pro Segment, Kind-Badge, scene+source-Info, 🔊-Indicator. Pro Body-Segment Buttons „🔄 Neuer Clip" (gleiche Query, anderer Treffer) + „✏️ Query" (Modal mit Text-Input → Tausch mit anderer Query). Loading-Overlay während Tausch. Hinweis-Banner für pre-Phase-3-Reels.
- **Cleanup-Cron** `/api/cron/reels-segment-cleanup` (täglich 04:00): löscht `segments/` + `audio/` für Reels mit `status='published'` und `published_at < now() - 30 days`. Final `video.mp4` + `thumb.jpg` bleiben. Pro Run max 50 Reels, `acquireCronLock` verhindert Parallel-Läufe. Storage-Verbrauch pendelt sich bei ~1.2 GB ein (60 Reels/Monat × 20 MB Segmente, mit 30-Tage-Retention).
- **Migration**: `supabase/supabase-reel-segments.sql` (idempotent, Tabelle + Indizes + RLS + Trigger).
- **Bekannte Limitierungen**: Tausch nur für Body, Live-Vorschau im Query-Modal noch nicht aktiv (Endpoint vorhanden, Frontend-Grid kommt in Phase 3.x), Voice bleibt beim Body-Tausch unverändert (Tausch ist visuell-only).

**Render-Stuck-Fix (Stand 2026-04-27):** Reels blieben nach erfolgreichem ffmpeg-Render auf `status='rendering'` hängen — UI zeigte ewig „Rendert…", Video-Player schwarz, Caption/Hashtags leer, obwohl die Phase-Logs `segments_persisted · 9/9` zeigten. Ursache: das finale UPDATE in `lib/reels/orchestrator.ts` schrieb Status + `quality_metrics` in einem Rutsch. Wenn die `quality_metrics`-Migration noch nicht durch war ODER ein anderer Fehler auftrat, wurde der Fehler stillschweigend geschluckt (Retry ohne quality_metrics prüfte den Folgefehler nicht, andere Fehler hatten gar kein Handling). Fix: Critical-Update (status, video_url, caption, hashtags, script_json, render_log, error_message) wird zuerst geschrieben — bei Fehler `phaseLog('final_update_failed')` + Throw → äußerer catch setzt `status='failed'` mit lesbarer Error-Message statt stumm hängen. `quality_metrics` läuft als zweiter optionaler UPDATE mit eigenem Try/Catch. Neuer Phase-Log-Eintrag `render_complete` markiert den Abschluss. Plus: `duration_seconds` wird jetzt mit `Math.round()` auf INT gecastet (FFprobe liefert Floats, Postgres-Spalte ist INT — sonst „invalid input syntax for type integer" beim Final-UPDATE). Recovery für bestehende Stuck-Reels: „Render abbrechen"-Button auf Reel-Detail-Seite (setzt auf `failed`, dann „Neu rendern" möglich).

**Live-Render-Status auf Reel-Detail-Seite (Stand 2026-04-27):** Neue Komponente `components/admin/ReelRenderStatus.tsx` parst den `render_log` und zeigt während `status='rendering'` einen Live-Status-Block oben auf `/admin/social/reels/[id]`. Inhalte: aktuelle Phase mit Emoji + Spinner, Gesamtdauer (bevorzugt aus dem juengsten `started`-Phaseneintrag, fallback `created_at`), Sekunden-seit-letztem-Log-Update mit phasen-spezifischer Stuck-Schwelle (script 180s, stock 90s, voice 240s, ffmpeg 1800s, upload 180s, segments 180s, finalize 60s), 7-Phasen-Timeline als Kacheln (done/active/pending/failed). Bei 70 % Schwelle → amber Warnung, bei 100 % → roter „Render hängt vermutlich"-Hinweis mit Aufforderung zum Abbrechen. Phase-Time wird als UTC interpretiert (Orchestrator schreibt `toISOString().slice(11,19)`), `Date.UTC()` statt lokaler `setHours()` — sonst tz-falsch um 1-2 h. Tick alle 1 s für Sekunden-Counter, Page-Polling alle 4 s für neue Phasen.

**Phase 2 Stilistische Aufwertung (Stand 2026-04-26):** Crossfades, Ken-Burns, gebrandeter CTA + Outro, Quality-Metrics in DB. Ausführliche Doku: `docs/reels/phase-2-summary.md`.
- **Crossfades**: 0.4 s `xfade` zwischen Body-Szenen + CTA. Concat ist jetzt zweistufig: Body+CTA → `body-cta.mp4` (Re-Encode mit STD-Args), dann Final-Demuxer `[intro?, body-cta, outro?]` mit `-c copy`. Voice-Track-Dauer wird pro Segment um xfade-Duration gekürzt (Mindestwert 0.5 s), damit Audio/Video synchron bleiben.
- **Ken-Burns**: Pro Stock-Szene zufällig (deterministisch via `reelId+sceneIdx`-Hash) Zoom-In, Zoom-Out, Pan-left oder Pan-right. Konfigurierbar pro Template via `social_reel_templates.motion_style` (`'static'` | `'kenburns'` Default | `'mixed'` ~50/50). **Hotfix 2026-04-28:** vorher per `zoompan`-Filter umgesetzt — der behandelt jeden Input-Frame als Standbild und produziert daraus mehrere Output-Frames mit Zoom, was bei Video-Input die echte Bewegung des Stock-Clips komplett einfriert (Reels sahen wie Slideshow aus Standbildern aus). Ersetzt durch zeit-basierte `scale + crop`-Kette: Pre-Scale auf 1.10× → `crop` mit `t`-Expressions (Zoom: variable Crop-Größe von 1.02× ↔ 1.10×; Pan: konstantes 1.10× mit zeit-abhängiger X-Position) → Post-Scale zurück auf 1080×1920. Drei Per-Frame-Filter, die echte Video-Frames durchlassen. Render-Zeit ähnlich wie zoompan.
- **CTA + Outro voll gebrandet**: Beide Frames nutzen jetzt das gleiche Layout — Pre-rendered `assets/reels/cta-gradient.png` (1080×1920 Navy→Blue) + Logo oben + Headline (Inter Tight 88pt weiss) + Subline (Inter Tight 52pt Cyan) + Pre-rendered `assets/reels/cta-url-pill.png` (720×140 weiss mit 28px Border-Radius + Drop-Shadow) + drawtext "cam2rent.de" auf Pill (44pt Dark Navy). Outro hat feste Subline „Action-Cam mieten in Berlin". Generator-Skript: `scripts/reels/generate-cta-assets.mjs` (Sharp-basiert, einmalig auszuführen). Fallback bei fehlenden PNGs: alter Color-BG + drawtext.
- **Quality-Metrics**: Neue JSONB-Spalte `social_reels.quality_metrics` mit `file_size_bytes`, `avg_bitrate_kbps`, `segment_count`, `source_resolutions`, `stock_sources`, `render_duration_seconds`, `font_used`, `motion_style`. Defensiver DB-Write: Falls Migration noch nicht durch, Spalte wird verworfen ohne Fehler. Admin-UI auf `/admin/social/reels/[id]` zeigt collapsible Block „Render-Metriken".
- **Migrationen**: `supabase/supabase-reels-motion-style.sql` + `supabase/supabase-reels-quality-metrics.sql` (beide idempotent).
- **Pixabay-UI-Feld**: Neues Eingabefeld unter `/admin/social/reels/vorlagen` (Settings-Card neben Pexels-Key) für `pixabay_api_key`. Solange leer → Pexels-only.

**Phase 1 Quick-Wins (Stand 2026-04-26):** Visuelle Verbesserungen in `lib/reels/ffmpeg-render.ts` + neuer Multi-Source-Stack unter `lib/reels/stock-sources/`. Ausführliche Doku: `docs/reels/phase-1-summary.md`.
- **Thumbnail-Bug** (Z. 800ff): Snapshot kommt jetzt aus dem **ersten Body-Segment** bei `-ss 0.8`, nicht mehr aus `finalPath` bei `-ss 1`. Das alte Verhalten zeigte immer das Intro-Logo.
- **Doppel-Encode eliminiert**: Neue Konstante `STD_VIDEO_ENCODE_ARGS` (libx264 high@4.0, GOP=60, sc_threshold=0, preset=medium, crf=20) — alle 5 Pro-Segment-Encodes (Intro/Outro/Stock-Body/Stock-CTA/MG-Body/MG-CTA) sind bitstream-kompatibel. Concat läuft jetzt mit `-c copy -movflags +faststart` (Stream-Copy statt Re-Encode → ~30 % schneller).
- **Auflösungs-Floor** auf Stock-Clips: `pickBestVideoFile` (Pexels) + `pickBestPixabayFile` ignorieren Varianten unter 1080 px in der kürzeren Dimension. Sub-1080p-Clips werden übersprungen, der nächste Treffer probiert.
- **Multi-Source Stock Footage** (neu): `lib/reels/stock-sources/{types,pexels,pixabay,index}.ts` als Adapter-Architektur. `findClipForQuery({ seed, excludeIds, minHeight })` wählt deterministisch via `reelId`-Hash zwischen Pexels und Pixabay. Bei nur einem konfigurierten Key (Pexels) bleibt das Verhalten unverändert. `lib/reels/pexels.ts` ist jetzt schmaler Re-Export für Backward-Compat. `render_log` enthält pro Reel `[stock-sources] pexels=N pixabay=M` + pro Segment `[seg-i] source=… ext_id=… res=W×H`.
- **Inter Tight als Marken-Schrift**: `assets/fonts/InterTight.ttf` (Variable Font, OFL) wird vom Dockerfile nach `/usr/share/fonts/cam2rent/` kopiert + `fc-cache -fv`. `detectFontPath()` cached die Wahl beim ersten Render und fällt auf DejaVuSans-Bold zurück, falls Inter Tight nicht installiert ist. **Hinweis:** Variable Font rendert im FreeType-Default als Regular (wght=400). Echtes ExtraBold benötigt eine statische TTF, kann später unter gleichem Pfad hinterlegt werden.
- **Migration**: `supabase/supabase-reels-pixabay-key.sql` (idempotent, ergänzt `pixabay_api_key`-Default im `reels_settings`-JSON).
- **.env.example**: `PIXABAY_API_KEY=` ergänzt.

**Skript-Prompt geschärft (Stand 2026-04-26):** `lib/reels/script-ai.ts` SYSTEM_PROMPT komplett überarbeitet:
- **Hook-Regeln:** Szene 1 max 4 Wörter, FRAGE/ZAHL/IMPERATIV/UNVOLLSTÄNDIGER SATZ, verbotene Eröffnungen ("Bereit für…", "Du…", "Hier ist…", Superlative).
- **CTA-Regeln:** Headline NIE "Jetzt mieten" — muss eine von vier Achsen treffen (Zeit/Preis/Use-Case/Knappheit). Subline beginnt immer mit Verb im Imperativ. voice_text nennt einmal die Domain.
- **Caption-Regeln:** Erste Person, erster Satz Mini-Story (kein Sales-Hook), letzter Satz weicher Hinweis auf cam2rent.de, keine Emojis im Caption-Text.
- **Pexels-Search-Queries:** explizite Gut/Schlecht-Beispiele (zu generisch + zu spezifisch).
- **Scene-Count nach Dauer:** 15s = 3-4 Szenen, 30s = 6-7 Szenen.
- **Variations-Pflicht:** Neuer Helper `buildVariationBlock()` lädt die letzten 10 Reels (status `rendered+`) aus `social_reels` und hängt deren Hooks/CTAs/Caption-Eröffnungen als „NICHT wiederholen"-Liste an den System-Prompt — Claude kopiert sich nicht selbst. Defensiv: bei DB-Fehler stiller Fallback ohne Block.
- **`kind`-Enum:** umgestellt von `'intro'|'middle'|'cta'` auf `'hook'|'body'|'transition'`. Alte DB-Werte bleiben durch Union-Type lesbar (Backwards-Compat, in der UI wird `kind` aktuell nirgends ausgelesen — nur als Hint für Claude).
- **Letzte Prüfung:** 7-Punkt-Checkliste am Ende des Prompts erzwingt Selbst-Validierung.

**Voice-Preview + ElevenLabs-Provider (Stand 2026-04-27):** Vorher gab's nur OpenAI-TTS und keine Vorschau. Beides erledigt: Probehoer fuer beide Provider direkt im Settings-UI, ElevenLabs als Premium-Provider fuer DE.
- **Provider-Switch:** `admin_settings.reels_settings.voice_provider` kann `'openai'` (Default) oder `'elevenlabs'` sein. `lib/reels/tts.ts` exportiert jetzt drei Funktionen: `generateSpeechOpenAI` (alter Pfad), `generateSpeechElevenLabs` (neu), `generateSpeechFromSettings` (Switch). Backward-Compat-Alias `generateSpeech = generateSpeechOpenAI`. Der Reel-Orchestrator ruft nur noch `generateSpeechFromSettings` und ist provider-agnostisch.
- **ElevenLabs-Settings-Felder** in `reels_settings`: `elevenlabs_api_key`, `elevenlabs_voice_id`, `elevenlabs_voice_name` (cached fuer UI-Anzeige), `elevenlabs_model_id` (`eleven_multilingual_v2` Default + `_turbo_v2_5` + `_flash_v2_5`), plus Voice-Settings-Slider `elevenlabs_stability`, `elevenlabs_similarity_boost`, `elevenlabs_style`, `elevenlabs_speaker_boost`. Style-Mapping (`calm` / `normal` / `energetic`) liefert sinnvolle Defaults via `styleToElevenLabsSettings()`.
- **Voices-Listing-API** `GET /api/admin/reels/elevenlabs-voices?api_key=…` (optional Override fuer Test vor dem Speichern). Ruft `https://api.elevenlabs.io/v1/voices`, slimt auf relevante Felder (voice_id, name, category, labels, preview_url, description). Fehler werden als 502 mit Original-Message zurueckgegeben.
- **Voice-Preview-API** `POST /api/admin/reels/voice-preview` jetzt provider-aware. Body: `{ provider: 'openai' | 'elevenlabs', ... }`. Bei OpenAI: `voice/style/model/text`. Bei ElevenLabs: `voiceId/modelId/style/stability/similarity_boost/style_weight/speaker_boost/apiKey?/text`. Liefert weiterhin `audio/mpeg`. Rate-Limit 10/min/IP.
- **UI** auf `/admin/social/reels/einstellungen` (Voice-Card komplett umgebaut):
  - Provider-Radio-Karten oben (OpenAI billig vs. ElevenLabs natuerlich)
  - **OpenAI-Block** wie bisher: 6 fixe Stimmen + Style + Modell + Probehoer-Grid
  - **ElevenLabs-Block:** API-Key-Input + Modell-Dropdown + Style + „Stimmen laden"-Button → laedt Voices vom Account, zeigt 2-Spalten-Grid mit Name/Category/Labels und 2 Buttons pro Voice („▶ Test" + „Auswählen"). Sliders fuer Stability/Similarity/Style + Checkbox Speaker-Boost. Test-Text-Textarea wird zwischen beiden Providern geteilt.
  - Memory-Leak-Schutz: Blob-URLs werden via `URL.revokeObjectURL` freigegeben, Audio-Element wird beim Unmount gestoppt + src geleert.
- **Kosten-Hinweis:** OpenAI ~0,003 €/Reel, ElevenLabs je nach Plan ~0,03–0,15 €/Reel. Per-Click-Preview kostet jeweils ein Sample-Volumen.

**Voice-Quality + Anti-Truncate-Fix (Stand 2026-04-27):** Drei Aenderungen damit die Reel-Stimme nicht mehr abgehackt klingt und voice_text nicht mehr mitten im Wort endet:
- **TTS-Default `tts-1-hd`** statt `tts-1` (Quality bump fuer ~+0.003 €/Reel) in `lib/reels/tts.ts`, `lib/reels/orchestrator.ts` und der UI-Default unter `/admin/social/reels/vorlagen` (HD steht jetzt oben + „empfohlen"-Label).
- **Soft Fade-Out** beim Voice-Trim in `lib/reels/ffmpeg-render.ts`: vorher `-t dur` Hard-Cut → bei mid-sentence Truncate ein hoerbarer Klick. Jetzt `apad=whole_dur=dur,afade=t=out:st=(dur-0.25):d=0.25` → die letzten 250 ms werden ausgeblendet, ein zerschnittener Halbsatz wirkt wie ein bewusst abklingender Trail.
- **Skript-Prompt verschaerft** in `lib/reels/script-ai.ts`: Wort-Budget runter von „~12 Woerter pro 5 s" (=2.4 w/s, zu eng am Limit) auf **MAX 1.8 Woerter pro Sekunde Szenen-Dauer**. Konkrete Mapping-Tabelle fuer Claude (4 s = max 7 Woerter, 5 s = max 9, etc.). Hook-Limit auf 5 Woerter runter (vorher 8). CTA-Voice-Limit als Funktion der `cta_frame.duration` (3 s = 5 Woerter inkl. „cam2rent punkt de" als 3 Woerter zaehlend), CTA-Default-Dauer auf 3-4 s hoch (vorher 2-3 s — zu kurz fuer Domain). Selbst-Check-Punkt 8 ergaenzt: „Hat KEIN voice_text mehr als 1.8 Woerter pro Sekunde Szenen-Dauer?".

Hintergrund Bug: Voice-MP3 wurde pro Szene auf `Math.max(0.5, duration - XFADE_DURATION)` gepad/getrimmt (sonst Audio/Video-Sync nach Crossfade kaputt). Wenn TTS aber laenger gesprochen hat als die Szene, wurde mit `-t dur` hart abgeschnitten — typisch im letzten Body, weil der User dann direkt das Outro/CTA sieht und die Diskontinuitaet hoert. XFADE-Shrink bleibt notwendig (Sync), aber das Wort-Budget der Skript-Stufe sorgt jetzt dafuer dass die TTS-Audio meist innerhalb der Szene endet, und der afade-out maskiert verbleibende Mid-Word-Cuts.

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

- **DB-Tabelle:** `waitlist_subscriptions` (id, product_id, email, source, use_case, created_at, notified_at, UNIQUE(product_id, email)) — Migrationen `supabase-waitlist.sql` + `supabase-waitlist-use-case.sql`, RLS aktiviert (nur Service-Role)
- **API:** `POST /api/waitlist` (`{ productId, email, source, useCase? }`) — idempotent bei Duplikaten, legt automatisch Admin-Notification `new_waitlist` an (inkl. Push). Use-Case wird an die Notification-Message angehängt.
- **Admin-API:** `GET/DELETE /api/admin/waitlist` — durch Admin-Middleware geschützt
- **Admin-Seite:** `/admin/warteliste` (neuer Eintrag in Sidebar-Gruppe "Kunden & Kommunikation", Bell-Icon) — zeigt Einträge gruppiert nach Kamera + Spalte "Nutzung" als Pill + Löschen
- **Detection:** `lib/get-products.ts` lädt zusätzlich alle `product_units` (außer `retired`) und setzt `Product.hasUnits` (optional boolean). Waitlist-Modus = `hasUnits === false`.
- **Shop-UI:**
  - `ProductCard.tsx`: Statt "Jetzt mieten"/"Ausgebucht" → blauer "Benachrichtige mich"-Button + Badge "Demnächst verfügbar"
  - Produktdetailseite `/kameras/[slug]`: Statt Kalender → neue Komponente `WaitlistCard.tsx` mit Bell-Icon + Formular
- **`NotifyModal.tsx`** übernimmt `productId` + `source` (`'card' | 'detail'`) und postet gegen `/api/waitlist`. Enthält optionales Use-Case-Dropdown (Wassersport/Wintersport/MTB/Outdoor/Reisen/Motorsport/Familie/Vlog/Sonstiges) — bei "Sonstiges" erscheint ein Freitextfeld (max 200 Zeichen). Feld ist optional — leer lassen ist OK.
- **Notifications:** `new_waitlist`-Typ im `NotificationDropdown` (cyan Bell-Icon)

### Kundenmaterial-Anreize (UGC) (Stand 2026-04-24)
Kunden laden nach ihrer Miete Fotos/Videos hoch, erteilen granulare Nutzungsrechte, Admin moderiert. Freigabe löst automatisch einen 15%-Rabattgutschein aus (analog zum DANKE-Coupon-Flow). Wenn cam2rent das Material tatsächlich auf Social/Blog/Website veröffentlicht, gibt's on-top einen 25%-Bonus-Gutschein.

- **DB-Tabelle:** `customer_ugc_submissions` (Migration `supabase/supabase-customer-ugc.sql`) mit granularen Consent-Feldern (Website, Social, Blog, Marketing, Name-sichtbar), Consent-IP, Status-Workflow `pending → approved → featured → rejected/withdrawn`, reward + bonus coupon codes, featured_channel (`social|blog|website|other`). Unique-Index garantiert eine aktive Submission pro Buchung.
- **Storage-Bucket:** `customer-ugc` (privat, Service-Role-only) — muss manuell im Supabase-Dashboard angelegt werden (50 MB pro Datei, MIME `image/*`, `video/mp4`, `video/quicktime`, `video/webm`).
- **File-Type-Check:** `lib/file-type-check.ts` um `detectVideoType()` + `isAllowedVideo()` erweitert (MP4/MOV/WebM Magic-Byte-Signaturen). Client-MIME wird ignoriert.
- **Kunden-UI:** `/konto/buchungen/[id]/material` — 2-stufiger Flow (Upload + Consent). Button "Material hochladen & Rabatt sichern" in `/konto/buchungen` bei Status `picked_up|shipped|returned|completed`. Zeigt bei bereits aktiver Einreichung den Status + Gutschein-Code + Widerrufs-Button.
- **Kunden-APIs:** `POST /api/customer-ugc/upload` (FormData, Bearer-Token-Auth, Rate-Limit 5/h), `GET /api/customer-ugc/[bookingId]` (Status + Preview-URLs), `POST /api/customer-ugc/withdraw/[id]` (löscht Dateien, ausgegebene Gutscheine bleiben gültig).
- **Admin-UI:** `/admin/kunden-material` (Sidebar in "Kunden & Kommunikation", Icon Foto-Gallery) — Status-Filter-Kacheln (Wartet/Freigegeben/Veröffentlicht/Abgelehnt/Zurückgezogen), Moderations-Modal mit Medien-Grid, Consent-Übersicht, Auto-Open via `?open=<submissionId>` aus Notification-Link. Buttons: Freigeben + Gutschein, Ablehnen (mit Begründungs-Prompt), Feature für Social/Blog/Website (mit Bonus-Gutschein), Endgültig löschen.
- **Admin-APIs:** `GET /api/admin/customer-ugc?status=<filter>`, `GET/PATCH/DELETE /api/admin/customer-ugc/[id]`, `POST /api/admin/customer-ugc/[id]/approve` (erstellt `UGC-XXX-XXXX`-Gutschein + E-Mail), `POST .../reject` (Begründung pflicht, Dateien-Delete optional), `POST .../feature` (channel-Parameter, erstellt `BONUS-XXX-XXXX`-Gutschein + E-Mail).
- **Lib:** `lib/customer-ugc.ts` — `loadUgcSettings()`, `createUgcCoupon()`, E-Mail-Helper `sendUgcApprovedEmail`/`sendUgcFeaturedEmail`/`sendUgcRejectedEmail` (E-Mail-Typen `ugc_approved`/`ugc_featured`/`ugc_rejected` in `TYPE_LABELS`).
- **Einstellungen:** `admin_settings.customer_ugc_rewards` steuert Rabatt-Prozente, Mindestbestellwerte, Gültigkeiten, max Dateien (5) + Größe (50 MB), Enabled-Flag. Default im Seed.
- **MediaLibraryPicker:** Neuer Tab "Kundenmaterial" zeigt approved/featured Bilder (mit Social- oder Website-Consent) — Admin kann UGC direkt in Social-Posts übernehmen. Signed URLs (24h).
- **Notifications:** `new_ugc`-Typ (amber Gallery-Icon), Link direkt auf Admin-Moderations-Modal.
- **Audit-Log:** `ugc.approve`/`reject`/`feature`/`update`/`delete` in ACTION_LABELS, Entity `customer_ugc`.
- **Rechtliche Einwilligung:** Upload-Formular mit Pflicht-Checkbox zu § 22 KUG + § 31 UrhG (einfaches, zeitlich unbegrenztes, widerrufliches Nutzungsrecht). Widerrufsrecht wirkt nur für künftige Nutzung — bereits ausgegebene Gutscheine bleiben gültig.
- **Go-Live TODO:**
  1. SQL-Migration `supabase/supabase-customer-ugc.sql` ausführen
  2. Supabase Storage-Bucket `customer-ugc` manuell anlegen (Public OFF, 50 MB, `image/*`, `video/mp4`, `video/quicktime`, `video/webm`)
  3. Bei Bedarf Rabatt-Staffelung unter `admin_settings.customer_ugc_rewards` anpassen

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

## Anlagenbuchhaltung + KI-Rechnungs-OCR (Stand 2026-04-21)
Volles Lager-/Anlagenmodul mit KI-gestuetzter Rechnungs-Analyse. Rechnung hochladen → Claude Vision extrahiert Lieferant, Positionen, Summen + schlaegt pro Position Anlagegut vs. Betriebsausgabe vor → Admin bestaetigt/korrigiert → System legt Assets bzw. Expenses an → Mietvertrag zieht aktuellen Zeitwert (asset.current_value) statt Kaution.

### DB (`supabase-assets.sql`, idempotent)
- **Neue Tabelle `assets`** (kind, name, serial_number, manufacturer, model, purchase_price, purchase_date, useful_life_months, depreciation_method, residual_value, current_value, last_depreciation_at, unit_id FK → product_units, supplier_id, purchase_id, status, is_test)
- **`purchases` erweitert** um: payment_method, invoice_storage_path, invoice_date, ai_extracted_at, ai_raw_response, net_amount, tax_amount, is_test
- **`purchase_items` erweitert** um: asset_id FK, expense_id FK, classification ('asset'|'expense'|'pending'|'ignored'), tax_rate, net_price, ai_suggestion
- **`expenses` erweitert** um: asset_id FK, CHECK-Constraint um `'depreciation'` + `'asset_purchase'` ergaenzt
- **Bug-Fix**: `UPDATE expenses SET category='stripe_fees' WHERE category='fees'` (war Race gegen CHECK-Constraint)
- **Storage-Bucket `purchase-invoices`** (manuell anzulegen, Service-Role-only)

### Libraries
- **`lib/ai/invoice-extract.ts`** — `extractInvoice(buffer, mimeType)` → Claude Sonnet 4.6 mit Document-Input (PDF) oder Image-Input (JPG/PNG/WebP). System-Prompt gibt cam2rent-Kontext + Klassifikations-Regeln (Anlagegut > 100 EUR, Verbrauchsmaterial = Expense, GWG-Sofortabzug 800 EUR-Grenze). Response ist strukturiertes JSON. Kosten: ~0,01–0,03 €/Rechnung. API-Key aus `admin_settings.blog_settings.anthropic_api_key`.
- **`lib/depreciation.ts`** — Pure-Function-Lib fuer lineare AfA: `monthlyDepreciationRate()`, `computeCurrentValue(asOf)`, `pendingDepreciationMonths()`, `isFullyDepreciated()`. Keine DB-Zugriffe.

### API-Routen
- **`POST /api/admin/purchases/upload`** (multipart, max 20 MB) → Magic-Byte-Check (PDF/JPG/PNG/WebP) → Storage-Upload in `purchase-invoices/YYYY/MM/<uuid>.<ext>` → `extractInvoice()` → Supplier finden/anlegen → `purchases` + `purchase_items` (classification='pending' + ai_suggestion). Rate-Limit 20/h pro IP. Respektiert is_test.
- **`PATCH /api/admin/purchase-items/[id]`** mit Body `{ classification: 'asset'|'expense'|'ignored', ... }`. Bei 'asset': legt `assets`-Row + optional `product_units`-Row an. Bei 'expense': legt `expenses`-Row mit `source_type='purchase_item'` + source_id an (Idempotenz).
- **`GET/POST /api/admin/assets`** — Listen/Anlegen (Filter: kind, status, purchase_id, unit_id, include_test).
- **`GET/PATCH/DELETE /api/admin/assets/[id]`** — Detail mit AfA-Historie aus expenses WHERE asset_id. DELETE sperrt bei vorhandenen AfA-Buchungen → Admin muss "Veraeussern" nutzen.
- **`POST /api/admin/assets/[id]/depreciation-catchup`** — Rueckwirkende AfA-Buchung fuer nachgetragenen Bestand.
- **`GET/POST /api/cron/depreciation`** — Monatlicher AfA-Cron (verifyCronAuth). Fuer jedes aktive lineare Asset: wenn Monats-AfA noch nicht gebucht (source_id=`<asset_id>_YYYY-MM` als Idempotenz), expenses-Eintrag mit `category='depreciation'` anlegen, current_value mindert sich, last_depreciation_at wird gesetzt. Stoppt bei Erreichen des Restwerts. Im Test-Modus: nur is_test=true Assets, im Live-Modus: nur is_test=false.
- **`GET /api/admin/invoices/purchase-pdf?path=...`** — Signed URL (5 Min) fuer Rechnungen im `purchase-invoices`-Bucket, Redirect.

### Admin-UI
- **`/admin/einkauf/upload`** (neu) — 4-Schritt-Flow: Drag-and-Drop → Claude-Analyse mit Live-Progress → Positions-Klassifizierung (pro Zeile Asset/Ausgabe/Ignorieren + Felder) → "Alle verbuchen" → Done.
  - KI-Vorschlag wird als Badge angezeigt ("Anlagegut · 92% Sicherheit")
  - Bei Asset: Art-Dropdown, Name, Nutzungsdauer, Seriennummer, Produkt-Verknuepfung (bei rental_camera)
  - Bei Expense: Kategorie-Dropdown, Buchungsdatum
- **`/admin/einkauf`** bekommt oberen Button "📄 Rechnung hochladen (KI)" primaer + "+ Manuell" sekundaer.
- **`/admin/anlagen`** (neu) — Anlagenverzeichnis: KPI-Karten (Anschaffungswert gesamt, Zeitwert, abgeschrieben), Filter (kind, status, Suche), Tabelle mit Link zur Rechnung + Detail.
- **`/admin/anlagen/[id]`** — Detail mit AfA-Historie, Aktionen "AfA nachholen", "Verkauft/Ausmustern/Verlust", Stammdaten, Unit-Verknuepfung. Zeigt berechneten Zeitwert vs. DB-Zeitwert wenn abweichend (AfA-Lauf ausstehend).
- **`/admin/anlagen/nachtragen`** — Liste aller `product_units` ohne Asset-Verknuepfung. Pro Einheit Inline-Formular (Kaufpreis, Kaufdatum, Nutzungsdauer) → legt Asset an + ruft depreciation-catchup auf.
- **`/admin/preise/kameras/[id]`** — Zusaetzliche Spalte "Anlage (Zeitwert)" in der Seriennummern-Tabelle. Bei verknuepftem Asset: Link auf Asset-Detail mit Zeitwert. Bei fehlendem Asset: Link "noch nicht erfasst" auf Upload-Seite. **Seriennummern-CRUD selbst bleibt 1:1 unveraendert** (keine Gefahr fuer Gantt, Packliste, Vertrag-SN, Uebergabeprotokoll).
- **Sidebar (`AdminLayoutClient.tsx`)** — Neuer Menupunkt "Anlagenverzeichnis" in Gruppe "Finanzen" neben "Buchhaltung".

### Mietvertrag — Zeitwert aus Asset
- **`lib/contracts/generate-contract.ts`** bekommt neuen optionalen Parameter `unitId`. Wenn gesetzt, wird ueber `assets.unit_id` der aktuelle `current_value` geladen und als `wiederbeschaffungswert` in MietgegenstandItem geschrieben. Fallback: `opts.deposit` (Kautionsbetrag) → keine Regression fuer Altbestand ohne Asset-Verknuepfung.
- **Floor gegen 0-€-Wertverfall:** `wiederbeschaffungswert = Math.max(asset.current_value, product.deposit)`. Wenn die AfA den Buchwert auf den Restwert treibt (z.B. nach 36 Monaten auf 0 €), bleibt die Kaution als realistische Untergrenze im Vertrag. Grund — steuerlich abgeschrieben ≠ tatsaechlicher Marktwert einer gebrauchten Kamera.
- **Default-Restwert 30 % vom Kaufpreis** beim Anlegen neuer Assets (in `purchase-items/[id]` + `assets` POST). Kann manuell im Asset-Detail oder im Upload-Form ueberschrieben werden. Stellt sicher, dass der Buchwert nicht auf 0 faellt und spiegelt den typischen Gebrauchtpreis von Vermietgeraeten wider.
- **8 Aufrufer** (`confirm-booking`, `confirm-cart` 2x, `manual-booking`, `sign-contract`, `contracts/sign`, `sample-contract`) reichen `unitId` durch wo `booking.unit_id` bekannt. `sample-contract` bleibt ohne unitId → Muster-Vertrag zeigt Dummy-Kaution.
- `product.deposit` bleibt weiter fuer Stripe-PreAuth (Kaution) zustaendig — **nicht mehr identisch mit Zeitwert**, dient aber als Vertrags-Floor.

### DATEV-Export
- **AfA-Buchungen** werden als zusaetzliche Zeilen angehaengt: `S AfA-Konto 4830 AN Bestandskonto 0420/0430/0400/0490` (je nach asset.kind). Datenquelle: `expenses WHERE category='depreciation' AND expense_date IN [from, to]`.
- Non-blocking: try/catch, wenn assets-Tabelle noch nicht migriert → Export funktioniert weiter ohne AfA-Zeilen.
- Seed-Setting `datev_asset_accounts` wird durch `supabase-assets.sql` angelegt (kann in `/admin/buchhaltung` → Einstellungen ueberschrieben werden).

### EUeR + Ausgaben-Tab
- `CATEGORY_LABELS` in `app/api/admin/buchhaltung/reports/euer/route.ts` + `app/admin/buchhaltung/components/AusgabenTab.tsx` um `depreciation: 'Abschreibungen (AfA)'` + `asset_purchase: 'GWG-Sofortabzug'` ergaenzt.
- Alter Key `fees:` → `stripe_fees:` umbenannt (war vorher inkonsistent gegen CHECK-Constraint).
- **Pre-existing Bug mit-gefixt**: `app/api/admin/manual-booking/route.ts:130` + `app/api/admin/buchhaltung/stripe-reconciliation/import-fees/route.ts:51` schrieben `category: 'fees'`, das war gegen den CHECK-Constraint. Jetzt `'stripe_fees'`.

### File-Type-Check erweitert
- `lib/file-type-check.ts` bekommt neuen Export `detectFileType()` der PDF-Signatur (`%PDF-`) zusaetzlich erkennt. Bestehender `detectImageType()` unveraendert.

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
0 * * * *    curl -s -X POST "https://cam2rent.de/api/cron/blog-generate?secret=<CRON_SECRET>"
*/10 * * * * curl -s -X POST "https://cam2rent.de/api/cron/blog-publish?secret=<CRON_SECRET>"
30 18 * * 0  curl -s -X POST -H "x-cron-secret: <CRON_SECRET>" "https://cam2rent.de/api/cron/weekly-report"
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
- Wird seit Env-Toggle (siehe unten) dynamisch aus `admin_settings.environment_mode` geladen. Im Test-Modus erscheint das diagonale Wasserzeichen "MUSTER / TESTVERTRAG – NICHT GÜLTIG" auf jeder Seite, im Live-Modus nicht. Kein manueller Code-Wechsel mehr noetig — Admin schaltet einfach unter `/admin/einstellungen` um.
- Muster-Vertrag unter `/admin/legal/sample-contract` nutzt `forceTestMode: true`, hat das Wasserzeichen also immer.

### Test-/Live-Modus Umschaltung (Stand 2026-04-20)
Zentraler Switch im Admin (`/admin/einstellungen` → "Test-/Live-Modus") kippt die komplette Umgebung: Stripe-Keys, Stripe-Webhook-Secret, Resend-Absender, Sendcloud-Keys, Site-URL, Vertrags-Wasserzeichen, Auto-Publish (Blog + Social), Rechnungs-/Gutschrift-/Buchungsnummer-Praefix (`TEST-`), is_test-Flag auf allen relevanten Datensaetzen und Buchhaltungs-Filter.

- **DB-Setting:** `admin_settings.environment_mode` = `{ "mode": "test" | "live" }` (Default: `test`)
- **Lib:** `lib/env-mode.ts` — `getEnvMode()`, `isTestMode()`, `getStripeSecretKey()`, `getStripePublishableKey()`, `getStripeWebhookSecret()`, `getSendcloudKeys()`, `getSiteUrl()`, `getResendFromEmail()`, `getTestModeEmailRedirect()`, `getNumberPrefix()`, `setEnvMode()`, `invalidateEnvModeCache()`. 30s In-Memory-Cache, Fallback bei Fehler: `'test'` (safe default).
- **Stripe-Factory:** `lib/stripe.ts` → `getStripe()` liefert eine `Stripe`-Instanz mit dem aktuellen Key. Alle 13 API-Routen migriert. `lib/stripe-client.ts` → `getStripePromise()` fuer Client-Seiten (Checkout) — laedt Publishable-Key async ueber `/api/env-mode`.
- **Admin-API:** `GET /api/admin/env-mode` + `POST /api/admin/env-mode` (Passwort-Pflicht, Audit-Log). Oeffentlich: `GET /api/env-mode` fuer Client (Banner, Stripe-Publishable).
- **Env-Var-Konvention:** `<NAME>_LIVE` / `<NAME>_TEST` (z.B. `STRIPE_SECRET_KEY_LIVE`); Fallback auf das bisherige `<NAME>` ohne Suffix (Backwards-Compat).
- **UI:** `components/admin/EnvModeSection.tsx` (Switch mit Passwort-Modal), `components/admin/EnvModeBadge.tsx` (Badge oben in Admin-Sidebar + Mobile-Header, amber = TEST, rosa = LIVE, Polling 60s).

#### Daten-Kontamination verhindert (GoBD-konform)
- **Migration `supabase-env-toggle.sql`:** Spalte `is_test BOOLEAN NOT NULL DEFAULT FALSE` auf `bookings`, `invoices`, `credit_notes`, `expenses`, `email_log`, `admin_audit_log`, `stripe_transactions` + Partial-Indizes.
- **Buchungsnummer:** Im Test-Modus `TEST-C2R-YYKW-NNN` Praefix; Counter separat fuer Test vs. Live (eq-Filter auf `is_test`), damit Live-Sequenz stabil bleibt.
- **Gutschrift-Nummer:** Im Test-Modus `TEST-GS-YYYY-NNNNNN`, separater Counter.
- **Stripe-Reconciliation:** `stripe_transactions.is_test` bei Sync-Import gesetzt.
- **Expenses:** `is_test` wird bei Insert gesetzt (Stripe-Gebuehren-Import, manuelle Buchung, Admin-Ausgabe).
- **Buchhaltungs-Queries:** Dashboard, Reports (EÜR, USt-VA, Revenue), DATEV-Export, Open-Items, Invoices-Liste, Dunning-Check, Credit-Notes, Expenses, Weekly-Report filtern alle per Default `.eq('is_test', false)`. Test-Daten erscheinen nicht in Berichten.
- **Email-Log:** `is_test` wird bei jedem `sendAndLog`-Call gesetzt.
- **Auto-Post:** `lib/meta/auto-post.ts` + `/api/cron/social-publish` + `/api/cron/social-generate` + `/api/cron/blog-publish` + `/api/cron/blog-generate` springen im Test-Modus frueh raus (keine Meta-API-Calls, keine OpenAI-Kosten).
- **Optional: TEST_MODE_REDIRECT_EMAIL:** Env-Var; wenn gesetzt, werden im Test-Modus alle Kundenmails stattdessen an diese Adresse umgeleitet (Subject mit "[TEST → urspruenglich: ...]" Prefix).

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

### E-Mail-Vorlagen-Übersicht + Bearbeitung (`/admin/emails/vorlagen`, Stand 2026-04-28)
Katalog aller automatisch versendeten E-Mails mit Inline-Vorschau und optionaler Anpassung von Betreff + Einleitungstext pro Vorlage.
- **Katalog:** `lib/email-previews.ts` — `EMAIL_TEMPLATE_CATALOG` listet ~17 Templates mit id, Name, Trigger-Beschreibung, Empfänger (Kunde/Admin) und Render-Funktion
- **Preview-Mechanismus:** `renderEmailPreview(sendFn, data)` in `lib/email.ts` nutzt `AsyncLocalStorage`, um `sendAndLog` im Capture-Modus auszuführen — kein tatsächlicher Versand, kein Log-Eintrag. Minimal-invasiv: keine Refaktorierung der 17 send-Funktionen nötig.
- **Overrides (Stufe 2):** Pro Template (keyed by emailType) lassen sich `subject` und `introHtml` in `admin_settings.email_template_overrides` hinterlegen. Greift überall — echte Sends, manueller Versand aus Buchungsdetails, Vorschau im Admin.
  - **Lib:** `lib/email-template-overrides.ts` — `getEmailTemplateOverride(id)`, `applyEmailOverride(rendered, override)`, `setEmailTemplateOverride(id, override|null)`, 30 s In-Memory-Cache mit `invalidateEmailTemplateOverridesCache()`. Eigener Allowlist-Sanitizer (`<b>`, `<i>`, `<em>`, `<strong>`, `<p>`, `<br>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<h2>`, `<h3>`, `<span>`, `<div>`, `<u>`, `<s>`, `<small>`, `<code>`); entfernt `<script>`, `<iframe>`, `<style>`, Event-Handler-Attribute, `style`-Attribute und `javascript:`-Links. Subject-Cap auf 250 Zeichen.
  - **Wiring:** `sendAndLog()` in `lib/email.ts` ruft den Override-Lookup vor Capture/Versand auf — Capture-Pfad (`renderEmailPreview`) bekommt damit automatisch die Override-Variante, das DB-`email_log` protokolliert den tatsächlich versendeten Subject. Die 5 Build-Pfad-Templates (booking_confirmation, booking_admin, cancellation_customer, cancellation_admin, shipping_confirmation) wenden Overrides explizit über `withOverride()` in `email-previews.ts` an, damit auch deren Vorschau die Anpassungen zeigt.
  - **HTML-Injection:** Einleitungs-Block wird nach der ersten `</h1>` eingefügt; falls keine vorhanden, am Anfang des weißen Body-Containers. Block hat ein `data-cam2rent-intro="1"`-Attribut zur Erkennung.
- **APIs:** `GET /api/admin/email-templates` (Liste), `GET /api/admin/email-templates/preview?id=X&format=html|json` (Render mit Dummy-Daten), `GET /api/admin/email-templates/overrides` (Map aller aktiven Overrides), `PUT /api/admin/email-templates/overrides` (Body `{ id, subject?, introHtml? }`), `DELETE /api/admin/email-templates/overrides?id=...` (Standard wiederherstellen).
- **UI:** Karten-Liste mit Inline-Vorschau im Modal (iframe) + Button „Neuer Tab" für Fullscreen-Preview. Bearbeiten-Button öffnet Edit-Modal mit Betreff-Input + Einleitungstext-Textarea + Live-Vorschau (iframe gegen Preview-API, manuell aktualisierbar) + „Auf Standard zurücksetzen"-Button. Karten mit aktiver Anpassung bekommen amber-Border + „✏ angepasst"-Badge, im Header zeigt sich die Gesamtzahl angepasster Vorlagen.
- **Audit-Log:** `email_template.update` + `email_template.reset` in `ACTION_LABELS`, Entity `email_template` in `ENTITY_LABELS`.

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

### Audit-Fixes (2026-04-25 Sweep 4 — uebriggebliebene Punkte)
Vier Themen, die nach Sweep 3 als „bewusst nicht gefixt" markiert waren, jetzt nachgezogen.

- **`fmtEuro`-Sweep (UI-Konsistenz)** — `lib/format-utils.ts` ist die einzige Quelle der Wahrheit fuer Euro-Formatierung. Alle ~14 verbliebenen `.toFixed(2).replace('.', ',') + ' €'`-Stellen ueber 11 Files (`app/admin/buchungen/{id,neu}`, `app/kameras/[slug]/{page,buchen}`, `app/konto/favoriten`, `app/set-konfigurator`, `app/vergleich`, `components/{ProductCard, ProductAccessorySets, SearchModal}`, `components/booking/SignatureStep`) durch `fmtEuro(...)` ersetzt. Lokale `fmt(n)`-Helper, die nur Komma-Konvertierung ohne `€` machen, blieben — sie sind semantisch verschieden.
- **Asset-Disposal Booking-Check (HIGH)** in `app/api/admin/assets/[id]/route.ts`: Bei Status-Wechsel auf `disposed`/`sold`/`lost` wird vor dem Update geprueft, ob die `unit_id` noch in einer aktiven Buchung (`confirmed`/`shipped`/`picked_up`) hängt. Wenn ja → 409 mit Buchungsnummer, sonst Update. Verhindert Datenkonsistenzbruch zwischen Anlagenverzeichnis (Status: weg) und Buchung (Vertrag verweist noch auf die Seriennummer).
- **User-Enumeration via `auth.admin.listUsers` ersetzt (HIGH, neue SQL-Migration)** — Migration `supabase/supabase-check-email-rpc.sql` legt eine `SECURITY DEFINER`-Funktion `public.check_email_exists(p_email)` an (nur fuer `service_role`-Grant). Stable, indexierbar, kein Daten-Leak. `app/api/auth/check-email` und `app/api/auth/express-signup` rufen jetzt zuerst die RPC auf und fallen nur dann auf den alten `listUsers`-Pfad zurueck, wenn die Funktion noch nicht existiert (Migration nicht durch). check-email Rate-Limit von 30/min auf 10/min reduziert.
- **Weekly-Report Memory-Schutz + Cron-Lock (MEDIUM)** in `lib/weekly-report.ts` + `app/api/cron/weekly-report/route.ts`: 4 unbeschraenkte Bookings/Invoices-Queries bekamen `.limit(2000)` als Safety-Net — bei normalem Betrieb < 100 Eintraege/Woche, der Cap schuetzt nur vor OOM bei Filter-Bug oder Datenexplosion. Plus `acquireCronLock('weekly-report')` damit Sonntag-18:30-Tick + Coolify-Redeploy nicht denselben Bericht zweimal verschicken.

**Go-Live TODO:** ~~SQL-Migration `supabase/supabase-check-email-rpc.sql` ausfuehren~~ ✓ (am 2026-04-25 ausgefuehrt, Datei nach `erledigte supabase/` verschoben).

### Security- & Reliability-Audit-Fixes (2026-04-25 Sweep 3)
Dritte Audit-Runde — Findings nach Sweep 2 verifiziert (manuelle Stichproben), Halluzinationen rausgefiltert. Falsch-Befunde: scrypt-N=1 (Agent verwechselte Format-Versions-Praefix mit Cost-Faktor — Node-Default ist N=16384, OWASP-konform), Auto-Cancel-Refund-Race (DB-Update kommt tatsaechlich VOR Stripe-Refund), NotificationDropdown Visibility-Reset (war schon implementiert).

- **Stripe-Webhook DB-Insert-Fehler nicht mehr stumm (CRITICAL)** in `app/api/stripe-webhook/route.ts`: bei `bookings.insert()`-Fehler nach erfolgreichem PaymentIntent (Geld eingegangen, aber DB-Insert scheitert) wird jetzt eine `payment_failed`-Admin-Notification erzeugt mit IntentID + Betrag + Fehler. Vorher: nur `console.error`, Stripe bekommt 200 zurueck, kein Retry, Buchung verloren.
- **Versand-Pack-Check atomar (CRITICAL)** in `app/api/admin/versand/[id]/check/route.ts`: UPDATE auf `pack_status='checked'` hat jetzt zusaetzlich `.eq('pack_status','packed')` + `.select('id')` → bei 0 Rows wird 409 zurueckgegeben. Vorher konnten zwei parallele Kontrolleure beide einen Check durchfuehren mit doppelten Foto-/Signatur-Daten. Selber Bug-Pattern wie der Sweep-2-UGC-Approve-Fix.
- **UGC-Reject atomar (HIGH)** in `app/api/admin/customer-ugc/[id]/reject/route.ts`: UPDATE mit `.eq('status','pending')` + 409 bei Race. Verhindert doppelten Storage-Remove + doppelte Mail bei Doppelklick.
- **Cron-Re-Entry-Lock-Helper (CRITICAL, neue Lib)** `lib/cron-lock.ts`: zentrale `acquireCronLock(name)` / `releaseCronLock(name)`-Pair, persistiert in `admin_settings.cron_lock_<name>` mit 15min Stale-Detection. Eingebaut in 5 Crons (`dunning-check`, `verification-reminder`, `verification-auto-cancel`, `awaiting-payment-cancel`, `social-publish`). Verhindert dass Coolify-Restart + Crontab-Tick parallel die selbe Mahn-/Storno-/Mail-Logik durchlaufen und dabei Mails / Stornos / Mahnungen duplizieren.
- **`Promise.allSettled` in social-publish-Cron (HIGH)** `app/api/cron/social-publish/route.ts`: vorher konnte ein Fehler in einer Phase (z.B. `processScheduleEntries`) die anderen (`processRetries`) mit-killen → Posts blieben in `failed`-Status haengen. Jetzt allSettled mit per-Phase-Logging.
- **damage-report Magic-Byte-Check (HIGH)** in `app/api/damage-report/route.ts`: vorher reichte `photo.type` (Client-MIME). Jetzt `isAllowedImage(buffer)` + `detectImageType` und Datei wird mit dem ECHTEN MIME ausgeliefert. Path-Traversal bleibt durch Whitelist-Mapping ausgeschlossen. `damage-photos`-Bucket nimmt nur noch JPEG/PNG/WebP/HEIC/GIF.
- **Signup-Rate-Limit per IP (HIGH)** in `app/api/auth/signup/route.ts`: vorher globaler In-Memory-Counter — 1 Angreifer konnte alle 3 Slots/h aufbrauchen und damit jeden legitimen Signup blockieren. Jetzt `rateLimit({ maxAttempts: 3, windowMs: 1h })` mit Bucket-Key `signup:${ip}` (nutzt den bestehenden `lib/rate-limit.ts`-Helper).
- **N+1 in 3 Admin-APIs behoben (HIGH)**:
  - `/api/admin/buchhaltung/invoices`: 1 Bookings-Lookup pro Rechnung → 1 Bulk `in('id', ids)` + Memory-Map.
  - `/api/admin/buchhaltung/open-items`: 2 Lookups pro Rechnung (Bookings + Dunning) → 2 Bulk-Queries + 2 Memory-Maps. Zusaetzlich `select('*')` auf Spaltenliste reduziert.
  - `/api/admin/nachrichten`: 1 Last-Message-Lookup pro Conversation → 1 Bulk-Query mit `ORDER BY created_at DESC`, dann erste Zeile pro `conversation_id` als neueste interpretiert.
- **EnvModeBadge Backoff (MEDIUM)** `components/admin/EnvModeBadge.tsx`: pollt nicht mehr stumpf alle 60s, sondern verdoppelt das Intervall bei API-Fehlern (60→120→240→480 s) und pausiert bei `document.visibilityState === 'hidden'`. Bei Tab-Visibility-Wechsel wird Backoff resettet + sofort neu geladen. Verhindert 60 unnoetige Requests/h pro Admin-Tab bei Supabase-Outage.
- **UI-Sweep**: `app/admin/social/plan/page.tsx` 3 Stellen (`zuruecksetzen`, `haengen`, `laeuft`), `components/InstallPrompt.tsx` (`Schliessen`, plus Dark-Mode-Klassen), `components/admin/MediaLibraryPicker.tsx` (`Schliessen`), `app/kameras/[slug]/buchen/page.tsx` (aria-label `erhoehen`), `app/registrierung/page.tsx` (`zuruecksetzen`), `components/admin/HaftungContent.tsx` 3 Stellen (`bg-white` + Border ohne `dark:`-Pendant).

### Security- & Reliability-Audit-Fixes (2026-04-25)
Zweite Audit-Runde nach 04-20-Sweep. Vier parallele Agents (Security/Performance/UI/Reliability) auf dem aktuellen Production-Stand, Findings verifiziert.

- **API-Permission-Enforcement (CRITICAL)**: Bisher schuetzte die Middleware nur die UI-Routen `/admin/*` per `requiredPermission()`. Die `/api/admin/*`-APIs liefen nur gegen `checkAdminAuth()` — d.h. ein Mitarbeiter mit `tagesgeschaeft`-Permission konnte via direktem API-Aufruf jede Buchhaltungs-/Anlagen-/Mitarbeiter-Route nutzen, weil die Sidebar nur die UI-Eintraege versteckt hat. Fix: Neue Tabelle `API_PATH_PERMISSIONS` in `middleware.ts` spiegelt die UI-Permissions auf API-Pfade, der API-Block prueft Session-Permissions vor `NextResponse.next()`. Legacy-ENV-Token bekommt weiter alle Rechte (Bootstrap), Sonderpfade (`/me`, `/notifications`, `/push`, `/dashboard-data`, `/availability-gantt`) bleiben fuer alle Admins offen.
- **Resend-Send-Errors werden geprueft (CRITICAL)** in `lib/email.ts`: `resend.emails.send()` liefert bei Rate-Limit/ungueltiger Adresse/Outage `{data: null, error}` und wirft NICHT — bisher wurde der Fall stillschweigend als „sent" geloggt. Jetzt `if (result.error) throw new Error(...)`, bestehender catch loggt `status: 'failed'`.
- **Stripe-Webhook nutzt `Promise.allSettled` (CRITICAL)**: Beide `Promise.all([...]).catch(...)`-Stellen in `app/api/stripe-webhook/route.ts` haben einen Mail-Fehler den anderen Send maskieren lassen und am Ende ohne Forensik geendet. Jetzt allSettled mit per-Send-Logging.
- **PATCH employees invalidiert Sessions (HIGH)** in `app/api/admin/employees/[id]/route.ts`: Bei `is_active=false`, Passwort-Wechsel, Rolle- oder Permission-Aenderung wird `deleteAllSessionsForUser()` aufgerufen, bisher nur in DELETE. Ein deaktivierter Mitarbeiter kann jetzt nicht mehr 7 Tage mit alter Session weiterarbeiten.
- **Magic-Byte-Check in `social/upload-image` (HIGH)**: Der `blog-images`-Bucket ist oeffentlich. Bisher reichte `file.type.startsWith('image/')` (Client-MIME). Jetzt `detectImageType(buffer)` vor Upload + content-type aus echtem Format.
- **Reels-Approve nur nach Render-Fertigstellung (HIGH)** in `app/api/admin/reels/[id]/approve/route.ts`: Whitelist-Check gegen `status` (`rendered|pending_review|approved|scheduled|failed|partial`) + `video_url`-Check. Verhindert Meta-API-Fehler im Publish-Cron.
- **UGC-Approve atomar (MEDIUM)** in `app/api/admin/customer-ugc/[id]/approve/route.ts`: `UPDATE` mit zusaetzlichem `.eq('status','pending')` + `select` → bei Race (Doppelklick) wird der zweite Call mit 409 abgewiesen statt einen zweiten Coupon zu erstellen.
- **N+1 in 4 Cron-Routen behoben**:
  - `cron/dunning-check`: 2 SELECTs pro Invoice → 1 Bulk-Load + Memory-Lookup
  - `cron/auto-cancel`: UPDATE pro Buchung → ein Bulk-UPDATE
  - `cron/reminder-emails`: `email_log.insert` pro Mail → Batch-Insert pro Job
  - `cron/depreciation`: SELECT pro Asset×Monat → Bulk-Load aller `source_id` + Memory-Set
- **`fetch().ok`-Check** ergaenzt in `cron/blog-generate` (DALL-E-Bild-Download) und `rental-contract/[bookingId]` (Storage-PDF-Download). Vorher: 404 fuehrte zu leerem/korruptem Buffer.
- **`reels-publish` Plausibilitaets-Check**: Reels mit `scheduled_at > 7 Tage in der Vergangenheit` (Tippfehler-Schutz) werden auf `status='failed'` gesetzt statt sofort publiziert.
- **PostgREST `.or()`-Sanitizer** `lib/search-sanitize.ts`: User-Input fuer Suche wird vor Interpolation in `.or('col.ilike.%X%,col2.ilike.%X%')` von Komma/Klammern/Backslash/Steuerzeichen gesaeubert + auf 100 Zeichen gecappt. Verhindert Filter-Injection (zusaetzliche `and(...)`-Bloecke) und DB-Last bei 10k-Char-Inputs. Eingebaut in: `audit-log`, `email-log`, `blog/posts`, `buchhaltung/invoices` (+export).
- **UI-Sweep**: 100vh→100dvh in 5 Anlagen-/Einkauf-Seiten (iOS-Safari Adressleisten-Bug), `text-sm`→`text-base` in Mitarbeiter-Form-Inputs (iOS-Auto-Zoom), Umlauten-Fixes in `/admin/anlagen`, `/admin/einkauf/upload`, `/admin/social/{neu,posts/[id],plan}` und `/kamera-finder` (Customer-UI: 9 Stellen `moechte`/`hauptsaechlich`/`Gehaeuse`/`Aufloesung`/`Atmosphaere`/`Spritzwassergeschuetzt`/`Guenstig`/`verfuegbar`), `EUR`→`€` und `inputMode="decimal"` in Anlagen-/Einkauf-Forms.
- **`public/robots.txt`** angelegt — verbietet Crawl von `/admin/`, `/api/`, `/checkout`, `/konto/`, `/auth/`, `/login`, `/umfrage/`. Verlinkt Sitemap.

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

### Mitarbeiterkonten + granulare Permissions (Stand 2026-04-24)
Zwei Login-Arten für den Admin-Bereich: weiterhin das Master-Passwort (ENV `ADMIN_PASSWORD`, virtueller „Owner" mit allen Rechten) als Bootstrap/Notfall-Zugang — ODER E-Mail+Passwort eines in der DB hinterlegten Mitarbeiters. Der Admin entscheidet pro Mitarbeiter, welche Bereiche sichtbar sind.

- **DB-Migration `supabase/supabase-admin-users.sql`** (idempotent): Tabellen `admin_users` (id, email UNIQUE, password_hash, name, role `owner|employee`, permissions JSONB, is_active, last_login_at, created_by) + `admin_sessions` (token PRIMARY KEY, user_id FK, expires_at, last_used_at, user_agent, ip_address). RLS aktiviert (nur Service-Role).
- **Passwort-Hashing:** Node-`crypto.scrypt` mit 16-Byte-Salt und 64-Byte-Hash. Format: `scrypt$1$<salt-hex>$<hash-hex>`. Kein zusätzliches Paket nötig.
- **Lib `lib/admin-users.ts`:** CRUD + `hashPassword`, `verifyPassword`, `createSession`, `getUserBySession`, `deleteAllSessionsForUser`, `legacyEnvUser()`, `hasPermission()`, `requiredPermissionForPath()`. Änderung an Rolle/Permissions/Passwort oder Deaktivierung invalidiert alle Sessions des Users automatisch.
- **9 Permission-Keys:** `tagesgeschaeft`, `kunden`, `katalog`, `preise`, `content`, `finanzen`, `berichte`, `system`, `mitarbeiter_verwalten`. Owner haben immer alle. Leeres Permission-Array = Mitarbeiter sieht nur Dashboard.
- **`lib/admin-auth.ts`** liefert `getCurrentAdminUser()` (Session-Token-Lookup ODER Legacy-Hash — timing-safe) und `currentUserHasPermission(perm)`. `checkAdminAuth()` bleibt als Boolean-Alias erhalten — alle bestehenden API-Routen laufen weiter.
- **Login-API `/api/admin/login`:** akzeptiert `{ loginId? | email? | username?, password, totpCode? }`. Mit Login-ID → enthält `@` → E-Mail-Lookup, sonst Username-Lookup → scrypt-Verify + Session-Cookie `sess_<random>`. Ohne Login-ID → Legacy-ENV-Passwort (mit 2FA). Beide setzen `admin_token`-Cookie mit `sameSite: 'strict'`. Legacy-Cookie weiterhin 24h (aus 04-20-Audit), Session-Cookie 7 Tage. Rate-Limit 5/15 Min pro IP. Username-Spalte (case-insensitive Unique-Index) auf `admin_users`, optional pro Account.
- **Logout** löscht bei Session-Tokens auch den DB-Eintrag (Session-Revocation).
- **Middleware** prüft Cookie: Session-Token → DB-Lookup (60s-Cache mit LRU-Eviction bei 500 Einträgen) → Permission-Check pro Admin-Pfad via `PATH_PERMISSIONS`-Tabelle. Bei fehlender Berechtigung Redirect auf `/admin?forbidden=<perm>`. Legacy-Token hat weiterhin alle Rechte. Legacy-Vergleich nutzt edge-kompatibles `safeStringEqual` (konstanzzeit).
- **Admin-UI `/admin/einstellungen/mitarbeiter`:** Liste aller Accounts mit Rolle-Badge, Permissions als Pills, letzter Login. Anlegen: Name+E-Mail+Passwort+Rolle+Permissions-Grid (Toggle-Karten mit Hinweistext). Bearbeiten: alles änderbar + optional neues Passwort. Löschen mit Bestätigung. Schutzschranken: nur Owner können Owner ernennen, letzter aktiver Owner kann nicht gelöscht/herabgestuft/deaktiviert werden, User kann sich nicht selbst löschen, der virtuelle `legacy-env`-User kann nicht angefasst werden.
- **Sidebar** holt `/api/admin/me` und filtert alle Nav-Items nach Permissions (Gruppen-Header werden komplett ausgeblendet, wenn keine Items sichtbar sind — z.B. ganze „Finanzen"-Sektion verschwindet für Mitarbeiter ohne `finanzen`-Permission). Dashboard sieht jeder eingeloggte Admin.
- **Audit-Log** schreibt ab jetzt den tatsächlichen `admin_user_id` + `admin_user_name` der eingeloggten Session in `admin_audit_log`. Spalten-Mapping (`details` statt `changes`, IP im JSONB) ist damit auch mit eingeloggtem User korrekt.
- **APIs:** `GET /api/admin/me`, `GET/POST /api/admin/employees`, `PATCH/DELETE /api/admin/employees/[id]`. Alle geschützt durch `hasPermission(me, 'mitarbeiter_verwalten')`.
- **Go-Live TODO:** `supabase-admin-users.sql` ausführen → unter `/admin/einstellungen/mitarbeiter` ersten echten Owner anlegen → Mitarbeiter als `employee` mit gewünschten Bereichen. Das ENV-`ADMIN_PASSWORD` bleibt als Notfall-Login aktiv und sollte auf einen zufälligen, unbekannten Wert gedreht werden, sobald echte Owner-Accounts existieren.

### Mobile-Fixes (2026-04-17)
- **Viewport-Export** in `app/layout.tsx`: `device-width`, `initialScale: 1`, `viewportFit: 'cover'` (iOS Safe-Area aktiv) — Next.js 15 Pattern.
- **CookieBanner z-[60]** + `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`: liegt jetzt über CompareBar, iOS Home-Indicator überlagert nicht mehr.
- **CompareBar safe-area-inset-bottom**: Content verschwindet nicht mehr hinter iOS Home-Indicator.
- **Checkout-Inputs** `text-sm` → `text-base` (16px): verhindert iOS Safari Auto-Zoom beim Input-Fokus.
- **ProductCard Favoriten-/Vergleich-Buttons** `p-1.5` → `p-2.5`: Touch-Targets jetzt ~44px (Apple HIG).

### UI-Darstellungs-Sweep (2026-04-21)
Systematischer Sweep ueber Admin- und Kundenkonto-UI nach Darstellungsfehlern. Gefixt:
- **Status-Badges deutsch**: Dashboard-Widgets (Letzte Buchungen + Aktivitaets-Feed) + Buchungs-Liste + Kunden-Detail + Kundenkonto-Buchungen hatten unvollstaendige Status-Maps. Zeigten Rohwerte wie `picked_up`, `pending_verification`, `awaiting_payment`, `returned`. Alle Maps auf die DB-Enum-Werte vervollstaendigt.
- **Kaution-Badge**: `DepositBadge` in Buchungsdetails kannte `held/released/captured`, aber nicht den DB-Default `none` + `pending`. Ergaenzt.
- **Waitlist-Quelle**: Spalte „Quelle" in `/admin/warteliste` zeigte `card`/`detail` roh. Neu: `sourceLabel()` → „Produktkarte" / „Detailseite".
- **Zahlenformat de-DE**: `toFixed(2) + ' €'` in sichtbarer UI durch `fmtEuro`/`formatCurrency` ersetzt (Zubehör-Liste, Sets-Liste, Analytics-Kundenwerte, Versand-Drucken, komplettes Manuelle-Buchung-Formular). Vorher „49.90 €", jetzt „49,90 €". API-Notizen bleiben unberuehrt.
- **„einm." → „einmalig"** im Zubehoer-Badge — konsistent zu Sets.
- **ae/oe/ue → echte Umlaute** in sichtbaren UI-Strings: Social-Themen-Placeholder „Saetze" → „Sätze", Social-Plan-Tooltip „zuruecksetzen" → „zurücksetzen", MediaLibraryPicker-Modal „waehlen" → „wählen".
- **Slug-Regex-Bug**: `toSlug()` in `/admin/blog/themen` hatte `/[aeAE]/g` (matcht a/e/A/E statt Umlaute). Aus „Action-Kamera" wurde „aectioen…-kaemeraer". Korrigiert auf `/[äÄ]/`, `/[öÖ]/`, `/[üÜ]/`.
- **Bewusst NICHT geaendert**: Das Wort „Versicherung" in AGB/Haftungsbedingungen/FAQ — dort ist es rechtlich zwingend („cam2rent ist KEINE Versicherung"). CLAUDE.md verbietet das Wort nur als Bezeichnung der Haftungsoptionen.

### E-Mail-Protokoll + Aktivitätsprotokoll-Fix (Stand 2026-04-22)
- **Kritischer Bug in `lib/audit.ts`**: Die Funktion schrieb in die Spalten `changes` + `ip_address`, die im DB-Schema (`admin_audit_log`) **nicht existieren** — die Tabelle hat stattdessen `details` (JSONB). Supabase-Insert schlug still fehl (try/catch schluckte den Fehler). Dadurch blieb das Aktivitätsprotokoll seit jeher leer, obwohl 15+ Routen `logAudit()` aufriefen. **Fix:** Mapping auf `details`, IP wird zusätzlich ins `details`-JSON aufgenommen. Fehler werden jetzt als `console.error` geloggt.
- **E-Mail-Protokoll TYPE_LABELS** vervollständigt um alle tatsächlich versendeten E-Mail-Typen: `payment_link`, `contract_signed`, `manual_documents`, `weekly_report`, `verification_reminder`, `verification_auto_cancel`, `auto_cancel`, `auto_cancel_payment`, `review_reward_coupon`, `test`. Vorher wurden diese als Rohwert ("payment_link") angezeigt.
- **Aktivitätsprotokoll ACTION_LABELS** auf das tatsächlich verwendete **Dotted-Naming** erweitert (`booking.cancel`, `invoice.mark_paid`, `credit_note.approve`, `expense.create`, `stripe.sync_run`, `reel.publish`, `env_mode.change`, ...). Legacy-Unterstrich-Namen bleiben als Fallback. Neuer Helper `humanizeAction()` erzeugt lesbares Fallback-Label für unbekannte Aktionen (`foo.bar_baz` → „foo · bar baz"). ENTITY_LABELS um `invoice`, `credit_note`, `dunning`, `expense`, `stripe`, `reel`, `env_mode` ergänzt.
- **Neue Audit-Logs instrumentiert in:**
  - `PATCH /api/admin/booking/[id]` — erkennt automatisch `booking.cancel`, `booking.verification_gate`, `booking.email_updated`, `booking.update`
  - `DELETE /api/admin/booking/[id]` → `booking.delete`
  - `POST /api/admin/verify-customer` → `customer.verify` / `customer.reject_verification`
  - `POST /api/admin/anonymize-customer` → `customer.anonymize`
  - `POST /api/admin/kunden/blacklist` → `customer.block` / `customer.unblock`
  - `POST /api/admin/env-mode` → `env_mode.change` (Inline-Insert ersetzt durch `logAudit()`-Helper, da Inline-Insert denselben Spaltennamen-Bug hatte)
  - `POST /api/admin/settings` → `settings.update` (transiente Status-Keys wie `social_plan_job` sind von der Protokollierung ausgenommen)

## Offene Punkte

### Reel-Workflow-Refactor (in Arbeit, Stand 2026-04-27)
Aktuelle Reel-UX ist zu unübersichtlich (Detailseite ~756 Zeilen Wand, Erstellung 1-Screen, kein Redaktionsplan, Vorlagen-Seite vermischt Settings + Music + Templates). Plan: 5 Schritte. **Schritt 1 ist gemerged (Commit `f7ddf89`)**, der Rest steht noch.

**Sidebar-Wireframe (final, in Schritt 1 umgesetzt):**
```
Social Media (Collapse)
├─ Übersicht
├─ Posts
├─ Neuer Post
├─ Reels (Sub-Collapse, neu)
│  ├─ Übersicht
│  ├─ Neues Reel
│  ├─ Redaktionsplan          ← Seite existiert noch nicht (Schritt 5)
│  ├─ Vorlagen
│  └─ Einstellungen           ← Schritt 1 ✓ (eigene Seite)
├─ Themen & Serien
├─ Redaktionsplan (Posts)
├─ KI-Plan (Bulk, Posts)
└─ Vorlagen (Posts)
```
Implementierung: `components/admin/AdminLayoutClient.tsx` — neue Komponente `ReelsCollapse` (analog `BlogCollapse`), `SOCIAL_ITEMS` aufgeteilt in `SOCIAL_POSTS_ITEMS_BEFORE` + `SOCIAL_POSTS_ITEMS_AFTER`, dazwischen `<ReelsCollapse>`. Highlight-Logik: `SocialCollapse` highlightet **nicht**, wenn man auf einem Reels-Pfad ist (sondern nur die Reels-Collapse).

**Schritt 1 — Sidebar-Sub-Nav + Einstellungen abspalten ✓ (Commit `f7ddf89`)**
- Neue Komponente `ReelsCollapse` in `AdminLayoutClient.tsx`, eingehängt in `SocialCollapse` zwischen "Neuer Post" und "Themen & Serien"
- Neue Seite `app/admin/social/reels/einstellungen/page.tsx` — Card-Layout mit API-Keys, Standard-Dauer, Branding, Voice-Over (extrahiert aus `vorlagen/page.tsx`)
- `vorlagen/page.tsx` zeigt nur noch Templates + Musikbibliothek + Link "Einstellungen" oben rechts
- Sidebar-Link `/admin/social/reels/zeitplan` ist drin, **Seite existiert aber noch nicht** → Schritt 5 muss diese Seite anlegen

**Schritt 2 — Detailseite mit Tabs ✓**
Datei `app/admin/social/reels/[id]/page.tsx` von 1-Wand-Layout (756 Z.) auf 4-Tab-Struktur umgebaut. State + Handler 1:1 erhalten, JSX neu strukturiert.
- **Header (immer sichtbar):** Back-Link, Titel, Status-Badge, TEST-Badge, „erstellt am", rechts: „Render abbrechen" (nur bei `rendering`/`publishing`), „Neu rendern", „Löschen". Toast (`feedback`) + `<ReelRenderStatus>`-Banner + Audio-Stumm-Hinweis bleiben über den Tabs.
- **Neue State-Variable:** `activeTab: 'preview' | 'content' | 'scenes' | 'render'` — Default `'preview'`. Alte `showScript/showLog/showMetrics` entfallen (Inhalte sind in den Tabs jetzt immer aufgeklappt).
- **Tab „Vorschau":** Video links (9:16), rechts kontextabhängiger „Nächster Schritt"-Block basierend auf `reel.status`:
  - `failed` → rote Fehlerbox + „Neu rendern"-Button
  - `rendering`/`publishing` → Hinweistext (Status oben aktualisiert)
  - `pending_review`/`rendered`/`draft` (canApprove + isReady) → „Freigeben"-Button (manuell veröffentlichen) + datetime-local + „Einplanen"
  - `approved` → „Jetzt veröffentlichen"
  - `scheduled` → geplanter Zeitpunkt + „Jetzt veröffentlichen"
  - `published` → grüne Bestätigung + FB/IG-Permalink-Links
  - `partial` → orange Hinweis + „Erneut veröffentlichen"
- **Tab „Inhalt":** Caption-Textarea (8 Zeilen + Zeichenzähler) + Hashtags-Input + datetime-local + „Speichern"-Button. Plattformen + Account-IDs read-only unten.
- **Tab „Szenen":** Migration-Banner falls `segmentsMissing`, dann bestehender Phase-3.2-Segment-Grid (Body-Tausch-Buttons) + Hinweis falls Reel pre-Phase-3.
- **Tab „Render & Skript":** KI-Skript (immer aufgeklappt, nicht mehr collapsible), Render-Metriken (immer aufgeklappt), Render-Log (immer aufgeklappt), Fallback-Hinweis falls weder Metriken noch Log vorhanden. Tab-Badge mit ⚠ wenn `error_message` gesetzt.
- **Tab-Counter:** „Szenen (N)" zeigt Anzahl persistierter Segmente.
- **Modals (Delete + Query)** bleiben tab-unabhängig am Ende des Components.
- Variable `canPublishNow` entfernt (durch direkte Status-Checks pro Tab-Block ersetzt).

**Schritt 3 — Neues-Reel-Wizard (TODO)**
Datei: `app/admin/social/reels/[id]/page.tsx` (aktuell 756 Zeilen Wand). State + Handler 1:1 erhalten, JSX neu strukturieren:
- **Header (immer sichtbar):** Back-Link, Titel, Status-Badge, TEST-Badge, „erstellt am", rechts: „Neu rendern" + „Löschen"
- **Toast** für `feedback`-Message, **`<ReelRenderStatus>`-Banner** (existiert) während Render
- **4 Tabs** (`useState<'preview'|'content'|'scenes'|'render'>('preview')`):
  - **Vorschau** — Video links (9:16), rechts „Nächster Schritt"-Block mit kontextabhängigem Primary-Button basierend auf `reel.status`:
    - `rendering` → „Render abbrechen" (`handleResetRender`)
    - `failed` → „Neu rendern" + Error-Message-Box
    - `rendered`/`pending_review`/`draft` → „Freigeben" + „Einplanen" (datetime-local + Button), nutzt bestehende `handleApprove(false|true)`
    - `approved`/`scheduled` → „Jetzt veröffentlichen" (`handlePublishNow`)
    - `published` → FB+IG-Permalink-Links
  - **Inhalt** — Caption-Textarea + Hashtags-Input + Schedule-Input + „Speichern"-Button (`handleSave`). Plattformen + Account-Namen read-only.
  - **Szenen** — bestehender Segment-Grid (Z. 524–605) + Migration-Banner + Query-Modal
  - **Render & Skript** — KI-Skript-JSON-Viewer (immer aufgeklappt), Render-Metriken (immer aufgeklappt), Render-Log (immer aufgeklappt), Audio-Warning-Banner falls stumm (Z. 363–368)
- Tab-Badge mit Counter sinnvoll für „Szenen (N)" und ⚠ in „Render" wenn `error_message` gesetzt
- Modals (Delete + Query) bleiben unverändert am Ende

**Schritt 3 — Neues-Reel-Wizard ✓**
Datei `app/admin/social/reels/neu/page.tsx` (vorher 280 Z. 1-Screen-Form, jetzt 4-Schritt-Wizard mit Stepper).
- **State zentral:** `step: 1|2|3|4` + Formfelder einzeln (kein useReducer, da Felder ohnehin separat).
- **Stepper oben:** 4 Kacheln (Idee / Visuelles / Verteilung / Bestätigen), aktiv = orange, fertig = emerald-Haken.
- **Schritt 1 — Idee:** Vorlage-Dropdown + Topic (Pflicht) + Kamera (optional). Skript-Prompt-Vorschau füllt `{topic}`/`{product_name}`/`{keywords}` direkt aus dem Template-`script_prompt` ein.
- **Schritt 2 — Visuelles:** Keywords-Input + Live-Preview-Grid aus Pexels/Pixabay (nutzt `GET /api/admin/reels/preview-stock?query=…&source=…`, zeigt 6 Treffer als 9:16-Video-Tiles mit Quelle/Auflösung/Dauer-Overlay). Musik-Dropdown (`/api/admin/reels/music`). Plattformen-Checkboxen mit Pflichtfeld-Validierung.
- **Schritt 3 — Verteilung:** FB-Page-Dropdown (conditional auf Facebook) + IG-Account-Dropdown (conditional auf Instagram). Radio-Toggle „Sofort generieren" vs. „In Redaktionsplan einreihen". Plan-Option ist disabled+greyed mit Hinweis „kommt mit Schritt 5".
- **Schritt 4 — Bestätigen:** `<dl>` mit allen gewählten Feldern (Vorlage, Topic, Kamera, Keywords, Plattformen, Musik, FB-Seite, IG-Account, Timing) + amber Kosten-Box (~0,02 € Claude + ~0,003 € TTS). „Reel generieren" ruft POST `/api/admin/reels` und springt auf Detail-Seite.
- **Navigation:** Zurück-Button (disabled in Schritt 1), Weiter-Button (validiert via `canGoNext()` — Topic+Template in S1, mind. 1 Plattform in S2, gültiger Schedule in S3), in Schritt 4 wird Weiter zu „Reel generieren".
- **Preview-API-Vertrag:** liefert `{ externalId, downloadUrl, width, height, durationSec, attribution }` — kein `thumb`-Feld. Frontend zeigt das Video direkt mit `preload="metadata"` als Tile (Browser zieht nur die ersten Bytes).

**Schritt 4 — Übersichtsliste mit Bulk + Filtern ✓**
Datei `app/admin/social/reels/page.tsx` (vorher 188 Z.). Lädt jetzt unbedingt alle (limit=200) und filtert/zählt client-seitig — dadurch sind die Counter pro Status-Pill immer richtig, egal welcher Filter aktiv ist.
- **Status-Pills mit Counter** (`{ '': allReels.length }` + pro Status). Aktive Pill ist dunkel, Counter sitzt als kleines Badge daneben.
- **Hybrid-Sort `hybridSort()`:** `scheduled` zuerst nach `scheduled_at` ASC, alles andere nach `created_at` DESC. Dadurch landet die nächste planmäßige Veröffentlichung immer ganz oben.
- **`nextStepHint(reel)`-Helper** liefert pro Reel einen kontextabhängigen Status-Hint mit Farbklasse: „Wartet auf Freigabe", „Geplant für TT.MM. HH:MM", „Render fehlgeschlagen — neu starten?", „Bereit — manuell veröffentlichen", „Nur teilweise gepostet — erneut versuchen?" usw. Wird auf der Karte unter Caption angezeigt.
- **Hover-Preview:** `onMouseEnter`/`onMouseLeave` setzen `hoveredId`. Wenn die Karte gehovert + `video_url` vorhanden, ersetzt ein `<video muted autoPlay loop>` das Thumbnail. Mobile sieht weiterhin das Standbild.
- **Bulk-Auswahl:** Checkbox in jeder Karte (Top-Left, mit Stop-Propagation über separates `<label>` außerhalb des Detail-Links). Sticky Bulk-Bar oben (`sticky top-0 z-10`) mit „Freigeben"/„Löschen"/„Auswahl aufheben" + Counter. „Alle X sichtbaren auswählen"-Link wird angezeigt wenn Liste vorhanden + Auswahl leer.
- **Bulk-Veröffentlichen NICHT** in der Bulk-Bar — Hinweistext: „Veröffentlichen läuft pro-Reel über die Detail-Seite (Meta-Rate-Limits)". Verhindert Massen-Posting-Fehler.
- **Auto-Refresh** bei `rendering`/`publishing`-Reels alle 5 Sek (wie vorher).

**Bulk-API:** `POST /api/admin/reels/bulk` mit `{ action: 'approve'|'delete', ids: string[] }` (max 100).
- `approve`: lädt zuerst alle Reels per `in('id', ids)`, filtert auf `status IN ('pending_review','rendered','draft') AND video_url NOT NULL`, setzt nur diese auf `approved`. Antwort: `{ approved: N, skipped: M }`.
- `delete`: räumt zuerst `social-reels/{id}/{video.mp4,thumb.jpg}` aus dem Storage (best-effort), dann `delete().in('id', ids)`. Kein Remote-Delete (zu viele API-Calls bei Bulk). Antwort: `{ deleted: N }`.
- Audit-Log: `reel.bulk_approve` bzw. `reel.bulk_delete` mit allen IDs als comma-separated entityId + Count in changes.

**Schritt 5 — Redaktionsplan + Bulk-Generator (TODO, größter Aufwand)**
Tabelle `social_reel_plan` ist seit `supabase-reels.sql` da, wird aber **nirgendwo im Code genutzt**. Spalten: `id, scheduled_date, scheduled_time, topic, template_id, status, generated_reel_id, error_message, …` (analog `social_editorial_plan` für Posts).

Vorbild: `/admin/social/zeitplan` (Posts) + `/admin/social/plan` (Bulk-Generator). Blueprint:
- **Neue Seite `app/admin/social/reels/zeitplan/page.tsx`** — 3-Spalten-Layout: Plan-Liste (Datum-Kacheln, klickbar für Inline-Edit) | rechts Plan-Eintrag-Detail mit Buttons „⚡ Jetzt generieren" / „🚀 Sofort posten" / „Bearbeiten" / „Löschen" / „Überspringen". Status-Workflow `planned → generating → generated → reviewed → published`.
- **Optional Schritt 5b: Bulk-Plan-Generator `app/admin/social/reels/plan/page.tsx`** (analog `/admin/social/plan`) — Eingabe: N Reels über M Wochen, Wochentag-Pills, Uhrzeit, Plattformen, Background-Job mit Progress-Bar.
- **Neue API-Routen unter `/api/admin/reels/plan/`:**
  - `GET/POST /api/admin/reels/plan` — Liste / Anlegen
  - `GET/PATCH/DELETE /api/admin/reels/plan/[id]`
  - `POST /api/admin/reels/plan/[id]/generate` — sofort generieren (extrahierte Logik aus dem bestehenden `POST /api/admin/reels` als reusable Helper in `lib/reels/`)
  - Optional `POST /api/admin/reels/plan/bulk` für Bulk-Generator
- **Neuer Cron `/api/cron/reels-generate`** (stündlich `0 * * * *`) analog `social-generate`: scannt fällige Plan-Einträge mit `scheduled_date <= today + reels_settings.schedule_days_before`, ruft Generate-Helper auf, setzt Status `generating → generated`. Im Voll-Modus direkt `scheduled` setzen, im Semi-Modus auf `pending_review` lassen. Nach Cron-Eintrag: `0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-generate`.
- **Settings-Block in `/admin/social/reels/einstellungen`** für „Automatische Generierung" (Toggle, Modus Semi/Voll, Vorlaufzeit, Wochentage, Zeitfenster) — analog `social_settings.auto_generate_*`. Speicherung in `admin_settings.reels_settings.auto_generate_config`.

**Test/Live-Hinweis:** Im Test-Modus springt der Cron früh raus (kein OpenAI/Pexels-Spend), analog `social-generate`.

**Reihenfolge der Implementierung war:** 1 → 2 → 3 → 4 → 5. Jeder Schritt für sich committable. Schritt 5 ist deutlich größer als die anderen — kann auf 5a (UI + APIs für Plan-CRUD) und 5b (Bulk + Cron) gesplittet werden.

**Vor jedem Push:** `npx tsc --noEmit` + `npx next lint` (siehe Regel oben). `npx next build` läuft in der Sandbox NICHT (kein Google-Fonts-Zugang).

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
- ~~`supabase-waitlist.sql`~~ + ~~`supabase-waitlist-use-case.sql`~~ (Benachrichtige-mich-Liste + Use-Case)
- ~~`supabase-coupon-atomic-increment.sql`~~ (Gutschein-Race-Fix)
- ~~`supabase-invoice-numbers-gobd.sql`~~ (GoBD-Counter angelegt, Code-Umstellung folgt separat zum Jahreswechsel mit Steuerberater-Rücksprache)
- ~~`supabase-storage-rls.sql`~~ (Bucket-RLS contracts/id-documents/damage-photos)
- ~~`supabase-performance-indizes.sql`~~ (8 Indizes: bookings.user_id, bookings.created_at, bookings(product_id,rental_from,rental_to), email_log.booking_id, blog_posts(status,created_at), social_posts(status,scheduled_at), waitlist_subscriptions.product_id, rental_agreements.booking_id)
- ~~`supabase-customer-ugc.sql`~~ + Storage-Bucket `customer-ugc` angelegt (Kundenmaterial-Modul live)
- ~~`supabase-admin-users.sql`~~ (Mitarbeiterkonten + 9 Permissions live — Permission-Enforcement aus Sweep 2 greift jetzt)
- ~~`supabase-assets.sql`~~ + Storage-Bucket `purchase-invoices` (Anlagenverzeichnis + KI-Rechnungs-OCR live)
- ~~`supabase-reels.sql`~~ + Storage-Bucket `social-reels` (Auto-Reels-Modul live)
- ~~`supabase-verification-deferred.sql`~~ (Express-Signup-Flag)
- ~~`supabase-env-toggle.sql`~~ (`is_test`-Flag auf 7 Tabellen — Test/Live-Wechsel sauber)
- ~~`supabase-awaiting-payment-deadline.sql`~~ (`stripe_payment_link_id` + Deadline-Regeln)
- ~~`supabase-check-email-rpc.sql`~~ (Anti-Enumeration RPC, ersetzt `listUsers` in 2 Auth-Routen)
- ~~`supabase-newsletter.sql`~~ + ~~`supabase-customer-push.sql`~~ + ~~`supabase-push-per-user.sql`~~ (Newsletter-Double-Opt-In, Endkunden-Push, Permission-gefilterte Admin-Pushes — am 2026-04-28 ausgeführt)
- ~~Restbestand `supabase/`-Ordner~~ (Buchhaltung-Vollausbau, Reels-Erweiterungen, Packing-Workflow, Legal-Seeds, Buchhaltung-Teil2, Anlagen-Flag-Live, Reels-Music/Pixabay/Motion-Style/Quality-Metrics/Segments, Newsletter, Customer-Push usw. — alle 60 erwarteten Tabellen nachweislich vorhanden, Stand 2026-04-28)

### Startseiten-Module (Stand 2026-04-26)
Fünf neue Frontend-Module, die die Startseite lebendig halten — alle nutzen vorhandene Daten/Infrastruktur, kein Pflegeaufwand notwendig.

- **`components/home/HomeUgc.tsx`** — Galerie freigegebener Kundenmaterial-Bilder (Bucket `customer-ugc`, signed URLs 24h). Quelle: `customer_ugc_submissions` mit Status `approved`/`featured` und `consent_use_website` oder `consent_use_social`. Versteckt sich bei < 3 Bildern. API: `GET /api/home-ugc` (cached 10 min).
- **`components/home/HomeSeasonalAction.tsx`** — Aktions-Karte zwischen Hero und Produkten (Gradient-Banner mit Badge, Titel, Untertitel, Coupon-Code, Gültig-bis-Datum, CTA-Button). Versteckt sich automatisch wenn deaktiviert oder abgelaufen. Admin-UI: `components/admin/SeasonalActionAdmin.tsx` in der Shop-Updater-Inhalte-Seite. Speicherung: `admin_settings.seasonal_action`. API: `GET /api/seasonal-action` (cached 60s).
- **`components/home/HomeFresh.tsx`** — Zwei-Spalten-Block "Frisch im Shop" (erste 3 Produkte mit `hasUnits=true`) + "Demnächst verfügbar" (Produkte mit `hasUnits=false` → Wartelisten-Kandidaten). Versteckt sich, wenn beide leer.
- **`components/home/NewsletterSignup.tsx`** — Newsletter-Anmeldung mit Double-Opt-In (DSGVO-konform). DB: `newsletter_subscribers` (Migration `supabase-newsletter.sql`). Flow: POST → Bestätigungsmail → GET-Confirm-Link → confirmed=true. Bestätigungsseite: `/newsletter/bestaetigt?status=ok|already|expired|invalid|error`. Rate-Limit: 5/h pro IP. E-Mail-Typ: `newsletter_confirm`.
- **`components/home/CustomerPushPrompt.tsx`** — Dezenter Prompt unten rechts (8s Delay), aktiviert Web-Push für Endkunden. DB: `customer_push_subscriptions` (Migration `supabase-customer-push.sql`). Lib: `lib/customer-push.ts` → `sendPushToCustomers(payload, { topic? })`. Nutzt dieselben VAPID-Keys wie Admin-Push. Public-Vapid-Endpoint: `GET /api/customer-push/vapid-key`.

### Newsletter-Verwaltung (Stand 2026-04-26)
Admin-Seite `/admin/newsletter` (in Sidebar-Gruppe „Rabatte & Aktionen", Permission `preise`). Drei Tabs:

- **Tab „Abonnenten"** — Liste mit Statistik-Kacheln (Total / Aktiv / Ausstehend / Abgemeldet), Filter (Alle / Bestätigt / Ausstehend / Abgemeldet), E-Mail-Suche, Pagination. Pro Eintrag: manuell Ab-/Reaktivieren oder endgültig Löschen.
- **Tab „Versand"** — Composer mit Betreff + HTML-Inhalt + iframe-Vorschau. Test-Versand an einzelne Adresse + Live-Versand an alle bestätigten + nicht-abgemeldeten Empfänger. Kampagnen werden in 25er-Chunks verschickt (gegen Resend-Burst-Limit), 500 ms Pause zwischen Chunks. Header + Pflicht-Footer (Abmelde-Link + Datenschutz) werden automatisch ergänzt.
- **Tab „Kunden-Push"** — Custom-Push an alle Endkunden-Geräte (Titel, Body, Klick-URL). Geht über `lib/customer-push.ts` → `sendPushToCustomers()`. Audit-Log `customer_push.send`.

**APIs:**
- `GET /api/admin/newsletter/subscribers?confirmed=&q=&page=&limit=` — Liste + Stats
- `PATCH/DELETE /api/admin/newsletter/subscribers/[id]` — Einzeleintrag bearbeiten/löschen
- `POST /api/admin/newsletter/send` — Body `{ subject, bodyHtml, mode: 'test'|'live', testEmail? }`
- `POST /api/admin/customer-push/send` — Body `{ title, body?, url?, topic? }`
- `GET /api/newsletter/unsubscribe?token=...` — One-Click-Abmeldung (kein Login)

**Lib:** `lib/newsletter.ts` → `sendNewsletterToAllConfirmed()` + `sendNewsletterTest()` + `buildNewsletterEmailHtml()`. Wrappt User-HTML in cam2rent-Layout, jeder Empfänger bekommt seinen eigenen Unsubscribe-Token-Link.

**E-Mail-Typen:** `newsletter_confirm`, `newsletter_campaign`, `newsletter_test` — alle in `app/admin/emails/page.tsx` TYPE_LABELS gelistet.

**Audit-Log-Aktionen:** `newsletter.send_campaign`, `newsletter.update_subscriber`, `newsletter.delete_subscriber`, `customer_push.send`.

### Noch offen
- **Buchhaltungs-Refactor Migration auszuführen:** `supabase/supabase-buchhaltung-foundation.sql` (idempotent). Fügt nullable Spalten `account_code` + `internal_beleg_no` zu invoices/expenses/credit_notes/purchases/purchase_items/assets hinzu, initialisiert `period_locks` + `kontenrahmen_mapping` Settings. Heute keine Wirkung — bereit fuer Belegjournal/Regelbesteuerung-Wechsel.
- **Zubehör-Exemplar-Tracking Phase 3A + 3B (Migrationen auszuführen, beide idempotent):**
  1. `supabase/supabase-assets-accessory-unit-id.sql` (3A) — Spalte `assets.accessory_unit_id` mit FK auf `accessory_units(id)` + Index. Ohne Migration schlägt der „+ erfassen"-Button im AccessoryUnitsManager mit 500 fehl.
  2. `supabase/supabase-damage-reports-accessory-unit.sql` (3B) — Spalte `damage_reports.accessory_unit_id` mit FK auf `accessory_units(id)` + Index. Ohne Migration schlägt der Submit im Zubehör-Schaden-Modal mit 500 fehl.
- Nach der Push-Migration: alle Mitarbeiter müssen einmal Push neu aktivieren unter `/admin/einstellungen` → "Push aktivieren", damit ihre Subscription mit dem Mitarbeiter-Account verknüpft wird (sonst kriegen sie weiterhin alle Notifications wie ein Owner).
- **Cron-Eintrag AfA monatlich in Hetzner-Crontab:**
  `0 3 1 * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/depreciation`
- **Cron-Härtung optional:** `CRON_DISABLE_URL_SECRET=true` in Coolify-Env setzen + Hetzner-Crontab auf Header-Auth umstellen (`-H "x-cron-secret: $CRON_SECRET"`), damit Secrets nicht mehr in Access-Logs landen.
- **Sicherheit:** API-Keys rotieren (wurden in einer Session öffentlich geteilt). Nachdem der erste echte Owner unter `/admin/einstellungen/mitarbeiter` angelegt ist, zusätzlich `ADMIN_PASSWORD`-ENV in Coolify auf einen zufaelligen Wert drehen — der Master-Login soll nur noch Notfall-Backup sein.
- **Deadline-Regeln** in `admin_settings.awaiting_payment_cancel_rules`: `{ versand: { days_before_rental: 3, cutoff_hour_berlin: 18 }, abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 } }`. Bedeutung: Deadline = `(rental_from − days_before_rental Tage)` um `cutoff_hour:00 Berlin-Zeit`. Versand-Default = **3 Tage vor Mietbeginn um 18:00 Berlin** (entspricht 2 vollen Versand-Tagen zwischen Deadline und Mietbeginn). Abholung-Default = **1 Tag vorher um 18:00 Berlin**. Sommer-/Winterzeit-Umstellung wird korrekt behandelt über `getBerlinOffsetString()`.
- **Crontab (Auto-Storno unbezahlter Buchungen):** Zwei Varianten, je nachdem ob der Cron-Daemon `TZ=`-Prefix unterstützt:
  - **Variante A (präziser, empfohlen):** Läuft täglich 18:01 Berlin, genau 1 Min nach der Deadline:
    ```
    TZ=Europe/Berlin
    1 18 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/awaiting-payment-cancel
    ```
  - **Variante B (DST-proof ohne TZ-Support):** Stündlich, max 1h Verzögerung:
    ```
    5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/awaiting-payment-cancel
    ```
  Storniert `awaiting_payment`-Buchungen deren Deadline (siehe Regeln oben) erreicht ist. Deaktiviert den Stripe Payment Link via `stripe.paymentLinks.update(id, {active:false})`, setzt Status `cancelled`, schickt Storno-Mail. Grace-Period: 1h nach Buchungs-Erstellung.
- **Auto-Reels Restschritte:** (1) Pexels API-Key (kostenlos) registrieren + in `admin_settings.reels_settings.pexels_api_key` hinterlegen oder als `PEXELS_API_KEY`-Env. (2) Docker-Image neu bauen (Dockerfile installiert jetzt `ffmpeg + ttf-dejavu + fontconfig` und kopiert `assets/fonts/InterTight.ttf` ins Image). (3) Crontab-Eintrag: `*/5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-publish`. (4) **Phase 1 Quick-Wins:** SQL-Migration `supabase/supabase-reels-pixabay-key.sql` ausführen + optional `PIXABAY_API_KEY` als zweite Stock-Footage-Quelle in `admin_settings.reels_settings.pixabay_api_key` oder als Env hinterlegen (Free-Tier 5000 req/h, kostenlos: pixabay.com/api/docs/). (5) **Phase 2 Stilistische Aufwertung:** SQL-Migrationen `supabase/supabase-reels-motion-style.sql` + `supabase/supabase-reels-quality-metrics.sql` ausführen (beide idempotent, additiv). (6) **Phase 3 Pro-Szene-Re-Render:** SQL-Migration `supabase/supabase-reel-segments.sql` ausführen + Crontab-Eintrag `0 4 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-segment-cleanup` (täglich 04:00, löscht Segmente nach 30 Tagen).
- ~~**Go-Live 01.05.2026:** Test/Live-Switch auf Live umschalten~~ ✓ (live seit 2026-05-01)
- ~~**Go-Live 01.05.2026:** Domain test.cam2rent.de → cam2rent.de~~ ✓ (live seit 2026-05-01)
- **Go-Live 01.05.2026:** Resend Domain verifizieren (DKIM + SPF) — pruefen ob durch
- ~~**Go-Live 01.05.2026:** `STRIPE_SECRET_KEY_LIVE` etc. in Coolify hinterlegen~~ ✓ (sonst wuerde Live-Modus nicht laufen)
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
