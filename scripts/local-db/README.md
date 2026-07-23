# Lokale Datenbank (Website 2.0)

Lokale Supabase-Umgebung (Docker) für Entwicklung + Test — **komplett getrennt
von der Live-Seite**. Die Live-DB wird nie berührt.

## Einmalig einrichten (schon erledigt)
- Docker Desktop installiert + läuft
- `npx supabase start` — lädt beim ersten Mal die Docker-Images
- `.env.local` zeigt auf `http://127.0.0.1:54321` (in .gitignore, nie gepusht)

## Täglich
1. **Docker Desktop starten** (falls nicht an)
2. `npm run db:start` — lokale DB/API hochfahren
3. `npm run dev` — Shop + Admin (nutzt automatisch `.env.local`)
4. Browser: **http://localhost:3000** (Shop + Admin)
   - Studio (DB ansehen/bearbeiten): **http://localhost:54323**
   - Test-Mails: **http://localhost:54324**
5. Admin-Login: Passwort **`admin`**

## Nützliche Befehle
| Befehl | Zweck |
|---|---|
| `npm run db:start` | Lokale Supabase hochfahren |
| `npm run db:stop`  | Herunterfahren |
| `npm run db:seed`  | Testdaten neu einspielen |
| `npm run db:reset` | DB komplett neu aufbauen (Schema + Rechte + Testdaten) |
| `npm run db:studio`| Zugangsdaten/Status anzeigen |

## Dateien
- `scripts/local-db/apply.sh` — Schema aus den ~160 SQL-Dateien aufbauen (Mehrfach-Durchlauf)
- `scripts/local-db/reset.sh` — Schnell-Neuaufbau aus `supabase/local-schema.sql`
- `scripts/local-db/seed.mjs` — Testdaten (Kameras, Exemplare, Zubehör, Set)
- `supabase/local-schema.sql` — Abzug des fertigen Schemas (99 Tabellen)

## Was funktioniert / was nicht
- **Funktioniert:** Shop-Anzeige, Produkte/Zubehör/Sets, Verfügbarkeit, Admin-Login,
  alle DB-gestützten Seiten.
- **Läuft lokal nicht echt:** Stripe-Zahlung, E-Mail-Versand, KI, Sendcloud
  (keine Keys gesetzt — im Code abgefangen). Für UI-/Ablauf-Tests egal.
