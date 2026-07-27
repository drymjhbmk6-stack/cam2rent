// ⚠️ AUTOMATISCH GENERIERT — NICHT VON HAND EDITIEREN.
//
// Quelle: Supabase (autoritative Rechtstexte).
//   • CONTRACT_PARAGRAPHS_FALLBACK ← admin_settings.contract_paragraphs
//   • LEGAL_FALLBACKS[slug]        ← legal_documents + legal_document_versions (aktuelle Fassung)
//
// Neu generieren (in einer Umgebung mit Supabase-Zugangsdaten):
//   npm run sync:legal
//
// Solange die Arrays/Objekte LEER sind (Stub-Zustand), greifen automatisch die
// hand-gepflegten Fallbacks (getParagraphen() in contract-template.tsx bzw. die
// JSX-Fassung in app/agb/page.tsx). Dadurch gibt es KEINE Regression, bevor das
// Skript einmal mit DB-Zugang gelaufen ist. Das Skript ersetzt DIESE Datei
// vollständig.

/** ISO-Zeitstempel des letzten Generierungslaufs (null = Stub, nie generiert). */
export const GENERATED_AT: string | null = null;

/**
 * Vertragsparagraphen des Mietvertrags (autoritative DB-Fassung, §§ 1–24).
 * Leer = Stub → getParagraphen() nutzt die hand-gepflegte Fallback-Liste.
 */
export const CONTRACT_PARAGRAPHS_FALLBACK: { title: string; text: string }[] = [];

/**
 * Rechtstexte als Markdown je Slug (agb, widerruf, haftungsausschluss,
 * datenschutz, impressum). Leer = Stub → die jeweilige Seite nutzt ihr
 * hand-gepflegtes JSX-Fallback.
 */
export const LEGAL_FALLBACKS: Record<string, { title: string; markdown: string }> = {};
