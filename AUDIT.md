# cam2rent — Korrektheits-Audit (vollständig, 21/21 Domänen)

**Auftrag:** Vollständige Prüfung des Codes auf Plausibilität/Richtigkeit jeder Berechnung und jedes Verweises — gelesen, nicht geraten. **Nur Prüfung, keine Code-Änderungen.**

**Umfang:** Next.js 15, ~940 TS/TSX-Dateien, ~210.000 Zeilen, 413 API-Routen. Live-Shop mit echtem Geldfluss (Stripe), Buchhaltung (EÜR/DATEV/USt), Verträgen, Inventar.

**Methodik:** Der Code wurde in 21 Domänen partitioniert; jede von einem Prüf-Agenten vollständig gelesen, Befunde adversarial gegengeprüft (erst widerlegen, dann bestätigen) und gegen die in `CLAUDE.md` dokumentierten *bewussten* Trade-offs abgeglichen. Fokus: falsche Arithmetik, falsche Verweise, Off-by-one, fehlende Filter (`is_test`/`deleted_at`/Status), Zeitzonen-Kippen, Doppel-/Fehlabzüge, Divergenzen derselben Berechnung an mehreren Orten. **Nicht** Gegenstand: Security-Härtung (Sweeps 5–9), Stil, Performance. Die schwersten HOCH-Befunde wurden zusätzlich vom Prüfer selbst an der Zeile gegengelesen.

**Legende:** Verdikt **CONFIRMED** = an der Zeile belegt · **PLAUSIBLE** = Rest-Unsicherheit / daten-/laufzeitabhängig · **REFUTED** = Verdacht geprüft und entkräftet. Klassifikation: **BUG** · **TRADE-OFF** (bewusst laut CLAUDE.md) · **DOKU↔CODE**.

**Status: 21/21 Domänen auditiert.** Keine Code-Änderungen vorgenommen.

---

## Executive Summary

**Geld direkt betroffen (HOCH):**
- **[H-1]** Zweite Mietverlängerung wird verschluckt — Kunde zahlt, bekommt keine Verlängerung, kein Refund.
- **[H-2]** Bestellbearbeitung + Bestätigungsmail/**Mietvertrags-PDF** ignorieren `special_discount`/`early_bird_discount` → falscher Betrag im Rechtsdokument, Phantom-Nachzahlung.
- **[H-8]** `not_combinable`-Gutschein + Auto-Rabatt = echter Overcharge (Kunde zahlt zu viel).
- **[H-13]** Harte Überbuchungssperre blind für gemischt-modellige Legacy-Buchungen → zweite Kamera doppelt buchbar (aktuell erreichbar).
- **[H-14]** `available_qty` bleibt nach Inventar-Löschung überhöht → Zubehör-Überbuchung.

**Recht/Verträge (HOCH):**
- **[H-12]** Basis-Haftung ≥ 15 Tage wird im unterschriebenen Vertrag als „Premium / 0 € Höchstbetrag" ausgewiesen → cam2rent trägt vollen Schaden statt Mieter bis Höchstbetrag.
- **[H-10]** Zwei divergierende Wiederbeschaffungswert-Formeln → Mietvertrag ≠ Inventaransicht für dasselbe Gerät.
- **[H-11]** `npm run sync:legal` (Go-Live-Schritt) bricht den Rechtstext-Guard-Test.

**Buchhaltung/Steuer (HOCH):**
- **[H-3/H-4]** EÜR & DATEV überzeichnen den Umsatz (mehrere Rabatt-Typen nicht abgezogen; EÜR und DATEV widersprechen sich).
- **[H-5]** Gelöschte Ausgaben mindern weiter den EÜR-Gewinn.
- **[H-6]** Lineare AfA der neuen Buchhaltungs-Welt fehlt komplett in EÜR/DATEV.
- **[H-7]** Report-Umsatz nicht deterministisch (hängt vom Zahlungs-Race-Sieger ab).
- **[H-9]** Tagesbericht zeigt dauerhaft 0 € (falscher Spaltenname).

**Wichtige Entwarnungen durch Gegenprüfung (REFUTED):** Kamera-Unit-Doppelvergabe über zu schmale RPC-Statusliste (die zuletzt ausgeführte RPC enthält die Zwischenstatus sehr wohl); WBW-`monthsElapsed` als TZ-Bug (Monat ist TZ-korrekt — die Divergenz ist der Tages-Cut); Rechen-Kern von Storno, Kalender-Tageszählung, hartem Kamera-Guard-Datum, Rechnungs-PDF, Steuer-, Adress-, IDOR-, Push-Filter-Logik.

---

## HOCH

### [H-1] Zweite Mietverlängerung wird verschluckt — Kunde zahlt ohne Gegenleistung
`app/api/confirm-extension/route.ts:200-208` · **BUG · CONFIRMED (selbst gegengelesen)**
UPDATE mit `.is('extension_payment_intent_id', null)` matcht bei einer **zweiten** Verlängerung 0 Zeilen (Feld schon gesetzt) → `if (!updateError && !updated) return { success:true, "Bereits verlängert." }`. `extend-booking` erlaubt die zweite Verlängerung und zieht `pi_B` ein; es gibt keinen `type='extension'`-Webhook, der heilt → **Geld weg, keine Verlängerung, kein Refund.**

### [H-2] `booking_edit` + `confirm-cart`-Bestätigung/Vertrag ignorieren `special_discount` & `early_bird_discount`
`app/api/admin/booking/[id]/route.ts:1277-1442` · `app/api/confirm-cart/route.ts:1316-1358` · **BUG · CONFIRMED**
Preis-Recompute nutzt nur `discount_amount`/`duration_discount`/`loyalty_discount`; `special_discount`+`early_bird_discount` werden nicht gelesen/geschrieben.
- **Bestellbearbeitung:** Kunde 15 % Sonderkondition (`special_discount=15`, `price_total` reduziert). Admin ändert nur Haftung → `discountTotal=0` → `computedTotal ≈ price_total + 15` → **Stripe-Nachzahlungslink über 15 €** wird gemailt; `special_discount` bleibt stale.
- **confirm-cart Frisch-Insert:** `groupTotal` roh ohne `serverSpecialTotal` → Bestätigungsmail **und signiertes Mietvertrags-PDF** weisen 200 € aus statt der gezahlten 160 €. Rechtsdokument mit falschem Betrag.

### [H-3] EÜR überzeichnet Umsatz/Gewinn — `early_bird_discount` + `special_discount` nicht abgezogen
`app/api/admin/buchhaltung/reports/euer/route.ts:54,109` · **BUG · CONFIRMED (selbst gegengelesen)**
Spalten werden nicht geladen; `d = discount_amount + duration_discount + loyalty_discount`. **Szenario:** `price_rental=200`, Sonderkondition 10 % → `price_total=180`, EÜR-Einnahme = 200. Folge: zu hoher Gewinn → zu hohe Einkommensteuer + inflationierte §-19-Grenze (22.000 €).

### [H-4] DATEV überzeichnet Umsatz UND widerspricht der EÜR
`app/api/admin/datev-export/route.ts:245` · `.../preview-rows/route.ts:73` · **BUG · CONFIRMED**
`rentalAmount = price_rental + price_accessories − discount_amount − refund_amount` — zieht **nur** `discount_amount` ab (nicht duration/loyalty/early_bird/special). **Szenario:** Katalog 200, `duration_discount=30`, `price_total=170` → DATEV-Erlös 200, EÜR 170 → dieselbe Buchung, zwei Steuerzahlen.

### [H-5] EÜR-Ausgaben ohne `deleted_at`-Filter — gelöschte Ausgaben zählen weiter
`app/api/admin/buchhaltung/reports/euer/route.ts:215-221` · **BUG · CONFIRMED (selbst gegengelesen)**
Query hat `.eq('is_test',false)` + Datum, **kein** `.is('deleted_at', null)` (ust-vorbereitung:66 hat ihn). `expenses` nutzt Soft-Delete. **Szenario:** gelöschte „Hardware 500 €" mindert weiter den Gewinn → Steuer zu niedrig; USt-Vorbereitung zeigt sie korrekt nicht.

### [H-6] Lineare AfA der neuen Buchhaltungs-Welt fehlt in EÜR & DATEV
`euer/route.ts:215-259` · `datev-export/route.ts:298-304` vs `lib/buchhaltung/afa-cron.ts:89` · **BUG · CONFIRMED (Code-Ebene)**
`afa-cron` schreibt ausschließlich nach `afa_buchungen`; kein Report liest `afa_buchungen` (EÜR schließt `afa` bewusst aus, DATEV liest nur `expenses.category='depreciation'`). → Für linear abgeschriebene Anlagegüter der neuen Welt verschwindet der monatliche Abschreibungsaufwand → Gewinn überzeichnet. (GWG neu + alte Welt sind ok.)

### [H-7] Report-Umsatz nicht deterministisch — Rabatt-Persistenz hängt vom Race-Sieger ab
`app/api/stripe-webhook/route.ts:788-828` vs `app/api/confirm-cart/route.ts:703-719` · **BUG · CONFIRMED**
`confirm-cart` schreibt skalierte Rabatte + merged `product_discount` in `discount_amount`; `handleCartBooking` schreibt **eine** aggregierte Buchung mit unskalierten Werten und lädt `product_discount` nicht. **Szenario:** 25 % Produktaktion (`product_discount=50`) + Coupon 10 → confirm-cart: `discount_amount=60`; Webhook: `discount_amount=10`, 50 € fehlen → EÜR/DATEV +50 € zu hoch. `price_total` selbst ist beidseitig korrekt.

### [H-8] `not_combinable`-Gutschein + Auto-Rabatt = echter Overcharge
`app/checkout/page.tsx:595-651` · **BUG · CONFIRMED**
Coupon-Basis `afterAutoDiscounts` ist bereits um den Auto-Rabatt gekürzt, dann wird der Auto-Rabatt genullt. **Szenario:** 100 €, 5 % Mietdauer, Coupon 20 % `not_combinable` → 81 € statt korrekt 80 €; mit 15 % Mietdauer → 83 € (**skaliert mit dem %-Satz**).

### [H-9] Tagesbericht zeigt dauerhaft 0 € / 0 Buchungen
`app/api/cron/daily-report/route.ts:58,81` · **BUG · CONFIRMED**
Selektiert/summiert `total_price`; die Spalte heißt überall `price_total` → PostgREST-Fehler → `data=null` → jeder Tagesbericht „0 Buchungen · 0,00 € · 0 % Conversion". (Analytics hatte denselben Bug bereits gefixt; daily-report übersehen.)

### [H-10] Zwei divergierende WBW-Formeln → Mietvertrag ≠ Inventaransicht (Tages-Cut)
`lib/inventar/wiederbeschaffungswert.ts:102-105` (`computeWBW`, **ohne** Tages-Cut) vs `lib/replacement-value.ts:140-148` (`monthsBetween`, **mit** Tages-Cut) · **BUG · CONFIRMED**
Beide werden auf dieselben `inventar_units`-Daten mit derselben Config angewandt, unterscheiden sich nur in der Monatszählung (Tages-Cut mit/ohne). `computeWBW` treibt die Inventar-Liste (`/admin/inventar`), `computeReplacementValue` den **Mietvertrag** + Haftungs-Box + Wiederbeschaffungssicht. **Szenario:** Kauf 20.01.2024, Stichtag 08.05.2026: `computeWBW`=28 Mon → 533,33 €; `computeReplacementValue`=27 Mon (Cut) → 550,00 €. Dasselbe Stück, zwei Werte; der Mietvertrag weicht von der Inventaransicht ab. **Hinweis (Gegenprüfung Domäne 11):** Das ist **kein** Zeitzonen-Bug — der Monat ist in beiden TZ-korrekt; die Divergenz ist ausschließlich der Tages-Cut. Zusätzlich: Missing-Value divergiert (`computeWBW`→null „Nicht gesetzt", andere→0) und Config-Validierung/-Caching (A rundet `useful_life_months` + 5-Min-Cache).

### [H-11] `npm run sync:legal` bricht den Rechtstext-Guard-Test
`scripts/sync-legal-fallbacks.ts` ↔ `lib/__tests__/widerruf-consistency.test.ts:148` · **BUG (latent) · CONFIRMED**
Der Guard verlangt jeden „Versicherung"-Treffer in `VERSICHERUNG_ALLOWLIST`. Der dokumentierte Go-Live-Schritt `sync:legal` schreibt die AGB-Markdown inkl. der **rechtlich zwingenden** Formulierung „keine Versicherung im Sinne des VVG" nach `lib/legal/generated-fallbacks.ts` — nicht allowlistet → Test schlägt deterministisch fehl. (Zusatzrisiko: DB-Widerrufsbelehrung mit „312g" bricht zusätzlich `expect(grepFiles('312g')).toEqual([])`.)

### [H-12] Basis-Haftung ≥ 15 Tage wird im unterschriebenen Vertrag als „Premium / 0 €" ausgewiesen
`lib/contracts/generate-contract.ts:726-730` · **BUG · CONFIRMED**
`generateContractPDF` rät die Haftungsoption aus dem Preis: `priceHaftung===0?'Ohne':priceHaftung<=20?'Basis':'Premium'`. `calcHaftungTieredPrice` (Basis, base 15, +5/Woche) liefert 15–21 T = **25** € → Klassifikation „Premium". **Kein Aufrufer** übergibt `haftungOption` (verifiziert für sign/confirm-booking/confirm-cart/manual-booking/postpone/regenerate), obwohl `booking.haftung` überall bereitsteht. **Szenario:** Kunde wählt **Basis** (Höchstbetrag z.B. 200 €) für 15+ Tage → der rechtsverbindliche Vertrag weist „**Premium-Haftungsschutz — Höchstbetrag 0,00 EUR**" aus. cam2rent trägt im Schadensfall den vollen Verlust statt bis Höchstbetrag. Kaskade: `resolveContractLegalSnapshot` friert `liability_max_amount=0` in `bookings` ein; `reset-contract` setzt den Snapshot nicht zurück (freeze-once) → zementiert den Fehler auch nach Neu-Unterschrift.

### [H-13] Harte Überbuchungssperre blind für gemischt-modellige Legacy-Buchungen
`lib/camera-availability-check.ts:114-135,189` vs Kalender `app/api/availability/[productId]/route.ts:159-170` (`buildQ3`) + `:59-66` (`cameraBelongsToThisProduct`) · **BUG · CONFIRMED**
Der Kunden-Kalender hat drei Loader (Q1 `product_id=`, Q2 `cameras contains`, **Q3 `product_name ilike … AND product_id != productId`**) + Namens-Priorität. Die harte Sperre `findCameraOverbookingConflict` hat **nur Q1+Q2** und zählt ID-only (`c.product_id === productId`). **Szenario:** Buchung X = `product_name="OSMO Action 5 Pro , DJI Osmo Nano"`, `cameras=NULL` (Multi-Kamera-Migration ist ausstehender Go-Live-TODO → aktuell praktisch immer NULL), `product_id=<OSMO>`. Ein Kunde bucht die **Nano** parallel (Direkt-/Angebotslink/alter Tab): Q1/Q2 laden X nicht, kein Q3 → `bookedCount(Nano)=0` → Zahlung erlaubt → **Nano doppelt gebucht**, obwohl der Kalender sie korrekt als belegt zeigt. Nur der Nicht-Erst-Modell-Teil einer Mischbuchung schlüpft durch (Gleichmodell + Einzelbuchung sind sicher).

### [H-14] `available_qty` bleibt nach Inventar-Löschung überhöht → Zubehör-Überbuchung
`app/api/admin/inventar/[id]/route.ts:96-100` + `lib/inventar-mirror.ts:423-435` · **BUG · CONFIRMED**
DELETE ruft (1) `deleteMirror` → intern `syncAccessoryQty` (Z.432), dann (2) `inventar_units.delete()` (route.ts:100). Beim Sync existiert die zu löschende Zeile **noch** → `MAX(legacy, inventar_inkl._noch_vorhandenem_Stück)`; danach **kein** Resync. **Szenario:** 3 Exemplare, 1 gelöscht → `available_qty` bleibt 3, real 2 → Gantt/Shop überbuchbar (genau der Fall, den die MAX-Härtung verhindern sollte, hier vom Ordering ausgehebelt).

---

## MITTEL-HOCH / MITTEL

### [M-0] Bestands-Sync zählt `wartung`/`defekt` als verfügbar → defekte Geräte buchbar
`lib/sync-accessory-qty.ts:68-74` · `lib/accessory-qty-recovery.ts:107-113` · `resync-qty/route.ts:93-99` · **BUG · CONFIRMED (MITTEL-HOCH)**
Legacy-Zählung filtert `status IN ['available','rented']`; Inventar-Zählung filtert nur `.neq('status','ausgemustert')` → zählt `wartung`(→maintenance)+`defekt`(→damaged) mit. `MAX(...)` übernimmt die inflationierte Zahl → defektes/in Wartung befindliches Gerät wird als Total-Kapazität buchbar.

### [M-1] WBW Missing-Value: beleglose Zubehörteile still mit 0 € in der max. Ersatzpflicht
`lib/inventar/wiederbeschaffungswert.ts:89-91` vs `lib/replacement-value.ts:63-64` · **BUG-Randfall · CONFIRMED/PLAUSIBLE**
Fehlt `kaufpreis_netto`: computeWBW→null (Inventar „Nicht gesetzt"), Haftungs-Box/Vertrag→0. Bei Buchung **„Ohne Haftungsschutz"** (`customerMax = totalWbw`) trägt ein beleglos-getracktes Zubehör 0 € bei → max. Ersatzpflicht des Mieters zu niedrig. (Kamera hat Deposit-Fallback, Zubehör nicht.)

### [M-2] USt-Umsatz (Σ `price_total`) ≠ EÜR-Umsatz (Komponenten-Rekonstruktion)
`ust-vorbereitung/route.ts:39` vs `euer/route.ts:104-211` · **BUG/Logik-Divergenz · CONFIRMED**
USt summiert `price_total` (kein Rabatt-/Refund-Abzug); EÜR rekonstruiert aus Komponenten. **Szenario:** `price_total=180`, `refund_amount=30`: USt 180, EÜR 150 → zwei „Umsatz"-Zahlen für denselben Zeitraum.

### [M-3] EÜR + USt zählen unbezahlte Buchungen als Umsatz (Zufluss-Prinzip)
`euer:59` · `ust-vorbereitung:35` · **BUG · PLAUSIBLE**
Filter nur `.neq('status','cancelled')` → `awaiting_payment`/`pending_verification` (Geld nicht geflossen) zählen voll. EÜR §4(3) EStG ist Zufluss-basiert. Korrigiert sich meist per Auto-Storno.

### [M-4] Stripe-Sync/Gebühren-Import nicht tester-bewusst
`lib/buchhaltung/stripe-sync.ts:92` · `.../import-fees/route.ts:88,96-101` · **BUG · CONFIRMED**
`stripe_transactions.is_test` = globaler env-Modus; `import-fees` lädt ganz ohne `is_test`-Filter → Tester-Stripe-Gebühr als Live-Ausgabe, mindert Live-EÜR.

### [M-5] Set-Default-`pricing_mode` divergiert (NULL-Spalte)
`app/admin/buchungen/neu/page.tsx:121` (`?? 'perDay'`) vs `lib/booking/verify-accessory-price.ts:90` (`?? 'flat'`) vs `buchen/page.tsx:1274` (effektiv flat) · **BUG · CONFIRMED (datenabhängig)**
Fehlt `sets.pricing_mode`: Admin rechnet `price×days`, Kunde `price`. **Szenario:** Set 20 €, 5 Tage → Admin 100 €, Kunde 20 €; `verifyAccessoryPrice` würde eine perDay-Set-Buchung als „mismatch" melden. (Zubehör-Default `perDay` überall konsistent.)

### [M-6] Auslastung ignoriert `is_test` → Test-Buchungen in Live-Kennzahl
`lib/camera-utilization.ts:68-73` · **BUG · CONFIRMED**
`computeCameraUtilization` filtert Buchungen nicht nach `is_test`. Shared lib → Analytics-Kamera-Performance **und** Dashboard-Widget.

### [M-7] Auslastung/History ignorieren vergangene `custom`-Zeiträume
`app/api/admin/analytics/route.ts:556-557` (+ History) · **BUG · CONFIRMED**
`computeCameraUtilization(days)` misst immer die letzten N Tage bis heute, nicht `startISO..endISO` → vergangene custom-Fenster zeigen falsche/leere Werte.

### [M-8] Auto-Reels: Fehler wird als Erfolg gewertet
`app/api/cron/reels-generate/route.ts:132-160` · **BUG · CONFIRMED**
`generateReel()` gibt bei Fehler `{status:'failed'}` zurück (wirft nicht); der Cron prüft das Result nicht → Plan→`generated` (Fehler gelöscht), Reel→`scheduled`/Review-Push → Termin fällt still aus.

### [M-9] Saison-Skip fehlt im automatischen Social-Generierungspfad
`app/api/cron/social-generate/route.ts:129-317` · **BUG + DOKU↔CODE · CONFIRMED**
Cron reimplementiert inline, ruft **nicht** `isTopicOutOfSeason()` und übergibt kein `postDate` → „Skitour" im Juli wird generiert (Sofort-Button würde skippen). CLAUDE.md behauptet, der Cron nutze `generate-plan-entry` — tut er nicht.

### [M-10] Survey-Reward-Coupon: Doppel-Coupon durch Read-then-Insert-Race
`app/api/survey/route.ts:66-104` · **BUG · PLAUSIBLE**
SELECT-dann-INSERT ohne Unique-Constraint → Doppelklick → zwei DANKE-Coupons (je 10 %); danach `.maybeSingle()`-Fehler → dritter Coupon.

### [M-11] Permission-Mapping-Lücken (Middleware)
`middleware.ts` · **BUG/MAPPING-LÜCKE · CONFIRMED**
`/admin/content/einstellungen` ungeschützt (API-Key-Felder); `/api/admin/damage-attachment-url`, `/combined-labels/[id]`, `/accessory-part-images` ungemappt + ohne In-Route-Permission (PII: Schadens-Anhänge, Etikett mit Name+Adresse); `/admin/schaeden` Sidebar-perm≠Enforcement; Einkauf UI(katalog)↔purchases-API(finanzen) + WBW-config UI(finanzen)↔API(system) inkonsistent → 403 in Admin-Tools. `purchase-items` klassifiziert Assets/Expenses ohne In-Route-Check.

### [M-12] Self-Service-Storno ohne Stornierungsbeleg / Re-Cancel-Idempotenz
`app/api/cancel-booking/route.ts:104-236` (F1) · `app/api/admin/booking/[id]/route.ts:1969-2078` (F2) · `resend-cancellation/route.ts:87-107` (F3) · **BUG · PLAUSIBLE**
(F1) Self-Service-Storno ruft nie `createCancellationCreditNote` + setzt Originalrechnung nicht auf `cancelled` → GoBD-Papierspur fehlt (Admin-Pfad macht's korrekt; Einkommen bleibt korrekt, da cancelled aus EÜR). (F2) Re-PATCH `cancelled` auf bereits stornierter Buchung: Guard `.eq('status',preStatus='cancelled')` matcht → doppelte Gutschrift + bei abweichendem Betrag zweiter Refund. (F3) Paralleles `resend` → zwei Gutschriften. Kern-Storno (Anker-Staffel, Versand-Erstattung, Kaution-Freigabe, Refund-Idempotenz, kein Doppelabzug) ist **korrekt bestätigt**.

---

## NIEDRIG / DOKU↔CODE / Trade-off

- **[L-1] Reformationstag fälschlich Berliner Feiertag** — `lib/german-holidays.ts:49,158` · **BUG (Faktenfehler) · CONFIRMED.** 31.10. jährlich als Versand-Start gesperrt, 30.10. als Enddatum, Auftragskalender rot.
- **[L-2] „Set-Rabatt 10/15%" nicht implementiert** — `app/set-konfigurator/page.tsx:223` · **DOKU↔CODE/toter Code · CONFIRMED.**
- **[L-3] `calcPriceFromTable` liefert bei zu kurzer priceTable still 0 €** — `lib/price-config.ts:147` · **BUG · PLAUSIBLE** (Server-Floor dann auch 0).
- **[L-4] Geplante Blog-Artikel 1-2 h zu früh live** — `blog-generate:358-363` vs `blog-publish:107-108` · **BUG · CONFIRMED.** Gegensätzliche TZ-Annahmen (Container `TZ=Europe/Berlin`); Schritt-1-Publish feuert vor der eingestellten Zeit.
- **[L-5] Blog-`view_count` läuft aktuell über Read-Modify-Write-Race** — `lib/blog-view-tracking.ts:50-56` · **CONFIRMED.** RPC `increment_blog_view` noch nicht deployt (Migration in `supabase/`) → Race-Fallback aktiv (View-Undercount).
- **[L-6] Zwei `sendReviewRequest` unter Typ `review_request`** — `lib/email.ts:1888` vs `lib/reminder-emails.ts:210` · **CONFIRMED.** Katalog/Vorschau zeigt die falsche (email.ts-)Version ohne Gutschein.
- **[L-7] Manueller Dokumentversand loggt immer `sent`** — `app/api/admin/booking/[id]/send-email:256-283` · **BUG · CONFIRMED.** Kein `result.error`-Check, kein Test-Redirect; `manual_documents` fehlt im Katalog.
- **[L-8] Reminder-Crons ohne `is_test`-Isolation/Test-Redirect** — `app/api/cron/reminder-emails` + `lib/reminder-emails.ts` · **BUG · CONFIRMED.** Test-Mails an echte Kunden; Log als `is_test=false`.
- **[L-9] Consent-Doku-Divergenz (Rechts-Risiko)** — `lib/consent.ts:6-14`, `components/CookieBanner.tsx:62-64`, `app/cookie-richtlinie/page.tsx:159-171` · **DOKU↔CODE/RECHTS-RISIKO · CONFIRMED.** Banner/Richtlinie versprechen „ohne Einwilligung keine Reichweitenmessung" + Flag `cam2rent_visit_counted`, aber `VisitTracker`/`/api/visit` zählt einwilligungsfrei ohne Flag (bewusste Owner-Entscheidung, aber Wortlaut deckt den weiterlaufenden Zähler nicht).
- **[L-10] `update-booking-status` ohne Status-Guard mit `cancelled` in der Whitelist** — `app/api/admin/update-booking-status/route.ts:25,32-35` · **BUG · PLAUSIBLE.** Storno hierüber ohne Nebenwirkungen (Payment-Link/Deposit-Release ~500 €/Zubehör-Freigabe/Refund/Mail).
- **[L-11] Postpone prüft Zubehör-Verfügbarkeit im neuen Zeitraum nicht** — `lib/booking-postpone.ts:132-156` · **TRADE-OFF (dokumentiert) · PLAUSIBLE.** Kameras geprüft, unabhängig knappes Zubehör nicht → mögliche Zubehör-Überbuchung.
- **[L-12] Kunden-Postpone „nur einmal"-Gate nicht atomar** — `app/api/booking/[id]/postpone/route.ts:114` + `lib/booking-postpone.ts:199` · **BUG · PLAUSIBLE.** Kein Inventar-Doppelschaden (Überbuchungscheck greift).
- **[L-13] `sanitizeCountryCodes` erzwingt DE nicht bei nicht-leerer Liste** — `lib/allowed-countries.ts:56-67` · **DOKU↔CODE · PLAUSIBLE.**
- **[L-14] Nicht-atomarer Cron-Lock + Publish ohne Status-Guard** — `lib/cron-lock.ts:47-89` + `publisher.ts:168` + `blog-publish:80-84` · **BUG (Defense-in-Depth) · PLAUSIBLE.** Coolify-Restart + Tick → möglicher Doppel-Post FB/IG.
- **[L-15] Funnel „Erfolgreich bezahlt" zählt Unbezahlte mit** — `analytics/route.ts:377-395` · **BUG · CONFIRMED.** Conversion überschätzt.
- **[L-16] CSV-Export-Labels hartkodiert „…heute"/„(30 Tage)"** — `analytics/page.tsx:638-712` · **BUG · CONFIRMED.**
- **[L-17] Negative Beträge im CSV-Formula-Escape → Text** — `lib/csv.ts:18,26` · **TRADE-OFF · PLAUSIBLE.** Summenformeln über Erstattungs-/Gutschrift-Spalten brechen in Excel.
- **[L-18] Duplizierte Storno-Staffel + §19-Hinweis in `business-config.ts`** — `lib/business-config.ts:106-119` · **DOKU↔CODE (Drift) · PLAUSIBLE.**
- **[L-19] Weitere Cron-Kleinbefunde** — `auto-cancel` ohne `is_test`/ohne Payment-Link-Deaktivierung; `verification-reminder:105` Fristen-`ceil` (nicht Berlin-verankert, off-schedule-Kante); `dunning/bulk:99-126` UTC-Split (inkonsistent zur gefixten Einzel-Mahnung); `account-cleanup`/`abandoned-cart` send-then-mark; `blog-generate` ohne `acquireCronLock` (funktional durch Schedule-Claim gedeckt). PLAUSIBLE/LOW.
- **[L-20] Netto-Herausrechnung an 4 Orten dupliziert** — `tax.ts`, `invoice-versions.ts:63`, `store-invoice.ts:59`, `invoice-pdf.tsx:412` · **TRADE-OFF/latent · PLAUSIBLE.** Aktuell konsistent; Drift bei künftiger `tax_rate`-Änderung. EÜR rechnet nicht netto (unter Kleinunternehmer korrekt, unter Regelbesteuerung falsch).
- **[L-21] `refund_amount` + gesenkter `price_total`/`new_price_total` = Doppelabzug-Falle** — `euer:133-148`, booking_edit · **TRADE-OFF/latent · PLAUSIBLE.**
- **[L-22] `invoice-versions` fingerprint ohne `early_bird`/`special`** — `lib/invoice-versions.ts:41-57` · **BUG-Randfall · CONFIRMED.** Reine Sonderkondition-/Frühbucher-Korrektur erzeugt keine Archiv-Version.
- **[L-23] `d.accessories.join(', ')` in Admin-Buchungsmail unescaped** — `lib/email.ts:648` · **BUG (gering) · CONFIRMED.**
- **[L-24] Override-Intro landet bei `appointment_reminder` im dunklen Header** — `lib/email-template-overrides.ts:254` · **BUG (gering) · PLAUSIBLE.**
- **[L-25] Postpone-Vertrag-Regen-Fehler lässt `contract_signed` stale true** — `app/api/booking/[id]/postpone/route.ts:169-238` · **TRADE-OFF · CONFIRMED.**
- **[L-26] Öffentliches `GET /api/blog/posts/[slug]` erhöht `view_count` bei jedem GET (kein Aufrufer)** — · **BUG (klein)/toter Endpunkt · CONFIRMED.**
- **[L-27] `availability-alerts` Dedup bricht dauerhaft nach initialem Race** — `app/api/availability-alerts/route.ts:137-201` · **BUG (latent) · PLAUSIBLE.** Notification-Spam.
- **[L-28] `payment_failed` als Sammel-Alarm für operative Fehler** — `lib/booking-postpone.ts:230` · **BUG (Routing) · PLAUSIBLE.** Operative Störung (Kamera-Zuweisung unvollständig) geht nur an `finanzen`, nicht `tagesgeschaeft`.
- **[L-29] Push-Kleinbefunde** — `coupon_race` ohne Icon (Default-Glocke); `overdue_return` registriert aber nie emittiert (toter Typ); `lib/audit.ts:95` schreibt `admin_notifications` direkt (umgeht Push). CONFIRMED, kosmetisch/design.
- **[L-30] Inventar-Sync-Kleinbefunde** — doppelte `migration_audit`-Brücke bricht `syncAccessoryQty`(`.maybeSingle()`)→Preview↔Apply-Divergenz; `safe_to_apply` weicht von dokumentierter Regel ab; undokumentierter `resync` sync-all-Fallback; `scan-lookup`-Kamera-Konfliktcheck übersieht Multi-Kamera/Neue-Welt; `applyScannedUnits` ID-Namespace-Mix. PLAUSIBLE/LOW.
- **[L-31] Social/Reels-LOW** — Publish ohne atomaren Claim (Doppelpost); IG-Ziel ohne Bild → dauerhaft `partial`; max_duration-Trim vs. Voice-Wortbudget; `segment-regenerator` ohne `afade`-out; kein Recovery aus `publishing`; FB-Reel-Finish nach 180s-Timeout; ae/oe/ue in admin-sichtbarer Fehlermeldung (`lib/meta/season.ts`).
- **[L-32] TZ-Kanten (nur DST-Frühjahr / off-schedule 00:00–02:00 Berlin)** — `accessory-availability.ts:104-105,271-272` + `find-free-unit:34-35` (Puffer-Fenster via `toISOString().split`, DST-Kante); `euer:156` + `wbw-bridge:48` (Anzeige-/Default-Datum, kosmetisch); diverse Client-„heute"-Vergleiche. **PLAUSIBLE/kosmetisch** — im Regelbetrieb kein Geldfehler.

---

## Wichtige REFUTED-Punkte (Verdacht geprüft → entkräftet)

- **Kamera-Unit-Doppelvergabe über zu schmale RPC-Statusliste** — REFUTED. Die zuletzt ausgeführte RPC `erledigte supabase/supabase-bookings-extra-statuses.sql` (2026-05-23) enthält `preparing_shipment`+`awaiting_pickup` sehr wohl; die schmalere Fassung in `supabase-camera-unit-assignment.sql` ist überschrieben. `pending_verification`/`awaiting_payment` reservieren nur den Slot, tragen nie `unit_id` → keine Doppelvergabe.
- **WBW-`monthsElapsed` als Zeitzonen-Bug** — REFUTED. Der Monat ist in beiden Implementierungen TZ-korrekt; die reale Divergenz ([H-10]) ist der Tages-Cut (mit/ohne), keine TZ.
- **Harter Kamera-Überbuchungs-Guard: Datum/Puffer-Sign** — korrekt (DST-fest via `toIsoDate`); der Guard-Mangel ist ausschließlich der fehlende Namens-Fallback ([H-13]), nicht das Datum.
- **Kalender-Tageszählung, Rechnungs-PDF (geht immer auf), Steuer `calculateTax`, Adress-Priorität, IDOR-Schutz, Postpone-Gates, Push-Filter (Katalog/Whitelist/Permission deckungsgleich), Set-Expansion/Upgrade-Skip-Parität, `syncAccessoryQty`-MAX-Floor, pdf_sha256-Verifikation, freeze-once, lock/finalize-wbw** — alle geprüft und korrekt.

---

## Abdeckungs-Matrix (21/21)

| Domäne | Bereich | Status |
|---|---|---|
| 1 | Preise/Rabatte/Versand/Haftung | ✅ |
| 2 | Storno/Erstattung (Server-Nebenwirkungen) | ✅ |
| 3 | Verfügbarkeit/Inventar/Units/Puffer/Cart-Holds/Status (+RPCs) | ✅ |
| 4 | Kaution/WBW/AfA/Haftungs-Box | ✅ |
| 5 | Buchhaltung EÜR/USt/DATEV/Rechnung/Stripe-Abgleich/Mahnung/Verkauf | ✅ |
| 6 | Zahlungs-Flow (intent/confirm/webhook/extend) | ✅ |
| 7 | Verträge/Signatur/Hash/Snapshot | ✅ |
| 8 | Legal-Content/Fallbacks/Consent | ✅ |
| 9 | Alle Crons (30 Routen) | ✅ |
| 10 | Admin-Buchungs-Mutationen | ✅ |
| 11 | Datum/Zeitzone-Querschnitt | ✅ |
| 12 | E-Mail-Rendering/Overrides/Previews | ✅ |
| 13 | Benachrichtigungen/Push | ✅ |
| 14 | Inventar-Integrität/Scan | ✅ |
| 15 | Auth/Permissions/Referenzen | ✅ |
| 16 | Analytics | ✅ |
| 17 | Blog | ✅ |
| 18 | Social/Reels | ✅ |
| 19 | Coupons/UGC/Waitlist/Newsletter | ✅ |
| 20 | Kundenkonto & Buchungs-Flows | ✅ |
| 21 | Rest-Sweep (Utilities) | ✅ |

**Bewusst nicht auditiert:** `archiv/`, `docs/`, `scripts/` (außer `sync-legal-fallbacks.ts`), generierte Assets (`cam2rent-logos/`, `public/`) — kein Rechen-/Geld-/Datums-Bezug.

---

*Reiner Prüfbericht — keine Code-Änderungen. Jeder Befund ist an Datei:Zeile belegt; die schwersten HOCH-Befunde wurden zusätzlich selbst an der Zeile gegengelesen. Fixes erfolgen nur auf ausdrücklichen Wunsch.*
