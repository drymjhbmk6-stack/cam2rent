/**
 * reset-db.ts — Leert alle Tabellen im public-Schema AUSSER den geschuetzten.
 *
 * Verwendung:
 *   npx tsx scripts/reset-db.ts --dry-run   # Nur anzeigen, nichts loeschen
 *   npx tsx scripts/reset-db.ts --confirm    # Wirklich loeschen
 *
 * Benoetigt in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional: Fuer TRUNCATE CASCADE diese SQL-Funktion im Supabase SQL Editor anlegen:
 *
 *   CREATE OR REPLACE FUNCTION exec_sql(query text)
 *   RETURNS json AS $$
 *   DECLARE result json;
 *   BEGIN
 *     EXECUTE query;
 *     result := json_build_object('success', true);
 *     RETURN result;
 *   END;
 *   $$ LANGUAGE plpgsql SECURITY DEFINER;
 *
 * Ohne diese Funktion wird DELETE als Fallback verwendet.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── .env.local manuell laden (kein dotenv noetig) ──────────────────────────
function loadEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      let value = trimmed.slice(eqIndex + 1).trim()
      // Anfuehrungszeichen entfernen
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
  } catch {
    // Datei nicht gefunden — env bleibt leer
  }
  return env
}

const envFile = loadEnv(resolve(__dirname, '..', '.env.local'))
const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || envFile['NEXT_PUBLIC_SUPABASE_URL']
const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || envFile['SUPABASE_SERVICE_ROLE_KEY']

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY')
  console.error('Stelle sicher, dass .env.local existiert und die Werte gesetzt sind.')
  process.exit(1)
}

// ── Geschuetzte Tabellen ────────────────────────────────────────────────────
const PROTECTED_TABLES = new Set(
  ['admin_config', 'accessories', 'sets', 'admin_settings', 'suppliers'].map(t => t.toLowerCase())
)

// ── Supabase-Client (Service Role = RLS umgehen) ────────────────────────────
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Tabellennamen aus PostgREST OpenAPI-Spec lesen ──────────────────────────
async function getAllPublicTables(): Promise<string[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`OpenAPI-Spec konnte nicht geladen werden (${res.status})`)
  }

  const spec = await res.json() as { paths?: Record<string, unknown> }

  // Tabellen = Pfade ohne /rpc/ Prefix
  const tables = Object.keys(spec.paths || {})
    .filter(p => !p.startsWith('/rpc/'))
    .map(p => p.replace(/^\//, ''))

  return tables.sort()
}

// ── Pruefen ob exec_sql RPC verfuegbar ist ──────────────────────────────────
async function hasExecSql(): Promise<boolean> {
  const { error } = await supabase.rpc('exec_sql', { query: 'SELECT 1' })
  return !error
}

// ── Tabelle leeren ──────────────────────────────────────────────────────────
async function clearTable(table: string, canTruncate: boolean): Promise<{ ok: boolean; method: string }> {
  // Versuch 1: TRUNCATE CASCADE via exec_sql RPC
  if (canTruncate) {
    const { error } = await supabase.rpc('exec_sql', {
      query: `TRUNCATE TABLE public."${table}" CASCADE`,
    })
    if (!error) {
      return { ok: true, method: 'TRUNCATE CASCADE' }
    }
  }

  // Versuch 2: DELETE via REST API mit id-Filter
  const res = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal',
    },
  })
  if (res.ok) {
    return { ok: true, method: 'DELETE (via REST)' }
  }

  // Versuch 3: DELETE mit created_at-Filter (falls kein id-Feld)
  const res2 = await fetch(
    `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?created_at=not.is.null`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=minimal',
      },
    }
  )
  if (res2.ok) {
    return { ok: true, method: 'DELETE (via REST, created_at)' }
  }

  return { ok: false, method: `Fehler: ${res2.status} - ${await res2.text()}` }
}

// ── Hauptprogramm ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const confirm = args.includes('--confirm')

  if (!dryRun && !confirm) {
    console.log('Verwendung:')
    console.log('  npx tsx scripts/reset-db.ts --dry-run   # Nur anzeigen')
    console.log('  npx tsx scripts/reset-db.ts --confirm    # Wirklich loeschen')
    process.exit(0)
  }

  console.log()
  console.log('=== cam2rent - Datenbank-Reset-Skript ===')
  console.log()
  console.log(`Supabase:  ${supabaseUrl}`)
  console.log(`Modus:     ${dryRun ? 'DRY-RUN (nur Anzeige)' : 'LIVE - Tabellen werden geleert!'}`)
  console.log()

  // Pruefen ob exec_sql verfuegbar ist
  const canTruncate = await hasExecSql()
  if (canTruncate) {
    console.log('exec_sql RPC gefunden -> TRUNCATE CASCADE wird verwendet.')
  } else {
    console.log('Hinweis: RPC-Funktion "exec_sql" nicht gefunden.')
    console.log('         DELETE wird als Fallback genutzt (kein CASCADE).')
    console.log('         Fuer TRUNCATE diese SQL im Supabase SQL Editor ausfuehren:')
    console.log()
    console.log('  CREATE OR REPLACE FUNCTION exec_sql(query text)')
    console.log('  RETURNS json AS $$')
    console.log('  DECLARE result json;')
    console.log('  BEGIN')
    console.log('    EXECUTE query;')
    console.log("    result := json_build_object('success', true);")
    console.log('    RETURN result;')
    console.log('  END;')
    console.log('  $$ LANGUAGE plpgsql SECURITY DEFINER;')
  }
  console.log()

  // Alle Tabellen laden
  let allTables: string[]
  try {
    allTables = await getAllPublicTables()
  } catch (err) {
    console.error('Konnte Tabellen nicht laden:', err)
    process.exit(1)
  }

  if (allTables.length === 0) {
    console.log('Keine Tabellen im public-Schema gefunden.')
    process.exit(0)
  }

  // Aufteilen
  const tablesToClear = allTables.filter(t => !PROTECTED_TABLES.has(t.toLowerCase()))
  const skippedTables = allTables.filter(t => PROTECTED_TABLES.has(t.toLowerCase()))

  console.log(`Gefundene Tabellen insgesamt: ${allTables.length}`)
  console.log()

  console.log(`Uebersprungene Tabellen (${skippedTables.length}):`)
  for (const t of skippedTables) {
    console.log(`  [SKIP] ${t}`)
  }
  console.log()

  console.log(`Zu leerende Tabellen (${tablesToClear.length}):`)
  for (const t of tablesToClear) {
    console.log(`  [CLEAR] ${t}`)
  }
  console.log()

  // Dry-Run: Hier aufhoeren
  if (dryRun) {
    console.log('--- DRY-RUN abgeschlossen. Keine Aenderungen vorgenommen. ---')
    console.log('Zum Loeschen: npx tsx scripts/reset-db.ts --confirm')
    process.exit(0)
  }

  // Live-Modus
  console.log('=== Tabellen werden geleert... ===')
  console.log()

  const results: { table: string; ok: boolean; method: string }[] = []

  for (const table of tablesToClear) {
    process.stdout.write(`  Leere "${table}"... `)
    const result = await clearTable(table, canTruncate)
    console.log(result.ok ? `OK (${result.method})` : `FEHLER (${result.method})`)
    results.push({ table, ...result })
  }

  console.log()
  console.log('=== Ergebnis ===')

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok)

  console.log(`Erfolgreich geleert: ${succeeded}/${tablesToClear.length}`)
  if (failed.length > 0) {
    console.log(`Fehlgeschlagen: ${failed.length}`)
    for (const r of failed) {
      console.log(`  - ${r.table}: ${r.method}`)
    }
  }
  console.log()
  console.log('Fertig.')
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err)
  process.exit(1)
})
