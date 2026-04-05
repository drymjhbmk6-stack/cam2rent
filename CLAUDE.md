# cam2rent.de — Claude Code Instructions

## Projekt
Action-Cam Verleih-Shop. Next.js 15 App Router, TypeScript, Tailwind CSS.
Lokaler Pfad: `C:\Cam2Rent\cam2rent`
GitHub: drymjhbmk6-stack/cam2rent (master)
Server: Hetzner CX23 (178.104.117.135) + Coolify → test.cam2rent.de

## Sprache
Alle UI-Texte, Kommentare und Kommunikation auf **Deutsch**.

## Wichtige Regeln

### Haftungsschutz — NIEMALS "Versicherung" sagen
Die Haftungsoptionen (15 € Standard / 25 € Premium) dürfen NICHT als "Versicherung", "versichert" oder "Vollversichert" bezeichnet werden.
Immer verwenden: "Haftungsschutz", "Haftungsbegrenzung", "Haftungsoption", "abgesichert".
**Warum:** cam2rent ist kein Versicherungsunternehmen. Die Prämien bilden ein eigenes Reparaturdepot.

### Expressversand ist immer kostenpflichtig
Expressversand kostet immer 12,99 € — auch wenn der Gratis-Versand-Schwellwert erreicht ist.
In `data/shipping.ts` → `calcShipping()`: Express-Zweig prüft NICHT den `freeShippingThreshold`.

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

## Architektur-Übersicht
- **Buchungsflow:** 5 Steps (Versand → Zubehör → Haftung → Zusammenfassung → Zahlung)
- **Kundenkonto:** `/app/konto/` mit horizontaler Tab-Leiste
- **Admin:** `/app/admin/` mit einklappbarer Sidebar (Mobile Drawer)
- **Preise:** 30-Tage-Preistabelle pro Produkt + Formel für 31+ Tage, alles in admin_config
- **Kaution vs. Haftungsschutz:** Gegenseitig ausschließend pro Produkt

## Produkte
6 Kameras: GoPro Hero 13, Hero 12, DJI Osmo Action 4, DJI Action 5 Pro, Insta360 Ace Pro 2, Insta360 X4
4 Zubehör: Mini-Stativ, SD 64GB, SD 128GB, Extra-Akku
7 Sets: Basic, Fahrrad, Ski, Motorrad, Taucher, Vlogging, Allrounder

## Steuer
Steuer-Modus umschaltbar im Admin (/admin/einstellungen):
- `admin_settings.tax_mode`: 'kleinunternehmer' (default) oder 'regelbesteuerung'
- API: GET /api/tax-config → { taxMode, taxRate, ustId }
- Preise sind immer Bruttopreise, MwSt wird nur herausgerechnet bei Regelbesteuerung
- Buchen-Seite + Checkout + Invoice-PDF + Contract-PDF sind tax-aware

## Buchungsverlängerung
- Stripe Redirect-Flow (nicht in-Modal): Payment → Redirect zu /konto/buchungen?extend_confirm=1 → confirm-extension API
- Extension-Context wird in sessionStorage gespeichert ('cam2rent_extension')

## Neue Kunden-Features
- **Kamera-Vergleich:** `/vergleich?ids=1,2,3` — CompareProvider Context, CompareBar (sticky unten), max 3 Produkte
- **Kamera-Finder:** `/kamera-finder` — 5-Fragen-Assistent mit Score-basiertem Produkt-Matching
- **Set-Konfigurator:** `/set-konfigurator` — 3-Step Builder (Kamera→Zubehör→Zusammenfassung), Set-Rabatt 10%/15%, Buchungsflow akzeptiert `?accessories=id1,id2` URL-Param
- **Dark/Light Mode:** ThemeProvider mit localStorage Persistenz, Tailwind `darkMode: 'class'`, Toggle in Navbar

## Build
143 Seiten, 0 Fehler (Stand 2026-04-06, Commit 27fe79e)
