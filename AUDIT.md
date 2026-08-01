# cam2rent — Korrektheits-Audit

**Auftrag:** Vollständige Prüfung des Codes auf Plausibilität/Richtigkeit jeder Berechnung und jedes Verweises — gelesen, nicht geraten. Nur Prüfung, **keine Code-Änderungen**.

**Umfang:** Next.js 15, ~940 TS/TSX-Dateien, ~210.000 Zeilen, 413 API-Routen. Live-Shop mit echtem Geldfluss (Stripe), Buchhaltung (EÜR/DATEV/USt), Verträgen, Inventar.

**Methodik:** Der Code wurde in 21 Domänen partitioniert; jede Domäne von einem Prüf-Agenten vollständig gelesen, Befunde adversarial gegengeprüft (widerlegt bevor bestätigt) und gegen die in `CLAUDE.md` dokumentierten *bewussten* Trade-offs abgeglichen. Fokus: falsche Arithmetik, falsche Verweise, Off-by-one, fehlende Filter (`is_test`/`deleted_at`/Status), Zeitzonen-Kippen, Doppel-/Fehlabzüge, Divergenzen derselben Berechnung an mehreren Orten. **Nicht** Gegenstand: Security-Härtung (bereits durch Sweeps 5–9 abgedeckt), Stil, Performance.

**Legende:**
- Verdikt **CONFIRMED** = an der Zeile belegt · **PLAUSIBLE** = Rest-Unsicherheit / hängt an Daten-/Laufzeitbedingung.
- Klassifikation: **BUG** = echter Fehler · **TRADE-OFF** = bewusst laut CLAUDE.md (dennoch gelistet, mit Bewertung) · **DOKU↔CODE** = Doku widerspricht Code.

**Status:** 15/21 Domänen tief auditiert (1, 4, 5, 6, 8, 9, 10, 12, 15, 16, 17, 18, 19, 20, 21). **6 Domänen ausstehend** (liefen ins temporäre Session-Limit): 2 (Storno), 3 (Verfügbarkeit/Inventar), 7 (Verträge), 11 (Datum/TZ-Querschnitt), 13 (Push), 14 (Inventar-Scan) — für diese liegen bereits die Kartierungs-Vorbefunde vor (unten Abschnitt „Ausstehend"). Die WBW- (Domäne 4) und Zahlungs- (Domäne 6) Kernbefunde sind bereits tief belegt.

---

## Executive Summary — die wichtigsten Befunde

**Geld direkt betroffen:**
1. **Zweite Mietverlängerung wird verschluckt** — Kunde zahlt, bekommt keine Verlängerung, kein Refund (`confirm-extension`). → **[H-1]**
2. **`not_combinable`-Gutschein + Auto-Rabatt = Overcharge** — Kunde zahlt zu viel (`checkout`). → **[H-8]**
3. **Mietvertrag-PDF/Bestätigung zeigt falschen Betrag** bei Sonderkondition (vollen statt gezahlten). → **[H-2]**
4. **Bestellbearbeitung fordert ausgehandelten Rabatt zurück** (Phantom-Nachzahlung). → **[H-2]**

**Buchhaltung falsch (Steuer/Reports):**
5. **EÜR & DATEV überzeichnen den Umsatz** — mehrere Rabatt-Typen werden nicht abgezogen; EÜR und DATEV widersprechen sich sogar. → **[H-3, H-4]**
6. **Gelöschte Ausgaben mindern weiter den EÜR-Gewinn** (fehlender `deleted_at`-Filter). → **[H-5]**
7. **Lineare AfA der neuen Buchhaltungs-Welt fehlt komplett in EÜR/DATEV.** → **[H-6]**
8. **Report-Umsatz ist nicht deterministisch** — hängt vom Zahlungs-Race-Sieger ab. → **[H-7]**
9. **Tagesbericht zeigt dauerhaft 0 €** (falscher Spaltenname). → **[H-9]**

**Recht/Verträge:**
10. **Zwei divergierende Wiederbeschaffungswert-Formeln** → Mietvertrag ≠ Inventaransicht für dasselbe Gerät. → **[H-10]**
11. **`sync:legal` bricht den Rechtstext-Guard-Test** (Pflicht-Formulierung nicht allowlistet). → **[H-11]**
12. **Consent-Banner/Cookie-Richtlinie versprechen mehr Einwilligungssteuerung als der Code liefert** (Rechts-Risiko). → **[M-…]**

**Betrieb:**
13. Reformationstag fälschlich als Berliner Feiertag → Versandkalender jährlich falsch gesperrt.
14. Diverse Permission-Mapping-Lücken (Über-/Unter-Zugriff, 403 in Admin-Tools).

---

## HOCH — geld-/steuer-/rechtsrelevant

### [H-1] Zweite Mietverlängerung wird verschluckt — Kunde zahlt ohne Gegenleistung
`app/api/confirm-extension/route.ts:188-208` · **BUG · CONFIRMED**
Der Idempotenz-Guard `.is('extension_payment_intent_id', null)` schützt nur die **erste** Verlängerung. `extend-booking` erlaubt eine zweite Verlängerung und erzeugt `pi_B`; der Kunde zahlt. Beim Persistieren matcht das UPDATE wegen des bereits gesetzten `pi_A` **0 Zeilen** → `updated=null, updateError=null` → Zweig `if (!updateError && !updated)` liefert `success:true, "Bereits verlängert."`. Ergebnis: `pi_B` eingezogen, `rental_to`/`days`/`price_total` unverändert, **kein Refund**, kein Webhook-Handler für `type='extension'` heilt es. **Szenario:** Buchung 5→8 Tage (bezahlt), später 8→12 Tage: 2,00-€ (oder mehr) werden abgebucht, Verlängerung findet nicht statt.

### [H-2] `booking_edit` + `confirm-cart`-Bestätigung/Vertrag ignorieren `special_discount` & `early_bird_discount`
`app/api/admin/booking/[id]/route.ts:1277-1442` · `app/api/confirm-cart/route.ts:1316-1358` · **BUG · CONFIRMED**
Preis-Recompute nutzt nur `discount_amount`/`duration_discount`/`loyalty_discount`. `special_discount` + `early_bird_discount` werden nicht gelesen/nicht neu geschrieben.
- **Bestellbearbeitung:** Kunde mit 15 % Sonderkondition (`discount_amount=0`, `special_discount=15`, `price_total` bereits reduziert). Admin ändert nur die Haftung → `discountTotal=0` → `computedTotal` liegt ~15 € über `price_total` → **Stripe-Nachzahlungslink über 15 €** wird dem Kunden gemailt; `special_discount` bleibt stale.
- **confirm-cart Frisch-Insert (E-Mail + Mietvertrag-PDF):** Der `after()`-Block rechnet `groupTotal` roh ohne `serverSpecialTotal` → Bestätigungsmail **und das signierte Mietvertrags-PDF** weisen z.B. 200 € aus, obwohl 160 € abgebucht wurden. Rechtsdokument mit falschem Betrag. (Der idempotente Race-Pfad nutzt korrekt `fullBooking.price_total`.)
- **Folge Rechnung:** invoice-pdf zeigt „Frühbucherrabatt"/„Sonderkondition (%)"-Zeilen aus den stale Feldern, die nicht mehr auf den Gesamtbetrag summieren.

### [H-3] EÜR überzeichnet Umsatz/Gewinn — `early_bird_discount` + `special_discount` nicht abgezogen
`app/api/admin/buchhaltung/reports/euer/route.ts:54,109` · **BUG · CONFIRMED**
Spalten werden nicht geladen; `d = discount_amount + duration_discount + loyalty_discount`. Einnahme wird aus Katalog-Komponenten − Teil-Rabatt rekonstruiert. **Szenario:** `price_rental=200`, Sonderkondition 10 % → `special_discount=20`, `price_total=180`. EÜR-Einnahme = 200 (statt 180). Folge: zu hoher Gewinn → zu hohe Einkommensteuer + inflationierte §-19-Grenzbeobachtung (22.000 €).

### [H-4] DATEV überzeichnet Umsatz UND widerspricht der EÜR
`app/api/admin/datev-export/route.ts:245` · `.../preview-rows/route.ts:73` · **BUG · CONFIRMED**
`rentalAmount = price_rental + price_accessories − discount_amount − refund_amount` — zieht **nur** `discount_amount` ab (nicht duration/loyalty/early_bird/special). **Szenario:** Katalog 200, `duration_discount=30`, `price_total=170`. DATEV-Erlös = 200; EÜR liefert 170 → **dieselbe Buchung, zwei Steuerzahlen**.

### [H-5] EÜR-Ausgaben ohne `deleted_at`-Filter — gelöschte Ausgaben zählen weiter
`app/api/admin/buchhaltung/reports/euer/route.ts:215-221` · **BUG · CONFIRMED**
Query hat nur `.eq('is_test',false)` + Datum, **kein** `.is('deleted_at', null)` (ust-vorbereitung:66 hat ihn korrekt). `expenses` nutzt Soft-Delete. **Szenario:** Admin löscht Fehlbuchung „Hardware 500 €" → EÜR zieht 500 € weiter ab → Gewinn/Steuer zu niedrig; USt-Vorbereitung zeigt sie korrekt nicht.

### [H-6] Lineare AfA der neuen Buchhaltungs-Welt fehlt in EÜR & DATEV
`euer/route.ts:215-259` · `datev-export/route.ts:298-304` vs `lib/buchhaltung/afa-cron.ts:89` · **BUG · CONFIRMED (Code-Ebene)**
Der monatliche `afa-cron` schreibt ausschließlich nach `afa_buchungen` (kein `expenses`-Eintrag). EÜR liest `expenses`+`beleg_positionen` (afa bewusst ausgeschlossen), DATEV liest AfA nur aus `expenses.category='depreciation'`. **Kein Report liest `afa_buchungen`** → für linear abgeschriebene Anlagegüter der neuen Welt verschwindet der monatliche Abschreibungsaufwand aus EÜR/DATEV → Gewinn überzeichnet. (GWG neu + alte Welt sind ok.)

### [H-7] Report-Umsatz nicht deterministisch — Rabatt-Persistenz hängt vom Race-Sieger ab
`app/api/stripe-webhook/route.ts:788-828` (handleCartBooking) vs `app/api/confirm-cart/route.ts:703-719` · **BUG · CONFIRMED**
`confirm-cart` schreibt pro Perioden-Gruppe **skalierte** Rabatte und merged `product_discount` in `discount_amount`. `handleCartBooking` schreibt **eine** aggregierte Buchung mit **unskalierten** Werten und lädt `product_discount` gar nicht. **Szenario:** 25 % Produktaktion (`product_discount=50`) + Coupon 10. Gewinnt confirm-cart → `discount_amount=60`; gewinnt der Webhook → `discount_amount=10`, die 50 € fehlen in jeder Spalte → EÜR/DATEV +50 € zu hoch. `price_total` selbst ist in beiden Pfaden korrekt (`intent.amount/100`).

### [H-8] `not_combinable`-Gutschein + Auto-Rabatt = echter Overcharge
`app/checkout/page.tsx:595-651` · **BUG · CONFIRMED**
`afterAutoDiscounts = cartTotal − autoDiscountCapped` zieht Mietdauer-/Frühbucher-/Treuerabatt ab; für `target_type='all'` ist die Coupon-Basis `afterAutoDiscounts`. Ist der Coupon `not_combinable`, werden die Auto-Rabatte auf 0 gesetzt — **aber die Coupon-Basis wurde bereits gekürzt**. **Szenario:** Warenkorb 100 €, 5 % Mietdauerrabatt, Coupon 20 % `not_combinable`: `afterAutoDiscounts=95` → Coupon 19 → Kunde zahlt **81 €** statt korrekt 80 € (20 % von 100). Mit 15 % Mietdauer → 83 € statt 80 (**3 € Overcharge**, skaliert mit dem Prozentsatz).

### [H-9] Tagesbericht zeigt dauerhaft 0 € / 0 Buchungen
`app/api/cron/daily-report/route.ts:58,81` · **BUG · CONFIRMED**
Selektiert/summiert `total_price`; die Spalte heißt überall `price_total`. PostgREST-Fehler → `data=null` → `bookings=[]` → jeder Tagesbericht meldet „0 Buchungen · 0,00 € · 0 % Conversion". (Die Analytics-Seite hatte exakt diesen Bug bereits gefixt; daily-report wurde übersehen.)

### [H-10] Zwei divergierende WBW-Formeln → Mietvertrag ≠ Inventaransicht
`lib/inventar/wiederbeschaffungswert.ts:102-105` (`computeWBW`) vs `lib/replacement-value.ts:140-148` (`computeReplacementValue`) · **BUG · CONFIRMED**
Beide werden auf dieselben `inventar_units`-Daten angewandt. Formel A: lokale Getter, **kein** Tages-Cut (genutzt von der Inventar-Liste). Formel B: UTC-Getter **mit** Tages-Cut (genutzt von Mietvertrag, Haftungs-Box, Wiederbeschaffungssicht). **Szenario:** Kaufpreis 1000 €, Kauf 2024-11-15, floor 40 %, life 36, Stichtag 2026-05-01: Formel A = 18 Monate → **700,00 €** (Inventar), Formel B = 17 Monate (Day-Cut) → **716,67 €** (Vertrag). Dasselbe Stück, zwei Werte; der rechtlich relevante Mietvertrag weicht ab. Zusätzlich: Missing-Value divergiert (A → `null`, B → `0`) und Config-Validierung/-Caching (A rundet `useful_life_months`+5-Min-Cache, B nicht).

### [H-11] `npm run sync:legal` bricht den Rechtstext-Guard-Test
`scripts/sync-legal-fallbacks.ts` ↔ `lib/__tests__/widerruf-consistency.test.ts:148` · **BUG (latent) · CONFIRMED**
Der Guard grept `app lib components data` nach „Versicherung" und verlangt jeden Treffer in `VERSICHERUNG_ALLOWLIST`. Der dokumentierte Go-Live-Schritt `sync:legal` schreibt die AGB-Markdown inkl. der **rechtlich zwingenden** Formulierung „keine Versicherung im Sinne des VVG" nach `lib/legal/generated-fallbacks.ts` — diese Datei ist **nicht** allowlistet → Test schlägt deterministisch fehl. (Zusatzrisiko: enthält die DB-Widerrufsbelehrung noch „312g", bricht zusätzlich `expect(grepFiles('312g')).toEqual([])`.)

---

## MITTEL

### [M-1] WBW Missing-Value: beleglose Zubehörteile still mit 0 € in der max. Ersatzpflicht
`lib/inventar/wiederbeschaffungswert.ts:89-91` vs `lib/replacement-value.ts:63-64` · **BUG-Randfall · CONFIRMED/PLAUSIBLE**
Fehlt `kaufpreis_netto`: `computeWBW`→null (Inventar zeigt „Nicht gesetzt"), Haftungs-Box/Vertrag→0. Bei Buchung **„Ohne Haftungsschutz"** ist `customerMax = totalWbw`; ein beleglos-getracktes Zubehör trägt 0 € bei → die maximale Ersatzpflicht des Mieters ist um dessen realen Wert **zu niedrig** ausgewiesen. Für Kameras greift der Deposit-Fallback, für Zubehör nicht.

### [M-2] USt-Umsatz (Σ `price_total`) ≠ EÜR-Umsatz (Komponenten-Rekonstruktion)
`ust-vorbereitung/route.ts:39` vs `euer/route.ts:104-211` · **BUG/Logik-Divergenz · CONFIRMED**
USt summiert `price_total` (kein Rabatt-, kein Refund-Abzug); EÜR rekonstruiert aus Komponenten − Rabatt − `refund_amount`. **Szenario:** `price_total=180`, `refund_amount=30`: USt-Umsatz 180, EÜR-Einnahme 150 → zwei „Umsatz"-Zahlen für denselben Zeitraum.

### [M-3] EÜR + USt zählen unbezahlte Buchungen als Umsatz (Zufluss-Prinzip verletzt)
`euer:59` · `ust-vorbereitung:35` · **BUG · PLAUSIBLE**
Filter nur `.neq('status','cancelled')` → `awaiting_payment`/`pending_verification` (Geld nicht geflossen) zählen voll. EÜR (§4 Abs.3 EStG) ist Zufluss-basiert. Betrag korrigiert sich meist per Auto-Storno, aber der Monatsbericht kann zwischenzeitlich Phantom-Umsatz zeigen.

### [M-4] Stripe-Sync/Gebühren-Import nicht tester-bewusst
`lib/buchhaltung/stripe-sync.ts:92` · `.../import-fees/route.ts:88,96-101` · **BUG · CONFIRMED**
`stripe_transactions.is_test` = globaler env-Modus (nicht abhängig von der gematchten Buchung); `import-fees` lädt Transaktionen ganz ohne `is_test`-Filter. → Tester-Stripe-Gebühr kann als Live-Ausgabe verbucht werden und die Live-EÜR mindern, obwohl die Buchung aus Reports isoliert ist.

### [M-5] Set-Default-`pricing_mode` divergiert (NULL-Spalte)
`app/admin/buchungen/neu/page.tsx:121` (`?? 'perDay'`) vs `lib/booking/verify-accessory-price.ts:90` (`?? 'flat'`) vs `buchen/page.tsx:1274` (effektiv flat) · **BUG · CONFIRMED (Auftreten datenabhängig)**
Fehlt `sets.pricing_mode`, rechnet die Admin-Manuellbuchung `price×days`, die Kundenseite `price`. **Szenario:** Set 20 €, 5 Tage → Admin 100 €, Kunde 20 €; `verifyAccessoryPrice` würde eine perDay-Set-Buchung als „mismatch" (100 vs 20) melden. (Zubehör-Default `perDay` ist überall konsistent; nur Sets divergieren.)

### [M-6] Auslastung ignoriert `is_test` → Test-Buchungen in Live-Kennzahl
`lib/camera-utilization.ts:68-73` · **BUG · CONFIRMED**
`computeCameraUtilization` filtert Buchungen nicht nach `is_test`. Shared lib → Analytics-Kamera-Performance **und** Dashboard-Widget. Im Live-Modus erhöhen Test-Buchungen die Auslastung; im Test-Modus zählen Live-Buchungen mit.

### [M-7] Auslastung/History ignorieren vergangene `custom`-Zeiträume
`app/api/admin/analytics/route.ts:556-557` (+ `page.tsx` History) · **BUG · CONFIRMED**
`computeCameraUtilization(days)` misst immer die letzten N Tage **bis heute**, nicht `startISO..endISO`. **Szenario:** custom „01.–31.01.2026" (Vergangenheit) → Auslastung/Besucher-Verlauf zeigen ein aktuelles Fenster bzw. bleiben leer.

### [M-8] Auto-Reels: Fehler wird als Erfolg gewertet
`app/api/cron/reels-generate/route.ts:132-160` · **BUG · CONFIRMED**
`generateReel()` wirft ab dem Row-Insert nie mehr, sondern gibt `{status:'failed'}` zurück; der Cron prüft das Result nicht → Plan-Zeile → `generated` (Fehler gelöscht), im Voll-Modus Reel → `scheduled`, im Semi-Modus Review-Push für ein fehlgeschlagenes Reel → der Termin fällt still aus. (`social-generate` macht es korrekt, weil `generateCaption` wirft.)

### [M-9] Saison-Skip fehlt im automatischen Social-Generierungspfad
`app/api/cron/social-generate/route.ts:129-317` · **BUG + DOKU↔CODE · CONFIRMED**
Der Cron reimplementiert die Generierung inline, ruft **nicht** `isTopicOutOfSeason()` und übergibt `generateCaption` kein `postDate` → ein „Skitour"-Thema im Juli wird generiert (der Sofort-Button würde es überspringen). CLAUDE.md behauptet, die Kern-Logik sei extrahiert und werde „auch vom Cron aufgerufen" — der Cron importiert `generate-plan-entry` nicht.

### [M-10] Survey-Reward-Coupon: Doppel-Coupon durch Read-then-Insert-Race
`app/api/survey/route.ts:66-104` · **BUG · PLAUSIBLE**
Idempotenz ist SELECT-dann-INSERT ohne Unique-Constraint. Doppelklick auf „Bei Google bewerten" (oder `google_click`+`rating` dicht hintereinander) → zwei DANKE-Coupons (je 10 %). Danach wirft `.maybeSingle()` (2 Zeilen) → Error ungeprüft → dritter Coupon (kompoundierend).

### [M-11] Permission-Mapping-Lücken (Middleware)
`middleware.ts` · **BUG/MAPPING-LÜCKE · CONFIRMED**
- `/admin/content/einstellungen` (Content-Settings inkl. API-Key-Felder) hat **keinen** `/admin/content`-Prefix → jeder eingeloggte Admin kann per Direkt-URL öffnen.
- `/api/admin/damage-attachment-url`, `/api/admin/combined-labels/[id]`, `/api/admin/accessory-part-images` sind ungemappt + ohne In-Route-Permission → jeder eingeloggte Admin bekommt Signed-URLs zu Schadens-Anhängen / Kombi-Etiketten (PII: Name+Adresse) / Katalog-Bild-Upload. Geschwister-Routen sind bewusst `tagesgeschaeft`/`katalog`.
- `/admin/schaeden` Sidebar-perm (`kunden`) ≠ Enforcement (`tagesgeschaeft`) → toter Sidebar-Link bzw. fehlender Link.
- Einkauf UI (`katalog`) ↔ `purchases`/`purchase-attachments` API (`finanzen`) und WBW-Config UI (`finanzen`) ↔ `settings/wbw-config` API (`system`) inkonsistent → 403 in Admin-Tools, nur Owner nutzbar. `purchase-items` klassifiziert Assets/Expenses (finanzen-Wirkung) mit katalog-Recht ohne In-Route-Check.

---

## NIEDRIG / DOKU↔CODE / Trade-off

- **[L-1] Reformationstag fälschlich Berliner Feiertag** — `lib/german-holidays.ts:49,158` · **BUG (Faktenfehler) · CONFIRMED.** 31.10. ist in Berlin kein Feiertag. Folge: 31.10. jährlich als Versand-Startdatum gesperrt, 30.10. als Enddatum gesperrt, Auftragskalender rot markiert.
- **[L-2] „Set-Rabatt 10/15%" nicht implementiert** — `app/set-konfigurator/page.tsx:223` · **DOKU↔CODE/toter Code · CONFIRMED.** `discountPercent=0` hartkodiert, Rabatt-UI nie sichtbar.
- **[L-3] `calcPriceFromTable` liefert bei zu kurzer priceTable still 0 €** — `lib/price-config.ts:147` · **BUG · PLAUSIBLE.** Der 50-%-Server-Floor wäre dann ebenfalls 0.
- **[L-4] Geplante Blog-Artikel 1-2 h zu früh live** — `blog-generate:358-363` vs `blog-publish:107-108` · **BUG · CONFIRMED.** Gegensätzliche TZ-Annahmen: `blog-generate` parst den naiven Datum-String als Container-Lokalzeit (Container läuft `TZ=Europe/Berlin`), zieht dann nochmals den Berlin-Offset ab → `scheduled_at` 1-2 h zu früh; Schritt-1-Publish (`.lte scheduled_at, now`) feuert vor der eingestellten Zeit.
- **[L-5] Blog-`view_count` läuft aktuell über Read-Modify-Write-Race** — `lib/blog-view-tracking.ts:50-56` · **CONFIRMED.** RPC `increment_blog_view` noch nicht deployt (Migration in `supabase/`, nicht `erledigte supabase/`) → jeder Aufruf nimmt den Race-behafteten Fallback (View-Undercount).
- **[L-6] Zwei `sendReviewRequest` unter Typ `review_request`** — `lib/email.ts:1888` vs `lib/reminder-emails.ts:210` · **CONFIRMED.** Manueller Statuswechsel schickt die Version ohne Gutschein, der Cron die mit Gutschein; der Vorlagen-Katalog/die Admin-Vorschau zeigt die falsche (email.ts-)Version.
- **[L-7] Manueller Dokumentversand loggt immer `sent`** — `app/api/admin/booking/[id]/send-email:256-283` · **BUG · CONFIRMED.** Roher `resend.emails.send` ohne `result.error`-Prüfung → fehlgeschlagener Rechnungs-/Vertragsversand erscheint als „gesendet"; kein Test-Redirect; Typ `manual_documents` fehlt im Katalog.
- **[L-8] Reminder-Crons ohne `is_test`-Isolation/Test-Redirect** — `app/api/cron/reminder-emails` + `lib/reminder-emails.ts` · **BUG · CONFIRMED.** Rückgabe-/Überfälligkeits-/Bewertungsmails: im Test-Modus an echte Kunden, im Live-Modus auch an Test-Buchungen; Log als `is_test=false`.
- **[L-9] Consent-Doku-Divergenz (Rechts-Risiko)** — `lib/consent.ts:6-14`, `components/CookieBanner.tsx:62-64`, `app/cookie-richtlinie/page.tsx:159-171` · **DOKU↔CODE/RECHTS-RISIKO · CONFIRMED.** Banner/Richtlinie/Modul-Doku behaupten „ohne Einwilligung keine Reichweitenmessung" + Consent-Flag `cam2rent_visit_counted`, aber `VisitTracker`/`/api/visit` zählt bei jedem Aufruf einwilligungsfrei und setzt kein Flag (bewusste Owner-Entscheidung, aber der zugesagte Wortlaut deckt den weiterlaufenden Zähler nicht).
- **[L-10] `update-booking-status` ohne Status-Guard mit `cancelled` in der Whitelist** — `app/api/admin/update-booking-status/route.ts:25,32-35` · **BUG · PLAUSIBLE.** Setzt jemand hierüber `cancelled`, laufen **keine** Storno-Nebenwirkungen (Payment-Link-Deaktivierung, Deposit-Release ~500 €, Zubehör-Freigabe, Refund, Storno-Mail); kein Race-Schutz.
- **[L-11] Postpone prüft Zubehör-Verfügbarkeit im neuen Zeitraum nicht** — `lib/booking-postpone.ts:132-156` · **TRADE-OFF (dokumentiert) · PLAUSIBLE.** `applyAccessoryComposition` mit unveränderter Komposition → `requiredDelta=0` → kein Verfügbarkeits-Block; Kameras werden geprüft, unabhängig knappes Zubehör nicht → mögliche Zubehör-Überbuchung.
- **[L-12] Kunden-Postpone „nur einmal"-Gate nicht atomar** — `app/api/booking/[id]/postpone/route.ts:114` + `lib/booking-postpone.ts:199` · **BUG · PLAUSIBLE.** Finales UPDATE ohne `.eq('postpone_count',0)`-Guard → zwei parallele Requests umgehen das Limit (kein Inventar-Doppelschaden dank Überbuchungscheck).
- **[L-13] `sanitizeCountryCodes` erzwingt DE nicht bei nicht-leerer Liste** — `lib/allowed-countries.ts:56-67` · **DOKU↔CODE · PLAUSIBLE.** `['AT']` bleibt `['AT']`; ein DE-freier Config-Write würde deutsche Kunden bei Registrierung/Checkout mit `country_not_allowed` ablehnen. Kommentar behauptet „DE immer erlaubt".
- **[L-14] Nicht-atomarer Cron-Lock + Publish ohne Status-Guard** — `lib/cron-lock.ts:47-89` + `lib/meta/publisher.ts:168` + `blog-publish:80-84` · **BUG (Defense-in-Depth) · PLAUSIBLE.** Coolify-Restart + Crontab-Tick können denselben Post/Reel doppelt auf FB/IG publizieren; die Publish-Crons hängen allein am nicht-atomaren Lock.
- **[L-15] Funnel-Stufe „Erfolgreich bezahlt" zählt Unbezahlte mit** — `analytics/route.ts:377-395` · **BUG · CONFIRMED.** `bookingCount` = `.neq('status','cancelled')` schließt `awaiting_payment`/`pending_verification` ein → Conversion überschätzt.
- **[L-16] CSV-Export-Labels hartkodiert „…heute"/„(30 Tage)"** — `analytics/page.tsx:638-712` · **BUG · CONFIRMED.** Bei Zeitraum „Jahr" trägt die CSV-Zeile „Seitenaufrufe heute" den Jahreswert.
- **[L-17] Negative Beträge werden im CSV-Formula-Escape zu Text** — `lib/csv.ts:18,26` · **TRADE-OFF · PLAUSIBLE.** Führendes Minus matcht `FORMULA_INITIAL_CHARS` → `'-5` → Excel/Sheets liest es als Text → Summenformeln über Erstattungs-/Gutschrift-Spalten brechen.
- **[L-18] Duplizierte Storno-Staffel + §19-Hinweis in `business-config.ts`** — `lib/business-config.ts:106-119` · **DOKU↔CODE (Drift) · PLAUSIBLE.** Hartkodierte Kopien von `CANCELLATION_TIERS` bzw. dem dynamischen `tax_mode`; bei künftiger Änderung stille Veraltung, falls angezeigt.
- **[L-19] Weitere Cron-Kleinbefunde** — `auto-cancel` ohne `is_test`/ohne Payment-Link-Deaktivierung; `verification-reminder:105` Fristen-`ceil` fragil (nicht Berlin-verankert); `account-cleanup`/`abandoned-cart` send-then-mark statt atomarem Claim; `blog-generate` ohne `acquireCronLock` (DOKU-Ungenauigkeit, funktional durch Schedule-Claim gedeckt). PLAUSIBLE.
- **[L-20] Netto-Herausrechnung an 4 Orten dupliziert** — `tax.ts`, `invoice-versions.ts:63`, `store-invoice.ts:59`, `invoice-pdf.tsx:412` · **TRADE-OFF/latent · PLAUSIBLE.** Aktuell konsistent; Drift bei künftiger `tax_rate`-Änderung. EÜR rechnet gar nicht netto (unter Kleinunternehmer korrekt, unter Regelbesteuerung falsch).
- **[L-21] `refund_amount` + gesenkter `price_total`/`new_price_total` = Doppelabzug-Falle** — `euer:133-148`, booking_edit · **TRADE-OFF/latent · PLAUSIBLE.** Ein manueller `new_price_total`-Override wird von der EÜR nicht gesehen; Kombination aus Refund-Erfassung + Komponenten-Senkung zieht doppelt ab.
- **[L-22] `invoice-versions` fingerprint ohne `early_bird`/`special`** — `lib/invoice-versions.ts:41-57` · **BUG-Randfall · CONFIRMED.** Reine Sonderkondition-/Frühbucher-Korrektur bei gleichem `price_total` erzeugt keine Archiv-Version.
- **[L-23] `d.accessories.join(', ')` in Admin-Buchungsmail unescaped** — `lib/email.ts:648` · **BUG (gering) · CONFIRMED.** Abweichung vom escapeHtml-Standard (Admin-Empfänger, Katalog-Namen → geringes Risiko).
- **[L-24] Override-Intro landet bei `appointment_reminder` im dunklen Header** — `lib/email-template-overrides.ts:254` · **BUG (gering) · PLAUSIBLE.** Intro nach erster `</h1>` = Logo-H1 im dunklen Header → schlecht lesbar (admin-only Template).
- **[L-25] Postpone-Vertrag-Regen-Fehler lässt `contract_signed` stale true** — `app/api/booking/[id]/postpone/route.ts:169-238` · **TRADE-OFF · CONFIRMED.** PDF-Fehler nach Löschen der `rental_agreements`-Zeile → Buchung im neuen Zeitraum ohne gespeicherten Vertrag, roter „nicht unterschrieben"-Banner greift nicht.
- **[L-26] Öffentliches `GET /api/blog/posts/[slug]` erhöht `view_count` bei jedem GET (kein Aufrufer)** — · **BUG (klein)/toter Endpunkt · CONFIRMED.** Per `curl` mit Browser-UA View-Inflation möglich; kein Doppelzähl-Problem im Normalbetrieb (Detailseite ist SSR).
- **[L-27] `availability-alerts` Dedup bricht dauerhaft nach initialem Race** — `app/api/availability-alerts/route.ts:137-201` · **BUG (latent) · PLAUSIBLE.** `.maybeSingle()` erroret ab 2 Zeilen → bei jedem Wizard-Reload neuer Insert + Admin-Notification-Spam.
- **[L-28] weitere Social/Reels-LOW** — Publish ohne atomaren Claim (Doppelpost); IG-Ziel ohne Bild → dauerhaft `partial`; max_duration-Trim vs. Voice-Wortbudget; `segment-regenerator` ohne `afade`-out (Klick); kein Recovery aus `publishing`-Status; FB-Reel-Finish nach 180s-Timeout trotzdem; ae/oe/ue in admin-sichtbarer Fehlermeldung (`lib/meta/season.ts`). Details in Domäne 18.

---

## Als KORREKT verifiziert (Auswahl, kein Befund)

- **Storno-Erstattung** (`data/cancellation.ts`): `CANCELLATION_TIERS` (>7T 100 % / 3-7T 50 % / <3T 10 %), `refundRateForDays` (negativ→10 %, nicht 0 %), Anker-Freeze (`effectiveCancelDate`=MIN), `berlinDaysUntil` DST-immun, `computeCancellationRefund` (Versand voll erstattet wenn nicht versendet). `lib/cancellation-text.ts` leitet ausschließlich aus den Tiers ab (keine Drift).
- **Haftungspreis** `calcHaftungTieredPrice` (`weeks=ceil(days/7)`, kein Off-by-one), **Coupon-Rundung** (centgenau), **Express-Versand nie gratis**, **Zonen-Logik** `resolveZonePrices`.
- **Idempotenz** confirm-cart/confirm-booking (PI-Lookup vor status-Check → 3DS-failed-Redirect abgefangen), `freshlyInsertedIds` (Doppel-Mail-Schutz), Webhook `event.id`-Dedupe, atomare Status-Flips.
- **Kunden-Rechnungs-PDF** geht immer auf (Rabatt = Differenz, Gesamt = `price_total`) — im Gegensatz zu EÜR/DATEV.
- **`calculateTax`**, **`store-invoice` paid/open**, **stripe-sync Auto-Match-Kaskade + Doppelzahlungsschutz + PayPal-Split**, **dunning atomarer Flip+Rollback**, **Gutschrift-Nummernkreis**.
- **Adress-Priorität** (`resolve-addresses`), **IDOR-Schutz** (`meine-buchungen`, `booking/[id]/pay`), **Postpone-Gates** (Ownership/Status/Anker/Überbuchung), **Survey-HMAC**, **UGC approve/feature** (atomar), **Waitlist/Newsletter**.
- **Auth-Härtung** (UA-Binding, Session-Cache-TTL 5 s, Owner-Checks, Session-Invalidierung), **Prefix-Matching** in der Middleware.
- **Berlin-TZ-Buckets** in Analytics (today/history/bookings/blog/patterns), **`awaiting-payment-cancel`/`contract-auto-cancel`/`verification-auto-cancel`** (atomare Guards, Refund-Idempotenz+Fehlertracking, Abholung nie storniert).
- **Reels-Render** (Dauer-Invariante, xfade/Voice-Sync, INT-Cast, kein Hänger auf `rendering`), **Token via Authorization-Header**, **Consent-Block** (`renderEarlyServiceConsentBlock`, IP escaped).

---

## Abdeckungs-Matrix

| Domäne | Bereich | Status |
|---|---|---|
| 1 | Preise/Rabatte/Versand/Haftung (`lib/price-config.ts`, `data/*.ts`, checkout, buchen, set-konfigurator, admin/buchungen/neu) | ✅ tief auditiert |
| 2 | Storno/Erstattung (`data/cancellation.ts`, cancel-booking, previews) | 🟡 Kartierung + Kernbefunde belegt; Detail-Audit ausstehend |
| 3 | Verfügbarkeit/Inventar/Units/Puffer/Cart-Holds/Status (+RPCs) | 🟡 Kartierung liegt vor; Detail-Audit ausstehend |
| 4 | Kaution/WBW/AfA/Haftungs-Box | ✅ tief auditiert |
| 5 | Buchhaltung EÜR/USt/DATEV/Rechnung/Stripe-Abgleich/Mahnung/Verkauf | ✅ tief auditiert |
| 6 | Zahlungs-Flow (intent/confirm/webhook/extend) | ✅ tief auditiert |
| 7 | Verträge/Signatur/Hash/Snapshot | 🟡 Kartierung liegt vor; Detail-Audit ausstehend |
| 8 | Legal-Content/Fallbacks/Consent | ✅ tief auditiert |
| 9 | Alle Crons | ✅ tief auditiert (30 Routen) |
| 10 | Admin-Buchungs-Mutationen | ✅ tief auditiert |
| 11 | Datum/Zeitzone-Querschnitt | 🟡 Kartierungs-Verdachtsfälle vorhanden; systematischer Sweep ausstehend |
| 12 | E-Mail-Rendering/Overrides/Previews | ✅ tief auditiert |
| 13 | Benachrichtigungen/Push | 🟡 Detail-Audit ausstehend |
| 14 | Inventar-Integrität/Scan | 🟡 Detail-Audit ausstehend |
| 15 | Auth/Permissions/Referenzen | ✅ tief auditiert |
| 16 | Analytics | ✅ tief auditiert |
| 17 | Blog | ✅ tief auditiert |
| 18 | Social/Reels | ✅ tief auditiert |
| 19 | Coupons/UGC/Waitlist/Newsletter | ✅ tief auditiert |
| 20 | Kundenkonto & Buchungs-Flows | ✅ tief auditiert |
| 21 | Rest-Sweep (Utilities: format-utils, pack-weight, tracking-url, label-resize, business-config, german-holidays, …) | ✅ tief auditiert |

**Bewusst nicht auditiert:** `archiv/`, `docs/`, `scripts/` (außer `sync-legal-fallbacks.ts`), generierte Assets (`cam2rent-logos/`, `public/`) — kein Rechen-/Geld-/Datums-Bezug.

---

## Ausstehende Domänen (Detail-Audit nach Session-Reset)

Für 2/3/7/11/13/14 sind die Prüf-Agenten ins temporäre Session-Limit gelaufen. **Bereits belegte Vorbefunde** (aus den Kartierungs-Läufen und den Nachbar-Domänen), die im Detail-Audit final zu verifizieren sind:

- **Domäne 3 (Verfügbarkeit):** harte Überbuchungssperre `findCameraOverbookingConflict` ohne Namens-Fallback/`buildQ3` → gemischte Legacy-Buchungen (cameras=NULL, Modell nur im Komma-`product_name`, fremde `product_id`) passieren die Sperre, obwohl der Kalender belegt zeigt; RPC-Statuslisten (`assign_free_unit`/`assign_free_camera_units`: nur confirmed/shipped/delivered/picked_up/active) schmaler als `RESERVING_BOOKING_STATUSES` (fehlt `preparing_shipment`/`awaiting_pickup`) → mögliche Unit-Doppelvergabe; `is_test`-Match in der aktuellen `assign_free_accessory_units`-Fassung verloren; Puffer-Asymmetrie Kalender vs. Sperre; Stock-Nenner-Divergenz (inventar_units vs product_units).
- **Domäne 7 (Verträge):** `resolveContractLegalSnapshot` freeze-once + Kategorie-Höchstbetrag, PDF-Byte-Hash-Verifikation, Multi-Kamera-WBW-Zeilen — final gegenzulesen (WBW-Formel-Divergenz [H-10] wirkt hier direkt in den Vertrag).
- **Domäne 11 (Datum/TZ):** Verdachtsfälle `computeAccessoryAvailability` (UTC-Puffer), EÜR-Anzeigedatum `created_at.slice(0,10)`, `verification-reminder` `ceil`, WBW `monthsElapsed` (bereits in [H-10]) — plus systematischer Grep-Sweep über alle `toISOString().split`/`new Date(y,m,d)`/`getHours`.
- **Domäne 13 (Push):** Vollständigkeit der Notification-Typen in allen 4 Registrierungsorten (Katalog/Permission-Map/Icon/Whitelist), push_prefs-Filter, `sendPushToUser`-Filter.
- **Domäne 14 (Inventar-Scan):** Set-Expansion/Upgrade-Skip-Parität über Wizard/resolveAccessoryItems/Packliste/Verfügbarkeit, `syncAccessoryQty = MAX(...)`-Untergrenze, Scan-Match (normalizeCode/label/Bulk/Race-safe), `applyScannedUnits`.
- **Domäne 2 (Storno):** Kernlogik bereits in „korrekt verifiziert" oben; Detail-Audit der cancel-booking-Nebenwirkungen (Refund-Idempotenz, Deposit-Release, credit-note-preview) ausstehend.

---

*Hinweis: Jeder Befund ist an Datei:Zeile belegt. Dies ist ein reiner Prüfbericht — es wurden keine Code-Änderungen vorgenommen. Fixes erfolgen nur auf ausdrücklichen Wunsch.*
