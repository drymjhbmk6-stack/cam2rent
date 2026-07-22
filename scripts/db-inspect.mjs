/**
 * DB-Struktur auslesen: listet alle Tabellen (public-Schema) + ihre Spalten (Felder + Typ).
 * KEINE Daten/Beispielzeilen — nur was jede Tabelle aufnimmt.
 *
 * Nutzt SUPABASE_URL + SERVICE_ROLE_KEY aus der Umgebung (.env / Coolify).
 * Aufruf:
 *   node --env-file=.env scripts/db-inspect.mjs             -> alle Tabellen + Spalten
 *   node --env-file=.env scripts/db-inspect.mjs bookings    -> nur diese Tabelle
 *   node --env-file=.env scripts/db-inspect.mjs --md         -> als Markdown (zum Speichern)
 */

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    'Fehlt: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Tipp: node --env-file=.env scripts/db-inspect.mjs'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const md = args.includes('--md');
const only = args.filter((a) => !a.startsWith('--'));

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function main() {
  const res = await fetch(`${URL}/rest/v1/`, { headers });
  if (!res.ok) throw new Error(`Schema-Abruf fehlgeschlagen: ${res.status}`);
  const spec = await res.json();
  const defs = spec.definitions || spec.components?.schemas || {};

  let tables = Object.keys(defs).sort();
  if (only.length) tables = tables.filter((t) => only.includes(t));

  if (md) console.log(`# DB-Struktur (${tables.length} Tabellen)\n`);
  else console.log(`\n${tables.length} Tabellen in ${URL}\n`);

  for (const t of tables) {
    const props = defs[t].properties || {};
    const cols = Object.keys(props);
    if (md) {
      console.log(`\n## ${t}  (${cols.length} Spalten)\n`);
      console.log('| Spalte | Typ | Hinweis |');
      console.log('|---|---|---|');
      for (const c of cols) {
        const p = props[c];
        const typ = p.format || p.type || '';
        const note = (p.description || '').split('\n')[0].replace(/\|/g, '\\|');
        console.log(`| ${c} | ${typ} | ${note} |`);
      }
    } else {
      console.log(`\n=== ${t}  (${cols.length} Spalten) ===`);
      for (const c of cols) {
        const p = props[c];
        const typ = p.format || p.type || '';
        console.log(`  ${c.padEnd(32)} ${typ}`);
      }
    }
  }
  if (!md) console.log('\n✅ Fertig.\n');
}

main().catch((e) => {
  console.error('Abbruch:', e.message);
  process.exit(1);
});
