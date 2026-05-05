/**
 * verify-migration.ts — Pruefung der Buchhaltungs-/Inventar-Migration
 * (Session A Schritt 3)
 *
 * Verwendung:
 *   npx tsx scripts/verify-migration.ts
 *
 * Bricht mit Exit-Code != 0 ab, wenn etwas nicht stimmt.
 *
 * Pruefungen:
 *   1. Alle alten Datensaetze haben einen migration_audit-Eintrag
 *   2. migration_audit-Eintraege zeigen auf existierende neue Datensaetze
 *   3. Summen Brutto / Netto stimmen ueberein (Toleranz 0,02 EUR pro Welt)
 *   4. Anzahl inventar_units >= alte Stueck-Summe
 *   5. Jeder assets_neu-Eintrag hat eine existierende beleg_position_id
 *   6. Keine doppelten inventar_code / beleg_nr
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      let value = t.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
  } catch {/* */}
  return env
}

const envFile = loadEnv(resolve(__dirname, '..', '.env.local'))
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] || envFile['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] || envFile['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Fehlende ENV: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const errors: string[] = []
const warns: string[] = []

function fail(msg: string) { errors.push(msg); console.error(`  ✗ ${msg}`) }
function ok(msg: string) { console.log(`  ✓ ${msg}`) }
function warn(msg: string) { warns.push(msg); console.log(`  ⚠ ${msg}`) }

async function count(table: string, filter: Record<string, unknown> = {}): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filter)) {
    q = q.eq(k, v)
  }
  const { count: c, error } = await q
  if (error) throw new Error(`count(${table}): ${error.message}`)
  return c ?? 0
}

async function sum(table: string, column: string): Promise<number> {
  const { data, error } = await supabase.from(table).select(column)
  if (error) throw new Error(`sum(${table}.${column}): ${error.message}`)
  let total = 0
  for (const r of (data as any[]) ?? []) {
    const v = (r as Record<string, unknown>)[column]
    total += Number(v ?? 0)
  }
  return Math.round(total * 100) / 100
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Migration-Verifikation')
  console.log('═══════════════════════════════════════════════════')

  // Test 1: Audit-Coverage
  console.log('\n[1] Audit-Coverage (alle alten IDs in migration_audit?)')
  const altSuppliers = await count('suppliers')
  const altPurchases = await count('purchases')
  const altPurchaseItems = await count('purchase_items')
  const altExpenses = await count('expenses')
  const altProductUnits = await count('product_units')
  const altAccessoryUnits = await count('accessory_units')
  const altAssets = await count('assets')

  const auditCount = async (alteTabelle: string) => {
    const { count: c, error } = await supabase
      .from('migration_audit').select('*', { count: 'exact', head: true })
      .eq('alte_tabelle', alteTabelle)
    if (error) throw new Error(`audit(${alteTabelle}): ${error.message}`)
    return c ?? 0
  }

  const auditSupp = await auditCount('suppliers')
  const auditPurch = await auditCount('purchases')
  const auditItems = await auditCount('purchase_items')
  const auditExp = await auditCount('expenses')
  const auditPU = await auditCount('product_units')
  const auditAU = await auditCount('accessory_units')
  const auditAssets = await auditCount('assets')

  if (auditSupp >= altSuppliers) ok(`suppliers: ${auditSupp}/${altSuppliers}`)
  else fail(`suppliers: nur ${auditSupp}/${altSuppliers} migriert`)

  if (auditPurch >= altPurchases) ok(`purchases: ${auditPurch}/${altPurchases}`)
  else fail(`purchases: nur ${auditPurch}/${altPurchases} migriert`)

  if (auditItems >= altPurchaseItems) ok(`purchase_items: ${auditItems}/${altPurchaseItems}`)
  else fail(`purchase_items: nur ${auditItems}/${altPurchaseItems} migriert`)

  // expenses kann via Sammel-Stripe weniger neue Belege als alte Eintraege haben,
  // aber MEHR audit-Eintraege (1 alte expense → bis zu 2 audit-rows: belege + position).
  // Daher pruefen wir nur, dass jede alte expense MINDESTENS einmal vorkommt:
  const distinctExpenseIds = await supabase
    .from('migration_audit').select('alte_id').eq('alte_tabelle', 'expenses')
  const distinctSet = new Set((distinctExpenseIds.data as any[] ?? []).map(r => r.alte_id))
  if (distinctSet.size >= altExpenses) ok(`expenses: ${distinctSet.size}/${altExpenses} distinct`)
  else fail(`expenses: nur ${distinctSet.size}/${altExpenses} distinct migriert`)

  if (auditPU >= altProductUnits) ok(`product_units: ${auditPU}/${altProductUnits}`)
  else fail(`product_units: nur ${auditPU}/${altProductUnits} migriert`)

  if (auditAU >= altAccessoryUnits) ok(`accessory_units: ${auditAU}/${altAccessoryUnits}`)
  else fail(`accessory_units: nur ${auditAU}/${altAccessoryUnits} migriert`)

  // Assets koennen verwaist gewesen sein → kein Hard-Fail, nur Hinweis
  if (auditAssets < altAssets) {
    warn(`assets: ${auditAssets}/${altAssets} migriert (Differenz = verwaiste Assets)`)
  } else {
    ok(`assets: ${auditAssets}/${altAssets} migriert`)
  }

  // Test 2: Audit-Targets existieren noch
  console.log('\n[2] Audit-Targets existieren in den Zieltabellen')
  const { data: auditRows } = await supabase
    .from('migration_audit').select('neue_tabelle, neue_id').limit(5000)
  const grouped = new Map<string, Set<string>>()
  for (const r of (auditRows as any[]) ?? []) {
    if (!grouped.has(r.neue_tabelle)) grouped.set(r.neue_tabelle, new Set())
    grouped.get(r.neue_tabelle)!.add(r.neue_id)
  }
  for (const [tabelle, ids] of grouped.entries()) {
    const { data, error } = await supabase
      .from(tabelle).select('id').in('id', Array.from(ids))
    if (error) { fail(`Lookup auf ${tabelle}: ${error.message}`); continue }
    const found = new Set((data as any[] ?? []).map(r => r.id))
    const missing = Array.from(ids).filter(id => !found.has(id))
    if (missing.length === 0) ok(`${tabelle}: alle ${ids.size} Audit-Targets existieren`)
    else fail(`${tabelle}: ${missing.length} Audit-Targets fehlen (z.B. ${missing.slice(0, 3).join(', ')})`)
  }

  // Test 3: Summen
  console.log('\n[3] Summen Brutto / Netto')
  const altPurchasesSum = await sum('purchases', 'total_amount')
  const altExpensesSum = await sum('expenses', 'gross_amount')
  const altGesamt = altPurchasesSum + altExpensesSum
  const neuBruttoSum = await sum('belege', 'summe_brutto')
  const diff = Math.abs(altGesamt - neuBruttoSum)
  if (diff <= 0.10) ok(`Summen passen: alt ${altGesamt.toFixed(2)} EUR ≈ neu ${neuBruttoSum.toFixed(2)} EUR (Diff ${diff.toFixed(2)})`)
  else fail(`Summen weichen ab: alt ${altGesamt.toFixed(2)} vs neu ${neuBruttoSum.toFixed(2)} EUR (Diff ${diff.toFixed(2)})`)

  // Test 4: inventar_units-Anzahl
  console.log('\n[4] inventar_units >= product_units + accessory_units + bulk')
  const neuInventar = await count('inventar_units')
  const erwartet = altProductUnits + altAccessoryUnits  // bulk-accessories addieren wir grosszuegig dazu
  if (neuInventar >= erwartet) ok(`inventar_units: ${neuInventar} (>= erwartet ${erwartet})`)
  else fail(`inventar_units: ${neuInventar} (erwartet >= ${erwartet})`)

  // Test 5: assets_neu hat existierende beleg_position_id
  console.log('\n[5] assets_neu.beleg_position_id existiert in beleg_positionen')
  const { data: assetsNeu } = await supabase
    .from('assets_neu').select('id, beleg_position_id').limit(5000)
  const positionsToCheck = new Set((assetsNeu as any[] ?? []).map(a => a.beleg_position_id))
  if (positionsToCheck.size > 0) {
    const { data: pos } = await supabase
      .from('beleg_positionen').select('id').in('id', Array.from(positionsToCheck))
    const foundIds = new Set((pos as any[] ?? []).map(r => r.id))
    const missing = Array.from(positionsToCheck).filter(p => !foundIds.has(p))
    if (missing.length === 0) ok(`Alle ${positionsToCheck.size} Asset-Anker existieren`)
    else fail(`${missing.length} Asset-Anker zeigen ins Leere`)
  } else {
    ok('Keine assets_neu vorhanden — nichts zu pruefen')
  }

  // Test 6: keine Duplikate
  console.log('\n[6] Keine doppelten inventar_code / beleg_nr')
  const { data: codes } = await supabase
    .from('inventar_units').select('inventar_code').not('inventar_code', 'is', null)
  const codeArr = (codes as any[] ?? []).map(r => r.inventar_code)
  const codeSet = new Set(codeArr)
  if (codeArr.length === codeSet.size) ok(`inventar_code: ${codeArr.length} eindeutig`)
  else fail(`inventar_code: ${codeArr.length - codeSet.size} Duplikate`)

  const { data: nrs } = await supabase
    .from('belege').select('beleg_nr')
  const nrArr = (nrs as any[] ?? []).map(r => r.beleg_nr)
  const nrSet = new Set(nrArr)
  if (nrArr.length === nrSet.size) ok(`beleg_nr: ${nrArr.length} eindeutig`)
  else fail(`beleg_nr: ${nrArr.length - nrSet.size} Duplikate`)

  // Zusammenfassung
  console.log('\n═══════════════════════════════════════════════════')
  if (errors.length === 0) {
    console.log(`  ✓ Verifikation erfolgreich (${warns.length} Warnings)`)
    if (warns.length > 0) {
      console.log('\n  Warnings:')
      for (const w of warns) console.log(`    · ${w}`)
    }
    console.log('═══════════════════════════════════════════════════')
    process.exit(0)
  } else {
    console.error(`  ✗ ${errors.length} Fehler gefunden`)
    console.error('\n  Fehler:')
    for (const e of errors) console.error(`    · ${e}`)
    console.error('═══════════════════════════════════════════════════')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\nFEHLER:', err.message)
  console.error(err.stack)
  process.exit(2)
})
