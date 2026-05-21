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

## Buchhaltungs-/Inventar-Konsolidierung (Stand 2026-05-05)

Vollstaendiger Refactor von Einkauf + Buchhaltung + Anlagen + Inventar in eine
einheitliche, beleg-zentrierte Architektur.

**Mentales Modell — 3 Welten:**
1. **Belege-Welt** (`belege` + `beleg_positionen` + `beleg_anhaenge` + `lieferanten`): Jede Ausgabe entsteht ueber einen Beleg. Klassifizierung pro Position (afa/gwg/ausgabe/ignoriert), dann Festschreibung mit lueckenloser Belegnummer (`naechste_beleg_nummer()`).
2. **Inventar-Welt** (`inventar_units` + `produkte` + `inventar_verknuepfung`): Alle physischen Stuecke in einer Tabelle. `tracking_mode='individual'` (mit Inventar-Code/Seriennummer) oder `'bulk'` (mit Bestand). WBW lebt hier — getrennt vom steuerlichen Buchwert.
3. **Anlagen-Welt** (`assets` + `afa_buchungen`): Reine Steuersicht. Auto-erzeugt aus afa/gwg-Belegpositionen bei Festschreibung. AfA-Cron schreibt monatlich fort.

**Neue Tabellen:** lieferanten, produkte, belege, beleg_positionen, beleg_anhaenge, inventar_units, inventar_verknuepfung, assets (umbenannt aus assets_neu nach Drop), afa_buchungen, migration_audit, beleg_nummer_counter.

**Wichtige Routen:**
- `/admin/buchhaltung/belege` — Liste, `/neu` Wizard (Quelle → Daten → Klassif.), `/[id]` Detail
- `/admin/buchhaltung/anlagen` — Steuersicht (KEIN WBW), `/[id]` Detail mit AfA-Historie
- `/admin/buchhaltung/ausgaben-neu` — vereinheitlichte Liste aus `beleg_positionen`
- `/admin/buchhaltung/wbw-config` — Floor-% + Nutzungsdauer-Settings + Live-Vorschau
- `/admin/inventar` — alle physischen Stuecke, `/neu` Manuell-Anlegen, `/[id]` Detail mit WBW-Override + Pfad-B-Verknuepfung

**Key-Libs:**
- `lib/buchhaltung/beleg-utils.ts` — nextBelegNr, recomputeSummen, sanitize
- `lib/buchhaltung/asset-auto-generator.ts` — Festschreibung erzeugt Assets+afa_buchungen
- `lib/buchhaltung/afa-cron.ts` — monatliche AfA-Logik mit Idempotenz
- `lib/inventar/wiederbeschaffungswert.ts` — `computeWBW()` mit Entscheidungsbaum (Override → null bei kein Preis → lineare Formel mit Floor)
- `lib/ai/klassifiziere-positionen.ts` — Claude Sonnet 4.6 fuer Auto-Klassifizierung
- `lib/ai/invoice-extract.ts` — Claude Vision fuer OCR (existierte schon)

**Wiederbeschaffungswert (WBW) — Entscheidungsbaum:**
1. `wbw_manuell_gesetzt=true` → return `wiederbeschaffungswert` (Override hat Vorrang)
2. `kaufpreis_netto IS NULL` → return `null` (UI zeigt "Nicht gesetzt")
3. Sonst: lineare Wertminderung von `kaufpreis_netto` auf `floor_percent% × kaufpreis_netto` ueber `useful_life_months`, danach konstant.

**Cron-Job:**
```
0 6 1 * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/afa-buchung
```

**⚠️ STRATEGIE-WECHSEL (Stand 2026-05-17) — Big-Bang-Drop AUFGEGEBEN:**
Der urspruengliche „migrieren → alte Tabellen droppen"-Plan wurde durch ein
**dauerhaftes Hybrid-/Spiegel-Modell** ersetzt und ist NICHT mehr gueltig.
Die alten Tabellen (`accessories`, `product_units`, `accessory_units`,
`expenses`, `assets`, …) bleiben **absichtlich lasttragend** — die Buchungs-RPCs
lesen sie weiterhin.

- **`lib/legacy-bridge.ts`** — Lazy-Backfill: der laufende App-Code legt pro
  Legacy-ID bei Bedarf `produkte` + `migration_audit`-Zeile an. `migration_audit`
  wird also fortlaufend im Normalbetrieb befuellt (≠ Beweis abgeschlossener
  Migration).
- **`lib/inventar-mirror.ts`** + `POST /api/admin/inventar/backfill-mirrors`
  (Button „Mirror-Backfill" auf `/admin/inventar`) — synct die alten Tabellen
  aus der neuen Welt, damit Buchungs-RPCs Daten finden. Das ist der
  **unterstuetzte Reparaturweg**, NICHT der Drop.
  - **Bestands-Sync (Stand 2026-05-20):** `mirrorAccessoryToLegacy` (Insert)
    und `deleteMirror` (Delete) rufen jetzt `syncAccessoryQty` nach der
    Mutation — vorher blieb `accessories.available_qty` nach dem Loeschen
    einer Inventar-Einheit stale (Gantt zeigte „1 Stueck" obwohl 0 aktiv).
    Sammel-Zubehoer (`is_bulk=true`) wird in `syncAccessoryQty` selbst
    uebersprungen.
  - **Bestands-Drift-Check (Stand 2026-05-20):** Neuer Endpoint
    `GET /api/admin/accessories/resync-qty` liefert eine **Dry-Run-Preview**
    aller Nicht-Bulk-Zubehoere, deren `available_qty` von der gezaehlten
    `accessory_units`-Menge abweicht (inkl. `has_inventar`-Flag: ist eine
    `migration_audit`-Bruecke `accessories → produkte` vorhanden?).
    `POST {ids:[...]}` wendet `syncAccessoryQty` gezielt auf die ausgewaehlten
    Eintraege an. UI: Button **„Bestände prüfen"** auf `/admin/inventar` oeffnet
    Modal mit Drift-Tabelle (aktuell/tatsaechlich/diff/inventar-flag).
    Default-Auswahl haakt nur Eintraege mit Inventar-Verknuepfung an —
    historisch manuell auf 1 gesetztes Zubehoer ohne Exemplar-Tracking wird
    NICHT stillschweigend auf 0 gesetzt. Backfill-Mirror-Endpoint macht
    bewusst **keinen** globalen Resync mehr (war zu aggressiv, haette
    Legacy-Zubehoer ohne Exemplare auf 0 gesetzt).
- **`supabase/recovery-after-drop.sql`** — Notfall: legt alte Tabellen wieder an,
  falls doch mal gedroppt wurde.

**GELÖSCHT (verwaister, aufgegebener Ansatz — Stand 2026-05-17):**
`scripts/migrate-buchhaltung.ts`, `scripts/verify-migration.ts`,
`supabase/buchhaltung-konsolidierung-drop.sql`,
`supabase/buchhaltung-konsolidierung-final-cleanup.sql` wurden aus dem Repo
entfernt (toter Code, nirgends referenziert, der Drop hätte lasttragende
Tabellen gelöscht → Buchungs-Engine bricht; ist schon einmal passiert, daher
existiert `recovery-after-drop.sql`). Git-History bewahrt sie, falls je
gebraucht. `recovery-after-drop.sql` bleibt als Notfall-Skript bestehen.

`supabase/buchhaltung-konsolidierung.sql` (reines Schema, idempotent, legt nur
neue Tabellen an) ist weiterhin ok/notwendig — nur die Daten-Migration + Drop
sind tot.

Aktiver Zwischenzustand: APIs/Libs nutzen `pickAssetsTable()` mit Fallback
assets_neu→assets. Mietvertrag liest WBW zuerst aus `inventar_units` (via
migration_audit-Lookup auf `product_units`) und faellt auf alte `assets`-Tabelle
zurueck. Die `pickAssetsTable`-Aufraeumung ist reine Code-Hygiene INNERHALB des
Hybrids (siehe „Welle 2+3"), kein Drop.

### Inventar-Löschen + Sammel-Zubehör-Autoinventar (Stand 2026-05-17)
Zwei Lücken im Inventar/Zubehör-Flow geschlossen:

- **Löschen-Aktion in der Inventar-Liste + Detailseite.** Der
  `DELETE /api/admin/inventar/[id]`-Endpoint existierte (lehnt `status='vermietet'`
  mit 409 ab, räumt via `deleteMirror()` die Legacy-Spiegel mit weg), hatte aber
  **keinen UI-Einstieg**. Jetzt: `/admin/inventar` hat eine „Aktion"-Spalte mit
  Löschen-Button pro Zeile (`stopPropagation` gegen den Row-Klick, disabled +
  Tooltip bei `vermietet`, 409-Handling). `/admin/inventar/[id]` hat eine
  „Gefahrenzone"-Section mit „Endgültig löschen" (Confirm, 409 → Inline-Fehler,
  Erfolg → Redirect auf `/admin/inventar`). Schutz unverändert serverseitig —
  vermietete Stücke bleiben unlöschbar.
- **Neues Sammel-Zubehör legt automatisch eine Bulk-Inventar-Einheit an.**
  Vorher schrieb `POST /api/admin/accessories` nur die `accessories`-Row; ein
  `is_bulk=true`-Zubehör tauchte nie unter `/admin/inventar` auf und hatte keinen
  Inventar-Code/Bestand. Jetzt: bei `is_bulk` ist im „Neues Zubehör"-Formular der
  **Inventar-Code Pflicht** (gleicher 4-Segment-Builder wie `/admin/inventar/neu`)
  + „Anfangsbestand". Der Server ruft nach dem Accessory-Insert
  `resolveProdukteId(supabase,'accessories',id,{autoCreate:true})` und legt eine
  `inventar_units`-Row an (`typ='zubehoer'`, `tracking_mode='bulk'`,
  `inventar_code`, `bestand=available_qty`, `status='verfuegbar'`,
  `beleg_status='beleg_fehlt'`). Defensiv: schlägt die Inventar-Anlage fehl
  (Migration fehlt / Code doppelt → 23505), bleibt das Zubehör erhalten und der
  User bekommt eine `warnings`-Meldung (bestehender Alert-Pfad in `handleCreate`).
- **Neuer Shared-Component `components/admin/InventarCodeBuilder.tsx`** —
  selbstverwaltender 4-Segment-Code-Builder (lädt code-segmente /
  seg3-suggestions / next-code-number selbst, meldet fertigen Code per
  `onChange`). `variant='dark'|'light'` für Theme. `/admin/inventar/neu` wurde
  auf diese Komponente umgestellt (lokaler `CodeBuilder` + seg-State + 3 Effekte
  dedupliziert, Verhalten 1:1), das Sammel-Zubehör-Formular nutzt sie mit
  `variant='light'`.

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
- **UI:** `NotificationDropdown` in Admin-Sidebar-Footer + Mobile-Header, pollt mit Visibility-Pause + adaptivem Backoff (30 s → max 5 min bei Fehlern)
- **State-Sync (Stand 2026-05-20):** Beide Glocken (Mobile-Header + Sidebar-Footer) lesen aus einem gemeinsamen `NotificationsProvider` (`contexts/NotificationsContext.tsx`), der den State (`notifications`, `unreadCount`) und das Polling **einmal zentral** haelt. Mutationen (`markAsRead(id)` / `markAllRead()`) gehen ueber den Provider mit Optimistic Update — beide Counter sind sofort identisch, kein 30-s-Polling-Delay mehr. Frueher hatte jede `<NotificationDropdown>`-Instanz ihren eigenen `useState(unreadCount)` + eigenes Polling, dadurch waren die Counter auseinandergelaufen. Wrapper sitzt in `AdminLayoutClient` um den Layout-Tree (nicht auf Login/Blog/QR-/Scan-Standalone-Seiten, die haben kein Admin-Shell).
- **11 Events angeschlossen:**
  - `new_booking`: confirm-booking, confirm-cart, manual-booking, confirm-extension
  - `booking_cancelled`: cancel-booking, cron/auto-cancel
  - `new_damage`: damage-report
  - `new_message`: messages
  - `new_review`: reviews
  - `new_waitlist`: api/waitlist
  - `new_customer`: api/auth/express-signup (Stand 2026-05-13) — feuert nach Konto-Anlage. Permission-gefiltert auf `kunden`. Message enthaelt E-Mail (+Telefon falls angegeben), Link auf `/admin/kunden/[userId]`. Express-Signup ist seit dem Audit der einzige Pfad zur Konto-Anlage — `/registrierung` nutzt denselben Flow.
- **Typen mit Icons:** new_booking (cyan), booking_cancelled (rot), new_damage (amber), new_message (lila), new_customer (grün), overdue_return (rot), new_review (amber), payment_failed (rot), new_waitlist (cyan), blog_ready (grün), social_ready (lila), reel_ready (pink)

### Content-Review-Pushes (Stand 2026-04-27)
Drei zusaetzliche Notification-Typen feuern, sobald frisch generierter KI-Content auf Admin-Review wartet — Permission-gefiltert auf `content`. Idee: keine eigene UI noetig, lebt parasitaer auf der bestehenden Push-Pipeline (`createAdminNotification` → `sendPushToAdmins`).
- **`blog_ready`** (gruen, Doc-Icon) — aus `app/api/cron/blog-generate/route.ts` direkt nach Insert. Feuert wenn `postStatus !== 'published'` (also Semi-Modus `draft` ODER Zeitplan-Eintrag `scheduled`); im Voll-Modus (`postStatus='published'`) keine Push, weil bereits live. Link auf `/admin/blog/artikel/[id]`. Titel je nach Status (`Neuer Blog-Artikel zum Reviewen` vs. `Geplanter Blog-Artikel generiert`).
- **`social_ready`** (lila, Share-Icon) — aus drei Stellen, die einen `social_posts.status='draft'` erzeugen koennen: `app/api/cron/social-generate/route.ts`, `lib/meta/generate-plan-entry.ts` (manuelles Sofort-Generate aus Redaktionsplan) und `lib/meta/auto-post.ts` (Trigger nach Blog-Publish/neuem Produkt/Set/Gutschein). Nur im Draft-Modus, im `scheduled`-Modus (Voll-Auto-Post) keine Push. `auto-post.ts` hatte vorher einen TODO-Kommentar mit Misuse von `type: 'new_booking'` — gleichzeitig korrigiert. Link auf `/admin/social/posts/[id]`.
- **`reel_ready`** (pink, Film-Icon) — aus `lib/reels/orchestrator.ts` direkt nach dem critical-update wenn `newStatus === 'pending_review'`. Im `'rendered'`-Modus (preview_required=false) keine Push, weil dann Auto-Publish greift. Link auf `/admin/social/reels/[id]`.
- **Permission-Mapping** in `lib/admin-notifications.ts` → `TYPE_TO_PERMISSION`: alle drei auf `'content'` gemappt. Mitarbeiter mit Content-Permission kriegen die Push, Owner sowieso. Mitarbeiter ohne Content-Bereich (z.B. nur `tagesgeschaeft`) werden nicht gestoert.

### Eingehende Kunden-E-Mails — IMAP-Polling (Stand 2026-05-21)
Echte E-Mails von Kunden landen jetzt in `/admin/nachrichten` — gethreaded an
Buchung/Kunde, mit Push, und der Admin antwortet direkt aus dem Tool als echte
E-Mail. Dockt an das bestehende `conversations`/`messages`-Modell an (eine
gemeinsame Inbox für Konto-Nachrichten + echte E-Mails).

**Warum IMAP statt Webhook:** Resend Inbound hätte eine zweite Domain
(`inbound.cam2rent.de`) gebraucht → Resend Pro (20 $/Mon). Stattdessen holt ein
Cron alle 3 Min neue Mails per IMAP direkt aus dem Google-Workspace-Postfach
`kontakt@cam2rent.de` — kostenlos, keine MX-Änderung, Postfach bleibt unberührt.
- **Migration `supabase/supabase-inbound-email.sql`** (idempotent): `conversations.customer_id`
  wird **nullable** (Sender ohne Kundenkonto erlaubt) + neue Spalten `customer_email`,
  `customer_name`, `source TEXT DEFAULT 'account' CHECK (account|email)`,
  `email_message_id`. `messages` bekommt `body_html`, `email_message_id`,
  `email_in_reply_to` + Partial-Unique-Index auf `email_message_id` (Dedupe).
  Neue Tabelle `message_attachments` (RLS service-role-only). Bestehende RLS
  unverändert — `auth.uid() = customer_id` matcht NULL nie, E-Mail-Konversationen
  ohne Konto sind admin-only.
- **Cron `GET/POST /api/cron/inbound-email-poll`** (`verifyCronAuth` +
  `acquireCronLock`): verbindet per `imapflow` mit `imap.gmail.com`, holt neue
  Mails seit der zuletzt verarbeiteten UID (Zustand in
  `admin_settings.inbound_email_imap_state` — verändert NICHT den Gmail-Lesestatus),
  parst mit `mailparser`. Erster Lauf „stellt scharf" (Bestand wird nicht
  rückwirkend importiert). Automatisierte Mails (Newsletter/Bounce/Auto-Reply per
  Header `List-*`/`Auto-Submitted`/`Precedence`) + Mails von `@cam2rent.de`
  (eigene System-/Report-Mails) werden übersprungen. Max 50 Mails/Lauf.
- **`lib/inbound-email.ts`** kapselt Transport-Format + DB-Logik:
  `parseImapMessage()`, `isAutomatedEmail()`, `processInboundEmail()`. Threading
  in `processInboundEmail`: `In-Reply-To` → Buchungsnummer im Betreff
  (`C2R-YYWW-NNN`-Regex) → offene Konversation gleicher `customer_email` → neue
  Konversation `source='email'`. Absender wird gegen `auth.users` aufgelöst —
  Treffer setzt `customer_id` (Thread erscheint dann auch im `/konto`). Anhänge:
  Magic-Byte-Check (`lib/file-type-check.ts`), Bucket `email-attachments`, nicht
  erkannte Typen als `application/octet-stream`. Feuert `new_message`-Notification
  (Permission `kunden`).
- **Admin-Antwort:** `POST /api/admin/nachrichten/[conversationId]` sendet bei
  `source='email'` eine **echte E-Mail** via `sendInboundReply()` (`lib/email.ts`)
  — `In-Reply-To`/`References` aus der letzten Kundenmail; `Reply-To` ist der
  `sendAndLog`-Default `ADMIN_EMAIL` (= `kontakt@cam2rent.de`), damit
  Kundenantworten dort landen und der IMAP-Cron sie wieder erfasst. Bei
  `source='account'` unverändert `sendNewMessageNotificationToCustomer`.
  `sendAndLog()` akzeptiert jetzt optional `replyTo` + `headers` und gibt die
  Resend-Message-ID zurück.
- **Admin-UI** (`/admin/nachrichten`): Kanal-Badge (📧 E-Mail / 💬 Konto),
  HTML-Mailinhalt per Button in sandboxed `<iframe sandbox="">` (kein JS),
  Anhänge als Download-Links über `GET /api/admin/message-attachment-url?id=`
  (Permission `kunden`, Signed-URL 5 Min).
- **E-Mail-Typen:** `inbound_received` + `inbound_reply` in `email_log` +
  `/admin/emails`-Katalog. Audit: `inbound_email.received`, `nachricht.email_reply`.
- **Pro-Mitarbeiter-Zuordnung** (Migration `supabase/supabase-inbound-email-per-employee.sql`):
  Jeder Mitarbeiter kann unter `/admin/einstellungen/mitarbeiter` eine eigene
  Postfach-Adresse (`admin_users.inbox_address`, typisch ein **Alias** des
  Support-Postfachs) bekommen. `processInboundEmail` matcht das An-/Cc-/
  Delivered-To-Feld der Mail gegen `inbox_address` (`findAdminUserByInboxAddress`)
  und setzt `conversations.assigned_admin_user_id` + `conversations.inbox_address`.
  In `/admin/nachrichten` sieht ein **Mitarbeiter nur seine eigenen +
  unzugeordnete** Konversationen, der **Owner alle** (Filter im GET +
  Ownership-Check im Detail-/Attachment-Endpoint). Admin-Antwort geht bei
  zugeordneter Konversation **von der Mitarbeiter-Adresse** raus (`sendAndLog`
  bekam optionales `from`; nur akzeptiert wenn auf `@cam2rent.de`). `inbox_address`
  ist bewusst NICHT Teil des Login-kritischen `SELECT_COLS` in `lib/admin-users.ts`
  — die Helper `getInboxAddressMap`/`setInboxAddress`/`findAdminUserByInboxAddress`
  sind defensiv (fehlende Migration → no-op). Conversation-Insert im Cron retryt
  ohne die beiden Felder, falls nur diese Migration aussteht.
- **Go-Live TODO:** siehe „Noch offen".

### Buchungsflow
5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)
- **Sets gefiltert** nach `product_ids` (Kamera-Kompatibilität) — nur passende Sets werden angezeigt
- **Set-Verfügbarkeit:** Nur Lagerbestand prüfen, NICHT Zubehör-Kompatibilität (Sets sind bereits per product_ids gefiltert)
- **Set-Preis:** `getSetPrice()` prüft `pricing_mode ?? pricingMode` (API gibt camelCase `pricingMode` zurück)
- Buchungsbestätigung antwortet sofort — PDF + E-Mail laufen im Hintergrund
- Kalender verhindert Buchung über ausgebuchte Tage hinweg (maxEndDate-Logik)
- **3DS-Failed-Redirect mit erfolgter Zahlung (Stand 2026-05-19):** Bei einigen Kreditkarten (insbesondere mit 3D-Secure) liefert Stripe gelegentlich `redirect_status=failed` zurück, obwohl Webhook + Charge bereits erfolgreich durchgelaufen sind. Vorher zeigte `/buchung-bestaetigt` dann hart die „Zahlung nicht abgeschlossen"-Seite, obwohl die Buchung in der DB existierte und die Karte belastet wurde. Fix in zwei Teilen: (a) `confirm-cart` + `confirm-booking` machen den **Idempotency-Lookup auf `bookings.payment_intent_id` jetzt VOR dem `intent.status !== 'succeeded'`-Check** — wenn der Webhook die Buchung schon angelegt hat (was bedeutet: Stripe hat seinerseits succeeded verifiziert), wird idempotent mit `booking_id(s)` geantwortet, unabhängig vom aktuell gelesenen Intent-Status. User-ID-Match-Check (Sweep 6 Vuln 4) bleibt erhalten. (b) `app/buchung-bestaetigt/page.tsx` ruft auch bei `redirect_status='failed'` den Server an statt sofort `PaymentFailed` zu rendern — einmaliger Retry nach 1.5 s als Webhook-Race-Schutz, neutraler `CheckingStatus`-Ladescreen („Zahlung wird geprüft…") während des Wartens, `PaymentFailed` erst wenn der Server auch nach Retry keine Buchung kennt. `!paymentIntentId` führt weiterhin sofort zu `PaymentFailed`. SuccessCard-Pfad für `succeeded`/`pending` unverändert.
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

### Buchungsdetail-Seite vereinfacht + neu geordnet (Stand 2026-05-19)
`/admin/buchungen/[id]` war mit ~15 gestapelten Blöcken überladen (mobil
endloser Scroll, „Notizen" eine unlesbare Wand aus Stripe-Link +
`Zubehör-Anpassung (…)`-Strings). Reine Layout-/Anzeige-Umordnung —
**keine Funktion, kein Handler, kein API-Call, kein Notiz-Schreibpfad
geändert** (CLAUDE.md-Doku-Pflicht erfüllt). Eine Datei:
`app/admin/buchungen/[id]/page.tsx`.
- **Neue Kompaktkarte „Auf einen Blick"** ganz oben (über dem 2/3+1/3-Grid,
  volle Breite, mobil zuerst): Status, Produkt+Seriennr., Zeitraum,
  Kunde+E-Mail, Gesamt, Kaution+`DepositBadge`. Read-only, nutzt nur
  vorhandene Werte/State.
- **Notizen als `NotesPanel`** (neue lokale Sub-Komponente, reine Anzeige):
  `notes.split(' | ')` → Zahlungslink wird Button „Zahlungslink öffnen"
  (`target=_blank rel=noopener`), `Stornierungsgrund:`/`Storniert…` → amber
  Stornogrund-Box, Rest → Änderungsverlauf-Liste mit „weitere anzeigen"
  (>4 Einträge). Defensiver Fallback: einzeiliger Text ohne ` | `/URL →
  Rohtext wie bisher. Schreibt nichts zurück.
- **`Collapsible`** (neue lokale Sub-Komponente, CSS-hide statt unmount →
  Formular-State bleibt beim Zuklappen erhalten): bündelt die schweren
  Panels (LiabilitySection, BookingEditSection, WbwFinalizePanel,
  InvoiceVersionsPanel) in einen **zugeklappten** Block „Bearbeiten &
  Werkzeuge" nach dem Mietvertrag. Jede bestehende Render-Bedingung 1:1
  mitgenommen. (`BookingAccessoryEditSection` wurde am 2026-05-19 entfernt
  — siehe Konsolidierungs-Notiz im Abschnitt „Zubehör einer bestehenden
  Buchung echt bearbeiten".)
- **Rechte Spalte** (Kundendaten/Aktionen/Dokumente) ist auf Desktop
  `lg:sticky lg:top-6` (Grid bekam `items-start`/`self-start`).
- Modals/Toast unverändert außerhalb von Grid/Collapsible. `tsc`+`next lint`
  für die Datei: 0 Fehler.

### Buchungsdetails (`/admin/buchungen/[id]`)
- **Kunden-E-Mail editierbar:** Stift-Icon neben E-Mail in Kundendaten → Inline-Bearbeitung (Enter=Speichern, Escape=Abbrechen), wird auch angezeigt wenn noch keine E-Mail hinterlegt ist
- **Trackingnummer + Carrier editierbar (Stand 2026-05-19):** Stift-Icon neben „Trackingnummer" in der Section „Versand & Tracking" → Inline-Bearbeitung mit **Carrier-Dropdown (DHL/DPD)** + Nummern-Input (Enter=Speichern, Escape=Abbrechen). `tracking_url` wird beim Speichern **automatisch** je nach Carrier neu erzeugt (DHL `piececode=`, DPD `parcelId=` — gemeinsamer Helper `lib/tracking-url.ts:buildTrackingUrl`, auch von `ship-booking` genutzt). Leere Nummer → URL+Carrier `null`. **Kunde bekommt eine neue Versand-E-Mail** mit korrigiertem Link, sobald `tracking_number` oder `tracking_carrier` geändert wurde und Mail + Versand-Modus passen (non-blocking, `sendShippingConfirmation`). Carrier wird zusaetzlich als kleines Badge neben der Nummer angezeigt.
- **Rückgabe-Trackingnummer + Carrier (Stand 2026-05-19):** Analog zum Hin-Versand, aber als interne Anzeige. Sichtbar in „Versand & Tracking" sobald `return_label_url` gesetzt ist (also nach Erzeugung des Rücksende-Etiketts). Dropdown (DHL/DPD) + Nummer → `return_tracking_url` wird automatisch gebaut. **Keine Kunden-Mail** (Retoure-Tracking ist intern; das Etikett-PDF hat der Kunde bereits). Migration: `supabase/supabase-bookings-tracking-carrier-return.sql` (idempotent, 4 neue Spalten `tracking_carrier`, `return_tracking_number`, `return_tracking_url`, `return_tracking_carrier`, jeweils mit CHECK auf DHL/DPD). Defensiver Fallback im PATCH-Endpoint: bei Migration-Mismatch werden die neuen Spalten gedroppt und das Update einmal ohne sie wiederholt.
- **PATCH-Endpoint:** `PATCH /api/admin/booking/[id]` akzeptiert `{ status?, customer_email?, tracking_number?, tracking_carrier?, return_tracking_number?, return_tracking_carrier? }` — alle unabhängig voneinander änderbar (Nummern getrimmt, max 100 Z., leer → null; Carrier validiert gegen `['DHL','DPD']` über `isAllowedCarrier`; Audit `booking.tracking_update` für reine Tracking-Edits).
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

### Zubehör-Bestandteile (Stand 2026-05-03)
Manche Zubehöre bestehen physisch aus mehreren Teilen (z.B. Funkmikrofon-Set: 2× Sender, 1× Empfänger, 2× Lavalier-Mikro, 1× USB-C-Kabel, Windschutz). Diese Teile werden nicht als eigene Inventar-Einträge geführt und tauchen beim Pack-Scan auch nicht als eigene Slots auf — sie hängen am Sammel-/Exemplar-QR des Hauptzubehörs. Beim Scannen erinnert das System aber sichtbar daran, dass weitere Teile mit ins Paket gehören.

- **DB-Spalte `accessories.included_parts TEXT[]`** (Migration `supabase-accessories-included-parts.sql`, idempotent, default `'{}'`). Speicherform: Klartext-Liste wie `['2x Sender', '1x Windschutz']`.
- **API:** `POST/PUT /api/admin/accessories[/[id]]` akzeptiert `included_parts` als String-Array. `sanitizeIncludedParts()` trimmt, droppt Leereinträge, cap auf 30 Zeilen × 120 Zeichen. Defensiver Fallback bei fehlender Migration (Insert-Retry ohne Spalte).
- **Admin-UI** (`/admin/zubehoer`): Komponente `IncludedPartsEditor` direkt unter Beschreibung in beiden Forms (Anlegen + Edit). Pro Zeile: Input + ↑-Reorder + ✕-Remove. Button „+ Bestandteil hinzufügen". Limits werden serverseitig erzwungen, Client zeigt 30er-Cap.
- **Booking-Detail-API** (`GET /api/admin/booking/[id]` + `GET /api/packlist/[bookingId]`): laden `included_parts` zusätzlich zur Name-Auflösung und reichen sie als optionales Feld auf jedem `resolved_items[]`-Eintrag durch — auch für Set-Sub-Items. Beide haben den Defensiv-Fallback (alte DB-Schemas ohne Migration werden unterstützt).
- **Pack-Workflow** (`/admin/versand/[id]/packen`): `<ItemList>` zeigt unter dem Item-Namen einen amber Hinweis-Block „Enthält N Teile" mit der Klartext-Liste. Greift in beiden Schritten (Packen + Kontrollieren) sowie in der continuous-Live-Liste unter dem Scanner. Set-Container werden weiterhin gefiltert (siehe oben), die Bestandteile hängen an den expandierten Sub-Items.
- **Scanner-Toast:** `applyScan()` liest `includedParts` vom getroffenen Slot und gibt sie über `ScanResult.includedParts` an den Aufrufer zurück. Sowohl `ScannerBar` als auch `ScannerLiveList` rendern einen Sub-Block „⚠ Enthält weitere Teile — bitte mitpacken: …". Toast-Lebensdauer wird bei vorhandenen Bestandteilen auf 6 s erhöht (sonst 3,5 s).
- **Packliste-PDF** (`lib/packlist-pdf.tsx`): `resolvedItems[].included_parts` wird unter dem Item-Namen als 8pt-grauer Text „Enthält: 2× Sender · 1× Windschutz" gerendert (`wrap={false}` damit Zeile zusammen bleibt).
- **Was nicht passiert:** Keine eigenen `accessory_units`, keine Verfügbarkeitsprüfung, keine eigenen Scan-Codes, keine Auswirkung auf den Lagerbestand. Bestandteile sind reine Zusatzanzeige.

#### Bild pro Bestandteil (Stand 2026-05-16)
Optionales kleines Referenzbild pro `included_parts`-Zeile, anklickbar → Lightbox (gross). `included_parts` bleibt unveraendert `TEXT[]` — alle bestehenden Konsumenten (Packliste-PDF, Pack-/Übergabe-Scanner, Booking-Detail) sind NICHT betroffen.
- **Migration `supabase/supabase-accessories-included-parts-images.sql`** (idempotent): neue Spalte `accessories.included_parts_images TEXT[] DEFAULT '{}'`. `included_parts_images[i]` = URL zu `included_parts[i]` (`''` = kein Bild).
- **Upload-Endpoint `/api/admin/accessory-part-images`** (POST/DELETE, `checkAdminAuth`): bewusst schlank — KEIN Wasserzeichen, KEIN `accessories.image_url`-Write, kein `processSetImage`. Magic-Byte-Check via `isAllowedImage`/`detectImageType`, Bucket `product-images`, Pfad `accessories/<id>/parts/<ts>-<rand>.<ext>`, max 8 MB. Path-Traversal-Whitelist auf `accessoryId`.
- **API:** `POST /api/admin/accessories` + `PUT /[id]` akzeptieren `included_parts_images`. Neuer Sanitizer `sanitizeIncludedPartsImages(input, partsCount)` (http(s)-URL oder `''`, auf parts-Laenge geklemmt → kein Index-Versatz). Eigener defensiver Retry-Block (Migration fehlt → Spalte droppen + Warnung), VOR dem `included_parts`-Block (spezifischer Regex zuerst).
- **Client `IncludedPartsEditor`** (`app/admin/zubehoer/page.tsx`): `onChange(parts, images)` haelt beide Arrays paarweise synchron. Helper `buildIncludedPartsPayload()` verwirft beim Submit Zeilen ohne Text **paarweise** (Bild wandert mit raus). Pro Zeile: 36px-Thumbnail (Klick → fixed Lightbox-Overlay) oder 📷-Upload-Button. Upload-Button nur im **Edit-Modus** (accessoryId vorhanden); im Neu-Form Platzhalter „Bild" + Hinweis „nach dem Speichern" (analog Hauptbild-Verhalten).
- **Was nicht passiert:** Bilder erscheinen NICHT im Pack-Workflow / in der Packliste-PDF / im Scanner-Toast (reine Admin-Editor-Anzeige). Kann bei Bedarf separat ergaenzt werden.

#### Zubehör-Umbenennung propagiert in die neue Welt (Stand 2026-05-16)
`PUT /api/admin/accessories/[id]` schrieb bei Namensänderung nur `accessories.name` — Inventar-Detail-Titel (`inventar_units.bezeichnung`) + Produkt-Dropdown (`produkte.name`, via `/api/admin/produkte`) blieben auf dem alten Namen hängen (Zwei-Welten-Drift). Jetzt: nach erfolgreichem Save (best-effort, non-blocking) wird via `lookupProdukteId(supabase,'accessories',id)` der verknüpfte `produkte`-Datensatz aufgelöst; **Referenz ist der aktuelle `produkte.name`** (nicht der vorige accessories-Name) → heilt auch **bereits gedrifteten Bestand** beim nächsten Speichern, nicht nur künftige Umbenennungen. `inventar_units.bezeichnung` wird nur dort umgeschrieben, wo sie noch dem alten `produkte.name` entspricht (manuell vergebene Unit-Bezeichnungen bleiben unberührt), Reihenfolge: erst Units (`eq('bezeichnung', oldName)`), dann `produkte.name`. Defensiv: keine `produkte`-Welt → `lookupProdukteId` liefert null → Skip, Save unberührt.

### Zubehör-Admin Layout (Stand 2026-05-07)
`/admin/zubehoer` ist jetzt eine Tabellen-Ansicht statt 2-Spalten-Karten-Grid. Zwei Tabs oben: „Buchbar für Kunden (N)" + „Intern (M)" mit grünem/amber Punkt. Aktiver Tab bestimmt den Tabellen-Inhalt. Pro Tab werden die Items nach Kategorie gruppiert (Group-Header-Zeile mit Kategorie + Anzahl). Spalten: Name | Kategorie | Preis | Kompatibilität | Aktionen. Kategorie- und Kompatibilitäts-Spalten sind responsive ausgeblendet (`md:`/`lg:table-cell`); auf Mobile rutschen Kategorie-Pill + Kompat-Tags unter den Namen. Container von `max-w-6xl` auf `max-w-7xl` aufgeweitet. **Update 2026-05-16:** Die redundante **Kategorie-Spalte wurde entfernt** (Kategorie steht bereits im Gruppen-Header) — an ihrer Stelle steht jetzt **„Kompatible Kameras"** (vorher eigene `lg:`-Spalte „Kompatibilität", jetzt `md:table-cell` an Kategorie-Position). Spalten neu: Bild | Name | Preis | Kompatible Kameras | Aktionen. Mobile-Block unter dem Namen zeigt nur noch Kompat-Tags (Kategorie-Pill raus). Alle `colSpan` von 6 → **5**. Edit-Modus expandiert eine zweite `<tr>` direkt unter der Item-Zeile (`<td colSpan={5}>`) mit dem **kompletten bisherigen Edit-Panel-Inhalt 1:1** — alle Felder, `IncludedPartsEditor`, `SpecFields`, `AccessoryUnitsManager`, Sammel-QR-Sektion, Bild-Upload, Buttons unverändert. Intern-Tab markiert die Name-Spalte mit einem dezenten amber Border-Left. Kategorie-Filter-Pills wirken zusätzlich. Reine Layout-Änderung, alle Handler/State/API-Calls/Form-Felder identisch.

### Sets-Admin Layout (Stand 2026-05-07)
`/admin/sets` analog zum Zubehör jetzt Tabelle statt Karten-Grid. Container `max-w-7xl`. Spalten: Set (Bild + Name + Brand-Pills + Custom-Badge) | Status (Verfügbar-Badge mit Auto-Berechnung) | Preis | Aktionen (Kopieren/Bearbeiten/Löschen). Gruppierung nach Kamera-Marken bleibt — wird zu Group-Header-Zeile in der Tabelle (`colSpan=4`). Edit-Panel expandiert als `<tr>` mit `<td colSpan=4>` darunter, alter Inhalt 1:1 (Grunddaten, Set-Bild-Upload, Preis, `AccessoryItemList` mit Drag-and-Drop, Passende-Kameras-Toggles, Speichern-Buttons). Status-Spalte ausgeblendet auf `<md` und stattdessen unter dem Namen gerendert. Reine Layout-Änderung — `handleSave`/`handleDelete`/`handleDuplicate`/`openEdit` und alle State-Maps identisch.

### Kameras-Admin Layout (Stand 2026-05-07)
`/admin/preise/kameras` analog zum Zubehör jetzt Tabelle. Container von `max-w-3xl` auf `max-w-7xl` aufgeweitet. Neue Gruppierung nach Marke (alphabetisch sortiert) — Group-Header-Zeile mit Marke + Anzahl. Spalten: Name (BrandBadge + Name als Link auf Edit-Seite) | Auslastung (30T mit Progress-Bar) | Tag 1 / Tag 30 Preise | Aktionen (Bearbeiten/Löschen). Auslastung ausgeblendet auf `<lg`, Preise auf `<md` — auf Mobile beides als kompakte Zeile unter dem Namen. Kein Inline-Edit (Edit war schon immer auf eigener Seite `[id]`). `BrandColorManager` bleibt darüber. Funktional unverändert — nur Layout + Marken-Gruppierung neu.

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
  - Farbcodiert: Grün=frei, Blau=gebucht, **Lila=Zahlung offen (`awaiting_payment`)**, Gold=Hinversand, Orange=Rückversand, Rot=Wartung, Grau=ausgemustert
  - Hover-Tooltip: Buchungs-ID, Kundenname, Zeitraum, Lieferart
  - Klick auf gebuchte Zelle → öffnet `/admin/buchungen/[id]` in neuem Tab
- **Zubehör-Tab:** Pro Zubehörteil ein Kalender mit einer Zeile (aggregiert, nicht pro Stück)
  - Zeigt Belegung als "X/Y" (z.B. "3/10" belegt von gesamt)
  - Grün=alle frei, Gold=teilweise belegt, Blau=ausgebucht
  - Set-Buchungen werden auf Einzelzubehör aufgelöst (über `sets.accessory_items`)
- **Sets-Tab:** Pro Set ein Kalender mit einer Zeile
  - Grün=frei, Blau=gebucht (mit Anzahl)
- **`awaiting_payment` im Gantt (Stand 2026-05-20):** Buchungen mit Status „Warte auf Zahlung" (Stripe-Payment-Link offen, noch nicht bezahlt) tauchten vorher NICHT im Live-Kalender auf — der Slot sah fälschlich „frei" aus, obwohl der `awaiting-payment-cancel`-Cron erst nach Deadline storniert und parallele Doppelbuchung möglich war. `app/api/admin/availability-gantt/route.ts` nimmt `'awaiting_payment'` jetzt in den Status-Filter mit auf; UI rendert diese Buchungen **lila** (`#7c3aed`, passt zum Status-Badge in `/admin/buchungen`) statt blau, inkl. lila Puffer-Varianten für Hin-/Rückversand (`#6d28d9` / `#5b21b6`). Tooltip zeigt „⏳ Zahlung ausstehend"-Hinweis, Cell-Content prefixt mit ⏳. Im Zubehör-/Set-Tab zählen Pending-Buchungen wie bisher zur Belegung (sie blockieren den Bestand korrekt); Tooltip listet sie zusätzlich mit ⏳-Prefix + Zeile „N davon Zahlung ausstehend". Sobald `stripe-webhook` den Status auf `confirmed` flippt, wird die Buchung beim nächsten Gantt-Reload normal blau angezeigt — keine Migration nötig.
- **API (alt):** `GET /api/admin/availability-gantt?month=YYYY-MM` → rückwärtskompatibel, liefert products[], accessories[], sets[]
- **Availability-API** (`/api/availability/[productId]`): Nutzt weiterhin `product.stock` für Shop-seitige Verfügbarkeitsprüfung

### Auftragskalender (`/admin/auftragskalender`, Stand 2026-05-21)
Planungs-/Auftragskalender — zeigt **alle Aufträge** mit Mietzeitraum + Versand/Abholung, damit der Admin sieht „wann muss ich was machen". Ergänzt den bestehenden Verfügbarkeits-Gantt (`/admin/verfuegbarkeit`, fokussiert auf frei-vs-belegt) — der Auftragskalender ist auftrags- statt unit-zentriert. Neuer Sidebar-Eintrag unter „Tagesgeschäft" direkt nach „Kalender".
- **API:** `GET /api/admin/auftragskalender?from=YYYY-MM-DD&to=YYYY-MM-DD` (Permission `tagesgeschaeft`). Lädt Buchungen im Zeitraum (Status `awaiting_payment|confirmed|shipped|picked_up|returned|completed`, `cancelled` raus), berechnet pro Buchung zwei Aktions-Tage anhand `admin_settings.booking_buffer_days`:
  - `ship_date` — Versand-/Übergabe-Tag: bei `delivery_mode='versand'` = `rental_from − versand_before`, bei `abholung` = `rental_from`.
  - `return_date` — Rückgabe-erwartet-Tag: `versand` = `rental_to + versand_after`, `abholung` = `rental_to + abholung_after`.
  Bereich wird um `maxBuffer` erweitert, damit Rand-Aktionen mitgeladen werden.
- **Seite:** Client-Component mit zwei umschaltbaren Ansichten (Präferenz in `localStorage.admin_auftragskalender_view`):
  - **Monat** — 6-Wochen-Raster (Montag-basiert), Buchungen als farbige Balken über `rental_from..rental_to` mit Lane-Zuweisung pro Woche, Statusfarbe (awaiting_payment lila / confirmed cyan / shipped amber / picked_up orange / returned grau / completed grün). Pro Tag Aktions-Badges (📤 N Versand / 📥 N Rückgabe). Balken-Klick → `/admin/buchungen/[id]`.
  - **To-do-Liste** (Agenda) — pro Tag des Monats mit Aktionen je eine Karte, Gruppen „📤 Raus/Übergabe" + „📥 Rückgabe erwartet", heute hervorgehoben, vergangene Tage gedimmt.
- Test-Buchungen werden mit `[TEST]`-Präfix + pink-dashed Rahmen angezeigt, per Checkbox aus-/einblendbar. Monatsnavigation (Zurück/Heute/Weiter) + Kennzahlen (Aufträge / Versand / Rückgaben im Monat).

### Rechnungs-Status spiegelt Buchungs-Status (Stand 2026-05-20)
Buchungen im Status `pending_verification` (Express-Signup ohne Ausweis) oder `awaiting_payment` (Stripe-Payment-Link noch nicht bezahlt) wurden in der Buchhaltungs-Welt faelschlich als „bezahlt" gefuehrt. Im Dashboard-Cockpit „Letzte 10 Rechnungen" sowie in `/admin/buchhaltung/rechnungen` standen sie mit gruenem **Bezahlt**-Badge, obwohl der Kunde noch keinen Cent ueberwiesen hatte. Drei aufeinander aufbauende Ursachen, alle gefixt:

- **`lib/buchhaltung/store-invoice.ts`** pruefte nur den `MANUAL-UNPAID`-Prefix. Express-Signup-Buchungen tragen aber `payment_intent_id = 'PENDING-<bookingId>'` (`app/api/create-pending-booking/route.ts`), und `awaiting_payment`-Buchungen koennen je nach Pfad mit oder ohne `pi_*`-Prefix entstehen. Beide rutschten als „paid" durch. Neue Logik: `isUnpaid = isExplicitUnpaid || isPendingPrefix || isAwaitingStatus` — der Buchungs-Status (`status`) ist jetzt das endgueltige Sicherheitsnetz. Plus: `payment_method` zeigt fuer `PENDING-` jetzt **„Zahlung ausstehend"** statt fallthrough auf „Stripe".
- **Backfill-Endpoint** (`POST /api/admin/buchhaltung/invoices/backfill`) laeuft ueber alle Buchungen mit `price_total > 0 AND status != 'cancelled'`. Da `pending_verification` + `awaiting_payment` nicht ausgeschlossen sind (bewusst — die Idee ist, dass jede Buchung eine Rechnung bekommt), zog er die fehlerhaften Status-Werte ueber `storeInvoiceForBooking` in die DB. Mit dem Lib-Fix oben heilt jeder neue Backfill automatisch — der ist idempotent ueber `invoice_number`, aber bestehende falsch-bezahlte Rows muessen separat synchronisiert werden (siehe sync-status).
- **Dashboard-Fallback** in `app/api/admin/buchhaltung/dashboard/route.ts:98` defaultete `inv.status || 'paid'` — ein NULL-Status wurde im UI als „Bezahlt" angezeigt. Geaendert auf `|| 'open'`: eine Rechnung gilt ohne expliziten Bezahlt-Status als offen.

**Heilen-Endpoint** `POST /api/admin/buchhaltung/invoices/sync-status` (`app/api/admin/buchhaltung/invoices/sync-status/route.ts`, Permission `finanzen`): laedt alle `invoices` mit `status='paid' OR payment_status='paid'`, joint die zugehoerigen `bookings.status` + `payment_intent_id`, filtert auf alle drei Symptome (awaiting-status / PENDING-prefix / MANUAL-UNPAID) und setzt sie mit Bulk-UPDATE auf `status='sent', payment_status='unpaid', paid_at=NULL`. Idempotent (mehrfaches Ausfuehren = no-op). Audit-Log `invoice.sync_status` mit `{checked, updated, ids[]}` (ids auf erste 50 begrenzt). Antwort `{checked, updated, ids}`.

**UI-Trigger** `/admin/buchhaltung?tab=rechnungen` → Button **„Status synchronisieren"** direkt neben „Rechnungen nachtragen". Confirm-Dialog erklaert das Verhalten, Toast-Feedback nach Abschluss.

**Daten-Konsequenz** beim einmaligen Lauf: bisher faelschlich bezahlte Rechnungen flippen auf „Offen" zurueck → `openAmount` im Cockpit steigt, `paidCount` sinkt entsprechend. EÜR / DATEV ziehen ihre Werte aus `bookings.price_total` (nicht aus `invoices.status`), bleiben also unveraendert.

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
  - **Stammdaten-Pflichtcheck (Stand 2026-05-13):** Verifizierung wird hart geblockt, wenn `full_name`, `address_street`, `address_zip` oder `address_city` leer sind. ~~Hintergrund: Express-Signup persistiert seit Sweep 7 keine Stammdaten (Anti-Pre-Claim-Schutz)~~ — **Stand 2026-05-14 revidiert:** Express-Signup persistiert Stammdaten wieder, weil zwei Mitigationen aktiv sind (Sicherheits-Hinweis-Mail an Email-Eigentuemer + harte Admin-ID-Verifizierung). UI zeigt amber Warn-Box mit fehlenden Feldern + deaktiviert „Verifizieren"-Button (Tooltip + cursor:not-allowed). Server-Pfad in `/api/admin/verify-customer` antwortet mit `422 { error: 'STAMMDATEN_UNVOLLSTAENDIG', missing: [...] }`. Ablehnen bleibt jederzeit möglich. Plus: `/konto/uebersicht` Profil-Save nutzt jetzt `update` statt `upsert` (column-level GRANT der profiles-RLS erlaubt INSERT nicht, sonst „Profil konnte nicht gespeichert werden").
  - **Verifizierungs-Erinnerung (Stand 2026-05-21):** Button „Verifizierungs-Erinnerung senden" in der Ausweis-Verifizierung-Karte — sichtbar solange `verification_status !== 'verified'` (auch ohne hochgeladenen Ausweis). Schickt dem Kunden eine E-Mail mit CTA-Link auf `/konto/verifizierung`. API `POST /api/admin/send-verification-reminder` (`{ customerId }`, Permission `kunden`) löst E-Mail + Name serverseitig über `auth.admin.getUserById` auf, blockt mit 409 wenn schon verifiziert, schreibt Audit `customer.verification_reminder`. E-Mail-Funktion `sendVerificationReminder()` in `lib/email.ts`, emailType `verification_reminder_manual`.
  - API: `/api/admin/verify-customer` (POST)
  - API: `/api/admin/id-document-url` (GET, Signed URLs)
- Profiles-Trigger: `handle_new_user()` erstellt automatisch Profil bei Registrierung
- Base-URL in Callback: `x-forwarded-host` Header oder `NEXT_PUBLIC_SITE_URL` Env-Variable

### Kundenkonto
`/app/konto/` mit horizontaler Tab-Leiste

### Preise
30-Tage-Preistabelle pro Produkt + Formel für 31+ Tage, alles in admin_config

### Aktion `not_combinable` — analog zu Coupons (Stand 2026-05-20)
Aktionen in `admin_settings.product_discounts` (JSON-Array) haben jetzt ein optionales `not_combinable: boolean`-Feld. Default `false` — bestehende Aktionen verhalten sich wie bisher.

**Wirkung:** Wenn eine Aktion mit `not_combinable=true` greift (egal ob Item-Level via `getDiscountMatchesForItem` oder Cart-Level via `applies_to_cart`), werden **Mietdauer-Rabatt + Stammkunden-Rabatt** für die ganze Buchung auf 0 gesetzt. Coupon-Rabatte sind unabhaengig (haben eigenen `not_combinable`-Schalter).

**Hintergrund:** Vorher stapelten alle vier Rabatt-Schichten seriell (Aktion → Mietdauer → Loyalty → Coupon). Eine „50 %-Aktion" auf einen Stammkunden ergab in Wirklichkeit ~64 % Rabatt (50 % Aktion + ~28 % Loyalty auf den Rest). Mit dem Schalter kann der Admin eine Aktion als **exklusiv** markieren — 50 % bedeutet dann genau 50 %.

- **Helper:** `hasActiveNotCombinableDiscount(cartTotalNetItems, itemDiscountAmount, cartLevelDiscountAmount, productDiscounts)` in `lib/price-config.ts`. Genutzt im Checkout (`app/checkout/page.tsx:471`) zur einheitlichen Auswertung. Kartoffel-Level: hoechste Aktion gewinnt — wenn die `not_combinable` ist, greift's. Item-Level: greift jede aktive `not_combinable`-Aktion, sobald irgendein Item-Rabatt > 0.
- **Admin-UI:** Checkbox „Nicht mit Mietdauer- und Stammkunden-Rabatt kombinierbar" in `/admin/rabatte` direkt unter „Auf Warenkorb-Gesamt anwenden" (Aktion-Editor).
- **Server:** Keine Migration, kein API-Change — das JSON-Array wird ueber `/api/admin/config?key=product_discounts` generisch gespeichert. `confirm-cart` nimmt die vom Frontend errechneten Werte; der bestehende ~70 %-Plausibilitaets-Floor (Sweep 7 #10) bleibt aktiv.

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
- **Gemeinsames Logo (Stand 2026-05-17):** `lib/pdf/common.tsx` exportiert `<PdfLogo width height />` (Marken-Kameraicon, Cyan/Navy) + `PDF_NAVY`/`PDF_CYAN`. Genutzt von weekly-report / legal / haftungsbedingungen / packlist / contract-template (vorher 5× inline-SVG-Kopie, pixel-identisch dedupliziert). **Bewusst NICHT zentralisiert:** Header-/Footer-Balken (Style-Werte weichen pro Template ab) und das schwarz/weiße Rechnungs-Logo (`lib/invoice-pdf.tsx` — eigenständige B/W-Variante laut Design-Regel).
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
  - Bei unbezahlt: Bankdaten (ohne Box) + QR-Codes nebeneinander (Banking + PayPal, Schwarz/Weiß)
  - Payment-Status-Erkennung: `UNPAID` in payment_intent_id ODER `payment_status` Spalte ODER "Überweisung ausstehend" in Notizen
  - **Positionen zu echten Katalogpreisen (Stand 2026-05-19):** Frueher verteilte das PDF den schon rabattierten `priceAccessories` proportional auf die Zeilen → sinnlose Einzelpreise (Stativ 7,90 € erschien als 2,23 €, Floating Stick 9,90 €×2 als 4,45 €). Jetzt: neuer Shared-Helper `lib/invoice-lines.ts` → `computeInvoiceLines(supabase, booking)` baut die Zeilen aus echten Katalogpreisen. Kamera = `price_rental / Anzahl Kameras` (gleiche Modellnamen zu 1 Zeile gruppiert, Menge=Stück). Zubehoer = `verifyAccessoryPrice()` (`lib/booking/verify-accessory-price.ts`, gleiche Logik wie Checkout: flat→`price`, sonst `price*Tage`) → pro Position `unit_price`/`qty`/`line_total`. Tabelle hat neue Spalte **Einzelpreis** (`colUnit`): `Pos | Beschreibung | Menge | Einzelpreis | Gesamt`. Versand + Haftungsschutz sind KEINE Positionszeilen mehr.
  - **Summen-Block (Reihenfolge):** Zwischensumme (Σ Positionen, Katalog, vor Rabatt) → Rabatt (mit Coupon-Code-Label) → Haftungsschutz → Versand → Gesamtbetrag. **Gesamtbetrag = `booking.price_total` (unveraendert, == bezahlter Betrag).** Der Rabatt ergibt sich als Differenz `zwischensumme + haftung + versand − price_total` → bei normalem Gutschein exakt der Coupon-Rabatt, bei Set-Bundle/manueller Preis-Anpassung schluckt die Zeile die Differenz, sodass die Rechnung IMMER aufgeht. Falls Katalog < bezahlt (manueller Aufpreis): Zeile „Anpassung: +X“ statt negativem Rabatt.
  - **3 Aufrufer** nutzen den Helper: `/api/invoice/[bookingId]`, `/api/admin/booking/[id]/send-email`, `lib/email.ts` (Buchungsbestaetigung, laedt Booking defensiv per `bookingId`). `InvoiceData` hat zwei neue optionale Felder `cameraLines`/`accessoryLines`; ohne sie greift im PDF der alte Fallback-Pfad (keine Regression fuer Altaufrufer).
  - **Rechnungs-Versionierung + „Rechnungsanpassung“ (Stand 2026-05-19):** Jede Fassung der Kundenrechnung wird intern **unveränderlich archiviert** (Snapshot + PDF). Migration `supabase/supabase-invoice-versions.sql` legt Tabelle `invoice_versions` an (id, booking_id, invoice_number, version_number, is_current, lines JSONB inkl. `fingerprint`, gross/net/tax, reason, trigger_source, pdf_path, sent_to_customer_at/email; RLS no-UPDATE/DELETE außer service-role, partial-unique `(booking_id) WHERE is_current`). Neuer Builder `lib/build-invoice-data.ts` → `buildInvoiceData(supabase, booking)` ist jetzt die **einzige Quelle** für `InvoiceData` (Steuer+Adresse+Zeilen+EPC-QR) — `/api/invoice/[bookingId]` wurde darauf umgestellt (reine Extraktion, byte-gleich). `lib/invoice-versions.ts` → `snapshotInvoiceVersion(supabase, bookingId, {reason, triggerSource, previousBooking, request})` ist **non-blocking** (fängt alle Fehler selbst ab — eine Buchungsänderung darf nie an der Versionierung scheitern), eingehängt am Ende der erfolgreichen Zweige `accessory_edit` + `booking_edit` (`app/api/admin/booking/[id]/route.ts`) und in `app/api/confirm-extension/route.ts`. **Lazy-Baseline:** existiert noch keine Version, wird v1 aus `previousBooking` (= Zustand VOR der Änderung) erzeugt, dann v2 aus dem frischen Stand — so ist die „Vorher“-Fassung auch für Altbuchungen erhalten. **Dedupe** über `fingerprint` (Zeilen+Summen+Zeitraum): keine neue Version bei nicht-rechnungsrelevanten Edits. PDF (`lib/invoice-pdf.tsx`) bekam optionale Felder `adjustmentVersion`/`adjustmentReason`/`replacesDate`: ab v≥2 Titel **„Rechnungsanpassung“** + „Anpassung Nr. X · ersetzt die Fassung vom …“, **gleiche Rechnungsnummer** (GoBD-Nummern bleiben laut Projektregel unangetastet). Versand **bewusst manuell**: `GET/POST /api/admin/booking/[id]/invoice-versions` (GET = Liste + frische Signed-URLs, POST = aktuelle/gewählte Fassung als `sendInvoiceAdjustment`-Mail, emailType `invoice_adjustment`, setzt sent_to_*; defensiver 503 bei fehlender Migration). Admin-UI: Section **„Rechnungsversionen“** (`InvoiceVersionsPanel` in `/admin/buchungen/[id]`, erscheint erst ab ≥2 Fassungen) mit PDF-Download je Fassung + Senden/Erneut-Senden-Button. Buchhaltungs-`invoices`/`credit_notes` + Stripe-Zahlung/Refund **nicht** angefasst (steuerliche Korrektur weiter über Gutschrift-Workflow). Audit: `booking.invoice_version`, `booking.invoice_send`.
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

### Übergabeprotokoll-Wizard mit Scanner (Stand 2026-05-16)
Die digitale Übergabe-Seite `/admin/buchungen/[id]/uebergabe` (4-Schritt-Wizard: Zustand → Vermieter → Mieter → Fertig) nutzt in Schritt 1 jetzt denselben Scanner-Workflow wie das Versand-Packen. Statt der reinen Checkbox-Liste: `<ScannerBar>` + `<ItemList>` (gruppiert, Mengen-Counter) + `<SerialScanner continuous>` + `<ScannerLiveList>` aus `components/admin/scan-workflow.tsx`. Kamera-Seriennummer / Zubehör-Exemplar-Code wird gescannt → Slot automatisch abgehakt, Toast-Feedback (grün/amber/rot), Auto-Close wenn alle scanbaren Stücke erfasst sind, Substitution erlaubt (analog Pack-Schritt 1). `bookingToScanInput()` setzt `skipReturnLabel: true` (Abholung → kein Rücksendeetikett). Manuelles Abhaken per Klick auf die Item-Zeile bleibt parallel möglich.

**Scanned-Units-Persistierung (Stand 2026-05-16):** Die Übergabe sendet jetzt — wie der Versand-Pack-Flow — die tatsächlich gescannten Unit-IDs (`scannedUnits: {cameraUnitId, accessoryUnitIds}`) im `data`-JSON ans Backend. `POST /api/admin/handover/[bookingId]` ruft `applyScannedUnits()` aus `lib/scan-substitutions.ts` auf, bevor `handover_data` geschrieben wird (reihenfolge-egal, idempotent, best-effort). Damit wird bei Abholung `bookings.unit_id` / `bookings.accessory_unit_ids` auf das tatsächlich übergebene physische Exemplar umgeschrieben (inkl. Substitution) — relevant für die exemplar-genaue Schadensabwicklung. `handover_data` selbst speichert weiterhin nur `items: [{name, ok}]`; die Unit-IDs landen ausschließlich über `applyScannedUnits` in den Buchungs-Spalten.

**Scan-Match-Fixes (Stand 2026-05-16):** Zwei Bugs, die dazu führten, dass der Pack-/Übergabe-Scanner Codes als „unbekannt" abwies, obwohl sie im System sind:
1. **cam2rent-QR ist eine URL:** Die Inventar-Etiketten (`/admin/preise/kameras/[id]/qr-codes` + `/admin/zubehoer/[id]/qr-codes`) kodieren `https://cam2rent.de/admin/scan/<code>`, kein nacktes Kürzel. `normalizeCode()` in `components/admin/scan-workflow.tsx` UND in `app/api/admin/scan-lookup/route.ts` zieht jetzt per Regex `/\/admin\/scan\/([^/?#]+)/` den `<code>`-Teil raus (URL-decoded), bevor normalisiert wird.
2. **Lookup ignorierte `label`:** Der QR wird bevorzugt aus `product_units.label` erzeugt (Fallback `serial_number`), und `/admin/scan/[code]` löst auch zuerst über `label` auf. `scan-lookup` matchte aber nur `serial_number`. Jetzt: `.or(serial_number.ilike.<code>,label.ilike.<code>)`, `serial_number`-Rückgabe fällt auf `label` zurück. Gilt für Pack- UND Übergabe-Scanner (gemeinsame Lib).

### Paketgewicht im Pack-Workflow → Versandetikett (Stand 2026-05-18)
Packer/Kontrolleur erfassen beim Packen das ungefähre Paketgewicht; es befüllt das Sendcloud-Etikett vor (vorher immer 0,5-kg-Default). Das Gewicht wird **automatisch aus den hinterlegten Einzelgewichten vorgeschlagen** (Kamera-Produkt-Spec `weight` als Freitext „154g/0,2 kg" + `accessories.specs.weight_g` in Gramm × Menge + 300 g Verpackungs-Zuschlag).
- **Migration `supabase/supabase-bookings-pack-weight.sql`** (idempotent): `bookings.pack_weight_kg NUMERIC NULL`. Defensiver Code-Fallback: fehlt die Spalte, läuft der Pack-Flow weiter (Gewicht wird nur nicht persistiert; Pack-Route + Check-Route retryen ohne das Feld).
- **`lib/pack-weight.ts`** (pure): `parseWeightToGrams()` (Zahl=Gramm, String „154g"/„0,2 kg"), `computePackWeightKg()` (Summe + 300 g Buffer, kg auf 2 Dezimalstellen, min 0,1; **null** wenn KEIN Einzelgewicht hinterlegt → UI zeigt manuellen Default).
- **`GET /api/admin/booking/[id]`** liefert neu `pack_weight_estimate_kg` (Kamera-Gewichte via `getProducts()` Spec `weight`, Zubehör via `accessories.specs.weight_g` der Leaf-Positionen; Set-Container übersprungen, da Sub-Items expandiert). Defensiv: fehlende Specs → Anteil 0, komplett unbekannt → null. `pack_weight_kg` kommt über `select('*')` mit (sofern Migration durch).
- **Pack-UI** (`/admin/versand/[id]/packen`): Schritt 1 (Packer) hat Eingabefeld „Ungefähres Paketgewicht" vorbefüllt mit `pack_weight_kg ?? pack_weight_estimate_kg`, mit Vorschlags-Hinweis; Schritt 2 (Kontrolleur) hat dasselbe Feld editierbar (Korrektur). Beide senden `packWeightKg` (pack: JSON-Body, check: FormData). Kein Pflichtfeld — bewusst, weil der Vorschlag i. d. R. greift.
- **Etikett-Vorbefüllung**: `openLabelModal` auf `/admin/versand` lädt `/api/admin/booking/[id]` und prefillt `labelForm.weightKg` mit `pack_weight_kg ?? pack_weight_estimate_kg ?? 0.5` — im Etikett-Dialog weiter änderbar.

**Kamera-Scan zählt nicht hoch wenn legacy product_id fehlt (Stand 2026-05-18):** Bei Buchungen ohne zugewiesene Kamera-Unit (im WBW-Panel „Keine Seriennummer") lebt die physische Kamera oft in der neuen `inventar_units`-Welt. `scan-lookup` löste den Code zwar auf, berechnete `matchesBooking` für Kameras aber **nur** über `cameraUnit.product_id === booking.product_id`. Ist die legacy product_id nicht via `migration_audit` (`alte_tabelle='admin_config.products'` → `produkte`) mappbar, ist sie `''` → `matchesBooking=false` → der Scan wurde mit „Kamera wird nicht benötigt" abgewiesen, Counter zählte nie hoch. Fix: zusätzlicher **Namens-Match** — `scan-lookup` lädt `bookings.product_name` (kommagetrennt bei Multi-Kamera) + bei inventar-Auflösung `produkte.name` (Fallback für leeren `productName`), `matchesBooking = idMatch || nameMatch` (normalisiert: lowercase/trim/collapse-spaces). Strikt additiv — kann `matchesBooking` nur in mehr korrekten Fällen true machen, nie weniger; reiner ID-Pfad unverändert.

**Multi-Kamera-Scan zählt jetzt korrekt hoch (Stand 2026-05-18):** Gleiches Symptom wie beim Sammel-Zubehör, aber für Kameras: bei einer 2-Kamera-Buchung (`product_name` kommagetrennt, `bookings.cameras`-Migration noch nicht durch → nur die 1. Kamera hat `unit_id`/Seriennr aufgelöst) blieb die Position bei `1/2`. Ursache: der Kamera-Substitutions-Zweig in `applyScan` (`components/admin/scan-workflow.tsx`) war hart auf Slot `'camera'` verdrahtet (`if (checked['camera']) → schon abgehakt; return key:'camera'`) — der 2. Scan landete nie auf Slot `'camera::1'`. Fix: der Zweig sucht jetzt den **nächsten freien Kamera-Slot** aus `items` (`type==='camera' && !checked`), analog zur Zubehör-Substitution; alle Slots voll → „Alle Kameras schon abgehakt". Der lokale camHit-Pfad (Match per Seriennr pro Slot, greift wenn `cameras_resolved` Seriennr für alle Kameras liefert) bleibt unverändert. unitId-Dedup schützt weiter gegen doppeltes Scannen derselben physischen Kamera.

**Kamera-Scan wurde IMMER als „ersetzt" gewertet, nie als Clean-Match (Stand 2026-05-18):** Symptom (Foto): grüner Banner „✓ Kamera ersetzt: 82JXN38OOBRXRA", Position hängt bei `1/2`. Ursache: der lokale `camHit` in `applyScan` (`components/admin/scan-workflow.tsx`) vergleicht den gescannten QR-Code gegen `cameraSlots[].serial` — das ist die via `resolveSerialForUnit` (booking/[id]) aufgelöste `seriennummer`/`serial_number`. Der QR auf dem Etikett trägt aber eine **andere Code-Repräsentation** (neue Inventar-Welt: `inventar_code` „CAM-…-01"; Legacy evtl. `label`), bzw. bei nicht zugewiesener `unit_id` ist `cameraSlots[].serial` schlicht `null`. Der String-Vergleich scheitert deshalb praktisch immer → es landet im Substitutions-Zweig „Kamera ersetzt …", `isSubstitute=true`, obwohl die exakt zugewiesene Kamera gescannt wurde. Fix: im camera-Server-Lookup-Zweig VOR der Substitution prüfen, ob die (cross-world robust via `scan-lookup` → migration_audit auf legacy `product_units.id` gemappte) `info.unitId` mit der `unitId` eines Buchungs-Slots (`lookup.cameraSlots`) übereinstimmt → dann **sauberer Treffer** auf genau diesen Slot („✓ Kamera (…)", kein `isSubstitute`, `scannedUnitId` gesetzt → `applyScannedUnits` ist No-op da == reserviert). Zusätzlich: hatte die Buchung gar keine Einheit zugewiesen (`cameraSlots[].unitId` alle null — Legacy/Inventar ohne `unit_id`), ist der Scan eine **Erst-Erfassung** („✓ Kamera erfasst: …") statt einer irreführenden „Ersetzung" — `isSubstitute` bleibt true (füllt den leeren Slot korrekt), nur die Meldung ist ehrlich. Strikt additiv: macht aus einem fälschlichen „ersetzt" nur dann einen Clean-Match, wenn die gescannte Einheit nachweislich die zugewiesene ist; echte Substitution (anderes physisches Stück gleichen Modells) bleibt unverändert „ersetzt". Greift auch im Übergabe-/Retouren-Scan (gemeinsame Lib). Voller Multi-Unit-Clean-Match für ALLE Kameras kommt erst mit der `bookings.cameras`-Migration (dann tragen alle Slots ihre `unit_id`).

**`finalize-wbw` lieferte fälschlich „Buchung nicht gefunden" (Stand 2026-05-18):** `POST /api/admin/booking/[id]/finalize-wbw` selektierte `serial_number` aus `bookings` — die Spalte existiert dort NICHT (Seriennr wird immer aus `product_units` aufgelöst; im GET-Handler ist `booking.serial_number` eine berechnete Property, keine DB-Spalte). PostgREST warf einen Spalten-Fehler → `.maybeSingle()` lieferte `data=null` → die WBW-Finalisierung brach mit 404 „Buchung nicht gefunden" ab (roter Fehler im Panel), obwohl die Buchung existiert. Fix: `serial_number` aus dem Select entfernt (wurde im Route-Body nie verwendet — der Serial je Position kommt aus dem Request-Body `items[].serial`).

**Sammel-Zubehör-Scan zählt jetzt die volle Menge (Stand 2026-05-18):** Sammel-Zubehör (`accessories.is_bulk=true` — Akku, Speicherkarte, Sticks etc.) hat NUR EINEN gemeinsamen QR-Code für alle physischen Stücke (siehe `/admin/zubehoer/[id]/qr-codes`: bei `is_bulk` genau 1 QR auf den Behälter). Beim Packen blieb die Position deshalb bei `1/2` hängen: der 2. Scan desselben Codes löste in `applyScan` (`components/admin/scan-workflow.tsx`) die unitId-Dedup aus (`scannedUnitIds.has(info.unitId)` → „schon abgehakt"), weil derselbe Code immer dieselbe unit_id liefert. Sichtbar als „… ersetzt"-Badge + Counter steht nicht hoch — galt für alle Positionen mit Menge > 1. Fix: `scan-lookup` liefert jetzt `isBulk` (aus `accessories.is_bulk`). In `applyScan` wird (a) die unitId-Dedup für Bulk übersprungen und (b) ein Bulk-Scan hakt **alle noch offenen Slots dieser Position** auf einmal ab (`ScanResult.keys[]`) — semantisch korrekt, weil es keinen Code pro Einzelstück gibt. Greift in Pack-Schritt 1, Kontroll-Schritt (Step 2) UND Retouren (vor dem `allowSubstitution`-Gate, da der Sammel-QR der vorgesehene Code ist, keine Substitution → kein „ersetzt"-Badge mehr). Meldung: „✓ Extra Akku — 2 Stück erfasst (Sammel-QR)". Alle 4 Consumer-Aufrufstellen (`versand/[id]/packen` ×2, `buchungen/[id]/uebergabe`, `retouren/[id]/pruefen`) setzen `result.keys` mit Vorrang vor `result.key`. Einzelstück-Zubehör (per-Exemplar-QR) bleibt 1:1 unverändert (Substitution + Dedup wie bisher).

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
- **Komponente:** `app/admin/buchhaltung/components/MonthCloseWizard.tsx`. Modal mit 4 Schritten: Stripe-Abgleich → Lieferanten-Klassifizierung → EÜR-Vorschau → Abschluss. **Stand 2026-05-21:** Der Wizard startet immer bei Schritt 1 (kein Auto-Sprung mehr zum ersten unfertigen Schritt — jeder Schritt soll bewusst durchlaufen werden) und hat pro Schritt eine `<StepNav>`-Leiste mit „← Zurück"/„Weiter →" (`setActiveStep`, ohne das Modal zu verlassen). Erledigte Schritte zeigen eine explizite grüne `<NothingToDo>`-Box („nichts zu tun"); offene Schritte zeigen weiterhin den CTA-Button zum passenden Tab. Die EÜR-Detailansicht (Schritt 3) öffnet jetzt in einem neuen Tab (`window.open`) statt das Modal zu schließen — der Wizard bleibt offen. Die 4 Stufen-Pillen oben bleiben zusätzlich frei anklickbar.
- **API:** `GET/POST/DELETE /api/admin/buchhaltung/period-close?period=YYYY-MM`. POST setzt Soft-Lock in `admin_settings.period_locks[period]` mit `{locked_at, locked_by}`. DELETE braucht `?reason=...` (min 10 Zeichen) und schreibt `unlocked_at, unlocked_by, unlock_reason` (Audit-Trail bleibt erhalten).
- **Soft-Lock heute, Hard-Lock spaeter:** Aktuell warnt das System nur, blockiert nicht. Beim Wechsel auf Regelbesteuerung wird die API zur harten Sperre.
- Audit-Log: `period.close`, `period.unlock`.
- **EÜR-Vorschau-Fix (Stand 2026-05-21):** Schritt 3 des Wizards zeigte `0,00 € / 0 Belege` Ausgaben, obwohl der EÜR-Bericht für denselben Monat z.B. 858,16 € auswies. Drei Ursachen im `GET /api/admin/buchhaltung/period-close`: (a) der Expenses-Query selektierte `.select('amount')` — die Spalte heißt `gross_amount`; PostgREST lieferte einen Fehler, `data` war `null`, Summe + Count fielen auf 0. (b) Die neue Buchhaltungs-Welt (`beleg_positionen` festgeschriebener Belege) wurde gar nicht gezählt — der EÜR-Bericht summiert beide Quellen. (c) Einnahmen kamen aus `invoices` statt wie im EÜR-Bericht aus `bookings`. Der Wizard-Schritt spiegelt jetzt 1:1 die EÜR-Berechnung (`reports/euer`): Einnahmen = realisierter Netto-Umsatz pro Buchung (Rabatt-/Erstattungs-Wasserfall), Ausgaben = `expenses.gross_amount` + `beleg_positionen.gesamt_brutto` (festgeschrieben, nicht-Test, im Zeitraum, klassifiziert `ausgabe|verbrauch|gwg`). Die „EÜR-Vorschau" stimmt damit wieder mit „Detaillierte EÜR" überein.
- **`period_locks`-String-Fix (Stand 2026-05-21):** `admin_settings.value` enthielt `period_locks` als JSON-**String** statt als Objekt. Der Code castete nur (`as Record<…>`) — beim Abschließen eines zweiten Monats warf `locks[period] = …` einen `Cannot create property on string`-TypeError (POST-Endpoint 500 mit leerem Body → Wizard zeigte „leere Antwort"). Beim Lesen lieferte der String stillschweigend „nicht gesperrt" (`locks[key]` auf einem String ist `undefined`) → Wizard zeigte abgeschlossene Monate als offen, Cockpit nörgelte weiter „Monatsabschluss steht aus". Neuer Helper `parseLocks()` (in `period-close`, GET/POST/DELETE) + inline-Pendant im `cockpit`-Endpoint normalisieren `value` defensiv (String → `JSON.parse`, sonst Objekt). Zusätzlich: der POST-Handler ist komplett in `try/catch` gekapselt (echte Fehlermeldung als JSON statt leerem 500), der Lese-Fehler beim Laden von `period_locks` wird ausgewertet (sonst hätte ein stiller Lesefehler beim Upsert alle anderen Monats-Locks überschrieben), und `MonthCloseWizard` parst Server-Antworten über `parseJsonSafe()` (verständliche Meldung bei leerem Body).

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

### Stripe-Abgleich: Auto-Match per Email + Doppelzahlungs-Erkennung (Stand 2026-05-20)
Der Sync (`app/api/admin/buchhaltung/stripe-reconciliation/sync/route.ts`) hat vorher nur ueber **exakten String-Vergleich** `bookings.payment_intent_id === pi.id` gematcht. Damit blieben zwei Klassen von Zahlungen dauerhaft als „Nicht zugeordnet" haengen:
- Buchungen, deren `payment_intent_id` noch auf einen `PENDING-`/`AWAITING-`/`MANUAL-UNPAID-`-Praefix steht, weil der Stripe-Webhook nie durchlief oder die Buchung manuell angelegt wurde (Stripe-Payment-Link spaeter bezahlt, Webhook verloren, Race-Condition).
- Doppelzahlungen: derselbe Kunde zahlt zweimal ueber denselben Payment-Link → zwei PIs, aber `bookings.payment_intent_id` speichert nur den ersten. Die zweite PI blieb unmatched ohne klaren Hinweis worum es geht.

Neu: zweistufiger Auto-Match + Doppelzahlungs-Schutz **direkt im Sync**, kein zweiter Endpoint notwendig.
- **Stufe 1 — PI-Lookup** (unveraendert): exakter Match `bookings.payment_intent_id = pi.id`.
- **Stufe 2 — Email + Betrag** (nur wenn Stufe 1 leer): laedt `pi.receipt_email` aus Stripe, sucht `bookings` mit `customer_email ilike receipt_email AND price_total BETWEEN amount-0.50 AND amount+0.50 AND status != 'cancelled'`. Filter: nur Buchungen wo `payment_intent_id` **leer** oder mit `PENDING-`/`AWAITING-`/`MANUAL-UNPAID-`-Praefix beginnt (also noch keine echte Stripe-PI hat — verhindert dass Doppelzahlungen faelschlich zugeordnet werden). Bei genau **einem** Treffer → matchen + `bookings.payment_intent_id` auf `pi.id` korrigieren (damit Refund-Workflows etc. den richtigen PI finden). Bei mehreren Treffern → unmatched lassen, aber `reconciliation_note` „Auto-Match abgebrochen: N offene Buchungen mit Email+Betrag gefunden — bitte manuell zuordnen".
- **Doppelzahlungs-Schutz**: nach erfolgtem Match (egal welche Stufe) wird geprueft, ob bereits eine **andere** `stripe_transactions`-Row mit `booking_id = match.id AND match_status IN ('matched','manual')` existiert. Falls ja → der aktuelle PI wird **nicht** gematcht, sondern als `unmatched` mit Notiz „Moegliche Doppelzahlung: Buchung wurde bereits ueber pi_XXX bezahlt — pruefe Erstattung" markiert. Damit sieht der Admin im UI sofort den Erstattungs-Fall ohne dass EÜR/DATEV den Doppelbetrag faelschlich als Einnahme zaehlt (Einnahmen ziehen aus `bookings.price_total`, nicht aus `stripe_transactions`).
- **Defensiv:** falls die `reconciliation_note`-Migration noch nicht durch ist, wird der Upsert mit dem Feld einmal probiert, bei Schema-Fehler (`reconciliation_note|column|schema cache|PGRST`-Regex) ohne Notiz retryed — Match-Status alleine bleibt nuetzlich.
- **Auto-Heilung bei Re-Sync:** der Sync verarbeitet bei jedem Lauf alle PaymentIntents im Zeitraum neu (ausser `match_status='manual'|'refunded'`, die bleiben User-gesetzt). Wenn die Migration durchlaeuft und der naechste Sync durchlaeuft, werden bisher fehl-gepinnte „unmatched"-Transactions automatisch nachgematcht. Manuell verknuepfte Eintraege bleiben unangetastet.

### Stripe-Abgleich: Erstattung / Fehlbuchung erfassen (Stand 2026-05-18)
Neuer „Erstattung"-Button pro Zeile im Stripe-Abgleich (`StripeAbgleichTab.tsx`, neben „Verknüpfen") für zwei Rückerstattungs-Szenarien. Hintergrund: das steuerliche Einkommen (EÜR + DATEV) wird **ausschließlich aus `bookings`** berechnet — `stripe_transactions` fließen NICHT als Einnahme ein. Eine nicht zugeordnete Stripe-Zahlung zählt also ohnehin nie als Einkommen; eine teilerstattete **verknüpfte** Buchung zählte aber bisher voll.
- **Migration `supabase/supabase-bookings-refund.sql`** (idempotent): `bookings.refund_amount NUMERIC NOT NULL DEFAULT 0`, `bookings.refund_note TEXT` (append-only Audit), `stripe_transactions.reconciliation_note TEXT`. `match_status='refunded'` ist im bestehenden CHECK bereits zulässig — kein Constraint-Change.
- **Kernunterscheidung (wichtig!):** Eine Rückerstattung auf eine **verknüpfte** Buchung ist NICHT automatisch eine Einnahmeminderung. Häufiger Fall: Stripe hat **mehr eingezogen als der Rechnungsbetrag** (Überzahlung/Fehlbuchung) — der Buchungsbetrag war bereits korrekt, die Erstattung korrigiert nur Stripe. Dann darf das Einkommen NICHT gemindert werden (sonst doppelter Abzug, EÜR zu niedrig). Nur eine **echte** Erstattung einer korrekt berechneten Buchung (Kulanz/Teil-Storno) mindert das Einkommen. Der Admin entscheidet das pro Fall im Modal.
- **Endpoint `POST /api/admin/buchhaltung/stripe-reconciliation/refund`** Body `{ transaction_id, scope:'full'|'partial', amount?, reduces_income:boolean, note }` (Kommentar Pflicht ≥ 3 Z.). Zwei Pfade:
  - **Tx mit Buchung verknüpft** (matched/manual): `bookings.refund_amount` wird **absolut gesetzt** (idempotent, selbstheilend — Re-Submit korrigiert einen vorher falsch erfassten Wert):
    - `reduces_income=false` → `refund_amount = 0` (Stripe-Überzahlung/Fehlbuchung korrigiert, kein Abzug)
    - `reduces_income=true, scope='full'` → `refund_amount = Buchungs-Rechnungsbetrag` (r+a+h+s − discount/duration/loyalty; Einnahme → 0)
    - `reduces_income=true, scope='partial'` → `refund_amount = eingegebener Gesamtbetrag` (gedeckelt auf Rechnungsbetrag)
    Audit-Zeile an `refund_note` + Kommentar an `stripe_transactions.reconciliation_note`. Audit `stripe.refund` (entity `booking`).
  - **Tx ohne Buchung** (unmatched): `match_status='refunded'` + `reconciliation_note`. Kein Einkommens-Effekt (war nie Einnahme). Stripe-Gebühr bleibt als Ausgabe — `import-fees` filtert NICHT nach `match_status`.
- **EÜR** (`reports/euer/route.ts`): `refund_amount` per **Wasserfall** Miete → Zubehör → Haftung → Versand vom Einkommen abgezogen (keine Kategorie negativ, Summe sinkt exakt um den Wert). Per-Position-Note zeigt „− X EUR Erstattung". Response `income.refunds` additiv. **DATEV** (`datev-export/route.ts` + `preview-rows`): `refund_amount` analog zu `discount_amount` in der Erlös-Zeile abgezogen. Da `refund_amount` absolut/0 ist, ist eine als „Überzahlung" markierte Erstattung automatisch 0 → kein Doppelabzug.
- **Defensiv:** alle vier Selects (EÜR-bookings, DATEV-bookings ×2, stripe_transactions) haben einen Fallback-Select OHNE die neue Spalte (Regex auf `refund_amount|reconciliation_note|column|schema cache|PGRST`) — fehlt die Migration, läuft alles weiter (refund_amount = 0). Der Refund-Endpoint liefert auf der Buchungs-Seite 503 „Migration ausstehend", auf der Tx-Seite Retry ohne `reconciliation_note`.
- **UI:** Bei verknüpfter Buchung zwei Radios: „Stripe-Überzahlung / Fehlbuchung korrigiert (kein Abzug)" (Default) vs. „Echte Erstattung — Einnahme mindern" → dann voll/teilweise + €-Feld. Ohne Buchung: nur Pflicht-Kommentar (immer Fehlbuchung). `reconciliation_note` wird unter dem Status-Badge angezeigt; Badge `refunded` → „Erstattet" (orange, war im `StatusBadge`-Mapping bereits vorhanden).

### Stripe-Abgleich: manuelle Verknüpfung mit Buchungsauswahl (Stand 2026-05-18)
Das „Manuell verknüpfen"-Modal im Stripe-Abgleich (`StripeAbgleichTab.tsx`) zeigte fast immer „Keine passenden Buchungen gefunden — ID manuell eingeben", weil der Suggestions-Endpoint `app/api/admin/buchhaltung/stripe-reconciliation/suggestions/route.ts` (a) stornierte Buchungen per `.neq('status','cancelled')` ausschloss und (b) hart auf ±2 € Betragstoleranz filterte ohne Fallback. Stripe-Zahlungen/Erstattungen stornierter Buchungen liessen sich so nur per auswendig getippter ID zuordnen.
- **API:** Storno-Filter entfernt (stornierte Buchungen sind jetzt Kandidaten, `is_test=false` bleibt). Neuer optionaler `q`-Param (über `sanitizeSearchInput` aus `lib/search-sanitize.ts` → `.or(id/customer_name/customer_email ilike)`). Antwort jetzt `{ suggestions, others }`: `suggestions` = betragsgleich ±2 € nach Nähe sortiert (nur wenn `amount` gesetzt und kein `q`), `others` = restliche unverknüpfte Buchungen bzw. Suchtreffer (`created_at` desc, limit 200). Beide schliessen bereits verknüpfte `matchedIds` aus. Rückwärtskompatibel (`suggestions` bleibt, `others` additiv).
- **UI:** Modal hat jetzt ein Suchfeld (debounced 300 ms → `suggestions?q=`), zeigt zwei Abschnitte „Betragsgleiche Buchungen" (gepinnt) + „Alle Buchungen"/„Suchergebnisse" als scrollbare Liste (maxHeight 280, bis 200 Einträge), pro Zeile `StatusBadge` mit deutschem Booking-Status-Label (`BOOKING_STATUS_LABEL`, „Storniert" sichtbar). Freitext-ID-Feld bleibt als letzter Fallback. `match/route.ts` unverändert — verknüpft stornierte Buchungen bereits problemlos (kein Status-Filter).

### Stripe-Abgleich: Auto-Match-Kaskade + Doppelzahlungs-Detection (Stand 2026-05-20)
Vorher griff der Sync-Auto-Match ausschliesslich ueber `bookings.payment_intent_id` (exact). Doppelzahlungen, Webhook-Race-Faelle und nicht primaer verknuepfte Intents landeten als „Nicht zugeordnet" und mussten manuell verknuepft werden. Zwei Erweiterungen:
- **Auto-Match-Kaskade** in `app/api/admin/buchhaltung/stripe-reconciliation/sync/route.ts`. Pro Intent wird in dieser Reihenfolge probiert (sobald einer trifft, fertig):
  1. `bookings.payment_intent_id` exact (unveraendert).
  2. `intent.metadata.pre_booking_id` (checkout-intent schreibt seit langem die geplante Buchungs-ID dort hinein) → exact match auf `bookings.id`. Nur wenn die Buchung noch keine andere Stripe-Verknuepfung hat (sonst koennte ein Doppelzahlungs-Intent mit gleichem pre_booking_id die existierende Verknuepfung ueberschreiben).
  3. Heuristik: `intent.metadata.user_id` + Betrag cent-exakt + Buchung im 7-Tage-Fenster der Intent-Erstellung. Greift NUR wenn (a) genau eine Buchung passt und (b) die Buchung noch keine Stripe-Verknuepfung hat. Sehr defensiv, vermeidet Mis-Matches bei Sammelkunden.
- **Doppelzahlungs-Detection** im GET-Endpoint `stripe-reconciliation/route.ts`: pro `unmatched`-Tx wird gesucht, ob es eine andere `matched`/`manual`-Tx mit gleichem Betrag (±0,005 €) im ±3-Tage-Fenster gibt. Wenn genau eine passt → Antwort-Felder `duplicate_of_booking_id` + `duplicate_of_tx_id` gesetzt (kein Schema-Change, on-the-fly).
- **UI** (`StripeAbgleichTab.tsx`): bei `duplicate_of_booking_id` wird ein roter Badge „🔄 Doppelzahlung von BK-X" unter dem Status angezeigt + Quick-Button „🔄 Als Doppelzahlung" als erste Aktion. Klick → Confirm-Dialog → POST `/api/admin/buchhaltung/stripe-reconciliation/mark-duplicate` mit `{transaction_id, original_booking_id}`.
- **Endpoint `mark-duplicate`** verknuepft die Tx mit der Original-Buchung (`booking_id`), setzt `match_status='refunded'`, schreibt einen Standard-Notiz-Text als `reconciliation_note` und haengt eine Audit-Zeile an `bookings.refund_note`. **Kein** Einkommens-Abzug (`bookings.refund_amount` bleibt unberuehrt) — eine Doppelzahlung ist netto-null, der Rechnungsbetrag der Buchung war korrekt. Den **Stripe-Refund selbst loest der Admin manuell aus** (im Stripe-Dashboard oder ueber den existierenden „Erstattung erfassen"-Workflow). Bewusst getrennt, damit Geldfluss-Aktionen explizit bleiben.
- Audit: `stripe.mark_duplicate` (Entity `booking`).

### Stripe-Abgleich: stuendlicher Auto-Sync per Cron (Stand 2026-05-21)
Der Stripe-Abgleich wird jetzt zusaetzlich zum manuellen „Synchronisieren"-Button automatisch jede Stunde synchronisiert.
- **Geteilte Kernlogik** `lib/buchhaltung/stripe-sync.ts` → `runStripeSync({ from, to })` — die komplette PaymentIntent-Lade- + Auto-Match-Kaskaden-Logik wurde aus `app/api/admin/buchhaltung/stripe-reconciliation/sync/route.ts` extrahiert (Route ist jetzt duenner Wrapper: `checkAdminAuth` → `runStripeSync` → `logAudit`). Verhalten 1:1 unveraendert.
- **Cron** `GET/POST /api/cron/stripe-sync` (`verifyCronAuth` + `acquireCronLock('stripe-sync')`): synchronisiert den **aktuellen Monat** (Berlin-TZ, `from = YYYY-MM-01`, `to = heute`) — analog zum „Aktueller Monat"-Default im UI. Laeuft in Test- UND Live-Modus (Stripe-Read, kein Spend; `runStripeSync` nutzt intern `isTestMode()`). Audit `stripe.sync_run` mit `source:'cron'`.
- **Hetzner-Crontab (stuendlich):**
  ```
  0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/stripe-sync
  ```

### Stripe-Gebühren-Ausgaben: lesbare Beschreibung mit Bestellnummer (Stand 2026-05-21)
Der „Gebühren als Ausgaben"-Button im Stripe-Abgleich (`POST /api/admin/buchhaltung/stripe-reconciliation/import-fees`) erzeugte `expenses`-Einträge mit der Beschreibung `Stripe-Gebühr für pi_3TZQsa…` (PaymentIntent-ID abgeschnitten) — in der Ausgaben-Liste schwer zuzuordnen. Jetzt: ist die `stripe_transactions.booking_id` gesetzt (= Buchungsnummer wie `C2R-2621-003`, da `bookings.id` der Text-PK ist), lautet die Beschreibung `Stripe-Gebühren von der Bestellung C2R-2621-003`. Ohne Buchungszuordnung bleibt der `pi_…`-Fallback.
- **Selbstheilung bestehender Einträge:** Der Idempotenz-Check (`source_type='stripe_fee'` + `source_id=tx.id`) lädt jetzt auch `description` mit. Existiert der Eintrag bereits, trägt aber noch eine auto-generierte Beschreibung (Prefix `Stripe-Gebühr`) und die Buchung ist inzwischen verknüpft → `description` wird auf die Bestellnummer-Variante aktualisiert. Manuell umbenannte Einträge (Prefix passt nicht) bleiben unangetastet. Bedeutet: ein erneuter Klick auf „Gebühren als Ausgaben" heilt die Altbestand-Beschreibungen.
- API-Antwort + Audit (`stripe.import_fees`) liefern zusätzlich `updated`; das UI-Toast zeigt „N Stripe-Gebühren verbucht, M Beschreibungen aktualisiert".

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
2. Pro Szene ein Pexels-Clip (`lib/reels/stock-sources/pexels.ts`, bevorzugt Portrait 9:16, Fallback Landscape)
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
- **Multi-Source Stock Footage** (neu): `lib/reels/stock-sources/{types,pexels,pixabay,index}.ts` als Adapter-Architektur. `findClipForQuery({ seed, excludeIds, minHeight })` wählt deterministisch via `reelId`-Hash zwischen Pexels und Pixabay. Bei nur einem konfigurierten Key (Pexels) bleibt das Verhalten unverändert. `render_log` enthält pro Reel `[stock-sources] pexels=N pixabay=M` + pro Segment `[seg-i] source=… ext_id=… res=W×H`.
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
- **Provider-Switch:** `admin_settings.reels_settings.voice_provider` kann `'openai'` (Default) oder `'elevenlabs'` sein. `lib/reels/tts.ts` exportiert jetzt drei Funktionen: `generateSpeechOpenAI` (alter Pfad), `generateSpeechElevenLabs` (neu), `generateSpeechFromSettings` (Switch). Der Reel-Orchestrator ruft nur noch `generateSpeechFromSettings` und ist provider-agnostisch.
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

### Versandpartner-Logos (Stand 2026-05-15)
Originale DHL- und DPD-Logos statt der bisherigen Fake-Pillen (gelb/rot mit Textbuchstaben).
- **Quelle:** `public/logos/shipping/DHL_Logo_2025-V1-0/Screen/` (offizielles DHL-Paket: BF/rgb/black/white-Varianten als SVG+PNG+PDF) + `public/logos/shipping/DPD_logo_{redgrad,redwhite,black,white}_rgb.png`
- **In der App verbaut:**
  - `public/logos/shipping/dhl.svg` (= DHL_Logo_BF_rgb.svg, gelber Brand-Frame + rotes DHL-Logo, 900×299, Aspect ~3:1) — die BF-Variante, weil der gelbe Hintergrund das Logo sofort als DHL erkennbar macht
  - `public/logos/shipping/dpd.png` (= DPD_logo_redgrad_rgb.png, roter Wuerfel + "dpd", 4097×1822, Aspect ~2.25:1)
  - `public/logos/shipping/dhl-white.svg` (= identisch zu dhl.svg, die gelbe BF-Box ist auch auf dunklem Hintergrund sichtbar) + `dpd-white.png` (weisse DPD-Variante fuer dunkle Hintergruende)
- **Komponente:** `components/ShippingLogos.tsx` mit Props `size: 'sm'|'md'` (Hoehe 20px/28px, Breite folgt aus Aspect-Ratio) + `variant: 'color'|'light'`. Default: `md` + `color`.
- **Eingesetzt in:** `components/home/HowItWorks.tsx` (size=sm, color — heller Hintergrund), `components/home/TrustBanner.tsx` (size=md, light — dunkler Hintergrund), `components/layout/Footer.tsx` (size=sm, light — dunkler Hintergrund).
- **Fix mit-gemacht:** Footer-Pillen + alte `dhl.svg`/`dpd.svg` (gelbe Box mit "DHL"-Text bzw. rote Box mit "DPD"-Text) durch die echten Logos abgeloest.

### Newsletter-H2 (Stand 2026-05-15)
`components/home/NewsletterSignup.tsx` — die `<h2>Sei zuerst dabei</h2>` erbte `color: #1a1a1a` aus dem globalen `app/globals.css`-h1-h6-Selector. Auf dem dunklen Newsletter-Gradient (slate-900/blue-950) war der Titel kaum lesbar. Fix: explizit `text-white` an die H2 gehaengt. Die `.dark`-Override in globals.css greift hier nicht, weil die Section selbst keinen Dark-Mode-Kontext setzt.

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

### Wiederbeschaffung & Haftung in Buchungsdetail (intern, Stand 2026-05-04)
Pro Buchung sieht der Admin auf `/admin/buchungen/[id]` jetzt eine eigene Section „Wiederbeschaffung & Haftung (intern)" direkt unter „Buchungsdaten":
- **Kompletter Wiederbeschaffungswert** als grosse Zahl oben (Summe aus Kamera + allen Zubehoer-Positionen).
- **Breakdown** pro Position (Kamera + Zubehoer mit Mengen + Pro-Stueck-Wert + Quelle: Anlage / Wiederb.-Wert / Kautions-Anker).
- **Was der Kunde maximal uebernimmt** als farbige Box (Premium gruen, Basis amber, Ohne rot) mit konkretem Eurobetrag + Erklaerung. Differenz zum vollen WBW wird ausgewiesen (geht ans Reparaturdepot bzw. muss bei „Ohne" manuell eingefordert werden).

**Berechnung:**
- Kamera-WBW: `assets.replacement_value_estimate` mit Vorrang vor `current_value`, Fallback `product.deposit`.
- Zubehoer pro Position: bei vorhandenen `accessory_unit_ids` Asset-Mittelwert pro `accessory_id`, sonst `accessories.replacement_value`.
- Kunden-Maximum: bei `haftung='premium'` = 0, bei `'standard'` = Eigenbeteiligung aus `haftung_config.eigenbeteiligungByCategory[product.category]`, sonst = voller WBW.

API: `GET /api/admin/booking/[id]` liefert die Daten ueber neues Feld `liability_summary`. Defensive Fallbacks falls Migrationen noch nicht durch sind.

#### Manuelle Anpassung der internen Haftungs-Box (Stand 2026-05-16)
Der Admin kann in dieser Box pro Buchung eine **andere Katalog-Kamera und/oder ein anderes Zubehoer** fuer die Wiederbeschaffungswert-Berechnung zuweisen — z.B. wenn die Auto-Quelle (Anlage/Inventar) fehlt oder die Buchung das falsche Produkt zugeordnet hat.
- **Wirkt ausschliesslich auf diese interne Anzeige-Box.** product_id, accessory_items, Preis, Mietvertrag, Packliste, Verfuegbarkeit der echten Buchung bleiben unveraendert.
- **DB:** Spalte `bookings.liability_override JSONB NULL` (Migration `supabase/supabase-bookings-liability-override.sql`, idempotent). Shape `{ camera_product_id?: string, accessories?: [{id, qty}] }` — beide Keys optional, jeder NULL = automatische Berechnung fuer diesen Teil.
- **API:** `PATCH /api/admin/booking/[id]` akzeptiert `liability_override` (saniert: camera_product_id ≤100 Zeichen, accessories ≤50 Zeilen, qty 1–99; `null` = zuruecksetzen). Defensiver Retry ohne die Spalte falls Migration aussteht (Status-/E-Mail-PATCH bricht nicht ab, reine Override-PATCHs liefern 503). `computeLiabilitySummary` setzt bei Override die unit_id-Asset-Pfade aus und nutzt fuer die Kamera Inventar-Durchschnitt(override-id) → Kaution; fuer Zubehoer die manuell gewaehlte Liste statt der Buchungs-Positionen. `liability_summary` liefert zusaetzlich `camera_overridden`, `accessories_overridden`, `override_camera_product_id`, `override_accessories`.
- **Refactor mitgenommen:** Der Zubehoer-Resolver (Sets→Sub-Items-Expansion) wurde aus dem GET-Handler in die modulweite Helper-Funktion `resolveAccessoryItems()` extrahiert und wird von beiden Pfaden (echte Buchung + Override) genutzt.
- **UI** (`LiabilitySection` in `/admin/buchungen/[id]`): „Bearbeiten"-Button + Badge „manuell angepasst" + „Auf automatisch zuruecksetzen". Edit-Modus: zwei unabhaengige Checkboxen („Kamera ueberschreiben" → Katalog-Dropdown, „Zubehoer ueberschreiben" → editierbare Zeilenliste mit Dropdown + Menge + Hinzufuegen/Entfernen). Page laedt zusaetzlich `/api/products` + `/api/admin/accessories` fuer die Dropdowns.

### Zubehör einer bestehenden Buchung echt bearbeiten (Stand 2026-05-18)
> **UI entfernt (Stand 2026-05-19):** Die eigenständige Sektion „Zubehör der
> Buchung bearbeiten" (`BookingAccessoryEditSection`) wurde aus
> `/admin/buchungen/[id]` ausgebaut, weil „Bestellung bearbeiten"
> (`BookingEditSection` / `booking_edit`-Branch) funktional Obermenge ist
> (nutzt intern denselben `applyAccessoryComposition`-Helper). Der unten
> beschriebene PATCH-Branch `accessory_edit` **bleibt im Backend bestehen**
> (kein UI-Einstieg, harmless, ggf. von externen Tools nutzbar) — die
> Beschreibung unten dokumentiert weiter das API-Verhalten. Für reine
> No-Payment-Zubehöränderungen läuft alles über „Bestellung bearbeiten"
> mit `settle:'none'`.

Eigene Sektion „Zubehör der Buchung bearbeiten" auf `/admin/buchungen/[id]` —
**unabhängig** von der reinen Anzeige-`liability_override`-Box (die bleibt 1:1
für WBW-/Kamera-Korrektur ohne Buchungsänderung). Hier ändert der Admin die
**echte** Zusammensetzung (`bookings.accessory_items`/`accessory_unit_ids`/
`accessories`), wodurch Packliste (PDF+HTML), Übergabeprotokoll, Scan-Workflow,
WBW-Box/-Vorschlag und Verfügbarkeit automatisch nachziehen (alles liest live aus
`GET /api/admin/booking/[id]`).
- **API:** `PATCH /api/admin/booking/[id]` neuer eigenständiger, früh
  zurückkehrender Body-Zweig `accessory_edit { items:[{accessory_id,qty}],
  reason, new_price_total? }`. **Keine Migration** (nur bestehende Spalten).
- **Grund Pflicht** (min. 10 Zeichen, analog Storno) → an `bookings.notes`
  angehängt (`Zubehör-Anpassung (TT.MM.JJJJ): … [— Preis neu: X,XX €]`) +
  `logAudit('booking.accessory_edit')` (ACTION_LABELS ergänzt).
- **Verfügbarkeit hart blockiert:** pro neuer/erhöhter Position
  `requiredDelta = max(0, neu − alt)` gegen `available_qty_remaining` aus
  internem Fetch auf `/api/accessory-availability` (zählt die eigene Buchung
  bereits mit → Delta exakt). Block → 409, **keine Mutation**. Status-Guard:
  terminale Buchungen (`cancelled/completed/returned`) → 409 / Sektion
  ausgeblendet.
- **Sets erlaubt (Stand 2026-05-18, geändert):** Die frühere „Set-IDs werden
  abgelehnt"-Regel ist aufgehoben. Auswahl-Validierung akzeptiert jetzt
  Accessory- **ODER** Set-IDs (parallel-Lookup `accessories` + `sets`,
  unbekannt → 422 `Unbekanntes Zubehör/Set`). Gewählte Sets werden
  serverseitig via `resolveAccessoryItems` in ihre Einzelteile expandiert
  (`sub.qty × gewählte Menge`, Leaf-Zeilen mit `accessory_id`, Set-Container
  verworfen, gemerged, Cap 50). Danach läuft die **unveränderte** Pipeline
  (Verfügbarkeit/Unit-Zuweisung/Speicherung) nur auf echten Accessories —
  konsistent mit „nach dem Speichern eigenständige Positionen". Ohne Set in
  der Auswahl ist die Expansion ein No-op → keine Regression für reine
  Accessory-Edits. UI: Dropdown in `BookingAccessoryEditSection` ist jetzt
  nach `<optgroup>` „Sets (werden in Einzelteile aufgelöst)" + „Zubehör"
  gruppiert; jede Option zeigt ein Kompatibilitäts-Label
  (`accessories.compatible_product_ids` bzw. `sets.product_ids` → Kameranamen
  via `/api/products`, leer = „alle Kameras") — disambiguiert auch
  gleichnamige Einträge (z.B. zwei „Selfi-Stick"). Neue Prop `options`
  (id/name/kind/compat) ersetzt `accessoryList` nur in dieser Komponente;
  `LiabilitySection` nutzt weiterhin unverändert `accessoryList`.
- **Set-Teile weich behandelt (Stand 2026-05-18, Fix):** Symptom — Set
  hinzufügen → 409 „nicht genug freie Exemplare: Extra Akku, 64 GB,
  Selfi-Stick, …" obwohl im Shop buchbar. Ursache: Set-Bestandteile sind oft
  set-only Accessories ohne eigene `accessory_units`/mit `available_qty=0`
  (es gibt teils gleichnamige Dubletten — eine kundenseitige + eine
  interne/Set-Variante). Die harte Pre-Check- **und** die
  Unit-Assign-`missing`-Logik lehnten diese ab, während der **Kunden-Set-Flow
  sie nie hart prüft** (`confirm-cart`: `assignAccessoryUnitsToBooking` für
  Sets ist non-blocking; Set-Verfügbarkeit ist Set-Ebene/soft laut
  Architektur-Regel). Fix: nur **direkt gewählte Einzel-Accessories**
  (`directExpanded`, = rawSelection ohne Set-IDs, via `resolveAccessoryItems`)
  werden hart auf Verfügbarkeit geprüft und bei fehlenden Units hart
  abgelehnt (`missingDirect`). Set-expandierte Teile werden weich behandelt:
  Units werden best-effort zugewiesen wo vorhanden, fehlende Set-Teil-Units
  blockieren die Änderung NICHT (kein Rollback, `accessory_unit_ids` =
  kept+fresh-partial) — exakt wie eine Set-Buchung im Shop. 409-Meldung für
  direkte Items zeigt jetzt `Name (benötigt X, frei Y)`. Reine
  Accessory-Edits ohne Set: `directRaw == rawSelection` → Verhalten 1:1 wie
  zuvor, keine Regression. Überbuchen einzeln gewählter Accessories bleibt
  hart verhindert.
- **Mutation near-atomar:** neue Units zuerst via
  `assignAccessoryUnitsToBooking` (alte bleiben vorerst `rented`); bei
  `missing>0` (Race) → frische Units freigeben + `accessory_unit_ids` auf alt
  zurücksetzen → 409, Buchung unverändert. Bei Erfolg:
  `accessory_unit_ids` explizit auf die neu zugewiesenen IDs setzen (RPC hängt
  nur an), dann `releaseAccessoryUnitsFromBooking(id, oldUnitIds)` (leert das
  Array nicht selbst, schont Units in anderen aktiven Buchungen),
  `accessory_items`/`accessories` überschreiben.
- **Preis OPTIONAL, keine Stripe-Bewegung** (Entscheidung): nur `price_total` +
  Notiz; Rechnungs-PDF (`/api/invoice/[bookingId]`) ist on-the-fly und zeigt den
  neuen Wert; eine evtl. persistente `invoices`-Row wird **nicht** automatisch
  korrigiert (über bestehenden Buchhaltungs-Gutschrift-Workflow regeln).
- **Mietvertrag bleibt Original** (Entscheidung) — Doku via Notiz + Audit + die
  bestehende WBW-Finalisierungs-Mail.
- **Verfügbarkeit:** `computeAccessoryAvailability` (`lib/accessory-availability.ts`,
  aus dem ehemaligen `/api/accessory-availability`-Route-Body extrahiert, Route
  ist jetzt dünner Wrapper) wird **in-process** aufgerufen (kein HTTP-Self-Fetch
  — hinter Cloudflare/Hetzner-Firewall unzuverlässig). Neuer Opt-Param
  `excludeBookingId` schließt die bearbeitete Buchung aus der Zählung aus →
  **keine Selbst-Blockade** (kritisch bei Set-Buchungen, deren `accessory_items`
  nur die Set-ID enthält → Einzelteil-Baseline sonst fälschlich 0). Geprüft wird
  die **gesamte** neue Menge pro Position gegen den bereinigten Restbestand;
  Bulk/nicht-trackbar (kein availMap-Eintrag) blockiert nicht.
- **Unit-Delta** basiert auf den **tatsächlich zugewiesenen** `accessory_units`
  (`unitsByAcc`), NICHT auf `accessory_items` (Set-ID-behaftet): pro Accessory
  bis `want` behalten, Überzähliges freigeben, `assignQty = want − keep.length`
  neu zuweisen (keine Self-Kollision mit eigenen rented-Units).
- **Pack-Workflow-Reset:** war die Buchung schon mitten im Packen
  (`pack_status='packed'` — Packer hat unterschrieben, Kontrolleur fehlt
  noch / Zwischenstand), werden bei der Änderung alle `pack_*`-Snapshot-
  Felder + 4-Augen-Signaturen genullt + `packing-photos`-Foto best-effort
  gelöscht (analog `versand/[id]/pack-reset`), sonst würden sie den ALTEN
  Inhalt bescheinigen. **Ein bereits ABGESCHLOSSENER Pack-Vorgang
  (`pack_status='checked'`, beide Unterschriften / 4-Augen erledigt) bleibt
  unberührt** (Stand 2026-05-19) — die unterschriebene Packliste ist der
  rechtliche Nachweis dessen, was physisch gepackt wurde; eine spätere
  Buchungs-Änderung darf den abgeschlossenen Snapshot nicht rückwirkend
  löschen. Packliste-PDF/HTML (`/api/packlist/[bookingId]`) liest live aus
  `accessory_items` → zieht automatisch nach, kein Reset nötig. Audit-Feld
  `pack_workflow_reset`.
- **`resolved_items`** wurde additiv um optionales `accessory_id` erweitert
  (Set-Container-Zeile hat keins → UI filtert sie aus dem Editor). UI:
  `BookingAccessoryEditSection` (Read = expandierte Ist-Positionen, Edit =
  Dropdown-Tausch/Menge/✕/„+ Zubehör hinzufügen" + Pflicht-Grund + optionale
  Preis-Checkbox), nutzt die schon geladene `accessoryList`. 409/422 inline.
- **Nebeneffekt (gewollt):** geänderte Set-Teile verlieren das „(aus Set: …)"-
  Label (flache Positionen). Werte/WBW pro Position bleiben korrekt.

#### Versand-DB-Quelle + Multi-Kamera-Modelle + Rabatt-Skalierung (Stand 2026-05-19)
Drei Korrekturen am `booking_edit`-Zweig (`app/api/admin/booking/[id]/route.ts`)
+ `BookingEditSection` (`app/admin/buchungen/[id]/page.tsx`), keine Migration:
- **Versandpreis aus DB statt statisch.** Vorher `calcShipping(...,
  shippingConfig)` mit dem fest in `data/shipping.ts` hinterlegten Objekt →
  falsch, sobald der Admin unter `/admin/einstellungen?tab=versand` andere
  Preise gesetzt hat. Jetzt: `admin_config`-Key `shipping` laden (gleiches
  Pattern wie `confirm-cart`), Fallback `DEFAULT_SHIPPING` (`lib/price-config`).
  `shippingConfig`-Import entfernt.
- **Lieferart/Versandart editierbar + manueller Override.** Body um
  `delivery_mode`, `shipping_method`, `shipping_override` erweitert; UI hat
  zwei Selects + Checkbox „Versandkosten manuell" (z. B. 0 € = kostenlos).
  `delivery_mode`/`shipping_method` werden in `upd` mitgeschrieben. Erklärt
  den 12,99-€-Fall: die Buchung stand auf Express (Express ignoriert den
  Gratis-Schwellwert).
- **Multi-Kamera: pro Kamera ein eigenes Modell.** Body um
  `cameras: {product_id}[]` erweitert (`camera_product_id` bleibt
  Legacy-Fallback). Preis = Σ `getPriceForDays(p, days)` je Kamera,
  Verfügbarkeit **pro distinct Modell** (`reservedCameraCount`),
  `desiredCameras: DesiredCamera[]` → `buildCameraSkeleton` +
  `assignCamerasToBooking`. UI: ein Dropdown pro Kamera (Anzahl aus
  `cameras_resolved`). Defensiver Fallback auf Ein-Modell ohne die
  `supabase-bookings-cameras.sql`/`-camera-unit-assignment.sql`-Migrationen.
- **Rabatt schrumpft proportional.** `discScale = clamp(newSubtotal /
  oldSubtotal, 0, 1)`; `discount_amount`/`duration_discount`/
  `loyalty_discount` skaliert in `upd` zurückgeschrieben (Rechnung/EÜR
  konsistent). Manueller `new_price_total`-Override bleibt vorrangig.
- Preview liefert zusätzlich `delivery_mode`, `shipping_method`,
  `shipping_overridden`, `discount_scaled`; Note + Audit dokumentieren die
  Versand-/Rabatt-Anpassung.

### Komplette Bestellbearbeitung mit Nachzahlung/Erstattung (Stand 2026-05-19)
Neue Section „Bestellung bearbeiten" auf `/admin/buchungen/[id]` (über der
schlankeren „Zubehör der Buchung bearbeiten"-Section, die für reine
Zubehör-Quick-Edits bleibt). Ändert **Mietzeitraum, Kamera, Set/Zubehör und
Haftungsschutz** in einem Vorgang; Preisdifferenz wird abgewickelt.
- **Wirksamkeit:** Änderung greift SOFORT auf die echte Buchung (Packliste,
  Vertragsdaten-Quelle, Verfügbarkeit, WBW). Zahlung wird separat verfolgt
  (nicht blockierend) — robust auch für bereits versendete Buchungen.
- **Nachzahlung (diff > 0):** Stripe-Zahlungslink über die Differenz wird
  erzeugt, automatisch per E-Mail an den Kunden geschickt
  (`lib/booking-adjustment-email.ts`, emailType `payment_link`) und im Admin
  in `notes`/Antwort angezeigt. `stripe-webhook` markiert bei Zahlung
  `adjustment_status='paid'` (metadata `booking_type:'price_adjustment'`).
- **Erstattung (diff < 0):** Auto-Stripe-Teilrefund nur wenn
  `payment_intent_id` mit `pi_` beginnt (idempotencyKey
  `booking-edit-refund:<id>:<cents>`), sonst `adjustment_status='refund_pending'`
  + `payment_failed`-Notification (manuell). **WICHTIG:** die
  `bookings.refund_amount`-Spalte wird NICHT angefasst — der gesenkte
  `price_total` reduziert das EÜR/DATEV-Einkommen bereits; `refund_amount`
  würde DOPPELT abziehen (gehört dem Stripe-Abgleich-Erstattungs-Feature).
- **Mietvertrag** bleibt das signierte Original — Änderung wird in
  `bookings.notes` + Audit (`booking.edit`) dokumentiert (analog
  accessory_edit). Pack-Workflow-Snapshot wird zurückgesetzt
  (`resetPackWorkflow`-Helper, jetzt geteilt mit accessory_edit).
- **Backend:** neuer früh-zurückkehrender PATCH-Zweig `booking_edit` in
  `app/api/admin/booking/[id]/route.ts`. Body
  `{ rental_from?, rental_to?, camera_product_id?, haftung?, items?,
  reason, new_price_total?, settle:'auto'|'none', dry_run? }`.
  `dry_run:true` → Preis-Breakdown + diff + Settlement-Plan ohne Mutation
  (UI „Vorschau berechnen"). `items` wird nur gesendet wenn der Admin
  Zubehör/Set wirklich ändert — sonst behält der Server die aktuelle
  Komposition (Set bleibt als Set bepreist; sonst würde ein Set in
  Einzelteile aufgelöst, gleiches Nebeneffekt wie accessory_edit).
- **Verfügbarkeit hart:** Kamera via `reservedCameraCount()`
  (spiegelt `/api/availability`, multi-cam-aware, exkl. dieser Buchung) gegen
  `product.stock`; Zubehör via geteiltem `applyAccessoryComposition`
  (`lib/booking-accessory-apply.ts` — aus accessory_edit extrahiert, beide
  Zweige nutzen es jetzt). Konflikt → 409, **keine Mutation**.
- **Preis-Recompute:** Miete `getPriceForDays × cameraCount`, Haftung
  `calcHaftungTieredPrice` (aus `admin_settings.haftung_config`),
  Zubehör/Sets aus DB-Preis × Tage/flat, Versand `calcShipping`,
  bestehende Rabatte (discount/duration/loyalty) bleiben abgezogen. Admin
  kann den Gesamtpreis manuell überschreiben (`new_price_total`).
- **Migration:** `supabase/supabase-bookings-edit-adjustment.sql` (idempotent)
  legt `bookings.adjustment_payment_link_id/amount/status/note` an.
  Defensiver Fallback: fehlt die Migration, läuft alles weiter (Doku nur in
  `notes`, Zahlungslink/Refund werden trotzdem ausgeführt, Webhook-Status-
  Update wird still übersprungen).

### Verkauf von Zubehör — Speicherkarten etc. (Stand 2026-05-21)
Admin-seitiges Verkaufs-Tool: ein Zubehör (typisch eine gebrauchte
Speicherkarte, die nicht zurück in den Verleih soll) an einen Kunden
**verkaufen** statt vermieten. Der Kunde bekommt Rechnung + Stripe-Zahlungslink
per E-Mail. Kein Kunden-Self-Service.

- **Modell:** Ein Verkauf ist eine `bookings`-Row mit `booking_type='kauf'` und
  den verkauften Artikeln in `sale_items` JSONB (`[{name,qty,unit_price}]`).
  Dadurch fließt er automatisch in Buchhaltung (EÜR/DATEV), `invoices`-Anlage
  und den `awaiting_payment`+Webhook-Flow ein. Migration
  `supabase/supabase-bookings-verkauf.sql` (idempotent): `booking_type TEXT
  NOT NULL DEFAULT 'miete'` + CHECK(`miete`|`kauf`) + `sale_items JSONB`.
- **Keine Miet-Kollision:** Verkaufszeilen tragen `product_id=''`,
  `accessory_items=null`, `unit_id=null`, `delivery_mode=null` → sie tauchen
  NICHT in Kamera-/Zubehör-Verfügbarkeit, Gantt oder Versand-Liste auf.
  `alle-buchungen` (Miet-Buchungsliste) + der `awaiting-payment-cancel`-Cron
  filtern `booking_type='kauf'` zusätzlich explizit raus (defensiver Retry
  ohne die Spalte, falls Migration aussteht — der Cron würde Verkäufe sonst
  sofort stornieren, weil `rental_from`=Verkaufsdatum).
- **`lib/verkauf.ts`** — `createSale()` (Stripe Product+Price+Payment-Link →
  `bookings`-Insert `status='awaiting_payment'`, `payment_intent_id='PENDING-…'`
  → `storeInvoiceForBooking` → `dispatchSaleInvoice`) + `dispatchSaleInvoice()`
  (Rechnung-PDF via `buildInvoiceData`+`InvoicePDF` → E-Mail mit Zahlungslink,
  emailType `kauf_rechnung`). Payment-Link-Muster aus `lib/booking-approve.ts`.
- **Rechnung:** `buildInvoiceData` hat einen frühen `booking_type==='kauf'`-
  Zweig (Positionen aus `sale_items`, kein Mietzeitraum/Haftung/Versand/
  Kaution). `lib/invoice-pdf.tsx` bekam ein `isKauf`-Flag: Meta zeigt
  „Kaufdatum" statt „Leistungszeitraum", Positions-Subline „Verkaufsartikel",
  keine Haftungs-/Versand-Summenzeilen, Unbezahlt-Block verweist auf den
  Zahlungslink (keine Bank-QR).
- **Webhook:** `checkout.session.completed` mit `metadata.booking_type='kauf'`
  → Buchung `awaiting_payment`→`confirmed`, `payment_intent_id` auf echte
  `pi_…`, `invoices`-Row auf bezahlt, `new_booking`-Notification.
- **APIs:** `GET/POST /api/admin/verkauf` (Liste / anlegen; `?customer_id=`
  liefert die Buchungen eines Kunden mit aufgelösten Artikel-Namen für die
  Artikelauswahl). `POST /api/admin/verkauf/[id]` mit `action`
  `resend|cancel|mark_paid`. Permission `tagesgeschaeft`.
- **UI:** `/admin/verkauf` (Liste, Sidebar-Gruppe „Tagesgeschäft") +
  `/admin/verkauf/neu` (Kunde aus DB wählen → optional Artikel aus einer
  früheren Buchung übernehmen → Preise manuell → „Rechnung schicken").
- **Bewusst nicht automatisiert:** Das verkaufte Exemplar muss der Admin
  separat unter `/admin/inventar` bzw. `/admin/zubehoer` als verkauft/
  ausgemustert markieren (Exemplar-Status `retired` bzw. Bulk-Bestand senken).
- **Go-Live TODO:** Migration `supabase/supabase-bookings-verkauf.sql`
  ausführen. Ohne Migration liefert `POST /api/admin/verkauf` 503.

### Multi-Kamera-Buchungen + In-App-PDF-Viewer (Stand 2026-05-18)
- **Mehrere Kameras pro Buchung** sind als kommagetrennter `bookings.product_name`
  gespeichert (z.B. „OSMO Action 5 Pro , OSMO Action 5 Pro"), `product_id` bleibt
  einzeln. Die Rechnung splittete das schon (`lib/invoice-pdf.tsx` →
  `productName.split(',')`), WBW + Pack/Übergabe NICHT → nur 1 Kamera sichtbar.
  Fixes:
  - **WBW** (`computeLiabilitySummary`, `app/api/admin/booking/[id]/route.ts`):
    `cameraCount = product_name.split(',').filter` → `cameraLine.qty = count`,
    `total_value = cameraValue * count` (bei `liability_override` = 1). `cameraValue`
    bleibt der Lookup über das einzelne `product_id`/`unit_id` (Annahme: gleiches
    Modell ×N — der Concat-Name impliziert das).
  - **Pack/Übergabe** (`expandItems` in `components/admin/scan-workflow.tsx`):
    pro kommagetrennter Kamera ein PackItem; der erste behält `key:'camera'`
    (scanbar via Seriennummer — die `applyScan`-Logik referenziert `'camera'`
    hart), die weiteren `camera::1..` (manuell). `groupItems` fasst alle
    `type:'camera'` zu EINER Gruppe → „Kamera 0/N"-Counter.

#### Echtes Multi-Unit-Datenmodell — beliebig viele Kameras, gemischte Modelle (Stand 2026-05-18)
**Löst das obige Komma-String-Pflaster ab.** Der `product_name`-Split blieb
als Legacy-Fallback erhalten; neue Buchungen tracken jede Kamera als eigenes
physisches Exemplar (eigene Seriennr + eigener Wert), auch verschiedene Modelle
in einer Buchung.
- **Spalte `bookings.cameras JSONB`** (Migration `supabase/supabase-bookings-cameras.sql`):
  ein Eintrag pro Kamera `{product_id,product_name,unit_id|null}`. NULL ⇒
  `lib/booking-cameras.ts:resolveBookingCameras()` leitet es aus
  `product_name`-Split + `product_id` + `unit_id` ab (erste Kamera = `unit_id`)
  → Altbuchungen verhalten sich exakt wie bisher. `unit_id`/`product_name`
  bleiben synchron befüllt (erste Kamera / Komma-Join) für unangetasteten
  Legacy-Code. Helper: `resolveBookingCameras`, `desiredFromBooking`,
  `buildCameraSkeleton`, `countBookingCameras`.
- **Race-sichere RPC `assign_free_camera_units`** (`supabase/supabase-camera-unit-assignment.sql`,
  selber Advisory-Lock-Key wie `assign_free_unit`; letztere zählt jetzt auch
  `cameras[]` als belegt). `lib/camera-unit-assignment.ts:assignCamerasToBooking()`
  schreibt das Skelett, füllt pro `product_id` die Slots, synct
  `unit_id`=erste Kamera. Verdrahtet (statt Einzel-`assignUnitToBooking`) in
  confirm-cart (Primär + Webhook-Race-Recovery), confirm-booking,
  manual-booking (Admin-Komma-Liste, vom Admin gewählte `unit_id` = 1. Kamera),
  stripe-webhook (Single + Cart).
- **Fehlalarm „N Kamera-Einheit(en) konnten nicht zugewiesen werden" gefixt (Stand 2026-05-19):**
  `assignCamerasToBooking` meldete `missing`, sobald die RPC **0 NEU**
  vergebene Einheiten zurückgab. Die RPC füllt aber nur Slots mit leerer
  `unit_id` — bei vorab gesetzter Seriennummer (manuelle Buchung schreibt
  `body.unit_id` ins Skelett, bevor `assignCamerasToBooking` läuft) oder bei
  idempotentem Re-Sync (Stripe-Webhook nach confirm-cart) ist der Slot schon
  gefüllt → RPC liefert korrekt `[]`, war aber fälschlich als „missing"
  gewertet (Buchung/Kalender trotzdem korrekt → Fehlalarm). Fix: `missing`
  wird jetzt aus dem **tatsächlichen Endzustand** von `bookings.cameras`
  berechnet (Slots ohne `unit_id` nach dem RPC-Lauf), nicht aus der Anzahl
  neu vergebener IDs. RPC-Fehler-Pfad pusht kein `missing` mehr separat —
  der leere Slot wird von der Endzustand-Auswertung ohnehin erfasst. Rein
  additiv, kein Verhaltenswechsel bei echten Engpässen.
- **Verfügbarkeit**: `/api/availability/[productId]` zweite Query
  `.contains('cameras',[{product_id}])` + Zählung via `resolveBookingCameras`
  pro Produkt → gemischte Modelle blockieren ihr eigenes Produkt korrekt
  (kein Doppelbuchen mehr). `lib/unit-assignment.findFreeUnit` belegt =
  `unit_id` ODER `cameras[].unit_id` (modellübergreifend, kein product_id-
  Filter). `availability-gantt`: pro Kamera ein Overlay-Eintrag mit deren
  `unit_id`, gruppiert nach deren Produkt.
- **WBW/Seriennr** (`booking/[id]` GET): `cameras_resolved[]` mit Seriennr je
  Unit; `computeLiabilitySummary` → `resolveCamWbw` pro Kamera über DEREN
  `unit_id` (Asset→Inventar-Unit→Inventar-Schnitt je Produkt→Kaution),
  `total_wbw`=Σ Zeilen. Override-Pfad unverändert.
- **Vertrag/Packliste**: `generate-contract` pro Kamera eigene Zeile mit
  eigener Seriennr (`resolveSerial`) + eigenem WBW (Floor = Kaution/Kamera).
  Packliste-Route + PDF: `data.cameras[]` → richtige Seriennr je Kamera-Seite.
  Rechnung unverändert (zeigt nur Namen). Legacy ohne `bookingId`/`cameras` →
  alte Split-Pfade.
- **Scan/Pack/Übergabe**: `ScanLookup.cameraSlots[]` (Slot+Seriennr+unit_id je
  Kamera), `applyScan` matcht jeden Kamera-Code auf seinen Slot;
  `ScannedUnits.cameraUnitIds[]` (`cameraUnitId` weiter back-compat geparst),
  `applyScannedUnits` substituiert pro Kamera in `cameras[]` nach Produkt +
  flippt `product_units`-Status. packen/uebergabe senden `cameraUnitIds[]`.
- **Retoure**: `return-booking` erhöht Stock pro Kamera-**Modell** so oft wie
  Kameras dieses Modells in der Buchung (statt 1×).
- **Schaden**: Spalte `damage_reports.camera_unit_id` (Migration
  `supabase/supabase-damage-reports-camera-unit.sql`) als Daten-Fundament
  angelegt. **Offen (Folge-Change):** dedizierter Pro-Kamera-Schaden-Modal
  analog `AccessoryDamageModal` — bewusst NICHT halbfertig mitgeliefert.

#### Verfügbarkeits-Unterzählung bei Multi-Kamera-/Mengen-Buchungen (Stand 2026-05-18)
Gleicher Concat-Name-Effekt traf die Verfügbarkeit — eine 2-Kamera-Buchung (1 Zeile) zählte als 1 Einheit, ein 2er-Bestand zeigte fälschlich noch „verfügbar" → Kunde konnte überbuchen.
- **Fix Kunden-Kalender** `app/api/availability/[productId]/route.ts`: `product_name` mitselektiert; pro überlappender Buchung `bookedCount += max(1, product_name.split(',').filter().length)` statt `bookedCount++` (gleiche Comma-Split-Konvention wie WBW/Invoice/Pack/Contract).
- **Fix Admin-Gantt-Zubehör** `app/api/admin/availability-gantt/route.ts` + `app/admin/verfuegbarkeit/page.tsx`: Gantt las nur Legacy `bookings.accessories[]` (1× je Buchung) → „1/2 belegt" obwohl qty 2. Jetzt qty-aware mit gleicher Priorität wie `computeAccessoryAvailability` (unit_ids → accessory_items.qty → legacy, inkl. Set-Expansion). Route gibt `qty` pro Buchungseintrag, Client summiert `qty` statt `.length`. **Kunden-Zubehör-Verfügbarkeit (`lib/accessory-availability.ts`) war bereits korrekt** (qty-aware) — die „1/2"-Anzeige war reiner Gantt-Display-Bug.
- **BEKANNTE Rest-Lücke (nicht gefixt — Architektur/hohe Blast-Radius):** `bookings.unit_id` ist EIN einzelnes uuid-Feld; `assign_free_unit` (Postgres-RPC) reserviert pro Buchungszeile genau 1 `product_unit`. Eine Multi-Kamera-Buchung reserviert physisch nur 1 Einheit — die weiteren Kameras sind unit-seitig nicht belegt. Der Kunden-Kalender (oben gefixt) verhindert die Überbuchung jetzt vorgelagert; eine echte N-Einheiten-Reservierung bräuchte Schema-Änderung (`unit_ids`-Array) + RPC-Rewrite + Gantt/Packliste/Vertrag-Anpassung → bewusst als Folge-Entscheidung offengelassen, NICHT blind am Buchungs-RPC geändert.

- **In-App-PDF-Viewer** `app/admin/pdf-viewer/page.tsx` (`?u=<rel /api-Pfad>&t=`):
  In der iOS-PWA öffneten `target="_blank"`-Links auf `/api/...`-PDFs eine
  chrome-lose Vollbildansicht OHNE Zurück → App musste geschlossen werden.
  Viewer ist eine normale App-Route (iframe + eigener Zurück-Button via
  `router.back()`, „Neuer Tab"-Fallback). `u` muss mit `/api/` beginnen (kein
  Open-Redirect). `/admin/buchungen/[id]` leitet Rechnung/Mietvertrag (2×) +
  Rücksendeetikett über den Viewer; externe Sendcloud-`label_url` bleibt
  `target="_blank"`.

### WBW-Finalisierung mit PDF-E-Mail an den Mieter (Stand 2026-05-16)
Beim Versandfertigmachen legt der Admin die **finalen** Wiederbeschaffungswerte der tatsaechlich mitgelieferten Ausruestung fest. Diese werden als rechtlich relevantes PDF generiert, in Storage abgelegt und automatisch per E-Mail an den Mieter geschickt. Laut Mietvertrag ist ab dann ausschliesslich der per E-Mail mitgeteilte finale WBW massgeblich.
- **Vertrags-Passus** (in `lib/contracts/contract-template.tsx`, immer gerendert, NICHT DB-overridable, bereits gespeicherte Vertrags-PDFs bleiben unberuehrt): „Die ausgewiesenen Wiederbeschaffungswerte stellen eine vorläufige Schätzung … Maßgeblich … ist ausschließlich der in dieser E-Mail ausgewiesene finale Wiederbeschaffungswert."
- **DB:** `bookings.wbw_final JSONB` (`[{name,serial,value}]`), `wbw_finalized BOOLEAN`, `wbw_finalized_at`, `wbw_email_sent_at` (Migration `supabase/supabase-bookings-wbw-finalized.sql`, idempotent). Es gibt keine `booking_items`-Tabelle — Positionen leben als JSONB-Array auf `bookings`.
- **PDF:** `lib/wbw-confirmation-pdf.tsx` (@react-pdf, A4, Navy/Cyan-Design, BUSINESS-Config als Vermieter). Storage: `contracts`-Bucket, Pfad `wbw/<bookingId>.pdf` (kein Jahres-Ordner → deterministisch fuer Re-Download).
- **E-Mail:** `sendWbwConfirmation()` in `lib/email.ts`, emailType `wbw_confirmation`, PDF als Anhang `WBW-<bookingId>.pdf`. Absender ueber `getResendFromEmail()` (Test/Live-aware).
- **API:** `POST /api/admin/booking/[id]/finalize-wbw` — Auth, 409 wenn schon finalisiert (ausser `{resend:true}`), 400 wenn ein Wert ≤ 0, 503 wenn Migration fehlt. Persistiert → PDF → Storage-Upsert → E-Mail. Bei Resend-Fehler: WBW+PDF bleiben, Response `{success:false, error, pdfUrl}`. `GET` liefert frische Signed-URL (Redirect) fuer Re-Download. Audit `booking.wbw_finalize` / `booking.wbw_resend`.
- **UI:** `WbwFinalizePanel` in `/admin/buchungen/[id]`, nur bei `status==='confirmed'`. Zustand A: editierbare Tabelle (Vorschlag = `liability_summary`-Werte), Bestaetigungs-Dialog, Button disabled solange ein Feld ≤ 0. Zustand B: gruene Box (Datum + E-Mail), read-only Tabelle, „PDF herunterladen" + „E-Mail erneut senden".

### Wiederbeschaffungswert getrennt vom Buchwert (Stand 2026-05-04)
Steuerlicher Buchwert (`assets.current_value`) und tatsaechlicher Wiederbeschaffungswert sind jetzt zwei getrennte Felder. Vorher: bei GWG fiel der Buchwert auf 0, der Mietvertrag zeigte dann fallback auf die Kaution — irrefuehrend, weil das ja nicht der echte Marktwert ist.

- **Migration:** `supabase/supabase-assets-replacement-value-estimate.sql` (idempotent) — neue Spalte `assets.replacement_value_estimate NUMERIC NULL`. NULL = `current_value` als Default.
- **GWG-Pfad** (`/api/admin/purchase-items/[id]`) setzt `replacement_value_estimate = purchase_price` automatisch beim Anlegen. Defensiver Retry ohne die Spalte falls Migration noch nicht durch ist.
- **Manueller Asset-POST** (`/api/admin/assets`): bei `depreciation_method='immediate'` wird `current_value=0`, `residual_value=0`, `useful_life_months=0` und `replacement_value_estimate=purchase_price` automatisch gesetzt. Bei regulaerem Asset bleibt das Feld NULL.
- **Vertrag-Floor** (`lib/contracts/generate-contract.ts`): `loadAssetCurrentValue` nimmt jetzt `replacement_value_estimate` mit Vorrang vor `current_value`. Bei GWG sieht der Mietvertrag damit den realen Marktwert (Kaufpreis), nicht 0 oder die Kaution.
- **Zubehoer-Schaden-Modal** (`/api/admin/booking/[id]/accessory-units-detail`): `suggested_wbw = MAX(asset.replacement_value_estimate ?? asset.current_value, accessory.replacement_value, 0)`. Bei GWG-Akku wird der Kaufpreis vorgeschlagen, statt 0.

### Schaden-Modus-Klarheit im Admin-Schadensmodul (Stand 2026-05-04)
`booking.deposit` enthaelt **immer** den Wert aus `product.deposit`, unabhaengig vom Modus. Aber im **Haftung-Modus** (Default) ist das nur ein theoretischer Anker — es gibt keine Stripe-Pre-Auth, also auch kein Capture moeglich. Das Schaden-UI hat das nicht klar kommuniziert; der „Kaution einbehalten"-Button hat im Haftung-Modus immer fehlgeschlagen.

- **`GET /api/admin/damage`** liefert jetzt zusaetzlich `deposit_intent_id`, `deposit_status`, `price_haftung` pro Booking.
- **`/admin/schaeden`** zeigt jetzt:
  - **Header-Label** wechselt zwischen „Kaution (Pre-Auth)" und „Kautions-Anker" je nach `deposit_intent_id`-Existenz
  - **Hinweis-Banner** im Confirmed-Workflow: amber „Schadenspauschale-Modus — keine Pre-Auth, manuell einfordern" oder rot „Ohne Schadenspauschale — Forderung schriftlich" je nach `price_haftung`
  - **„Kaution einbehalten"-Input** ist read-only mit „— keine Pre-Auth —" bei fehlender `deposit_intent_id`
  - **„Kaution einbehalten"-Button** ist hidden bei fehlender `deposit_intent_id` (kein leerer Stripe-Capture-Aufruf mehr)

### Vertrag: Schadensregel-Karte + dynamischer Kautions-Hinweis (Stand 2026-05-04)
Der Vertrag zeigt unter der „Gewählte Haftungsoption"-Karte jetzt eine konkrete Schadensregel-Box mit den realen Zahlen fuer DIESE Buchung:
- **Premium-Schadenspauschale**: „Maximale Eigenbeteiligung: 0,00 EUR"
- **Basis-Schadenspauschale**: „Maximale Eigenbeteiligung: {eigenbeteiligung} EUR"
- **Ohne Schadenspauschale**: „Haftung bis zum Wiederbeschaffungswert pro Position (siehe Tabelle oben)"

Plus: der hardcoded Hinweis „Eine Kaution oder Kreditkartenvorautorisierung wird nicht erhoben" ist jetzt **dynamisch** je nach `admin_settings.deposit_mode`:
- **Modus `kaution`**: „Kaution {betrag} per Kreditkartenvorautorisierung reserviert (kein Geldfluss). Aufhebung 7 Tage nach Vertragsende."
- **Modus `haftung`**: bleibt wie vorher.

`generate-contract.ts` laedt das Setting via `loadDepositMode()` und reicht es als `data.depositMode` ans PDF-Template.

### GWG-Pfad (Geringwertige Wirtschaftsgueter, Stand 2026-05-04)
Vermietzubehör/Werkzeug/Bueroequipment zwischen 250 und 800 EUR netto kann jetzt korrekt nach § 6 Abs. 2 EStG sofort abgeschrieben werden — UND erscheint trotzdem im Anlagenverzeichnis (Verzeichnis-Pflicht). Vorher landete sowas entweder als regulaeres Asset mit linear-AfA ueber 36 Monate (verschenkte Sofort-Steuerersparnis) oder als reine Expense (kein GWG-Verzeichnis).

- **Migration:** `supabase/supabase-purchase-items-gwg.sql` (idempotent) — erweitert den CHECK-Constraint von `purchase_items.classification` um `'gwg'`. Ohne Migration schlaegt der GWG-Save mit constraint-violation fehl, andere Pfade laufen unveraendert.
- **Backend:** `PATCH /api/admin/purchase-items/[id]` akzeptiert jetzt `classification: 'gwg'` zusaetzlich zu asset/expense/ignored. Bei GWG werden in einem Zug **zwei** Eintraege angelegt:
  - `expenses`-Row mit `category='asset_purchase'`, vollem Brutto-/Nettobetrag — kommt direkt in die EÜR als Aufwand des Anschaffungsjahres
  - `assets`-Row mit `depreciation_method='immediate'`, `useful_life_months=0`, `residual_value=0`, `current_value=0`, `last_depreciation_at=Kaufdatum` — fuer das gesetzlich vorgeschriebene Verzeichnis
  - `expense.asset_id` zeigt auf das Asset (Backlink), `purchase_items.asset_id` + `purchase_items.expense_id` beide gesetzt
  - Optional `create_unit + product_id + serial_number` legt analog zum Asset-Pfad eine `product_units`-Row an
  - Audit-Log: `purchase_item.classify_gwg`
- **Re-Klassifizierung** (jemand schaltet GWG -> asset oder expense): das bestehende Cleanup im Route-Top trennt Asset-Verknuepfung + loescht Expense-Eintrag. Das Asset bleibt als orphan im Verzeichnis und kann manuell unter `/admin/anlagen` weggeraeumt werden.
- **KI-Prompt** (`lib/ai/invoice-extract.ts`): Klassifikations-Regeln auf gesetzliche Schwellen umgestellt (< 250 EUR netto = expense, 250-800 EUR netto = gwg, > 800 EUR netto = asset). Vermietkameras (`kind=rental_camera`) bleiben **immer** asset, auch unter 800 EUR — wegen Inventur und Mietvertrags-Bezug. `InvoiceClassification`-Typ um `'gwg'` erweitert.
- **UI Klassifizier-Step** (`/admin/einkauf/upload`): Vierter Button „GWG (sofort)" (amber) zwischen „Anlagegut" und „Ausgabe". Bei Aktivierung: Felder wie Asset (kind, name, serial, optional product), aber **ohne** Nutzungsdauer/Restwert (Backend setzt hart auf 0/immediate). Amber Hinweisbox erklaert die Buchung. Plausibilitaets-Warnung wenn Netto > 800 EUR (zu teuer fuer GWG) oder < 250 EUR (Ausgabe wuerde reichen).
- **Client-Side Auto-Vorschlag**: Wenn die KI noch nicht GWG kennt (alte Antwort), aber `suggested='asset'` und Netto in 250-800 EUR liegt, wird der Default-Draft auf `gwg` gesetzt. Greift sofort nach Deploy, ohne dass die KI das gelernt haben muss.
- **Anlagenverzeichnis** (`/admin/anlagen`): Neuer Filter „AfA-Methode" (Linear / GWG / Keine), neue KPI-Karte „Davon GWG (sofort)" mit Anzahl + Anschaffungssumme (klickbar als Filter-Toggle), amber **GWG-Badge** neben dem Art-Badge in der Tabellen-Zeile.
- **Auswirkung auf Mietvertrag-Wiederbeschaffungswert:** Bei GWG ist `asset.current_value = 0` ab Tag 1. Der Vertrag-Floor `Math.max(asset.current_value, deposit)` zieht damit **immer die Kaution** als Wiederbeschaffungswert. Fuer Vermietzubehör ist das ohnehin egal (Vertrag nutzt `accessories.replacement_value` direkt). Fuer GWG-Kameras (selten — meist > 800 EUR) bedeutet das: Schadenersatz im Vertrag = Kaution, nicht aktueller Marktwert. Wer hoeheren Schadenersatz will, sollte die Kamera als asset mit linear klassifizieren.
- **Bestand**: Existierende `expenses` mit `category='asset_purchase'` werden NICHT automatisch konvertiert. Wer den Altbestand ins Verzeichnis ziehen will, muss sie unter `/admin/anlagen/nachtragen` manuell als Asset mit `depreciation_method='immediate'` anlegen (oder ein einmaliges Migrations-Script schreiben — nicht im Default-Build).

### Multi-File-Belege (Stand 2026-05-04)
Pro Einkauf koennen jetzt mehrere Belege hinterlegt werden — Rechnung, Quittung, Lieferschein, Sonstiges. Greift sowohl im manuellen als auch im KI-Workflow.
- **Tabelle `purchase_attachments`** (Migration `supabase/supabase-purchase-attachments.sql`, idempotent): id, purchase_id FK CASCADE, storage_path, filename, mime_type, size_bytes, kind (`invoice|receipt|delivery_note|other`), created_at. Service-Role-only RLS. Bucket `purchase-invoices` wird wiederverwendet, neue Files landen unter `YYYY/MM/<uuid>.<ext>` in Berlin-Zeit.
- **APIs:** `GET /api/admin/purchase-attachments?purchase_id=...`, `POST /api/admin/purchase-attachments` (multipart, max 10 Files á 20 MB, optional `kinds` als JSON-Array), `DELETE /api/admin/purchase-attachments/[id]` (Storage + DB-Row). Magic-Byte-Check via `detectFileType` (PDF/JPG/PNG/WebP). Permission `finanzen` in der Middleware.
- **GET `/api/admin/purchases`** liefert pro Einkauf jetzt zusaetzlich `attachments[]` (Bulk-Load + Memory-Map, defensiver Fallback bei fehlender Tabelle).
- **POST `/api/admin/purchases/upload`** (KI) traegt den Hauptbeleg parallel zu `purchases.invoice_storage_path` auch in `purchase_attachments` mit `kind='invoice'` ein, damit Anhaenge-Liste und Belege-Liste an einer Stelle leben. Defensiv: Fehler beim Insert wird stumm geloggt, wenn die Migration noch nicht durch ist.
- **UI manueller Einkauf** (`/admin/einkauf` → "+ Manuell"): Drag&Drop-Zone "Belege" mit `multiple`, pro Datei Dropdown fuer den Belegtyp (Default `Quittung`). Upload erst beim Speichern. Beim Abbrechen wird die Pending-Liste verworfen (keine Storage-Leichen).
- **UI KI-Upload** (`/admin/einkauf/upload`): File-Picker auf `multiple`, erste Datei = Hauptrechnung (KI-Analyse, immer `kind='invoice'`, Dropdown disabled), restliche Dateien = Anhaenge ohne KI (Default `kind='receipt'`). Nach erfolgreichem KI-Run werden die Extras im selben Request an `/api/admin/purchase-attachments` mit der frisch erzeugten `purchase_id` gehaengt. Status-Banner im Classify-Step zeigt Erfolg/Fehler der Zusatz-Uploads.
- **PurchaseRow-Detail** (`/admin/einkauf` aufgeklappt): Neue "Belege"-Section listet alle Anhaenge mit `kind`-Badge (farbcodiert: Rechnung cyan, Quittung gruen, Lieferschein lila, Sonstiges grau), Download-Link via `/api/admin/invoices/purchase-pdf?path=...`, Loeschen-Button. Drop-Zone darunter erlaubt das Nachladen weiterer Belege ohne Re-Analyse.
- **Audit-Log:** `purchase.attach_files` (POST mit Count + Kinds), `purchase.detach_file` (DELETE mit kind + storage_path).

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

### Buchhaltungs-Audit + Daten-/Berlin-TZ-/Race-Fixes (Stand 2026-05-15)
Vier parallele Spezialisten-Audits (Einnahmen, Ausgaben/Belege, Anlagen/AfA/WBW, Reports/DATEV/Cockpit) auf der Buchhaltungs-Welt. 11 echte Bugs verifiziert (Zeilen-Refs gepruft, halluzinierte Findings rausgefiltert) und alle direkt gefixt.

**Daten-Korrektheit (Geld-/GoBD-relevant):**
- **KI-Vorschlag 'verbrauch' wurde verschluckt** (`lib/ai/klassifiziere-positionen.ts` definiert 5 Werte; DB-CHECK kannte nur 4) — Migration `supabase-beleg-positionen-verbrauch.sql` am 2026-05-15 ausgefuehrt. Plus defensiver Fallback-Helper `insertPositionWithVerbrauchFallback` + `updatePositionWithVerbrauchFallback` in `lib/buchhaltung/beleg-utils.ts`: bei Constraint-23514 wird auf 'ausgabe' gewechselt + Hinweis in `notes`. Bleibt als Defense-in-Depth fuer kuenftige Schema-Verschiebungen drin. Eingebaut in `/api/admin/beleg-positionen` POST + PATCH.
- **Revenue-List-CSV-Export ohne is_test-Filter** (`buchhaltung/reports/revenue-list/export/route.ts:22`) — Test-Buchungen leakten in den Buchhaltungsbericht. `.eq('is_test', false)` ergaenzt.
- **DATEV-Export hartcodierte Konten** (`datev-export/route.ts:38-41`: 8400/1590/3800) — Buchhalter-Kontoaenderungen unter `admin_settings.kontenrahmen_mapping` (Sweep 6) wurden ignoriert. Jetzt nutzt der Export `loadKontenrahmen()` + `accountForBestand()`. `admin_config.datev_config` (Beraternummer/Mandantennummer) hat weiterhin Vorrang.
- **DATEV AfA-Datum Dead Code** (Z. 282 `expDate` als TT.MM+YYYY berechnet, aber Z. 289 nutzt direkt `slice(8,10)+slice(5,7)` und `void expDate` markiert es als tot) — auf konsistenten `formatDateDATEV()`-Helper umgestellt.
- **USt-Voranmeldung im Klein-Modus erfand "negative Zahllast"** (`reports/ust-vorbereitung/route.ts`): Vorsteuer aus Lieferanten-Rechnungen wurde im Kleinunternehmer-Modus weiter abgezogen (`zahllast = 0 - vorsteuer = -X EUR` als vermeintliche Erstattung — § 19 UStG schliesst Vorsteuerabzug aus). Jetzt: harter Early-Return mit `ust19=0, vorsteuer=0, zahllast=0` + Hinweis fuer die UI. Umsatz wird weiter zur § 19-Grenzbeobachtung gezeigt.
- **Festschreibung ohne Asset-Gen-Fehler-Notification** (`belege/[id]/festschreiben/route.ts`) — wenn `erzeugeAssetsFuerBeleg` fehlschlug, blieb `auto_gen_error` nur im Response. Jetzt zusaetzlich `payment_failed`-Admin-Notification mit Link zum Beleg, damit der Admin den Re-Generate-Button findet.

**Berlin-Timezone-Sweep (11 Stellen):**
Vorher schickten alle Reports `${from}T00:00:00` ohne TZ-Suffix an Postgres. Auf dem Hetzner-UTC-Server interpretierte die DB das als UTC-Mitternacht — eine Buchung am 01.01. 00:30 Berlin (= 31.12. 23:30 UTC) landete dann ausserhalb des Januar-Filters. Alle 11 Stellen nutzen jetzt `getBerlinDayStartFromDateString()` / `getBerlinDayEndFromDateString()`:
  - `reports/euer/route.ts`
  - `reports/ust-vorbereitung/route.ts`
  - `reports/revenue-list/export/route.ts` (war is_test-Bug, plus Date-Filter wurde direkt mitgefixt)
  - `dashboard/route.ts` (2× — current + previous Period)
  - `period-close/route.ts`
  - `stripe-reconciliation/route.ts` (2×)
  - `stripe-reconciliation/export/route.ts`
  - `stripe-reconciliation/import-fees/route.ts`
  - `stripe-reconciliation/sync/route.ts` (Stripe-Unix-TS aus Berlin-Datum)
  - `datev-export/route.ts`
  - `datev-export/preview-rows/route.ts`

**Race-Conditions / atomare Status-Flips:**
- **Manuelle Mahnung-Erstellung** (`buchhaltung/dunning/route.ts`): vorher Insert → UPDATE invoice ohne Guard → eine parallel laufende `mark-paid` konnte die bezahlte Rechnung wieder auf `overdue` ziehen, plus eine Mahnung zu einer bezahlten Rechnung wurde angelegt. Jetzt: zuerst pre-Check `payment_status === 'paid'` → atomarer UPDATE mit `.eq('status', invoice.status).eq('payment_status', invoice.payment_status)` als Guard → bei Race 409, Insert nur wenn Flip erfolgreich. Bei Insert-Fehler Rollback des Status. Plus: Frist-Berechnung umgestellt auf `getBerlinDateString(now+7d)` — vorher konnte `toISOString().split('T')[0]` auf UTC-Server die Frist um 1 Tag versetzen.
- **Cron `dunning-check`**: gleiches Pattern wie manuelle Mahnung — atomarer Status-Flip ZUERST, dann Insert, bei Insert-Fehler Rollback. Plus: Status-Filter umgestellt von `or(status.in.(open,overdue), payment_status.in.(open,overdue))` auf strikte AND-Variante (`neq('payment_status','paid').neq('status','paid').neq('status','cancelled')`), damit bezahlte Rechnungen nicht mehr in der Mahn-Schleife landen.

**Filter-Defense-in-Depth:**
- **Open-Items-Filter** (`buchhaltung/open-items/route.ts:17`) zeigte bezahlte Rechnungen, wenn `status` oder `payment_status` nicht synchron auf `'paid'` waren (manueller DB-Edit oder Race). Jetzt: AND-Filter statt OR.

**Cockpit:**
- **Monatsabschluss-Erinnerung Day-of-Month-Bug** (`cockpit/route.ts:138`): Comment sagte "nach dem 5.", Code prueft `>= 1` (immer wahr). Korrigiert auf `>= 5`. Vorher warnte das Cockpit am 02.03. zur Februar-Closure, bevor noch alle Februar-Eingangsbelege erfasst waren.

**Aufgeräumt (Stand 2026-05-17):** Die alte `app/api/admin/buchhaltung-neu/euer/route.ts` (Refactor-Zombie, vom UI nie aufgerufen) wurde gelöscht — inkl. der jetzt toten `/api/admin/buchhaltung-neu`-Permission-Zeile in `middleware.ts`. Beseitigt nebenbei 6 vorbestehende tsc-Fehler aus dieser Datei.

### Statistik-Audit + Daten-/Filter-Fixes (Stand 2026-05-15)
Tiefen-Audit der Statistik-Seite (`/admin/analytics` + `/api/admin/analytics`) — sechs echte Daten- und Filter-Bugs gefixt, plus Reliability:

- **Funnel "Buchung gestartet" matchte zu viel:** vorher `path.includes('/buchen')` — matchte auch `/konto/buchungen` (Endkundenkonto-Liste) → zu hohe Anzahl gestarteter Buchungen. Neuer Helper `isBookingWizardPath()` matcht strikt auf `^/kameras/<slug>/buchen`. Plus: "Produkt angesehen" filtert jetzt Wizard-Pfade raus, sonst doppelt gezählt.
- **Funnel-Stufe 5 konnte > 100% anzeigen:** Stufen 1-4 zählen Sessions, Stufe 5 zählt Bookings (Entitäten). Wenn ein Direktkunde ohne Cookie-Zustimmung bucht, gibt es Bookings ohne Sessions → pct > 100%. Cap auf 100% + Tooltip-Hinweis ergänzt.
- **Live-`range=month` UTC-Monatsanfang statt Berlin:** inkonsistent zum Rest. Neue Helper `getBerlinMonthStartISO()` + `getBerlinYearStartISO()` in `lib/timezone.ts`.
- **Customer-Doppelzählung user_id vs email:** vorher `key = user_id ?? customer_email` — gleicher Kunde wurde 2× gezählt, wenn er erst als Gast bucht und später ein Konto anlegt. Jetzt: E-Mail (lowercase, trimmed) ist primärer Key, `user_id` nur Fallback.
- **Live-Tab Filter "Jahr"/"Custom" fielen still auf "Heute" zurück:** Label sagte "Jahr" → Daten waren Heute. UI mappt jetzt 1:1 auf API-`range=year|custom` mit `from`/`to`-Parametern. Bei unvollständigem Custom (kein from/to) wird der Fetch unterdrückt + amber Hinweis-Text.
- **Bookings/Customers/Blog-Tab ignorierten Filter:** Cache-Guards in `fetchBookings`/`fetchTraffic` haben Refetch bei Filter-Änderung verhindert + API-Calls hatten keinen Range-Parameter (hardcoded 30d). Neuer zentraler Range-Helper `lib/analytics-range.ts` mit `parseAnalyticsRange(req)` + `applyRange(query, parsed)` — alle 9 API-Branches (live/today/history/funnel/customers/products/traffic/bookings/blog) nutzen ihn jetzt einheitlich. Cache-Guards entfernt, alle Tabs reloaden bei Filter-Wechsel.
- **Auslastung jetzt Range-aware:** vorher hardcoded `booking.days / 30 * 100`. Bei Jahr/Custom war die Auslastung unsinnig. Jetzt: `booking.days / parsed.days * 100` mit `parsed.days` aus dem Range-Helper.
- **Top-Pages "Heute" hardcoded:** Label sagte "Heute" egal welcher Filter aktiv. Jetzt dynamisch.
- **Alle Tab-Labels "30 Tage" hardcoded:** Traffic-Quellen, Geräte-Verteilung, Browser, Kamera-Performance, Buchungstrichter, Buchungen heute, Umsatz heute → alle nutzen jetzt `getTimeRangeLabel(filters.timeRange)`.
- **Reliability:** alle `fetch()`-Calls in der Page nutzen jetzt einen `safeFetch<T>()`-Helper mit try/catch + HTTP-Status-Check. Vorher zeigte die UI bei API-Fehler ewig "Laden..." ohne Fehler-Anzeige.
- **Top-Pages defensiv:** `isTrackablePagePath()` filtert `/admin` + `/api`-Pfade raus — die werden zwar ohnehin nicht getrackt (PageTracker-Skip), aber als Defense-in-Depth.
- **Dateien:** `lib/timezone.ts` (4 neue Helper), `lib/analytics-range.ts` (neu), `app/api/admin/analytics/route.ts` (komplett refaktoriert), `app/admin/analytics/page.tsx` (Filter-Pipeline + Labels + safeFetch).

### Analytics-Self-Exclude für Admin (Stand 2026-05-07)
Admin-Test-Besuche der Live-Seite verfälschten die Analytics. Toggle in `/admin/einstellungen` (Sektion 10 „Eigene Besuche aus Analytics ausschließen") setzt pro Browser/Gerät zwei Marker, die das Tracking unterdrücken — Schalter halt 1 Jahr.
- **Marker:** localStorage `cam2rent_no_track='1'` + Cookie `cam2rent_no_track=1; max-age=1y; samesite=lax`. Beide werden client-seitig von der Komponente gesetzt/gelöscht.
- **Client-Skip:** `components/PageTracker.tsx` — zusätzlicher Check direkt nach dem Consent-Check. Kein Network-Call, spart sogar Bandbreite.
- **Server-Skip:** `app/api/track/route.ts` — Cookie-Check vor DB-Insert; Response `{ ok: true, skipped: 'admin' }`. Schützt auch wenn localStorage manipuliert wurde oder Tracking via anderem Endpoint läuft.
- **UI:** `components/admin/AnalyticsOptOutSection.tsx` — Toggle-Switch. Pro Browser einmalig zu aktivieren (Hinweis im UI). Bei Cache-/Cookie-Löschung muss erneut aktiviert werden.
- **Was nicht passiert:** Bestehende Datensätze in `page_views` werden NICHT rückwirkend gefiltert — nur neue Besuche ab Aktivierung werden ausgeschlossen.

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

### Security-Audit-Fixes (2026-05-07 Sweep 9 — Verifikation + Lueckenschluss)
Neunter Audit-Sweep mit acht parallelen Spezialisten-Agents (TLS, Auth, Authorization, Payment, Upload/SSRF, XSS, Webhook/Cron, DSGVO/Frontend). Alle Sweep-8-Fixes verifiziert (alle ~80 halten), zusaetzlich ~50 Findings entdeckt und gefixt — diesmal vor allem Defense-in-Depth + uebersehene Pfade.

**KRITISCH:**
- **K1 create-pending-booking ohne Coupon-Validation:** `discountAmount`/`productDiscount`/`durationDiscount`/`loyaltyDiscount` flossen ungeprueft aus dem Body in die DB. Im verificationDeferred-Modus konnte ein Angreifer beliebige Werte einreichen → Stripe-Payment-Link mit `unit_amount=0`. Jetzt: Coupon ueber `coupons`-Lookup validiert (active/valid_until/min_order_value), andere Discount-Felder mit `Math.max(0,...)`.

**HOCH:**
- **kunden/blacklist Owner-Schutz** + Self-Block-Verbot.
- **employees DELETE Owner-Schutz** (PATCH hatte den schon, DELETE nicht).
- **UGC-Approve Reorder:** Status-Flip ZUERST, dann Coupon (analog Feature-Endpoint Sweep 8). Vorher konnte Doppelklick zwei UGC-Coupons in DB erzeugen.
- **daily-report Cron-Lock** (war im Sweep-8-Lock-Sweep uebersehen).
- **verification-auto-cancel + confirm-extension Refund-Failure-Tracking:** `refund_status='failed_pending_admin'` + Admin-Notification analog cancel-booking Sweep 7 #24.
- **payment-link-email kompletter Escape-Sweep:** alle User-/DB-Variablen + BUSINESS-Felder mit `escapeHtml`, Subject mit `stripSubject`. Sweep 8 H1-Audit hatte das dokumentiert aber nicht gefixt.
- **email-template-overrides normalize() Sanitizer:** Read-Pfad ruft jetzt `sanitizeIntroHtml` + Subject-CRLF-Strip auf. Vorher konnten direkte DB-Manipulationen `<script>` in Customer-Mails einschleusen.
- **shop-content cta_link Validation:** `isAllowedNotificationLink`-Check verhindert `javascript:`/Phishing-URLs im Hero-CTA.
- **PostgREST `.or()`-Sanitizer in 3 Routen** (`inventar`, `belege`, `scan-lookup`) — verhindert Filter-Injection bei Such-Strings.
- **EUeR-CSV escapeCsvField:** Excel-Formula-Injection (`=cmd|...`) in Vendor-/Description-Feldern geschlossen.
- **damage_resolution Subject mit stripSubject** (Sweep 7 #16-Notiz hatte das versprochen, aber nur review_request gefixt).
- **DSGVO-Cleanup-Cron H2-Bug:** Postgres `< cutoff` matcht NULL nie → pending/rejected Profile blieben fuer immer im Storage. Jetzt: 3 Branches (verified=90d, rejected=sofort, pending=30d).
- **anonymize-customer audit-log Anonymize:** `admin_audit_log.details` fuer Buchungs-IDs + Customer-Eintraege werden auf `{anonymized:true}` ueberschrieben (DSGVO Art. 17 vollstaendig).
- **Booking-DELETE Storage-Cleanup:** damage-photos, packing-photos, handover-photos werden mit-geloescht (analog anonymize-customer K12).
- **/api/admin/damage-photo-url (NEU):** Signed-URL-Endpoint fuer privat-Bucket-Workflow (Admin-UI nutzt zukuenftig statt `getPublicUrl()`).
- **Google-Reviews Legacy-Key in Header:** vorher `?key=...` → Outbound-Logs.
- **downloadToFile Allowlist-Check** in Reels-Render: Defense-in-Depth gegen Pre-Sweep-7-Music-Rows mit beliebigen URLs.
- **packlist + admin/legal/pdf Cache-Control:** Sweep 8 H4 hatte 4 PDF-Routen gefixt — diese 2 wurden uebersehen.
- **`x-forwarded-host` Allowlist** in `auth/callback` + `social/oauth`: Account-Takeover via Phishing-Header-Spoofing geschlossen.
- **lib/meta/publisher.ts auf zentralisierte URL-Allowlist** (loeschte lokale Kopie ohne Cloud-Metadata-Block).
- **2fa/confirm Rate-Limit** (5/h pro Owner): Setup-Spam + Brute-Force bei gestohlenem Cookie geschlossen.
- **Login Per-Account-Lockout:** zweiter Bucket (10/h pro loginIdentifier) gegen distributed Brute-Force.
- **lib/audit.ts Forensik + Critical-Action-Notification:** UA wird mit-geloggt; bei DB-Outage und kritischer Aktion (delete/anonymize/env_mode/period/blacklist) wird zusaetzlich `payment_failed`-Notification erzeugt — Audit-Outages werden nicht mehr stillschweigend geschluckt.
- **cancel-booking Promise.allSettled** statt `Promise.all` (analog Webhook Sweep 8 K1).

**MEDIUM:**
- ResetConsentButton loescht jetzt auch `cam2rent_vid` + `cam2rent_sid` (DSGVO Art. 7 Abs. 3).
- Datenschutzerklaerung neue Sektion 8a "Frontend-Fehlerprotokoll" — beschreibt `client_errors`-Tabelle (IP+UA+URL+Stack, 30d Retention).
- HSTS mit `preload` + max-age 2 Jahre. Permissions-Policy erweitert um geolocation=() + Sensoren + interest-cohort/browsing-topics-Block.
- email_log-Cleanup mit `setMonth(-24)` statt 24*30 Tage.
- QrDownloadButton: filename mit `esc()` (war pre-Sweep ungeschuetzt).
- NotificationDropdown client-side `isSafe`-Pruefung fuer Pre-Sweep-8-Legacy-Notification-Links.
- `productDiscount`/`durationDiscount`/`loyaltyDiscount` in `confirm-cart` aus Body auf 30%-des-Subtotal gecapt + >= 0.
- Stripe-Webhook `Math.max(0, ...)` auf alle parseFloat-Preis-Komponenten gegen negative Body-Werte.
- `/api/validate-coupon` Rueckgabe auf safe-Felder beschraenkt (kein `target_user_email`-Leak mehr).

**Sweep 8 hielt vollstaendig:** Alle 80 Sweep-8-Fixes wurden durch parallele Audit-Agents bestaetigt — keine Regressionen.

### Security-Audit-Fixes (2026-05-07 Sweep 8 — Tiefen-Audit + alle Fixes)
Achter Audit-Sweep mit acht parallelen Spezialisten-Agents (TLS/Verschluesselung, Auth/Session/Crypto, Authorization/IDOR, Payment/Stripe, Upload/SSRF/Storage, XSS/Injection/E-Mail, DSGVO/Headers/Logs, Webhook/Cron/Race, Frontend/Client). Sweep 5+6+7 wurden alle verifiziert und halten. Diesmal kein "nur Bericht" — **alle ~80 Findings direkt auf master gefixt** (12 Commit-Batches).

**KRITISCH (gefixt):**
- **K1 fehlende API-Permissions** in `middleware.ts` — `/api/admin/anlagen-neu`, `/ausgaben`, `/buchhaltung-neu`, `/wiederbeschaffung` waren ohne Mapping. UI-Pfade `/admin/inventar`, `/scan`, `/kunden-uebersicht`, `/tagesgeschaeft` ergaenzt.
- **K2 oeffentliche APIs anonym aufrufbar:** `PUT /api/shop-content` (Hero/CTA setzbar), `POST/PATCH/DELETE /api/sets` (Set-Preise auf 1ct), `GET/DELETE /api/beta-feedback` (PII-Leak) — alle drei mit `checkAdminAuth()` geschuetzt, beta-feedback POST mit Rate-Limit 5/h.
- **K3 cron/auto-cancel Race:** atomarer Bulk-UPDATE mit Status-Guard + Cron-Lock — verhindert Storno bezahlter Buchungen bei Webhook-Race.
- **K4 cron/reels-segment-cleanup + cron/afa-buchung Lock kaputt:** `if (!lock)` war immer falsch (lock = Objekt). Auf `!lock.acquired` korrigiert.
- **K5 Stored XSS in 5 Customer-Mails:** shipping confirmation, cron/auto-cancel, awaiting-payment-cancel, verification-reminder, verification-auto-cancel — alle Variablen mit `escapeHtml()` + Subject mit `stripSubject()`.
- **K6 Stored XSS in Admin-Druckansichten:** `/admin/buchungen/[id]` (Packliste, Übergabeprotokoll), `/admin/versand/page.tsx` (Pack-Druck), `/admin/buchungen/neu` (Rechnungsvorschau) — lokaler `esc()`-Helper an alle ~40 Interpolations-Stellen.
- **K7 JSON-LD-Breakout** in `app/blog/[slug]/page.tsx` — `<` + `>` + U+2028/U+2029 unicode-escapen, sonst kann Blog-Titel mit `</script>` aus dem JSON-LD-Block ausbrechen.
- **K8** siehe K2.
- **K9 Service-Worker `clients.openWindow`** ohne URL-Validierung — `safePushUrl()` validiert gegen Origin (relativ oder cam2rent.de), Fallback auf `/admin`.
- **K10 Meta-Token in Query-Parameter** statt Authorization-Header in `lib/meta/graph-api.ts` — Token landete sonst in Reverse-Proxy-Logs (60-Tage-Page-Token = praktisch never-expire).
- **K11 PageTracker ohne Opt-In** (DSGVO/§ 25 TTDSG-Verstoss) — auf `cam2rent_consent === 'all'` umgestellt, Default OFF.
- **K12 anonymize-customer ohne Storage-Cleanup** — Personalausweis-Scans + UGC-Files blieben fuer immer im Storage. Jetzt: vollstaendige Loeschung von `id-documents/{userId}/` + `customer-ugc/...`-Files. UGC-Rows -> `withdrawn`. Damage-Photos bleiben (booking-Pfad, GoBD-pflichtig).
- **K13 fehlender DSGVO-Cleanup-Cron** — Datenschutzerklaerung versprach 90-Tage-Loeschung, kein Cron existierte. Neuer `/api/cron/dsgvo-cleanup` (Ausweis-Scans 90d, page_views 90d, client_errors 30d, email_log ohne booking_id 24m).
- **K14 Google-Profilfotos** vor Cookie-Consent (analog Google-Fonts-Urteil LG Muenchen) — Initialen-Avatar als Fallback statt CDN-Bild.
- **K15 CN PATCH ohne Cap** — Sweep 7 #18 hatte nur POST gefixt, PATCH liess Mitarbeiter Gutschriften beliebig hochsetzen. Cap-Check gegen Originalrechnung minus aktive CNs.

**HOCH (gefixt):**
- **H1 confirm-booking 30%->50% Floor** (konsistent mit create-payment-intent Sweep 7 #10), Reviews productId-Match-Pruefung, UGC `consent_use_website` strikt (vorher OR-Filter mit Social).
- **H2 confirm-extension atomarer Idempotency-Guard** (.is('extension_payment_intent_id', null)). Push-Endpoint-Allowlist (4 Browser-Vendor-Hosts) in `/api/admin/push/subscribe` + `/api/customer-push/subscribe`. IDOR-Fixes in `/api/messages` (booking_id-Owner-Check), `/api/custom-sets` (userId aus Session).
- **H3 Admin-Cancel-Booking releast Deposit-Pre-Auth** (`stripe.paymentIntents.cancel`). cron/verification-auto-cancel mit Status-Guard + Pre-Check.
- **H4 PDFs ohne Cache-Control** — Rechnung + Vertrag mit `Cache-Control: private, no-store`.
- **H5 Survey-Token ohne Expiry** — neues Format `<timestamp>.<32-hex-hmac>`, 90-Tage-Ablauf.
- **H7 2FA-Disable Brute-Force** — Rate-Limit 10/h pro Owner-User-ID.
- **H8 Sendcloud-Credentials an attacker.com** — `isSendcloudUrl()` Allowlist in 3 Label-Routen.
- **H11 Open-Redirect** in `/login` + `/registrierung` — `safeRedirect()`-Helper (relativ + nicht `//` + kein `javascript:`).
- **H16 BUSINESS-Felder + Tracking-URL** im Mail-Versand (shipping) escaped.
- **5 Crons fehlten Cron-Lock** — `auto-cancel`, `blog-publish`, `reels-publish`, `depreciation`, `abandoned-cart`, `reminder-emails` ergaenzt (jetzt alle 11 Crons mit Lock).
- **Stripe-Webhook event.id-Dedupe** + atomarer Status-Flip im checkout.session.completed-Branch + Promise.allSettled in handleSingleBooking + explizite runtime/dynamic/maxDuration exports.
- **UGC-Feature atomar** (Status-Flip ZUERST, dann Coupon — verhindert Doppel-Bonus bei Doppelklick).

**MEDIUM (gefixt):**
- Magic-Byte-Check in `/api/admin/social/unsplash` POST + `/api/admin/seasonal-images/upload` Unsplash-Branch (vorher hartcodiert `image/jpeg`).
- Path-Traversal-Schutz in DELETE von `/api/product-images`, `/api/set-images`, `/api/admin/blog/media` (Format-Whitelist + `..` + Cross-Bucket-Block).
- Iframes in `/admin/emails/vorlagen` mit `sandbox=""` (analog Newsletter-Composer Sweep 7 #29).
- ctaUrl in `/api/seasonal-action` + `link` in `/api/admin/notifications/create` mit `isAllowedNotificationLink()`.
- ElevenLabs-Key wandert von Query in Body (POST) — landet nicht mehr in Access-Logs.
- `/api/cart/sync` userId+email aus Session (verhindert Spam-Vehikel).
- stripe-reconciliation/match: booking_id-Existenz-Pruefung vor UPDATE.

**Neue Libs/Helper:**
- `lib/url-allowlist.ts` erweitert um `isAllowedPushEndpoint`, `isAllowedNotificationLink`, `isSendcloudUrl`.
- `lib/survey-token.ts` neu mit Timestamp + 90d Expiry.

**Neuer Cron:** `/api/cron/dsgvo-cleanup` — Crontab: `30 3 * * * curl ... /api/cron/dsgvo-cleanup`.

**Datenschutzerklaerung:** Neue Sektion 7a mit 8 Sub-Processoren (Meta, OpenAI, Anthropic, ElevenLabs, Pexels, Pixabay, Unsplash, Google) — vorher fehlten alle (Verstoss Art. 13 Abs. 1 lit. e DSGVO).

**Sweep-7-Verifikation:** Alle 30 Sweep-7-Fixes weiterhin in Kraft (durch parallele Audit-Agents bestaetigt). Sweep-8-Findings wurden ZUSAETZLICH gefunden, nicht als Regression.

### Security-Audit-Fixes (2026-05-03 Sweep 7)
Siebter Audit-Sweep mit fuenf parallelen Spezialisten-Agents (Auth/Session, Payment/Stripe, Authorization/IDOR, Upload/SSRF, XSS/E-Mail) auf dem aktuellen Production-Stand. Sweep 5+6 wurden verifiziert — alle dortigen Fixes halten. 30 zusaetzliche Findings (8 KRITISCH, 10 HOCH, 12 MEDIUM), alle direkt auf master gefixt.

**KRITISCH (8):**
- **#1 employees PATCH Owner-Schutz** in `app/api/admin/employees/[id]/route.ts` — Vorher konnte ein Mitarbeiter mit `mitarbeiter_verwalten`-Permission das Passwort eines Owners zuruecksetzen oder sich selbst alle 9 Permissions vergeben. Jetzt: Nicht-Owner duerfen Owner-Accounts gar nicht aendern, und Self-Modify auf `permissions`/`role`/`is_active` ist fuer Nicht-Owner geblockt.
- **#2 2FA-Endpunkte Owner-only** in `app/api/admin/2fa/{setup,confirm,disable,status}/route.ts` — Sweep 6 hat `checkAdminAuth()` ergaenzt, aber jeder eingeloggte Mitarbeiter konnte das TOTP-Secret des Notfall-Owner-Logins ueberschreiben/loeschen. Jetzt: alle vier Endpoints `me.role === 'owner'`.
- **#3 customer-push/send Owner-only + URL-Allowlist** in `app/api/admin/customer-push/send/route.ts` — Mitarbeiter mit `preise`-Permission konnte Phishing-Pushes mit cam2rent-Branding an alle Endkunden schicken. Jetzt: Owner-only + URL muss relativ oder cam2rent.de sein.
- **#4 kunden/tester Owner-only** in `app/api/admin/kunden/tester/route.ts` — Mitarbeiter mit `kunden`-Permission konnte sich/Komplizen auf Tester setzen → Stripe wechselt auf Test-Keys → Gratis-Kameras. Jetzt: Owner-only.
- **#5 newsletter/send Live-Mode Owner-only** in `app/api/admin/newsletter/send/route.ts` — analog #3, aber fuer Newsletter (E-Mail an alle bestaetigten Abonnenten). Live-Versand jetzt Owner-only, Test-Versand bleibt fuer `preise`.
- **#6 SSRF + Key-Leak in `/api/admin/blog/images`** — Wortgleicher Bug zu Sweep-5-Fixes (`social/unsplash`, `seasonal-images/upload`), nur in einer dritten Datei uebersehen. Unsplash-Key wurde als Query-String an attacker-kontrollierte URL geschickt + SSRF auf interne Adressen moeglich. Jetzt: Allowlist via `lib/url-allowlist.ts` + Schluessel im Authorization-Header + Magic-Byte-Check.
- **#7 SSRF in reels/music** in `app/api/admin/reels/music/route.ts` — Content-Mitarbeiter konnte als Musik-URL `http://169.254.169.254/...` (AWS-Cloud-Metadata) eintragen. Jetzt: `isAllowedStockUrl()` aus `lib/url-allowlist.ts` (Pexels, Pixabay, Supabase, cam2rent.de). Plus Magic-Byte-Check fuer MP3-Uploads.
- **#8 weekly-report/test Empfaenger-Lock** in `app/api/admin/weekly-report/test/route.ts` — Mitarbeiter mit `berichte`-Permission konnte den vollen Wochenbericht (Umsatz, offene Rechnungen, Kundennamen + Adressen) an beliebige externe Adresse schicken. Jetzt: Mitarbeiter sind hart auf den konfigurierten Empfaenger gepinnt, nur Owner darf Body-`email` ueberschreiben.

**HOCH (10):**
- **#9 confirm-extension processing-Status** in `app/api/confirm-extension/route.ts` — Vorher wurde Stripe-Status `processing` (PayPal/SEPA-pending) als gleichwertig zu `succeeded` behandelt. Bei spaeterem Zahlungs-Fehlschlag blieb die Verlaengerung dauerhaft eingebucht ohne Geld. Jetzt: nur `succeeded` akzeptiert.
- **#10 create-payment-intent Plausibilitaetspruefung** in `app/api/create-payment-intent/route.ts` — `checkout-intent` hatte den Check (Cart-Flow), Single-Buchungen gingen aber ohne Plausibilitaetspruefung durch. Angreifer konnte 1 EUR statt 500 EUR via DOM-Manipulation zahlen. Jetzt: 50%-Floor gegen `calcPriceFromTable(product, days)`.
- **#11 awaiting-payment-cancel Status-Guard** in `app/api/cron/awaiting-payment-cancel/route.ts` — Race: Kunde zahlt 17:59:55, Webhook setzt `confirmed`, Cron um 18:00:00 ueberschreibt mit `cancelled`. Jetzt: atomarer UPDATE mit `eq('status','awaiting_payment')` + Status-Flip ZUERST, Payment-Link-Deaktivierung danach.
- **#12 Coupon-Floor active/valid_until/min_order_value** in `app/api/confirm-cart/route.ts` — Floor-Check nutzte nur `value/type`, abgelaufene/inaktive Coupons senkten den Floor → Buchung mit reduziertem Stripe-Betrag konnte durchgehen. Jetzt: vollstaendiger Coupon-Validity-Check vor Floor-Berechnung.
- **#13 Middleware Session-Lookup mit UA-Binding** in `middleware.ts` — Sweep 6 Vuln 15 hatte UA-Binding nur in `getUserBySession`. Die Middleware (90 % der Admin-Routen) hatte den Check nicht. Gestohlenes Cookie funktionierte weiter. Jetzt: `lookupSession()` vergleicht den UA des aktuellen Requests mit dem in `admin_sessions.user_agent` gespeicherten Wert + DELETE bei Mismatch.
- **#14 damage-report E-Mail-Fallback entfernt** in `app/api/damage-report/route.ts` — Sweep 6 Vuln 14 hatte den `customer_email`-Fallback in `meine-buchungen` entfernt; hier blieb er stehen. Express-Signup-Hijack via Schadensmeldung. Jetzt: nur `booking.user_id === user.id`.
- **#15 booking/[id]/pay E-Mail-Fallback entfernt** in `app/api/booking/[id]/pay/route.ts` — Gleiches Pattern wie #14, fuer Bezahllinks. Geldwaesche-Vehikel mit gestohlener Karte.
- **#16 Stored XSS in 7+ Mail-Templates** in `lib/email.ts` + `lib/customer-ugc.ts` — Sweep 5 hat Schadensmeldungs- und Nachrichten-Mails gegen HTML-Injection abgesichert. Sechs weitere Templates (`damage_resolution`, `referral_reward`, `extension_confirmation`, `review_request`, `abandoned_cart`, `verification_rejected`) plus alle drei UGC-Mails (approve/feature/reject) interpolierten `customerName`/`productName`/`reason` roh ins HTML. Plus: Subject-Spoofing via CRLF in `review_request` + `damage_resolution`. Jetzt: `escapeHtml()` an allen Stellen + neuer `stripSubject()`-Helper fuer CRLF-Schutz + 200-Zeichen-Cap.
- **#17 Schadens-Stripe-Captures atomar + idempotent** in `app/api/admin/damage/retain-deposit/route.ts` und `app/api/admin/accessory-damage/route.ts` — Doppelklick fuehrte zu doppelten DB-Schreibungen + Audit-Log-Duplikaten. Jetzt: atomarer Status-Flip `held → captured` mit Guard, dann Stripe-Capture mit `idempotencyKey: 'deposit-capture:${intentId}:${cents}'`. Bei Stripe-Fehler Status-Flip rueckgaengig fuer Retry.
- **#18 Credit-Note Cap gegen Originalrechnung** in `app/api/admin/buchhaltung/credit-notes/route.ts` + `[id]/approve/route.ts` — Mitarbeiter mit `finanzen`-Permission konnte 5000-EUR-Gutschrift auf 100-EUR-Rechnung anlegen. Stripe lehnte den Refund ab, aber Originalrechnung wurde trotzdem auf `cancelled` gesetzt → USt-Voranmeldung verzerrt. Jetzt: Pre-Check `requestedGross <= invoiceGross - SUM(active_cns)` beim Anlegen. Bei `refundStatus === 'failed'` bleibt Status auf `approved` statt `sent`, Originalrechnung NICHT cancelled, Admin-Notification `payment_failed` zum manuellen Handling.

**MEDIUM (12):**
- **#19 Magic-Byte-Check in 3 Upload-Routen** — `/api/admin/blog/upload`, `/api/admin/blog/media`, `/api/admin/reels/music`. Vorher reichte `file.type` (Client-MIME), beliebige Inhalte landeten als "image"/"audio" deklariert im public Bucket. Jetzt: `isAllowedImage(buffer, ['jpeg','png','webp'])` bzw. neuer `isAllowedAudio()` (`detectAudioType` in `lib/file-type-check.ts` ergaenzt: MP3, WAV, OGG, FLAC, M4A).
- **#20 Path-Traversal in `/api/accessory-images`** — Whitelist-Regex `/^[a-z0-9_-]{1,64}$/i` fuer `accessoryId`. DELETE prueft jetzt auch dass `path` mit `accessories/${accessoryId}/` beginnt — verhindert dass Mitarbeiter mit `katalog`-Permission fremde Produktbilder loescht.
- **#21 upload-id Content-Type aus Magic-Byte** in `app/api/upload-id/route.ts` — Trotz Magic-Byte-Check wurde der Content-Type aus `file.type` (Client-MIME) gesetzt. Polyglot-JPEG mit `text/html`-MIME wuerde beim Aufruf der Signed URL als HTML gerendert. Jetzt: `detectImageType(buffer)` liefert das echte Format → harter MIME + Extension.
- **#22 Login Timing-Channel** in `app/api/admin/login/route.ts` — Bei nicht-existentem User wurde scrypt nicht aufgerufen → ~50–100 ms Antwortzeit-Unterschied → Mitarbeiter-Konto-Enumeration. Jetzt: bei nicht-existentem User wird gegen einen Dummy-Hash verifiziert, damit die Latenz konstant bleibt.
- **#23 Express-Signup Display-Name nicht persistieren** in `app/api/auth/express-signup/route.ts` — Da `email_confirm: true` ohne Bestaetigung lief, konnte ein Angreifer ein Konto auf eine fremde E-Mail mit beleidigendem Vor-/Nachnamen anlegen. Spaetere Buchungen unter der Adresse wuerden den Angreifer-Namen tragen. Jetzt: `user_metadata = {}`, `profiles.full_name = null`, `address_* = null` — Profil wird erst beim ersten echten Login gefuellt.
- **#24 cancel-booking Refund-Fehler tracken + Notification** in `app/api/cancel-booking/route.ts` — Bei Stripe-Outage flippte Status auf `cancelled`, Refund schlug fehl, der Fehler wurde nur stumm geloggt. Kunde sah "Storno bestaetigt", merkt erst beim Kontoauszug. Jetzt: `bookings.refund_status = 'failed_pending_admin'` + Admin-Notification `payment_failed` mit Link zur Buchung.
- **#25 /api/survey HMAC-Token** in `app/api/survey/route.ts` + `lib/survey-token.ts` (neu) + `lib/reminder-emails.ts` + `app/umfrage/[bookingId]/page.tsx` — Buchungs-IDs sind enumerierbar (`C2R-YYWW-NNN`). Vorher konnte jeder anonyme User Spam-Reviews unter dem Namen echter Kunden einreichen + DANKE-Coupon-Mails an die echten Kunden ausloesen. Jetzt: HMAC-SHA256-Token im Survey-Link (`?t=...`), timing-safe-Vergleich im Endpoint, Token-Generierung in der Reminder-Mail.
- **#26 Analytics-CSV Formula-Escape** in `app/admin/analytics/page.tsx` — Sweep 6 hat das in 4 Buchhaltungs-Exports gefixt; der Analytics-CSV-Export (Client-seitig) wurde uebersehen. Vorher konnte Angreifer via Referrer-Header `=cmd|...`-Formel einschmuggeln, die in Excel beim Oeffnen ausgefuehrt wird. Neuer `csvEscape()`-Helper mit Apostroph-Praefix vor Formel-Triggern.
- **#27 Mahnungs-custom_text mit escapeHtml** in `app/api/admin/buchhaltung/dunning/route.ts` — Vorher unvollstaendiger Sanitizer (nur `<` und `>`, nicht `&`/`"`/`'`). Jetzt: zentraler `escapeHtml()` + `stripSubject()` fuer den Subject-Pfad.
- **#28 Newsletter + UGC BUSINESS-Felder escapen** in `lib/newsletter.ts` + `lib/customer-ugc.ts` — `BUSINESS.url`, `addressLine`, `name` werden roh interpoliert und stammen aus `admin_settings.business_config` (system-Permission). Mitarbeiter mit System-Permission konnte versehentlich/boeswillig Phishing-Links in jeden Newsletter-Footer einbauen. Jetzt: alle BUSINESS-Felder mit `escapeHtml()` umkleidet.
- **#29 Newsletter-Composer iframe sandbox** in `app/admin/newsletter/page.tsx` — Same-Origin-iframe rendete User-HTML 1:1 mit `srcDoc`. Eingefuegte `<script>`-Tags liefen im Admin-Origin und konnten `document.cookie` etc. lesen. Jetzt: leeres `sandbox=""` (alle Restrictions aktiv: kein Skript, kein same-origin, keine Forms).

**Neue Libs:**
- `lib/url-allowlist.ts` — Zentrale `isAllowedImageSourceUrl`, `isAllowedStockUrl`, `isUnsplashUrl` mit RFC1918/Loopback/Cloud-Metadata-Block. Wiederverwendet aus `lib/meta/publisher.ts isAllowedSourceUrl` (Sweep 5).
- `lib/survey-token.ts` — HMAC-SHA256-Token-Generation/Verifikation fuer den Survey-Endpoint.
- `lib/file-type-check.ts` erweitert um `detectAudioType()` + `isAllowedAudio()` (MP3, WAV, OGG, FLAC, M4A).
- `lib/email.ts` neuer Export `stripSubject()` fuer CRLF-Schutz im Mail-Subject.

**Sweep-7-Go-Live-TODO:**
- Bestehende Admin-Sessions invalidieren nach Deploy: `DELETE FROM admin_sessions;` — der UA-Binding-Schutz greift erst, sobald `user_agent` fuer alle aktiven Sessions gesetzt ist.
- ENV-Variable `SURVEY_HMAC_SECRET` (32+ Zeichen Random) in Coolify hinterlegen — sonst faellt die Survey-Token-Erzeugung auf `ADMIN_PASSWORD` als Secret zurueck (funktioniert, aber separates Secret ist sauberer).

### Security-Audit-Fixes (2026-05-03 Sweep 6 — Tiefen-Audit)
Zweite Audit-Runde am gleichen Tag mit fuenf parallelen Spezialisten-Agents (Sweep-5-Verifikation, Stripe/Payment, Authorization, Customer-Auth, Less-common-Surfaces). 20 zusaetzliche Findings mit Konfidenz ≥ 8 — alle gefixt direkt auf master. Sweep-5-Fixes wurden unabhaengig verifiziert: alle 15 halten.

**KRITISCH (3):**
- **`profiles` RLS Spalten-Level-GRANT (HIGH)** — Migration `supabase/supabase-profiles-rls-column-level.sql`. Alte Policy `users_update_own_profile` hatte kein `WITH CHECK` und keinen Spalten-GRANT — Kunde konnte aus dem Browser via `supabase.from('profiles').update({...})` `verification_status='verified'`, `blacklisted=false`, `is_tester=true` setzen. Letzteres schaltet sogar auf Stripe-Test-Keys um. Migration: REVOKE UPDATE, dann GRANT UPDATE nur auf (full_name, phone, address_*, updated_at). Sensible Felder gehen ab jetzt nur ueber service-role-API.
- **2FA-Endpunkte unauthentifiziert (HIGH)** in `app/api/admin/2fa/{setup,confirm,disable,status}/route.ts` — kein einziger Endpunkt rief `checkAdminAuth()`. Anonymer Angreifer konnte das gespeicherte TOTP-Secret in `admin_settings.totp_secret` ueberschreiben oder loeschen. Zwei Calls reichten, um den Owner-Authenticator zu zerstoeren. Alle vier mit Auth-Check ergaenzt.
- **CSV-Formula-Injection in DATEV/Buchhaltung-Exporten (HIGH, CWE-1236)** — `escapeField` im DATEV-Export entwertete nur `;`/`"`/`\n`, drei weitere Buchhaltungs-Exporter (`invoices/export`, `revenue-list/export`, `stripe-reconciliation/export`) hatten gar kein Escape. Angreifer konnte `customerName='=HYPERLINK(...)'` setzen → Excel/Google-Sheets feuert die Formel beim Oeffnen, exfiltriert Belegnummern/Betraege. Neuer zentraler Helper `lib/csv.ts` mit `escapeCsvField` + `buildCsvRow` + `buildCsv`. Setzt einen Apostroph vor Zellen, die mit `=`/`+`/`-`/`@`/TAB/CR beginnen.

**HIGH (13):**
- **`checkout-intent` + `create-payment-intent` userId aus Session pinnen** — beide Routen lasen `userId` aus dem Body, prueften damit `profiles.blacklisted` / `verification_status` und schrieben den Wert in `metadata.user_id`. Sweep-5-Cross-Check in `confirm-cart` verglich nur Body gegen Metadata — beide aus derselben unauthentifizierten Quelle. Jetzt: `cookies() + supabaseAuth.auth.getUser()` ist die alleinige Quelle, Body-userId muss matchen oder 403.
- **Express-Signup Account-Pre-Claim (HIGH)** — `email_confirm: true` ohne Bestaetigung erlaubte einem Angreifer, ein Konto fuer eine fremde E-Mail anzulegen. Kombiniert mit dem `meine-buchungen`-E-Mail-Fallback und `claim-guest-bookings` ergab sich ein One-Shot-Hijack aller Gastbuchungen unter dieser E-Mail. Fix-Kombination: (a) Express-Signup schickt jetzt eine Sicherheits-Warnmail an die Adresse („Konto erstellt — wenn das nicht du warst, kontaktiere uns sofort"), (b) der E-Mail-Fallback in `meine-buchungen` wurde entfernt, (c) `claim-guest-bookings` ist auf no-op zurueckgebaut. Gastbuchungen muessen ab sofort vom Admin manuell zugewiesen werden.
- **Stripe-Refunds idempotencyKey ueberall** — vier Routen (cancel-booking, confirm-extension, verification-auto-cancel, credit-notes/approve) feuerten `stripe.refunds.create` ohne idempotencyKey. Browser-Doppelklick / Network-Retry / Cron-Lock-Stale konnten Doppel-Refunds erzeugen. Jeder Aufruf bekommt jetzt einen sprechenden Key (`cancel-refund:${id}`, `cn-refund:${id}`, `extension-refund:${pi}`, `verif-auto-cancel:${id}`).
- **Credit-Note approve atomar (HIGH)** in `credit-notes/[id]/approve` — TOCTOU-Race: pruefte `status==='pending_review'`, dann UPDATE ohne Status-Guard. Doppel-Klick = doppelter Stripe-Refund = bei einer 500-EUR-Gutschrift 500 EUR Schaden. UPDATE atomar mit `.eq('status','pending_review').select('id').maybeSingle()`. Bei 0 Rows → 409.
- **`cancel-booking` Status-Flip ZUERST** — Reihenfolge war Refund → Status. Zwei parallele Self-Service-Storno-Anfragen passierten beide den Cancellation-Check, beide refundeten. Jetzt: atomarer Status-Flip mit `in('status', ['confirmed','shipped'])`-Guard, dann erst Refund mit idempotencyKey. Bei Race → 409. Plus: MANUAL-Payment-Intents (`MANUAL-...`) skippen den Stripe-Refund-Aufruf.
- **70%-Plausibilitaets-Floor enger ziehen (HIGH)** — sowohl `checkout-intent` als auch `confirm-cart` hatten einen pauschalen 30%-Floor („Rabatt-Puffer"), der Angreifern erlaubte, beliebig 70% Rabatt ohne Coupon einzustreichen. Neu: Floor wird aus server-validiertem Coupon-Wert berechnet — Lookup in `coupons.value/type` ueber den eingereichten `couponCode`, plus 30%-Cap fuer duration/loyalty. 95% Hard-Cap insgesamt. Zusaetzlich wird `r_discountAmount` mit dem Server-Wert ueberschrieben, falls der Body-Wert abweicht — verhindert dass DB/Rechnung einen Fake-Rabatt zeigen.
- **Discount-Felder server-recompute** — `discountAmount`, `productDiscount`, `durationDiscount`, `loyaltyDiscount` waren aus dem Body uebernommen und ungeprueft in `bookings.discount_amount` gelandet. Ein Angreifer mit `discountAmount=350, amountCents=15000` auf einen 500-EUR-Cart bekam eine Rechnung mit phantom 350-EUR-Rabatt. Coupon-Wert wird jetzt server-seitig ueber den `coupons`-Lookup ermittelt, Body-Wert ueberschrieben.
- **OAuth-Callback `state` validieren (HIGH, CSRF)** in `/api/admin/social/oauth` — Start-Branch setzte `meta_oauth_state`-Cookie, Callback las nur `?code=...` ohne den Cookie zu vergleichen. Owner via Phishing-Link auf Meta-Authorize-URL gelockt → Meta callback mit Owner-Session-Cookie + Angreifer-Code → Angreifers FB-Page wuerde fuer cam2rent posten. Fix: timing-safe-Vergleich `stateParam === stateCookie`, ansonsten Redirect auf `?error=invalid_state`. Cookie wird nach Erfolg/Fehler geloescht.
- **`webhook` Pruefung (HIGH)** — `stripe-webhook` baut Buchungen aus `intent.metadata.{user_id, customer_email, product_id}` — diese Felder kamen frueher unauthentifiziert aus `create-payment-intent`. Mit dem Session-Pinning oben (Vuln 4-Fix) ist das jetzt geschlossen, da `metadata.user_id` zwingend der Session-User ist.
- **`price_total` konsistent** — frueher schrieb `confirm-cart` per-Group `subtotal − client-discounts + shipping`, der Webhook nutzte `intent.amount/100`. Mit Vuln 9+10-Fix uebernimmt `confirm-cart` den server-validierten Discount-Wert, daher matcht `price_total` jetzt zwischen beiden Pfaden.
- **`meine-buchungen` E-Mail-Fallback entfernt** — die `.or(user_id.eq.X,and(customer_email.eq.Y,user_id.is.null))`-Klausel war der Hebel, der Express-Signup-Hijacks erst gefaehrlich machte. Jetzt nur noch `eq('user_id', user.id)`. Gastbuchungen werden nicht mehr automatisch ans Konto haengen.
- **`claim-guest-bookings` deaktiviert** — Route ist auf no-op (200 mit `claimed: 0`) zurueckgebaut. Kommentar im Code erklaert, dass Gastbuchungen ab sofort vom Admin manuell unter `/admin/buchungen/[id]` zugewiesen werden muessen.
- **Admin-Sessions UA-Binding (HIGH)** in `lib/admin-users.ts:getUserBySession` — wenn beim Login der `user_agent`-Header gespeichert wurde und der aktuelle Request mit anderem UA kommt, wird die Session geloescht + null zurueckgegeben. `lib/admin-auth.ts:getCurrentAdminUser` reicht jetzt den aktuellen UA durch. Backward-Compat: bei NULL auf einer Seite wird der Check uebersprungen.
- **Verifikations-Refund-Loop blockiert (HIGH)** in `checkout-intent` — wenn `verificationDeferred=true` und der User schon ≥ 2 Buchungen wegen fehlendem Ausweis automatisch storniert hat (`notes ILIKE '%Ausweis-Upload wurde nicht fristgerecht%'`), wird die naechste Buchung mit `code: 'TOO_MANY_AUTO_CANCELS'` abgelehnt.

**MEDIUM (4):**
- **`confirm-cart` Webhook-Race-Recovery** — bei `23505`-Conflict (Webhook hat Buchung schon eingefuegt) wird jetzt nicht mehr 500 zurueckgegeben, sondern die existierenden Bookings aus DB geholt + Loop verlassen → Erfolgs-Pfad inkl. Vertrag-After-Hook laeuft. Verhindert „Buchung in DB ohne signierten Mietvertrag".
- **`cancel-booking` MANUAL-PI skip** — `payment_intent_id` wie `MANUAL-BK-...` startet nicht mit `pi_` und triggert daher kein Stripe-Refund-Call mehr. Vorher: 404 vom Stripe-API → 500 zum Customer → Buchung blieb confirmed. Jetzt: Status-Flip + skip Refund + 200.
- **`anonymize-customer` Owner-only** — Mitarbeiter mit `kunden`-Permission konnten sonst beliebige Profile anonymisieren (auch um eigene Spuren in `email_log` zu verwischen). Jetzt `me.role === 'owner'` Pflicht. Selbst-Anonymisierung verboten.
- **`reminder-emails.ts` Resend-Errors throwen** — gleiches Pattern wie der Sweep-2-Fix in `lib/email.ts`: Resend liefert bei Rate-Limit `{data:null, error}` statt zu werfen. Reminder-Helpers haben den Fall geschluckt → Mail wurde als `sent` ins email_log geschrieben, Cron-Idempotenz blockierte Retry. An allen 5 Stellen `if (result.error) throw new Error(...)` ergaenzt.

**Go-Live TODO (Sweep 6):**
- ~~SQL-Migration `supabase/supabase-profiles-rls-column-level.sql` ausfuehren~~ — **PFLICHT vor naechstem Release**, sonst bleibt die kritische RLS-Luecke offen.
- Bestehende Sessions invalidieren nach Sweep-6-Deploy: `DELETE FROM admin_sessions;` — alle Admins muessen sich neu einloggen, damit der `user_agent`-Wert gespeichert wird (UA-Binding greift sonst noch nicht).
- Sweep-5-Test-User pruefen: alle Konten mit `is_tester=true` einmal manuell ueberpruefen, ob sie wirklich Tester sind (jemand koennte das Flag vor dem RLS-Fix gesetzt haben).
- Express-Signup-Sicherheits-Warnmail-Versand-Test: kontakt@cam2rent.de Mail-Inbox checken nach erstem Live-Signup.

### Security-Audit-Fixes (2026-05-03 Sweep 5)
Vollstaendiger Webseiten-Sicherheits-Audit mit vier parallelen Agents (Auth/Session, File-Uploads/SSRF, Payment/IDOR, Injection/HTML). 15 Findings mit Konfidenz ≥ 8 alle gefixt — alle direkt auf master.

**HIGH (5):**
- **`/api/contracts/sign` Auth + Ownership-Check (HIGH)** — Route nahm `bookingId, customerName, signatureDataUrl` aus dem Body ohne jede Pruefung. Vor Vertrag-Erzeugung wird jetzt entweder Supabase-Session (Kunde, mit `.eq('user_id', user.id)`) oder `checkAdminAuth()` (Tablet-Uebergabe) verlangt. Verhindert Vertrags-Faelschung im Namen fremder Kunden bei kennbaren Buchungsnummern (`C2R-YYWW-NNN`).
- **`/api/set-images`, `/api/accessory-images`, `/api/product-images` Admin-Auth (HIGH)** — Alle drei Routen lagen ausserhalb von `/api/admin/*` (Middleware schuetzt nur das) und hatten keinen eigenen Auth-Check. Service-Role-Client schrieb dabei `image_url` in `sets`/`accessories` per `setId`/`accessoryId` aus dem Body. `checkAdminAuth()` an POST + DELETE in jeder Route ergaenzt — Internet-Defacing der Shop-Bilder geschlossen.
- **`/api/confirm-extension` Stripe-Metadata-Pruefung (HIGH)** — Verlaengerungen vertrauten `paymentIntent.amount` blind. Jetzt: `metadata.type === 'extension'`, `metadata.booking_id === bookingId`, `metadata.new_rental_to === newRentalTo` als Pflicht-Match. Zusaetzlich Plausibilitaets-Check: Server berechnet erwartete Diff selbst und vergleicht mit `paymentIntent.amount` (50-Cent-Toleranz fuer Rundungen). Ohne diese Pruefung konnte ein Kunde einen 1-Tag-Verlaengerungs-Intent fuer 30 Tage Verlaengerung wiederverwenden (Schaden 150–500 € pro Angriff).
- **`/api/admin/social/unsplash` + `/api/admin/seasonal-images/upload` SSRF + Key-Leak (HIGH)** — Beide Routen hingen den Unsplash-Access-Key als Query-Parameter an eine attacker-kontrollierte `downloadLocation` an (`fetch(${downloadLocation}?client_id=${accessKey})`). Plus `imageUrl` ohne Host-Allowlist → SSRF auf interne Adressen. Fix: neue `isUnsplashUrl()`-Allowlist (`images.unsplash.com`, `plus.unsplash.com`, `api.unsplash.com`, `unsplash.com`). Schluessel wandert in den `Authorization: Client-ID ...`-Header (kein URL-Logging mehr). Bei seasonal-images zusaetzlich `detectImageType()`-Magic-Byte-Check vor dem Storage-Upload, statt Content-Type aus Data-URI-Prefix zu vertrauen.
- **HTML-Injection in Schadensmeldungs- und Nachrichten-E-Mails (HIGH)** in `lib/email.ts` — `data.description`, `data.customerName`, `data.subject`, `data.messagePreview`, `data.adminNotes` wurden roh in HTML interpoliert (Lines 822, 869–873, 906, 1143–1148, 1189–1195). `h()`-Helper (existierte bereits, wird woanders genutzt) jetzt ueberall draufgelegt. Subjects bekommen zusaetzlich CRLF + U+2028/U+2029-Strip (`replace(/[\r\n  ]/g, ' ')`) plus 200-Zeichen-Cap gegen Subject-Spoofing.

**MEDIUM (10):**
- **`/api/create-pending-booking` Auth-Check** — `userId` aus Body wurde direkt als `user_id` gespeichert. Jetzt zuerst `supabaseAuth.auth.getUser()`, body.userId muss zur Session passen, sonst 403. Verhindert dass Angreifer Buchungen + signierte Vertraege im Namen fremder user_ids hinterlegt.
- **Session-Cache-TTL drastisch reduziert** in `middleware.ts` — `SESSION_CACHE_TTL_MS` von 60 s auf 5 s. Bei Rechte-Entzug, Logout oder Mitarbeiter-Deaktivierung bleibt das Privesc-Window jetzt max 5 s statt einer ganzen Minute. Trade-off: kleiner DB-Roundtrip pro Anfrage, aber bei < 50 ms vernachlaessigbar.
- **Fehlende API-Permissions in middleware** — `/api/admin/handover` und `/api/admin/scan-lookup` hatten keinen Eintrag in `API_PATH_PERMISSIONS`. Mitarbeiter mit `permissions: []` konnten beide aufrufen und Uebergabedaten/Inventar fuer fremde Buchungen manipulieren. Beide auf `tagesgeschaeft` gemappt.
- **`/api/cancel-booking` Kautions-Pre-Auth-Release** — Storno refundete nur die Miete, der `deposit_intent_id`-Hold (~500 €, 7 Tage) blieb auf der Kreditkarte. Jetzt `stripe.paymentIntents.cancel(deposit_intent_id)` + `deposit_status='released'` analog zu `verification-auto-cancel`.
- **`/api/confirm-cart` userId aus Stripe-Metadata** — Body-`userId` wurde direkt in `bookings.user_id` geschrieben. Jetzt: `intent.metadata.user_id` (gesetzt von checkout-intent) hat Vorrang. Wenn Body-userId gesetzt ist und nicht zur Stripe-Metadata passt → 403. Verhindert Loyalty-Counter-Abuse + Coupon-Laundering ueber fremde Accounts.
- **Coupon `target_user_email` + `once_per_customer` enforcement** in `confirm-cart` — Pre-Check vor RPC-Aufruf: wenn Coupon `target_user_email` hat, muss `r_email` (case-insensitive) matchen. `once_per_customer` prueft via Bookings-Count, ob der User/die E-Mail den Code schon mal genutzt hat. Bei Verletzung wird Buchung trotzdem durchgezogen (Geld eingegangen), aber Counter NICHT erhoeht + Admin-Notification.
- **`/api/admin/notifications/create` auf Owner-only beschraenkt** — Endpoint wurde nirgends im Code aufgerufen, ist aber nur ueber das `admin_token`-Cookie abgesichert (kein Permission-Check). Content-Mitarbeiter konnten dem Owner gefaelschte `payment_failed`-Pushes mit Phishing-Links schicken (mapping ueber `TYPE_TO_PERMISSION`). Jetzt: `getCurrentAdminUser()` + `me.role === 'owner'` Pflicht. Plus Whitelist auf bekannte Notification-Typen + Length-Caps auf title/message/link.
- **`cropImageForPlatform` Host-Allowlist** in `lib/meta/publisher.ts` — `media_urls` aus `social_posts` wurden ungefiltert via `fetch()` geladen. Content-Mitarbeiter konnten `["http://10.x.x.x/..."]` reinschreiben + den Server interne Adressen abfragen lassen, deren Antwort dann im public `blog-images`-Bucket landete. Neue `isAllowedSourceUrl()`: nur `https://`, kein Loopback/RFC1918, Suffix-Allowlist (Supabase, Unsplash, OpenAI-CDN, cam2rent.de).
- **`/api/admin/booking/[id]/send-email` Customer/Product-Name escaping** — Inline-HTML-Template interpolierte `booking.customer_name` und `booking.product_name` ohne Escape. `escapeHtml()`-Import aus `lib/email` hinzugefuegt + alle vier Stellen umgestellt (`customer_name`, `docNames`, `id`, `product_name`, `von`, `bis`).

**Bonus (Pre-existing Lint-Errors mitgefixt — CLAUDE.md verlangt 0 Errors vor Push):** ReelRenderStatus.tsx Zeile 282 (`"` zu `&bdquo;`/`&ldquo;`), checkout/page.tsx Zeile 1143 (`<a href="/">` zu `<Link href="/">`).

**Ausgelassen (Konfidenz < 8):** `auth/callback` x-forwarded-host (Proxy-Konfig-abhaengig), Cron-URL-Secret in Logs (bekannter TODO), PostgREST `.or()`-Interpolation des `user.email` (Supabase Auth validiert E-Mails restriktiv), `/api/admin/invoices/purchase-pdf` Pfad-Trust (laterale Lese-Primitive innerhalb finanzen-perm).

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
- **Signup-Rate-Limit per IP (HIGH)** in `app/api/auth/signup/route.ts`: vorher globaler In-Memory-Counter — 1 Angreifer konnte alle 3 Slots/h aufbrauchen und damit jeden legitimen Signup blockieren. Jetzt `rateLimit({ maxAttempts: 3, windowMs: 1h })` mit Bucket-Key `signup:${ip}` (nutzt den bestehenden `lib/rate-limit.ts`-Helper). **Obsolet seit 2026-05-14 (Supabase Pro):** Route `/api/auth/signup` ist gelöscht (war tot, nie vom Frontend aufgerufen), und das parallele 5/h-Limit auf `/api/auth/express-signup` ist ebenfalls entfernt. DoS-Schutz liegt jetzt vollständig auf Supabase Pro + den weiteren Pre-Checks der Express-Signup-Route (E-Mail-Existenz-Check, Sicherheits-Warnmail an Pre-Claim-Adressen, Passwort-/Adress-Validierung). Anti-E-Mail-Enumeration `/api/auth/check-email` (10/min) bleibt aktiv.
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

### Reliability-Audit Welle 1 (2026-05-08)
Erster Tech-Debt-/Reliability-Pass mit `engineering:tech-debt` + `engineering:code-review`-Mindset, fokussiert auf Race-Conditions, Idempotenz und tote Code-Pfade. Drei parallele Explore-Agents (Performance, Dead/Duplicate-Code, Reliability-Gaps) haben konkrete Findings ausserhalb der Sweep-5-9-Befunde aufgespuert.

- **`social-generate` Cron-Lock**: `acquireCronLock('social-generate')` ergaenzt — Sweep 8 hat 6 andere Crons gelockt, dieser hier hatte nur das alte manuelle Stale-Lock-Pattern via `social_generation_status`. Bei Coolify-Restart + Cron-Tick konnten doppelte `social_posts`-Drafts mit gleichem `scheduled_at` entstehen. Body in `runGeneration(req)` ausgelagert, Lock im try/finally drumherum.
- **`mark-paid` Status-Guard**: `app/api/admin/buchhaltung/invoices/[id]/mark-paid` UPDATE jetzt mit `.eq('payment_status', invoice.payment_status).select('id').maybeSingle()` — bei Doppelklick zwei Admins parallel bekommt einer 200, der andere 409 statt zwei Audit-Log-Eintraegen + zwei Quittungsmails. Plus: Idempotenz-Path bei `payment_status==='paid'` returnt sofort 200.
- **`dunning/bulk` Status-Guard**: Reihenfolge umgedreht — erst atomarer Invoice-UPDATE auf `overdue` mit `.eq('status', inv.status).eq('payment_status', inv.payment_status).select('id').maybeSingle()`, dann Mahn-Notice-Insert. Vorher konnte ein zwischenzeitlich bezahlter Invoice (`mark-paid` parallel) trotzdem auf `overdue` zurueckgezogen werden + falsche Mahnung erzeugt.
- **`credit-notes/approve` Amount-Cap (Defense-in-Depth)**: Sweep 7 #18 hat den Cap beim ANLEGEN gefixt. Beim APPROVE jetzt zusaetzlich Pre-Refund-Check `SUM(other approved/sent CNs) + this.gross_amount <= booking.price_total + 0.01`. Bei Ueberschreitung wird CN-Status auf `pending_review` rollbacked und 422 zurueckgegeben, **vor** dem Stripe-Refund-Call. Schuetzt vor manuellem DB-Edit zwischen Insert und Approve.
- **`claim-guest-bookings` komplett entfernt**: Route + AuthProvider-Aufruf. Sweep 6 hatte die Route auf no-op gesetzt (Express-Signup-Hijack-Vehikel), aber `AuthProvider.tsx` rief sie nach jedem Login + USER_UPDATED weiterhin auf — toter Round-Trip pro Auth-Wechsel. Gastbuchungen werden jetzt vom Admin manuell unter `/admin/buchungen/[id]` zugewiesen (Hinweis war seit Sweep 6 in CLAUDE.md, Aufruf hat es nicht gemerkt).
- **Pure-Function-Tests**: Vitest-Suite fuer die zwei kritischsten Lib-Funktionen unter `lib/inventar/__tests__/wiederbeschaffungswert.test.ts` (16 Tests, deckt den vollen Entscheidungsbaum ab: Override → null → linear → Floor) und `lib/buchhaltung/__tests__/beleg-utils.test.ts` (18 Tests fuer `sanitizePosition`-Clamps und Defaults). Format analog `lib/accounting/__tests__/{tax,dunning,reconciliation}.test.ts`.

**Additive Folge (Welle 1.5, 2026-05-08)** — keine Code-Pfad-Aenderungen, nur neue Files:
- **Tests fuer 4 weitere Pure-Function-Libs**: `lib/__tests__/depreciation.test.ts` (24 Tests fuer monatliche AfA-Rate, monthsBetween, Zeitwert-Berechnung mit Restwert-Floor, pendingDepreciationMonths-Catchup, isFullyDepreciated). `lib/__tests__/timezone.test.ts` (18 Tests fuer Berlin-Offset Sommer/Winter, getBerlinDateString, getBerlinHour, utc↔local Round-Trip). `lib/__tests__/csv.test.ts` (20 Tests fuer Formula-Injection-Schutz `=`/`+`/`-`/`@`/TAB/CR + RFC4180-Quoting + BOM). `lib/__tests__/url-allowlist.test.ts` (28 Tests fuer alle 6 SSRF-Allowlist-Helpers inkl. RFC1918, Cloud-Metadata, IPv6-Loopback). Insgesamt 90 neue Tests.
- **DB-Indizes-Migration** unter `supabase/supabase-tech-debt-indizes.sql` (additiv, idempotent, manuell auszufuehren). Drei neue Indizes: `invoices(is_test, invoice_date DESC)` fuer Buchhaltungs-Liste, `expenses(category) WHERE deleted_at IS NULL` fuer EÜR-Filter, `inventar_verknuepfung(beleg_position_id)` fuer Belege-Detail (optional, nur wenn neue Buchhaltungs-Welt migriert ist). `CREATE INDEX CONCURRENTLY` — kein Lock waehrend Live-Betrieb.

**Welle 2 + 3** (Timeouts auf externe Calls, N+1-Patches, `lib/email.ts` logEmail-Catch, Permission-Mapping-Luecken) folgen in separaten Sessions, sobald gewuenscht.

> **`pickAssetsTable` NICHT „konsolidieren" (Stand 2026-05-17).** Die Notiz
> stammte aus dem aufgegebenen Drop-Denkmodell (nach `assets_neu`→`assets`-Rename
> waere es „nur noch assets"). Da der Drop tot ist (siehe „STRATEGIE-WECHSEL"),
> ist die Dual-Table-Logik (`assets` UND `assets_neu` parallel abfragen/schreiben,
> Insert-Time-Fallback, PostgREST-Schema-Cache-Defensive in
> `anlagen-neu`, `belege/[id]`, `aufheben`, `asset-auto-generator`, `afa-cron`)
> der **korrekte dauerhafte Soll-Zustand**, kein Tech-Debt. Hartverdrahten auf
> eine Tabelle würde real existierende Assets in der jeweils anderen Tabelle
> unauffindbar machen (Finanz-Regression). Die abweichenden
> `isMissingTableError`-Varianten (afa-cron nur `42P01`; andere zusaetzlich
> `PGRST205/PGRST202`) sind absichtlich — nicht vereinheitlichen.

### Basis-Set-Pflicht + Verfuegbarkeits-Alerts (Stand 2026-05-20)
Pro Kamera muss ein Basis-Set hinterlegt sein, das der Kunde beim Buchen
automatisch mitnehmen muss. Fehlt es oder ist es im gewuenschten Zeitraum
ausgebucht, wird die Buchung im Wizard hart geblockt + ein Admin-Alarm
(Push + Dashboard-Banner + Detail-Seite) ausgeloest.

- **Schema:** `sets.basic_for_product_ids TEXT[] DEFAULT '{}'` (Migration
  `supabase-sets-basic-for-products.sql`, GIN-Index). Eintraege MUESSEN
  Teilmenge von `product_ids` sein — API + UI sanitisieren das. Tabelle
  `availability_alerts` (Migration `supabase-availability-alerts.sql`) mit
  Typen `no_basic_set | basic_set_unavailable | set_unavailable |
  accessory_unavailable`, Dedupe-Index auf Kombi+offen, RLS service-role.
- **Sets-Admin** (`/admin/sets`): Checkbox „Als Basis-Set markieren" + Pill-
  Auswahl der Kameras (Subset der oben gewaehlten `product_ids`). Kommt aus
  `product_ids` entfernt → fliegt automatisch aus `basic_for_product_ids`.
  Im NewSetForm + Edit-Panel gleich.
- **Sets-API** (`app/api/sets/route.ts`): GET liefert `basic_for_product_ids`
  pro Set; POST/PATCH akzeptieren das Feld, validieren als Subset, schreiben
  defensiv mit Migration-Fallback (Spalte droppen + Retry, falls Migration
  ausstehend).
- **Buchungs-Wizard** (`app/kameras/[slug]/buchen/page.tsx`): Sets-Loader
  ruft `/api/sets` (vorher `?available=true` — filterte ausgebuchte Sets
  komplett raus). Set-Liste rendert ausgebuchte Sets **ausgegraut** mit Pill
  „Im Zeitraum ausgebucht" statt sie zu verstecken. Neuer Effekt prueft pro
  Kamera+Zeitraum den Basis-Set-Status: kein Basis-Set definiert → Block
  `no_basic_set`, Basis-Set im Zeitraum ausgebucht → Block
  `basic_set_unavailable`. Block setzt `basicSetBlock`-State, das blockiert
  „Weiter: Zubehoer" + „Weiter: Haftung" und zeigt ein Modal („Buchung
  aktuell nicht moeglich — Support / Zeitraum aendern"). Telemetrie wird
  fire-and-forget einmal pro Session+Kamera+Zeitraum+Typ via `useRef<Set>`
  gespammelt-frei an `/api/availability-alerts` gesendet.
- **Telemetrie** `POST /api/availability-alerts` (oeffentlich, Rate-Limit
  20/h pro IP): saeubert Inputs, dedupliziert 24h-Fenster auf
  Kombi (alert_type+product_id+set_id+accessory_id+rental_from+rental_to)
  mit `resolved_at IS NULL`. Bei Dedupe-Treffer wird `occurrence_count` + 1
  und `last_seen_at = now()` gesetzt. Beim ersten Auftreten in 24h feuert
  `createAdminNotification` mit Typ `availability_alert` (Permission
  `tagesgeschaeft`, rotes Warnsymbol). Defensiver Fallback bei fehlender
  Migration → kein Persist, kein 500.
- **Admin-API** `GET/POST /api/admin/availability-alerts`: Liste der
  offenen Alerts (max 100, sortiert nach `last_seen_at`), POST mit
  `{id, action: 'resolve'|'reopen', note?}` zum Markieren als erledigt.
  Audit-Log `availability_alert.resolve` / `.reopen`.
- **Dashboard** (`/admin`): Neue Komponente `AvailabilityAlertsBanner`
  (sticky-rot oben, sichtbar nur wenn offene Alerts), 60s-Polling mit
  Backoff bei Fehlern + Visibility-Pause (analog NotificationDropdown).
  Zeigt Top-3 mit „weitere anzeigen", Link auf Detailseite.
- **Detailseite** `/admin/verfuegbarkeit-alerts`: Liste aller offenen/
  erledigten Alerts mit Lade-Hint pro Typ (z.B. „Im Admin unter Sets ein
  Set als Basis-Set fuer diese Kamera markieren"), Resolve-Button mit
  optionalem Kommentar, Reopen, Quick-Link „Sets oeffnen" bei
  `no_basic_set`. Permission `tagesgeschaeft` (UI + API).
- **Bekannte Limitierung (bewusst):** `set_unavailable` und
  `accessory_unavailable` werden vom Wizard heute NICHT gefeuert — nur
  `no_basic_set` + `basic_set_unavailable`. Andere Set-/Zubehoer-
  Ausbuchungen erscheinen normal im Kalender + Gantt-View, fuer die gibt
  es kein Hard-Block-Szenario. Die Alert-Typen sind im Schema vorbereitet,
  falls spaeter ergaenzt werden soll. Notification-Banner zeigt aber
  selbstverstaendlich alle vier Typen, sobald sie eingetragen sind.
- **Go-Live TODO:**
  1. Migrationen `supabase-sets-basic-for-products.sql` +
     `supabase-availability-alerts.sql` ausfuehren.
  2. Unter `/admin/sets` fuer jede Kamera mindestens ein Set als Basis-Set
     markieren (Checkbox + Kamera-Pill anhaken). Ohne diesen Schritt
     greift das Hard-Gate beim naechsten Kunden-Versuch und der Admin
     bekommt einen Push.

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
Tabelle `social_reel_plan` ist seit `supabase-reels.sql` da. Spalten: `id, scheduled_date, scheduled_time, topic, template_id, status, generated_reel_id, error_message, …` (analog `social_editorial_plan` für Posts). Der Cron `app/api/cron/reels-generate/route.ts` liest jetzt daraus und generiert Reels automatisch.

Vorbild: `/admin/social/zeitplan` (Posts) + `/admin/social/plan` (Bulk-Generator). Blueprint:
- **Neue Seite `app/admin/social/reels/zeitplan/page.tsx`** — 3-Spalten-Layout: Plan-Liste (Datum-Kacheln, klickbar für Inline-Edit) | rechts Plan-Eintrag-Detail mit Buttons „⚡ Jetzt generieren" / „🚀 Sofort posten" / „Bearbeiten" / „Löschen" / „Überspringen". Status-Workflow `planned → generating → generated → reviewed → published`.
- **Optional Schritt 5b: Bulk-Plan-Generator `app/admin/social/reels/plan/page.tsx`** (analog `/admin/social/plan`) — Eingabe: N Reels über M Wochen, Wochentag-Pills, Uhrzeit, Plattformen, Background-Job mit Progress-Bar.
- **Neue API-Routen unter `/api/admin/reels/plan/`:**
  - `GET/POST /api/admin/reels/plan` — Liste / Anlegen
  - `GET/PATCH/DELETE /api/admin/reels/plan/[id]`
  - `POST /api/admin/reels/plan/[id]/generate` — sofort generieren (extrahierte Logik aus dem bestehenden `POST /api/admin/reels` als reusable Helper in `lib/reels/`)
  - Optional `POST /api/admin/reels/plan/bulk` für Bulk-Generator
- **Cron `app/api/cron/reels-generate/route.ts` ✓ implementiert** (stündlich `0 * * * *`) analog `social-generate`: prüft `reels_settings.auto_generate`, Wochentag + Zeitfenster (Berlin), scannt fällige `social_reel_plan`-Einträge (`status='planned'`, `scheduled_date <= today + auto_generate_schedule_days_before`), generiert via `generateReel()` aus `lib/reels/orchestrator`. Semi-Modus: `pending_review` + Admin-Notification `reel_ready`. Voll-Modus: direkt `status='scheduled'` mit `scheduled_at`.
- **Settings-Block in `/admin/social/reels/einstellungen` ✓ implementiert** — neue Card „Automatische Generierung" mit Toggle, Semi/Voll-Modus-Karten, Wochentage-Pills (zeigt „X Reels/Woche"), Zeitfenster, Vorlaufzeit-Slider. Neue Felder in `reels_settings`: `auto_generate`, `auto_generate_mode`, `auto_generate_weekdays[]`, `auto_generate_time_from`, `auto_generate_time_to`, `auto_generate_schedule_days_before`.
- **Social-Posts Einstellungen (`components/admin/SocialEinstellungenContent.tsx`) ✓ umstrukturiert** — drei separate Cards: „Automatische Generierung" (Blog-Stil: Toggle, Semi/Voll, Wochentage-Pills mit „X Posts/Woche", Zeitfenster, Vorlaufzeit, Faktencheck, Cron-URL), „Auto-Post-Trigger" (blog_publish etc.), „KI-Konfiguration" (Ton, Kontext, Hashtags).

**Test/Live-Hinweis:** Im Test-Modus springt der Cron früh raus (kein OpenAI/Pexels-Spend), analog `social-generate`.

**Reihenfolge der Implementierung war:** 1 → 2 → 3 → 4 → 5. Jeder Schritt für sich committable. Schritt 5 ist deutlich größer als die anderen — kann auf 5a (UI + APIs für Plan-CRUD) und 5b (Bulk + Cron) gesplittet werden.

**Vor jedem Push:** `npx tsc --noEmit` + `npx next lint` (siehe Regel oben). `npx next build` läuft in der Sandbox NICHT (kein Google-Fonts-Zugang).

### Check-Tool
- **`supabase-migrationen-status-check.sql`** — Read-only SQL-Script im Repo-Root. Listet je Migration "ERLEDIGT" oder "OFFEN". Nach jedem Deploy neuer Migrationen einfach nochmal laufen lassen und erledigte manuell nach `erledigte supabase/` verschieben.

### Ausgeführte Migrationen (erledigt)
- ~~`supabase-invoice-versions.sql`~~ (Rechnungs-Versionierung / `invoice_versions` — am 2026-05-19 ausgeführt, Datei nach `erledigte supabase/` verschoben)
- ~~`supabase-accessories-included-parts-images.sql`~~ (Bild pro Zubehör-Bestandteil — am 2026-05-16 ausgeführt, Datei nach `erledigte supabase/` verschoben)
- ~~`supabase-bookings-liability-override.sql`~~ (manuelle Kamera-/Zubehör-Anpassung der internen Haftungs-Box — am 2026-05-16 ausgeführt, Datei nach `erledigte supabase/` verschoben)
- ~~`supabase-bookings-wbw-finalized.sql`~~ (WBW-Finalisierung + PDF-E-Mail — am 2026-05-16 ausgeführt, Datei nach `erledigte supabase/` verschoben)
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
- ~~`supabase-beleg-positionen-verbrauch.sql`~~ (CHECK-Constraint um `'verbrauch'` erweitert — am 2026-05-15 ausgeführt, KI-Workflow speichert `verbrauch` jetzt nativ)
- ~~`supabase-newsletter.sql`~~ + ~~`supabase-customer-push.sql`~~ + ~~`supabase-push-per-user.sql`~~ (Newsletter-Double-Opt-In, Endkunden-Push, Permission-gefilterte Admin-Pushes — am 2026-04-28 ausgeführt)
- ~~Restbestand `supabase/`-Ordner~~ (Buchhaltung-Vollausbau, Reels-Erweiterungen, Packing-Workflow, Legal-Seeds, Buchhaltung-Teil2, Anlagen-Flag-Live, Reels-Music/Pixabay/Motion-Style/Quality-Metrics/Segments, Newsletter, Customer-Push usw. — alle 60 erwarteten Tabellen nachweislich vorhanden, Stand 2026-04-28)

### Startseiten-Module (Stand 2026-04-26)
Fünf neue Frontend-Module, die die Startseite lebendig halten — alle nutzen vorhandene Daten/Infrastruktur, kein Pflegeaufwand notwendig.

- **`components/home/HomeUgc.tsx`** — Galerie freigegebener Kundenmaterial-Bilder (Bucket `customer-ugc`, signed URLs 24h). Quelle: `customer_ugc_submissions` mit Status `approved`/`featured` und `consent_use_website` oder `consent_use_social`. Versteckt sich bei < 3 Bildern. API: `GET /api/home-ugc` (cached 10 min).
- **`components/home/HomeSeasonalAction.tsx`** — Aktions-Karte zwischen Hero und Produkten (Gradient-Banner mit Badge, Titel, Untertitel, Coupon-Code, Gültig-bis-Datum, CTA-Button). Versteckt sich automatisch wenn deaktiviert oder abgelaufen. Admin-UI: `components/admin/SeasonalActionAdmin.tsx` in der Shop-Updater-Inhalte-Seite. Speicherung: `admin_settings.seasonal_action`. API: `GET /api/seasonal-action` (cached 60s).
- **`components/home/HomeFresh.tsx`** — Zwei-Spalten-Block "Frisch im Shop" (erste 3 Produkte mit `hasUnits=true`) + "Demnächst verfügbar" (Produkte mit `hasUnits=false` → Wartelisten-Kandidaten). Versteckt sich, wenn beide leer.
- **`components/home/NewsletterSignup.tsx`** — Newsletter-Anmeldung mit Double-Opt-In (DSGVO-konform). DB: `newsletter_subscribers` (Migration `supabase-newsletter.sql`). Flow: POST → Bestätigungsmail → GET-Confirm-Link → confirmed=true. Bestätigungsseite: `/newsletter/bestaetigt?status=ok|already|expired|invalid|error`. Rate-Limit: 5/h pro IP. E-Mail-Typ: `newsletter_confirm`.
- **`components/home/CustomerPushPrompt.tsx`** — Dezenter Prompt unten rechts (8s Delay), aktiviert Web-Push für Endkunden. DB: `customer_push_subscriptions` (Migration `supabase-customer-push.sql`). Lib: `lib/customer-push.ts` → `sendPushToCustomers(payload, { topic? })`. Nutzt dieselben VAPID-Keys wie Admin-Push. Public-Vapid-Endpoint: `GET /api/customer-push/vapid-key`.
- **`components/home/HomeSeoText.tsx`** (Stand 2026-05-13) — Server-Komponente am Seitenende (zwischen `AppInstallBanner` und `CtaBanner`). Lädt Markdown-Block aus `admin_settings.home_seo_text` über `getHomePageData()` und rendert ihn server-seitig via `MarkdownContent`. Versteckt sich wenn `enabled=false` oder leer. **Zweck:** SEO-Wortanzahl der Startseite > 500 Wörter heben — Inhalt landet im SSR-HTML, Crawler zählen ihn. Plus: Title + Meta-Description in `app/layout.tsx` von 42/133 auf 67/152 Zeichen verlängert (GoPro/DJI/Insta360 + Preis-Hook im Title). Admin-UI: `components/admin/HomeSeoTextAdmin.tsx` als Card im Settings-Hub unter `/admin/startseite?tab=inhalte` mit Toggle + Titel + Markdown-Textarea + **Live-Wortzähler** (rot < 300, amber 300–499, grün ≥ 500). Setting-Key: `home_seo_text = { enabled, title, markdown }`.

### Cloudflare-Ready IP-Extraktion (Stand 2026-05-13)
`lib/rate-limit.ts:getClientIp(req)` ist jetzt Cloudflare-aware: liest **`cf-connecting-ip` mit Vorrang** vor `x-forwarded-for` und `x-real-ip`. Cloudflare strippt User-gefälschte `cf-connecting-ip`-Werte am Edge — der Header ist also vertrauenswürdig, sobald Cloudflare als Proxy davor steht. Funktioniert mit `Request` und `NextRequest` (Typ-Erweiterung). Backward-kompatibel: ohne Cloudflare ist der Header leer, Fallback bleibt `x-forwarded-for[0]` wie bisher.

Migriert: `lib/audit.ts` nutzt jetzt den zentralen Helper statt eigener Header-Lookup-Logik. Direkt-Reads in 7 weiteren Routen ersetzt (`contracts/sign`, `confirm-cart` 2×, `confirm-booking` 2×, `admin/sign-contract`, `admin/booking/[id]/regenerate-contract`, `admin/handover/[bookingId]`, `admin/manual-booking`, `admin/reels/voice-preview`). `.env.example` dokumentiert die Cloudflare-Konvention.

**Wichtig vor Cloudflare-Live-Schaltung:** Hetzner-Firewall (UFW oder Coolify-Firewall) muss Port 443/80 auf die offiziellen Cloudflare-IP-Ranges (`https://www.cloudflare.com/ips/`) einschränken. Sonst kann ein Angreifer den Hetzner direkt anfragen und `cf-connecting-ip` selbst setzen → IP-Rate-Limit komplett umgangen.

### Cloudflare-Vollintegration (Stand 2026-05-14)
Cloudflare laeuft als Proxy + Edge-Schicht vor cam2rent.de. Die „Wichtig vor Cloudflare-Live-Schaltung"-Warnung aus dem 05-13-Eintrag oben ist umgesetzt: Hetzner Cloud Firewall blockt Port 80/443 fuer alle Quellen ausser den 22 offiziellen Cloudflare-IP-Ranges (15 IPv4 + 7 IPv6). Damit ist der `cf-connecting-ip`-Header vertrauenswuerdig — ein Angreifer kann den Origin nicht mehr direkt anfragen und den Header selbst setzen.

- **Cloudflare-Konfiguration:**
  - SSL/TLS-Modus: `Vollstaendig (strikt)` — End-to-End-HTTPS Cloudflare ↔ Hetzner mit Cert-Validierung
  - Always Use HTTPS: ON — HTTP → HTTPS-301 am Edge
  - Mindest-TLS-Version: TLS 1.2 (TLS 1.3 zusaetzlich aktiv, wird automatisch gewaehlt wo unterstuetzt)
  - HSTS: 6 Monate, IncludeSubDomains: ON, Preload: OFF (vorsichtiger Einstieg — App-Header in `next.config.ts` liefert weiterhin 2 Jahre mit `preload`, Cloudflare-Layer ist nur Edge-Reinforcement)
  - Bot Fight Mode: ON — JS-Challenge fuer Headless-Bots, verifizierte Suchmaschinen-Crawler (Googlebot, Bingbot) bleiben durch
  - DDoS-Schutz: Always-on (Cloudflare-Default)
- **WAF-Regeln (Free-Tier):**
  - Rate-Limit `auth-bruteforce`: 10 Requests / 10 Sek auf `/api/admin/login` und `/api/auth/*` → 10 Sek Block. Free-Tier-Limit (Period + Duration jeweils nur 10 s waehlbar). Echter Brute-Force-Schutz laeuft im App-Code (`lib/rate-limit.ts`: 5 Versuche / 15 Min pro IP + Per-Account-Lockout aus Sweep 7); Cloudflare-Layer ist Bandbreiten-Schutz vor Hetzner-Overload bei Massen-Attack.
  - Cloudflare Managed Ruleset / OWASP Core Ruleset sind **Pro-Feature** ($20/Monat) — bewusst nicht aktiv. Stattdessen: 5 Custom-WAF-Slots (0/5 belegt, fuer spaeter), Bot Fight Mode + Sicherheitsstufe „Mittel" als Baseline.
- **Cache-Regeln:**
  - `Bypass dynamic` (Position 1): `/api/*`, `/admin/*` → Cache umgehen. Verhindert dass dynamische Inhalte am Edge gecached werden (Buchungen, Admin-Daten, JSON-Responses).
  - `Cache static` (Position 2): `/_next/static/*` + Bilder (`.jpg|jpeg|png|webp|svg|gif|ico|woff2`) → Edge-TTL 1 Monat, Browser-TTL 1 Tag. Cache-Rate sollte von 0 % auf 30–60 % steigen.
- **DNS:**
  - `cam2rent.de` + `www` A-Records: orange Wolke (Proxied) ✓
  - Wildcard `*` A-Record → `85.13.154.63` (KAS-Legacy-IP): graue Wolke. Kein Origin-Leak weil andere IP als Hetzner. Stehengelassen fuer eventuell noch genutzte KAS-Subdomains.
  - MX + TXT (SPF, DMARC, DKIM, Resend, Google-Verification): grau wie ueblich (MX kann nicht geproxied werden).
- **Hetzner Cloud Firewall `firewall-1` (Beschreibung `cam2rent-cloudflare-only`):**
  - Eingehend: TCP/22 (SSH, Any IPv4 + IPv6), TCP/443 (HTTPS, nur 22 Cloudflare-CIDRs), TCP/80 (HTTP, nur 22 Cloudflare-CIDRs — fuer Let's-Encrypt-HTTP-01-Challenge + Cloudflare-Redirect), TCP/8000 (Coolify-Admin, nur eigene Heim-IP `<IPv4>/32` + IPv6-Prefix `<IPv6>/64`)
  - Ausgehend: alles erlaubt (Default)
  - Server `cam2rent` zugewiesen
  - **Coolify-Zugang bei IP-Wechsel:** DSL-Provider (Telekom/Vodafone) rotieren die IPv4 typischerweise taeglich. Wenn `http://178.104.117.135:8000/...` ploetzlich Timeout liefert, eigene IP unter https://wieistmeineip.de pruefen und die TCP/8000-Regel in Hetzner aktualisieren. IPv6 mit `/64` deckt das ganze Heim-Prefix ab (Privacy-Extensions wechseln nur die letzten 64 Bits) — IPv4 muss als `/32` exakt gesetzt werden, oder als `/24`-Block des Providers, wenn der Wechsel zu oft nervt. Alternative: SSH-Tunnel `ssh -L 8000:localhost:8000 root@178.104.117.135` braucht keinen offenen Port (SSH ist Any-IP).
- **Wartung:** Cloudflare-IP-Ranges quartalsweise gegen https://www.cloudflare.com/ips/ pruefen — Hetzner Cloud Firewall hat keine Auto-Update. Bei Erweiterung neue Ranges manuell ergaenzen, sonst kommt der Origin nicht mehr durch.
- **Bekannte Free-Tier-Limits:** Verwaltete WAF-Regeln (Managed Ruleset, OWASP) sind Pro-only. Rate-Limit-Period + Duration sind auf 10 Sekunden gecapt (Pro: 10s/1m/5m/15m/1h/24h waehlbar). Falls cam2rent in Zukunft ueber 100k Requests/Monat geht oder eine aktive Angriffswelle erlebt, Pro-Plan in Betracht ziehen.
- **Spaeter optional:**
  - HSTS-Max-Age auf 12 Monate hochziehen + Preload aktivieren, wenn 6 Monate stabil
  - Zertifikatstransparenz-Monitoring aktivieren (Card auf SSL/TLS → Edge-Zertifikate) → E-Mail-Warnung bei neuer Cert-Ausstellung fuer cam2rent.de, hilft bei Phishing-Erkennung

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

### OCR-Rate-Limit-Schutz (Stand 2026-05-09)
Bulk-Upload (50 Dateien) feuerte vorher fire-and-forget alle OCR-Calls quasi parallel an Claude Vision → bei Anthropic Tier 1 (50K ITPM) brachen 30+ Belege mit OCR-Fehler ab. Drei-stufige Härtung:
- **Server-Semaphor** in `app/api/admin/belege/[id]/ocr/route.ts`: process-lokale Queue mit `OCR_MAX_CONCURRENT=3`. Anfragen warten in `ocrWaiters[]` bis ein Slot frei ist. Bei 50 parallelen Bulk-Uploads laufen also nur 3 OCRs gleichzeitig, Rest staut sich am Semaphor — kein Hard-Fail mehr durch ITPM-Burst.
- **Anthropic-SDK `maxRetries: 5`** in `lib/ai/invoice-extract.ts`: SDK macht jetzt 5 Retries mit exponential backoff bei 429/529, vorher waren das die SDK-Defaults (2). Fängt verbleibende Rate-Limit-Hits zwischen den Semaphor-Slots auf.
- **Retry-Endpoint** `POST /api/admin/belege/retry-failed-ocr`: scannt `ocr_status='failed'` im aktuellen Test/Live-Modus, verarbeitet bis zu 5 Belege sequenziell pro Request via Internal-Fetch auf den OCR-Endpoint (mit Cookie-Forward für Session-Auth), 1 s Delay zwischen Calls. UI-Button auf `/admin/buchhaltung/belege` mit Auto-Loop bis `remaining=0`, Stoppen-Button für Abbruch.
- **`maxDuration = 300`** auf der OCR-Route, da Coolify-Default-Timeout bei langen Vision-Calls + Semaphor-Wartezeit sonst greift.
- **Fehler prominent auf Detail-Seite** (`/admin/buchhaltung/belege/[id]`): roter Banner mit `ocr_error`-Text + „🔄 OCR neu starten"-Button für Einzelfälle. Vorher war der Fehler nur via Hover-Tooltip auf der Liste sichtbar.

**Audit-Log:** `beleg.retry_failed_ocr` mit `{retried, succeeded, remaining}` in changes.

### Belege-Duplikat-Erkennung (Stand 2026-05-09)
Zusätzlich zum bestehenden file-hash-Check (byte-identische Datei) erkennt das System jetzt **inhaltliche Duplikate**:
- **Strict-Match:** gleicher `lieferant_id` + gleiche `rechnungsnummer_lieferant` (de-facto-Beweis, weil jeder Lieferant Rechnungsnummern nur einmal vergibt)
- **Soft-Match:** gleicher `lieferant_id` + gleiches `beleg_datum` + gleiche `summe_brutto` (cents-genau, ±0,005 €)

**Trigger:** Nach OCR-Abschluss, nach manueller Anlage (`POST /api/admin/belege`) und nach PATCH dup-relevanter Felder.

**DB:** Drei neue Spalten auf `belege`: `verdacht_duplikat_beleg_id` (UUID FK Self), `verdacht_duplikat_grund` (TEXT), `verdacht_duplikat_dismissed_at` (TIMESTAMPTZ). Migration `supabase/supabase-belege-content-dedup.sql` (idempotent, defensiver Code falls noch nicht durch).

**UI:**
- Detail-Page (`/admin/buchhaltung/belege/[id]`): Roter Banner mit Link auf Original + zwei Buttons („Diesen Beleg löschen" / „Kein Duplikat — fortfahren")
- Liste (`/admin/buchhaltung/belege`): rosa Badge „⚠ Duplikat-Verdacht" neben dem OCR-Fehler-Badge
- Liste hat zusätzlich Button „🔍 Duplikate scannen" → markiert auch bereits bestehende Duplikate (POST `/api/admin/belege/scan-duplicates`)

**Hard-Block:** `POST /api/admin/belege/[id]/festschreiben` lehnt mit 409 ab solange `verdacht_duplikat_beleg_id` gesetzt und nicht dismissed ist.

**Dismiss:** `POST /api/admin/belege/[id]/dismiss-duplicate` setzt `verdacht_duplikat_dismissed_at = now()`. Die FK-Referenz bleibt für Audit-Trail erhalten.

**Notification:** Neuer Typ `beleg_duplicate` (amber, Permission `finanzen`). OCR-Pfad sendet bei Verdacht statt der gewohnten `beleg_ready`-Push diese amber Variante.

**Audit-Aktionen:** `beleg.dismiss_duplicate`, `beleg.scan_duplicates`. `beleg.ocr` enthält jetzt `duplicate_kind: 'strict'|'soft'|null` in changes.

### Belege: Positionen inline bearbeiten (Stand 2026-05-21)
Die Beleg-Detailseite (`/admin/buchhaltung/belege/[id]`) hatte alle Positions-Felder hart auf `disabled` — eine fehlerhafte OCR-Analyse (Bezeichnung, Menge, Netto, MwSt %) liess sich gar nicht über die UI korrigieren, obwohl `PATCH /api/admin/beleg-positionen/[id]` das längst unterstützt. Jetzt: pro Position ein **„✏ Bearbeiten"-Button** in der Sub-Zeile (sichtbar nur wenn Beleg nicht festgeschrieben und Position nicht `locked`). Klick → Felder Bezeichnung/Menge/Einzel-Netto/MwSt % werden editierbar (cyan Rahmen), **Einzel-Brutto bleibt read-only und wird live aus Netto × MwSt berechnet** (das Datenmodell speichert Netto + MwSt-Satz, Brutto ist abgeleitet — eine Amazon-Rechnung mit eigener USt-Rundung kann daher 1 Cent abweichen, für Kleinunternehmer/EÜR irrelevant). „Speichern" schickt die Korrektur an die bestehende API (`recomputeBelegSummen` aktualisiert die Beleg-Summen), „Abbrechen" verwirft. Validierung clientseitig (Bezeichnung nicht leer, Netto ≥ 0, Menge ≥ 1, MwSt 0–100). Eine Position gleichzeitig editierbar. Audit: `beleg_position.update` (bereits vorhanden).

### Belege: Bundle-Verknüpfung — mehrere Inventar-Stücke + WBW auf einmal (Stand 2026-05-21)
Bundle-Einkäufe (z.B. 3 Akkus + Ladestation für 49,99 € als EINE Beleg-Position)
liessen sich bisher nur Stück für Stück verknüpfen, und der anteilige
Beleg-Kaufpreis taugte nicht als Wiederbeschaffungswert. Neu: pro Beleg-Position
(klassifiziert als `afa|gwg|verbrauch`) ein Button **„🔗 Inventar verknüpfen"**
in der Sub-Zeile → Modal `components/admin/InventarVerknuepfModal.tsx`.
- Modal lädt freie Inventar-Stücke (`GET /api/admin/inventar?beleg_status=beleg_fehlt`),
  Suchfeld, Checkbox-Liste, pro Zeile ein WBW-Feld + ein „Wert für alle
  Gewählten"-Feld. Mengen-Cap = `position.menge − bereits verknüpft`.
- **`POST /api/admin/beleg-positionen/[id]/verknuepfen`** (neu): Body
  `{ items: [{inventar_unit_id, wbw?}] }`. Verknüpft alle Stücke in einem Rutsch
  (`inventar_verknuepfung`, `stueck_anteil=1`), setzt `kaufpreis_netto`/
  `kaufdatum` aus der Position (Brutto bei Kleinunternehmer) und — falls `wbw`
  angegeben — `wiederbeschaffungswert=wbw, wbw_manuell_gesetzt=true` (manueller
  Override, der die Kaufpreis-basierte WBW-Formel umgeht). Ohne `wbw`: gleiche
  Init wie die Einzel-Verknüpfung. Mengen-Limit wird serverseitig geprüft (409).
  Funktioniert auch bei festgeschriebenen Belegen (Verknüpfen ist kein
  inhaltlicher Beleg-Edit). Audit: `inventar.verknuepfen_bulk`.
- Hinweis bleibt: eine „Bundle Menge 1"-Position kann nur 1 Stück aufnehmen —
  der Beleg muss die echte Stückzahl als `menge` führen (bzw. in mehrere
  Positionen aufgeteilt sein).

### Noch offen
- **Inbound-E-Mail Go-Live (IMAP-Polling):**
  1. Migration `supabase/supabase-inbound-email.sql` ausführen. Ohne Migration
     bricht der Cron `/api/cron/inbound-email-poll` pro Mail mit
     `migration_pending` ab (Lauf wird abgebrochen, UID-Stand NICHT vorgerückt
     → nach der Migration wird ab der Stelle weitergemacht); `/admin/nachrichten`
     fällt defensiv auf das alte Schema zurück.
  2. Supabase Storage-Bucket `email-attachments` anlegen (privat, ~25 MB,
     MIME-Allowlist leer lassen — siehe Kommentar in der Migration).
  3. Im Google-Konto `kontakt@cam2rent.de`: 2-Faktor aktivieren → **App-Passwort**
     erzeugen (Google-Konto → Sicherheit → App-Passwörter) + IMAP im
     Gmail-Postfach aktivieren (Einstellungen → Weiterleitung & POP/IMAP).
  4. Coolify-Env: `INBOUND_IMAP_USER=kontakt@cam2rent.de` +
     `INBOUND_IMAP_PASSWORD=<App-Passwort>` (optional `INBOUND_IMAP_HOST`/`PORT`).
  5. Hetzner-Crontab (alle 3 Min):
     ```
     */3 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/inbound-email-poll
     ```
  Hinweis: Der erste Cron-Lauf „stellt scharf" — er importiert den
  Postfach-Bestand NICHT rückwirkend, sondern erfasst nur ab dann eingehende
  Mails. Eine Test-Mail nach dem zweiten Lauf bestätigt das Setup.
- **Pro-Mitarbeiter-Postfächer Go-Live:** Migration
  `supabase/supabase-inbound-email-per-employee.sql` ausführen. Dann pro
  Mitarbeiter in Google Workspace einen **Alias** `name@cam2rent.de` am
  Support-Konto anlegen (kostenlos, bis 30 Aliase) und dieselbe Adresse unter
  `/admin/einstellungen/mitarbeiter` im Feld „Postfach-Adresse" eintragen.
  Ohne die Migration läuft die Basis-Inbound-Funktion weiter (alle
  Konversationen unzugeordnet, für alle sichtbar). Echte separate
  Google-Konten statt Aliasen wären auch möglich, brauchen aber eine
  Cron-Erweiterung (mehrere IMAP-Logins) — aktuell pollt der Cron ein Postfach.
- **Tracking-Carrier + Retoure-Tracking Migration auszuführen:** `supabase/supabase-bookings-tracking-carrier-return.sql` (idempotent). Legt vier neue Spalten an: `tracking_carrier`, `return_tracking_number`, `return_tracking_url`, `return_tracking_carrier` (CHECK auf DHL/DPD, NULL erlaubt). Ohne Migration läuft der bestehende Hin-Versand-Workflow (ship-booking) per defensivem Retry weiter (tracking_carrier wird gedroppt). Die neue Trackingnummer-Bearbeitung in `/admin/buchungen/[id]` antwortet bei fehlender Spalte mit 503; Retoure-Tracking-Edit wird komplett geblockt. Empfohlen ASAP ausführen.
- **Bestellbearbeitungs-Migration auszuführen:** `supabase/supabase-bookings-edit-adjustment.sql` (idempotent). Legt `bookings.adjustment_payment_link_id/amount/status/note` an. Ohne Migration läuft die komplette Bestellbearbeitung weiter (Zahlungslink/Refund werden ausgeführt, Doku landet in `notes`), nur die strukturierten `adjustment_*`-Felder + der Webhook-Status-Sync („Nachzahlung bezahlt") greifen erst nach der Migration. Empfohlen ASAP ausführen.
- **Verkauf-Migration auszuführen:** `supabase/supabase-bookings-verkauf.sql` (idempotent). Legt `bookings.booking_type` (DEFAULT `miete`) + `bookings.sale_items` JSONB an. Ohne Migration liefert `POST /api/admin/verkauf` 503; die Miet-Ansichten laufen per defensivem Fallback unverändert weiter. Empfohlen ASAP ausführen, damit das Verkaufs-Tool nutzbar ist.
- **Multi-Kamera-Migrationen auszuführen (3, idempotent):**
  `supabase/supabase-bookings-cameras.sql` (Spalte `bookings.cameras JSONB`),
  `supabase/supabase-camera-unit-assignment.sql` (RPC `assign_free_camera_units`
  + `assign_free_unit`-Update inkl. cameras[]-Belegung),
  `supabase/supabase-damage-reports-camera-unit.sql` (`damage_reports.camera_unit_id`).
  Ohne die Migrationen läuft alles über den defensiven Legacy-Fallback
  (`resolveBookingCameras` aus `product_name`/`unit_id`) — gemischte Modelle
  / echtes Multi-Unit-Tracking greifen erst NACH den Migrationen. RPC fehlt ⇒
  `assignCamerasToBooking` no-op (Buchung ok, nur keine Kamera-Zuweisung).
  Empfohlen ASAP ausführen. **Folge-Change offen:** Pro-Kamera-Schaden-Modal
  (analog `AccessoryDamageModal`) — Spalte ist da, UI fehlt bewusst.
- **Erstattung/Fehlbuchung-Migration auszuführen:** `supabase/supabase-bookings-refund.sql` (idempotent). Legt `bookings.refund_amount` + `bookings.refund_note` + `stripe_transactions.reconciliation_note` an. Ohne Migration laufen EÜR + DATEV + Stripe-Abgleich per defensivem Fallback-Select weiter (refund_amount = 0, kein Abzug); der „Erstattung erfassen"-Button liefert für verknüpfte Buchungen 503 „Migration ausstehend". Empfohlen ASAP ausführen, sonst greift der Teilerstattungs-Abzug nicht.
- **Buchungsnummer-Counter-Migration auszuführen:** `supabase/supabase-booking-id-counter.sql` (idempotent). Legt Tabelle `booking_id_counter` + RPC `next_booking_counter` an, seedet aus existierenden `bookings.id`-Suffixen. Ohne Migration läuft `generateBookingId()` über den Fallback (COUNT-Kandidat + SELECT-Verifikation gegen `bookings.id` mit Suffix-Increment-Loop) — sequenziell sicher, aber NICHT parallel-sicher. Mit Migration zusätzlich parallel-sicher via atomarem `INSERT ON CONFLICT`. Empfohlen ASAP ausführen.
- **Belege-Duplikat-Migration auszuführen:** `supabase/supabase-belege-content-dedup.sql` (idempotent). Drei neue Spalten auf `belege`. Ohne Migration laufen OCR/Anlage/PATCH per defensivem Retry weiter (Verdacht-Flag wird einfach nicht persistiert), Dismiss-Endpoint liefert 503, Festschreiben blockt nichts. Nach Migration sofort einmal „🔍 Duplikate scannen" auf `/admin/buchhaltung/belege` klicken — markiert die bereits eingebuchten Duplikate.
- **Wiederbeschaffungswert-Migration auszuführen:** `supabase/supabase-assets-replacement-value-estimate.sql` (idempotent). Legt Spalte `assets.replacement_value_estimate` an. Ohne Migration laufen GWG-Anlage und Anlagen-POST per defensivem Retry weiter ohne die Spalte; Vertrag und Zubehör-Schaden-Modal fallen dann auf den Buchwert zurueck (bei GWG = 0 EUR — fuehrt zu falschen Vorschlaegen).
- **Tech-Debt-Performance-Indizes auszuführen:** `supabase/supabase-tech-debt-indizes.sql` (additiv, idempotent, CONCURRENTLY — kein Live-Lock). Drei Indizes fuer Hot-Paths: `invoices(is_test, invoice_date)`, `expenses(category) WHERE deleted_at IS NULL`, `inventar_verknuepfung(beleg_position_id)` (3. nur wenn neue Buchhaltungs-Welt migriert). Ohne Migration laeuft alles weiter, nur Listen unter `/admin/buchhaltung` sind langsamer bei vielen Eintraegen.
- **GWG-Klassifikation Migration auszuführen:** `supabase/supabase-purchase-items-gwg.sql` (idempotent). Erweitert den CHECK-Constraint von `purchase_items.classification` um `'gwg'`. Ohne Migration laeuft der Asset-/Expense-Pfad weiter, aber die Speicherung von GWG-Klassifizierungen schlaegt mit constraint-violation fehl. Die UI zeigt den Button trotzdem an — er wirft dann beim Save einen Fehler.
- **Einkauf-Belege-Migration auszuführen:** `supabase/supabase-purchase-attachments.sql` (idempotent). Legt Tabelle `purchase_attachments` an (id, purchase_id FK CASCADE, storage_path, filename, mime_type, size_bytes, kind `invoice|receipt|delivery_note|other`, created_at) + RLS service-role-only. Ohne Migration läuft alles weiter (defensive Fallbacks: `/api/admin/purchases` liefert leere `attachments[]`, `/api/admin/purchases/upload` Haupt-Beleg-Insert wird stumm geskippt). Anhang-Upload-Endpunkt liefert dann 500 — manueller Workflow + KI-Workflow beim ersten Beleg unverändert. Bucket `purchase-invoices` wird wiederverwendet.
- **Zubehör-Bestandteile Migration auszuführen:** `supabase/supabase-accessories-included-parts.sql` (idempotent). Fügt nullable Spalte `included_parts TEXT[] DEFAULT '{}'` zu `accessories`. Ohne Migration ignorieren die APIs den Wert (defensiver Retry-Pfad), die Admin-UI speichert dann leer, Pack-Workflow + PDF zeigen keine Bestandteile.
- **Buchhaltungs-Refactor Migration auszuführen:** `supabase/supabase-buchhaltung-foundation.sql` (idempotent). Fügt nullable Spalten `account_code` + `internal_beleg_no` zu invoices/expenses/credit_notes/purchases/purchase_items/assets hinzu, initialisiert `period_locks` + `kontenrahmen_mapping` Settings. Heute keine Wirkung — bereit fuer Belegjournal/Regelbesteuerung-Wechsel.
- **Zubehör-Exemplar-Tracking Phase 3A + 3B (Migrationen auszuführen, beide idempotent):**
  1. `supabase/supabase-assets-accessory-unit-id.sql` (3A) — Spalte `assets.accessory_unit_id` mit FK auf `accessory_units(id)` + Index. Ohne Migration schlägt der „+ erfassen"-Button im AccessoryUnitsManager mit 500 fehl.
  2. `supabase/supabase-damage-reports-accessory-unit.sql` (3B) — Spalte `damage_reports.accessory_unit_id` mit FK auf `accessory_units(id)` + Index. Ohne Migration schlägt der Submit im Zubehör-Schaden-Modal mit 500 fehl.
- Nach der Push-Migration: alle Mitarbeiter müssen einmal Push neu aktivieren unter `/admin/einstellungen` → "Push aktivieren", damit ihre Subscription mit dem Mitarbeiter-Account verknüpft wird (sonst kriegen sie weiterhin alle Notifications wie ein Owner).
- **Cron-Eintrag AfA monatlich in Hetzner-Crontab:**
  `0 3 1 * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/depreciation`
- **Cron-Eintrag DSGVO-Cleanup taeglich (Sweep 8 K13):**
  `30 3 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/dsgvo-cleanup`
  Räumt Ausweis-Scans nach 90 Tagen, page_views nach 90 Tagen, client_errors nach 30 Tagen, email_log ohne booking_id nach 24 Monaten. Setzt das Versprechen aus der Datenschutzerklärung um.
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
- **Cron-Eintrag stripe-sync in Hetzner-Crontab eintragen (stuendlicher Stripe-Abgleich):**
  `0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/stripe-sync`
  Synchronisiert jede Stunde automatisch den aktuellen Monat (= manueller „Synchronisieren"-Button im Stripe-Abgleich-Tab). Ohne den Crontab-Eintrag bleibt nur der manuelle Button.
- **Cron-Eintrag reels-generate in Hetzner-Crontab eintragen:**
  `0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-generate`
  Generiert stündlich Reels aus dem `social_reel_plan`-Redaktionsplan. Wochentag + Zeitfenster werden aus `admin_settings.reels_settings` (Auto-Generierungs-Card in `/admin/social/reels/einstellungen`) geladen. Im Test-Modus automatisch deaktiviert (kein OpenAI/Pexels-Spend).
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
