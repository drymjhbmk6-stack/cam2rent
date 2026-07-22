/**
 * DB auslesen: listet alle Tabellen (public-Schema) + Zeilenzahl + Beispielzeilen.
 *
 * Nutzt SUPABASE_URL + SERVICE_ROLE_KEY aus der Umgebung (.env / Coolify).
 * Aufruf:
 *   node scripts/db-inspect.mjs                 -> alle Tabellen, je 3 Beispielzeilen
 *   node scripts/db-inspect.mjs bookings        -> nur diese Tabelle, 10 Zeilen
 *   node scripts/db-inspect.mjs --rows 5        -> alle Tabellen, je 5 Beispielzeilen
 *
 * .env laden (falls nicht schon gesetzt):
 *   node --env-file=.env scripts/db-inspect.mjs
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

// Argumente
const args = process.argv.slice(2);
let sampleRows = 3;
const only = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rows') sampleRows = parseInt(args[++i], 10) || 3;
  else only.push(args[i]);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// 1) Tabellennamen aus dem PostgREST-OpenAPI-Schema holen
async function listTables() {
  const res = await fetch(`${URL}/rest/v1/`, { headers });
  if (!res.ok) throw new Error(`Schema-Abruf fehlgeschlagen: ${res.status}`);
  const spec = await res.json();
  return Object.keys(spec.definitions || spec.components?.schemas || {}).sort();
}

// 2) Zeilenzahl (exakt, nur Header) + Beispielzeilen
async function inspect(table) {
  // Count via Content-Range Header (Prefer: count=exact, head)
  const countRes = await fetch(
    `${URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`,
    { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }
  );
  const range = countRes.headers.get('content-range') || '*/?';
  const total = range.split('/')[1];

  // Beispielzeilen
  let sample = [];
  if (sampleRows > 0) {
    const r = await fetch(
      `${URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${sampleRows}`,
      { headers }
    );
    if (r.ok) sample = await r.json();
  }
  return { total, sample };
}

async function main() {
  let tables = await listTables();
  if (only.length) tables = tables.filter((t) => only.includes(t));

  console.log(`\n📊 ${tables.length} Tabellen in ${URL}\n`);

  for (const t of tables) {
    try {
      const { total, sample } = await inspect(t);
      console.log(`\n=== ${t}  (${total} Zeilen) ===`);
      if (sample.length) {
        console.log('Spalten:', Object.keys(sample[0]).join(', '));
        console.dir(sample, { depth: 2, maxArrayLength: sampleRows });
      } else {
        console.log('(leer oder keine Leserechte)');
      }
    } catch (e) {
      console.log(`\n=== ${t}  — Fehler: ${e.message}`);
    }
  }
  console.log('\n✅ Fertig.\n');
}

main().catch((e) => {
  console.error('Abbruch:', e.message);
  process.exit(1);
});
