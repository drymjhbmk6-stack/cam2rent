# cam2rent — Crontab-Referenz (Hetzner)

**Zweck:** Autoritative Liste aller Cron-Jobs. Beim Hinzufügen eines neuen Crons
wird dieser hier eingetragen (Gruppe + Zeile) — so weiß jede neue Claude-Session
sofort, wo die neue Zeile hingehört, ohne den Code neu durchzugehen.

## Prinzip (jede Zeile gleich aufgebaut)

```
<schedule> curl -s [-X POST] --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/<route>
```

- **`--resolve cam2rent.de:443:127.0.0.1`** ist Pflicht → umgeht Cloudflare
  (sonst fängt Bot Fight Mode den `curl` mit einer Challenge ab, die App wird nie erreicht).
- **`-X POST`** nur bei Routen, die POST unterstützen. **GET-only-Routen laufen OHNE `-X POST`**
  (mit POST → 405, läuft still nicht).
- Oben in der Crontab müssen gesetzt sein: `TZ=Europe/Berlin`, `SITE=https://cam2rent.de`,
  `CRON_SECRET=<echter Wert>`. Mit `TZ=Europe/Berlin` sind alle Uhrzeiten Berlin-Zeit.

## GET-only-Routen (NIEMALS `-X POST`)

`auto-cancel` · `dunning-check` · `abandoned-cart` · `reminder-emails` · `daily-report`
`blog-generate` und `blog-publish` sind **POST-only**. Alle übrigen können GET **und** POST
(wir nutzen POST).

## Vollständige Crontab (Stand 2026-08-09 — 31 Jobs)

```cron
TZ=Europe/Berlin
SITE=https://cam2rent.de
CRON_SECRET=DEIN_CRON_SECRET_HIER

# — Blog —
0 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/blog-generate           # stuendlich
*/10 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/blog-publish         # alle 10 Min

# — Social Media (FB + IG) —
*/5 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/social-publish        # alle 5 Min
0 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/social-generate         # stuendlich

# — Auto-Reels —
*/5 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/reels-publish         # alle 5 Min
0 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/reels-generate          # stuendlich
0 4 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/reels-segment-cleanup   # taeglich 04:00

# — Verifizierung / Express-Signup —
0 8 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/verification-reminder      # taeglich 08:00
0 14 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/verification-auto-cancel  # taeglich 14:00

# — Mietvertrag —
10 8 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/contract-reminder      # taeglich 08:10
0 9 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/contract-auto-cancel    # taeglich 09:00

# — Zahlungsausfaelle —
5 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/awaiting-payment-cancel # stuendlich :05
15 3 * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/auto-cancel                    # taeglich 03:15 [GET]
0 6 * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/dunning-check                   # taeglich 06:00 [GET]

# — Tagesgeschaeft / Versand & Rueckgabe —
0 8,13,18 * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/pickup-return-reminder    # 8/13/18 Uhr [GET]
0 8 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/return-checklist-reminder # taeglich 08:00
30 8 * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/reminder-emails                # taeglich 08:30 [GET]
*/10 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/sendcloud-status-sync # alle 10 Min

# — Warenkorb / Reservierungen —
*/15 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/cart-holds-cleanup   # alle 15 Min
*/30 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/reservations-cleanup # alle 30 Min
15 * * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/abandoned-cart                 # stuendlich :15 [GET]

# — Kunden-E-Mails / Persoenlich —
*/3 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/inbound-email-poll    # alle 3 Min
*/5 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/appointment-reminders # alle 5 Min

# — Konto-Lifecycle —
30 7 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/account-cleanup        # taeglich 07:30
30 3 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/dsgvo-cleanup          # taeglich 03:30

# — Buchhaltung / Reporting —
0 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/stripe-sync             # stuendlich
0 20 * * * curl -s --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/daily-report                   # taeglich 20:00 [GET]
30 18 * * 0 curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/weekly-report         # So 18:30
0 6 1 * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/afa-buchung             # 1. d. Monats 06:00
0 3 1 * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/depreciation            # 1. d. Monats 03:00
0 7 1 */3 * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" $SITE/api/cron/firmware-check        # alle 3 Monate, 1. 07:00
```

## Wenn ein NEUER Cron dazukommt

1. Route unter `app/api/cron/<name>/route.ts` prüfen: unterstützt sie `GET`, `POST` oder beide?
   → bestimmt, ob `-X POST` drankommt (GET-only = ohne).
2. Passende Gruppe oben wählen und die Zeile dort einfügen.
3. Diese Datei aktualisieren (Zeile + Gruppe eintragen) und die Job-Zahl im Titel hochzählen.
