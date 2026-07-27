/**
 * sync-legal-fallbacks.ts — generiert die Rechtstext-Fallbacks aus Supabase.
 *
 * Warum: `getParagraphen()` (contract-template.tsx) und die JSX-Fallbacks der
 * Legal-Seiten (app/agb, app/widerruf, …) sind hand-gepflegte Momentaufnahmen,
 * die gegenüber der autoritativen DB-Fassung (V9, Vertrag §§ 1–24 / AGB §§ 1–25)
 * auseinanderlaufen. Dieses Skript liest die aktuellen Texte aus der DB und
 * schreibt sie nach `lib/legal/generated-fallbacks.ts`, sodass die Fallbacks
 * per EIN Befehl aktuell gehalten werden können statt von Hand nachgepflegt.
 *
 * Verwendung:
 *   npm run sync:legal            # generiert lib/legal/generated-fallbacks.ts
 *   npm run sync:legal -- --dry   # nur anzeigen, was generiert würde
 *
 * Benötigt (aus .env.local ODER der Umgebung):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * WICHTIG (Rechtstext-Compliance): Ist die DB nicht erreichbar oder sind die
 * autoritativen Texte noch nicht vollständig eingespielt (Vertrag < 24 §§ /
 * AGB < 25 §§), BRICHT das Skript ab und schreibt NICHTS — lieber der bekannte
 * (alte) Fallback als ein halb generierter Stand. Das Vollständigkeits-Gate
 * kann mit `--force` übersprungen werden (nur bewusst nutzen).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_FILE = join(process.cwd(), 'lib', 'legal', 'generated-fallbacks.ts');

// Slugs der Rechtsdokumente, die als Markdown-Fallback mitgenommen werden.
const LEGAL_SLUGS = ['agb', 'widerruf', 'haftungsausschluss', 'datenschutz', 'impressum'] as const;

// Erwartete Mindest-§-Zahl (Vollständigkeits-Gate). Vertrag §§ 1–24, AGB §§ 1–25.
const MIN_CONTRACT_PARAGRAPHS = 24;
const MIN_AGB_PARAGRAPHS = 25;

export interface ContractParagraph {
  title: string;
  text: string;
}
export interface LegalDoc {
  slug: string;
  title: string;
  markdown: string;
}

/** Zählt „§ N"-Überschriften in einem Markdown- oder Titel-Text. */
export function countParagraphs(text: string): number {
  const matches = text.match(/(^|\n)\s*#{0,3}\s*§\s*\d+/g);
  return matches ? matches.length : 0;
}

/** Escaped einen String für ein einfaches TS-Single-Quote-Literal. */
function tsString(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n') + "'";
}

/**
 * Reine Transform-Funktion (unit-testbar): rendert den kompletten Inhalt der
 * generierten Datei aus den DB-Daten. KEIN IO.
 */
export function renderGeneratedModule(
  paragraphs: ContractParagraph[],
  legalDocs: LegalDoc[],
  generatedAtIso: string,
): string {
  const header = `// ⚠️ AUTOMATISCH GENERIERT von scripts/sync-legal-fallbacks.ts — NICHT VON HAND EDITIEREN.
//
// Quelle: Supabase (autoritative Rechtstexte).
//   • CONTRACT_PARAGRAPHS_FALLBACK ← admin_settings.contract_paragraphs
//   • LEGAL_FALLBACKS[slug]        ← legal_documents + legal_document_versions
//
// Neu generieren:  npm run sync:legal
// Zuletzt generiert: ${generatedAtIso}

`;

  const paragraphsLiteral = paragraphs
    .map((p) => `  { title: ${tsString(p.title)}, text: ${tsString(p.text)} },`)
    .join('\n');

  const legalLiteral = legalDocs
    .map((d) => `  ${tsString(d.slug)}: { title: ${tsString(d.title)}, markdown: ${tsString(d.markdown)} },`)
    .join('\n');

  return (
    header +
    `export const GENERATED_AT: string | null = ${tsString(generatedAtIso)};\n\n` +
    `export const CONTRACT_PARAGRAPHS_FALLBACK: { title: string; text: string }[] = [\n${paragraphsLiteral}\n];\n\n` +
    `export const LEGAL_FALLBACKS: Record<string, { title: string; markdown: string }> = {\n${legalLiteral}\n};\n`
  );
}

// ── Ausführung (nur wenn direkt gestartet, nicht beim Import im Test) ──────────
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');

  // .env.local best-effort laden (ohne Extra-Dependency).
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env.local optional */ }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen. Abbruch — nichts generiert.');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Vertragsparagraphen
  const { data: cpRow, error: cpErr } = await supabase
    .from('admin_settings').select('value').eq('key', 'contract_paragraphs').maybeSingle();
  if (cpErr) { console.error('❌ contract_paragraphs laden fehlgeschlagen:', cpErr.message); process.exit(1); }
  const raw = cpRow?.value;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const paragraphs: ContractParagraph[] = Array.isArray(parsed)
    ? parsed.filter((p) => p && typeof p.title === 'string' && typeof p.text === 'string')
        .map((p) => ({ title: p.title.trim(), text: p.text }))
    : [];

  // 2. Rechtsdokumente (aktuelle Fassung)
  const legalDocs: LegalDoc[] = [];
  for (const slug of LEGAL_SLUGS) {
    const { data: doc } = await supabase
      .from('legal_documents').select('id, title').eq('slug', slug).maybeSingle();
    if (!doc) { console.warn(`⚠️  legal_documents: kein Eintrag für "${slug}" — übersprungen.`); continue; }
    const { data: ver } = await supabase
      .from('legal_document_versions')
      .select('content').eq('document_id', doc.id).eq('is_current', true).maybeSingle();
    if (!ver?.content) { console.warn(`⚠️  Keine aktuelle Version für "${slug}" — übersprungen.`); continue; }
    legalDocs.push({ slug, title: doc.title ?? slug, markdown: ver.content });
  }

  // 3. Vollständigkeits-Gate (Compliance: kein halber Stand).
  const agb = legalDocs.find((d) => d.slug === 'agb');
  const agbCount = agb ? countParagraphs(agb.markdown) : 0;
  const problems: string[] = [];
  if (paragraphs.length < MIN_CONTRACT_PARAGRAPHS)
    problems.push(`Vertrag: ${paragraphs.length} Paragraphen (erwartet ≥ ${MIN_CONTRACT_PARAGRAPHS})`);
  if (agbCount < MIN_AGB_PARAGRAPHS)
    problems.push(`AGB: ${agbCount} Paragraphen (erwartet ≥ ${MIN_AGB_PARAGRAPHS})`);

  if (problems.length && !force) {
    console.error('❌ Autoritative Texte unvollständig — Abbruch (nichts geschrieben):');
    for (const p of problems) console.error('   • ' + p);
    console.error('   → DB-Texte vollständig einspielen und erneut ausführen (oder --force).');
    process.exit(1);
  }

  const out = renderGeneratedModule(paragraphs, legalDocs, new Date().toISOString());
  console.log(`ℹ️  Vertrag: ${paragraphs.length} §§ · AGB: ${agbCount} §§ · Rechtsdokumente: ${legalDocs.length}`);

  if (dry) {
    console.log('— Dry-Run, nichts geschrieben. Vorschau (gekürzt):\n');
    console.log(out.slice(0, 800) + '\n…');
    return;
  }
  writeFileSync(OUT_FILE, out, 'utf8');
  console.log(`✅ ${OUT_FILE} generiert.`);
}

// Nur ausführen, wenn das Skript direkt gestartet wurde (nicht beim Test-Import).
const isDirectRun = process.argv[1] && /sync-legal-fallbacks\.ts$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
