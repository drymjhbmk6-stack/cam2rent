/**
 * migrate-buchhaltung.ts — Daten-Migration alte Welt → neue Welt
 * (Buchhaltung + Inventar Konsolidierung, Session A Schritt 2)
 *
 * Verwendung:
 *   npx tsx scripts/migrate-buchhaltung.ts --dry-run   # nur Counts, schreibt nichts
 *   npx tsx scripts/migrate-buchhaltung.ts --confirm   # echte Migration
 *
 * Voraussetzung: SQL-Migration `supabase/buchhaltung-konsolidierung.sql`
 * wurde bereits im Supabase-Dashboard ausgefuehrt.
 *
 * Idempotenz: Skript bricht ab, wenn `migration_audit` bereits Eintraege hat.
 *
 * Benoetigt in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const CONFIRMED = args.includes('--confirm')

if (!DRY_RUN && !CONFIRMED) {
  console.error('Bitte --dry-run oder --confirm angeben.')
  process.exit(1)
}

// ── ENV laden ───────────────────────────────────────────────────────────────
function loadEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
  } catch {
    // egal
  }
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

// ── Stats / Report ──────────────────────────────────────────────────────────
const stats = {
  lieferanten_in: 0, lieferanten_out: 0,
  produkte_kameras: 0, produkte_zubehoer: 0,
  inventar_kameras: 0, inventar_zubehoer_individual: 0, inventar_bulk: 0,
  belege_aus_purchases: 0, belege_aus_expenses: 0, belege_aus_stripe: 0,
  belege_aus_orphan_assets: 0,
  beleg_positionen_total: 0,
  assets_neu_migriert: 0, assets_verwaist: 0, assets_via_eigenbeleg: 0,
  inventar_verknuepfungen: 0,
  warnings: [] as string[],
}

function warn(msg: string) {
  stats.warnings.push(msg)
  console.warn(`  ⚠ ${msg}`)
}

// ── Audit-Helper ────────────────────────────────────────────────────────────
type AuditRow = { alte_tabelle: string; alte_id: string; neue_tabelle: string; neue_id: string; notizen?: string }
const auditBuffer: AuditRow[] = []

function audit(row: AuditRow) {
  auditBuffer.push(row)
}

async function flushAudit() {
  if (auditBuffer.length === 0 || DRY_RUN) {
    auditBuffer.length = 0
    return
  }
  // In 500er-Batches schreiben
  while (auditBuffer.length > 0) {
    const chunk = auditBuffer.splice(0, 500)
    const { error } = await supabase.from('migration_audit').insert(chunk)
    if (error) {
      console.error('Fehler beim Audit-Insert:', error.message)
      throw error
    }
  }
}

// ── Belegnummer holen (DB-Funktion) ─────────────────────────────────────────
async function nextBelegNr(jahr: number): Promise<string> {
  if (DRY_RUN) return `EK-${jahr}-DRY`
  const { data, error } = await supabase.rpc('naechste_beleg_nummer', { p_jahr: jahr })
  if (error) throw new Error(`naechste_beleg_nummer failed: ${error.message}`)
  return data as string
}

// ── Heuristik: Verbrauchsmaterial-Erkennung ─────────────────────────────────
const VERBRAUCH_KEYWORDS = [
  'tuch', 'tücher', 'tuecher', 'putz', 'reinigung', 'klebe', 'putzset',
  'verpackung', 'karton', 'papier', 'folie', 'spray', 'reiniger',
  'desinfek', 'mikrofaser', 'wischtuch',
]

function isVerbrauchsmaterial(name: string, kategorie?: string | null): boolean {
  const haystack = `${name} ${kategorie ?? ''}`.toLowerCase()
  return VERBRAUCH_KEYWORDS.some(k => haystack.includes(k))
}

// ── Pre-Check: ist DB schon migriert? ───────────────────────────────────────
async function checkPristine() {
  const { count, error } = await supabase
    .from('migration_audit')
    .select('*', { count: 'exact', head: true })
  if (error) {
    throw new Error(`migration_audit-Check fehlgeschlagen: ${error.message}. Wurde die Schema-Migration ausgefuehrt?`)
  }
  if ((count ?? 0) > 0) {
    throw new Error(`migration_audit hat bereits ${count} Eintraege. Migration scheint schon gelaufen — Abbruch.`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 1: lieferanten ← suppliers
// ────────────────────────────────────────────────────────────────────────────
async function migrateLieferanten(): Promise<Map<string, string>> {
  console.log('\n[1/8] Lieferanten ← suppliers')
  const map = new Map<string, string>()
  const { data: suppliers, error } = await supabase
    .from('suppliers').select('*').order('created_at')
  if (error) throw error
  stats.lieferanten_in = suppliers?.length ?? 0

  for (const s of suppliers ?? []) {
    const adresse = [s.contact_person, s.phone, s.website, s.supplier_number]
      .filter(Boolean).join(' · ') || null
    const insertRow = {
      name: s.name,
      adresse,
      ust_id: null,
      email: s.email,
      notizen: s.notes,
    }
    if (DRY_RUN) {
      map.set(s.id, '00000000-0000-0000-0000-000000000000')
      stats.lieferanten_out++
      continue
    }
    const { data, error: insErr } = await supabase
      .from('lieferanten').insert(insertRow).select('id').single()
    if (insErr) { warn(`supplier ${s.id}: ${insErr.message}`); continue }
    map.set(s.id, data.id)
    audit({ alte_tabelle: 'suppliers', alte_id: s.id, neue_tabelle: 'lieferanten', neue_id: data.id })
    stats.lieferanten_out++
  }
  await flushAudit()
  console.log(`  → ${stats.lieferanten_out}/${stats.lieferanten_in} migriert`)
  return map
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 2: produkte ← admin_config.products + accessories
// ────────────────────────────────────────────────────────────────────────────
async function migrateProdukte(): Promise<{ kameraMap: Map<string, string>; zubMap: Map<string, string> }> {
  console.log('\n[2/8] Produkte ← admin_config.products + accessories')
  const kameraMap = new Map<string, string>()  // product_id (TEXT) → produkte.id (UUID)
  const zubMap = new Map<string, string>()     // accessory_id (TEXT) → produkte.id (UUID)

  // Kameras aus admin_config
  const { data: cfg } = await supabase
    .from('admin_config').select('value').eq('key', 'products').maybeSingle()
  const products = (cfg?.value ?? {}) as Record<string, { name?: string; brand?: string; model?: string; image?: string; deposit?: number }>

  for (const [key, p] of Object.entries(products)) {
    const insertRow = {
      name: p.name ?? key,
      marke: p.brand ?? null,
      modell: p.model ?? null,
      default_wbw: p.deposit ?? null,
      ist_vermietbar: true,
      bild_url: p.image ?? null,
    }
    if (DRY_RUN) { kameraMap.set(key, '00000000-0000-0000-0000-000000000000'); stats.produkte_kameras++; continue }
    const { data, error } = await supabase.from('produkte').insert(insertRow).select('id').single()
    if (error) { warn(`produkt-kamera ${key}: ${error.message}`); continue }
    kameraMap.set(key, data.id)
    audit({ alte_tabelle: 'admin_config.products', alte_id: key, neue_tabelle: 'produkte', neue_id: data.id })
    stats.produkte_kameras++
  }

  // Zubehoer (alle accessories)
  const { data: accs, error: accErr } = await supabase
    .from('accessories').select('id, name, category')
  if (accErr) throw accErr

  for (const a of accs ?? []) {
    const insertRow = {
      name: a.name,
      marke: null,
      modell: a.category ?? null,
      default_wbw: null,
      ist_vermietbar: true,
      bild_url: null,
    }
    if (DRY_RUN) { zubMap.set(a.id, '00000000-0000-0000-0000-000000000000'); stats.produkte_zubehoer++; continue }
    const { data, error } = await supabase.from('produkte').insert(insertRow).select('id').single()
    if (error) { warn(`produkt-zub ${a.id}: ${error.message}`); continue }
    zubMap.set(a.id, data.id)
    audit({ alte_tabelle: 'accessories', alte_id: a.id, neue_tabelle: 'produkte', neue_id: data.id, notizen: 'als produkt' })
    stats.produkte_zubehoer++
  }

  await flushAudit()
  console.log(`  → ${stats.produkte_kameras} Kamera-Stammdaten, ${stats.produkte_zubehoer} Zubehoer-Stammdaten`)
  return { kameraMap, zubMap }
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 3: inventar_units ← product_units + accessory_units + accessories(bulk)
// ────────────────────────────────────────────────────────────────────────────
async function migrateInventar(
  kameraMap: Map<string, string>,
  zubMap: Map<string, string>,
): Promise<{
  productUnitMap: Map<string, string>
  accessoryUnitMap: Map<string, string>
  bulkAccessoryMap: Map<string, string>
}> {
  console.log('\n[3/8] Inventar ← product_units + accessory_units + accessories(bulk)')

  const productUnitMap = new Map<string, string>()
  const accessoryUnitMap = new Map<string, string>()
  const bulkAccessoryMap = new Map<string, string>()

  // 3a) product_units → kamera/individual
  const { data: pUnits, error: pErr } = await supabase
    .from('product_units').select('id, product_id, serial_number, label, status, notes, purchased_at')
  if (pErr) throw pErr

  // assets-Lookups für Kaufpreis/-datum
  const { data: assetsAll } = await supabase
    .from('assets').select('id, unit_id, accessory_unit_id, purchase_price, purchase_date, replacement_value_estimate, current_value, kind')

  const assetsByUnitId = new Map<string, any>()
  const assetsByAccessoryUnitId = new Map<string, any>()
  for (const a of (assetsAll as any[]) ?? []) {
    if (a.unit_id) assetsByUnitId.set(a.unit_id, a)
    if (a.accessory_unit_id) assetsByAccessoryUnitId.set(a.accessory_unit_id, a)
  }

  for (const u of pUnits ?? []) {
    const asset = assetsByUnitId.get(u.id)
    const kaufpreis = asset?.purchase_price ?? null
    const kaufdatum = asset?.purchase_date ?? u.purchased_at ?? null
    const wbw = asset?.replacement_value_estimate ?? asset?.current_value ?? null
    const code = `CAM-${u.product_id}-${u.serial_number}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
    const insertRow = {
      bezeichnung: u.label || `${u.product_id} ${u.serial_number}`,
      typ: 'kamera' as const,
      tracking_mode: 'individual' as const,
      produkt_id: kameraMap.get(u.product_id) ?? null,
      seriennummer: u.serial_number,
      inventar_code: code,
      bestand: null,
      kaufpreis_netto: kaufpreis,
      kaufdatum: kaufdatum,
      wiederbeschaffungswert: wbw,
      wbw_manuell_gesetzt: !!asset?.replacement_value_estimate,
      status: mapInventarStatus(u.status),
      beleg_status: asset?.purchase_price ? 'verknuepft' : 'beleg_fehlt',
      notizen: u.notes,
    }
    if (DRY_RUN) { productUnitMap.set(u.id, '00000000-0000-0000-0000-000000000000'); stats.inventar_kameras++; continue }
    const { data, error } = await supabase.from('inventar_units').insert(insertRow).select('id').single()
    if (error) { warn(`product_unit ${u.id}: ${error.message}`); continue }
    productUnitMap.set(u.id, data.id)
    audit({ alte_tabelle: 'product_units', alte_id: u.id, neue_tabelle: 'inventar_units', neue_id: data.id })
    stats.inventar_kameras++
  }

  // 3b) accessory_units → zubehoer/individual
  const { data: aUnits, error: aErr } = await supabase
    .from('accessory_units').select('id, accessory_id, exemplar_code, status, notes, purchased_at')
  if (aErr) throw aErr

  const { data: accsForLookup } = await supabase
    .from('accessories').select('id, name, category')
  const accLookup = new Map<string, { name: string; category: string | null }>()
  for (const a of (accsForLookup as any[]) ?? []) {
    accLookup.set(a.id, { name: a.name, category: a.category })
  }

  for (const u of aUnits ?? []) {
    const asset = assetsByAccessoryUnitId.get(u.id)
    const accInfo = accLookup.get(u.accessory_id)
    const kaufpreis = asset?.purchase_price ?? null
    const kaufdatum = asset?.purchase_date ?? u.purchased_at ?? null
    const wbw = asset?.replacement_value_estimate ?? asset?.current_value ?? null
    const insertRow = {
      bezeichnung: accInfo ? `${accInfo.name} (${u.exemplar_code})` : u.exemplar_code,
      typ: 'zubehoer' as const,
      tracking_mode: 'individual' as const,
      produkt_id: zubMap.get(u.accessory_id) ?? null,
      seriennummer: null,
      inventar_code: u.exemplar_code.slice(0, 60),
      bestand: null,
      kaufpreis_netto: kaufpreis,
      kaufdatum: kaufdatum,
      wiederbeschaffungswert: wbw,
      wbw_manuell_gesetzt: !!asset?.replacement_value_estimate,
      status: mapInventarStatus(u.status),
      beleg_status: asset?.purchase_price ? 'verknuepft' : 'beleg_fehlt',
      notizen: u.notes,
    }
    if (DRY_RUN) { accessoryUnitMap.set(u.id, '00000000-0000-0000-0000-000000000000'); stats.inventar_zubehoer_individual++; continue }
    const { data, error } = await supabase.from('inventar_units').insert(insertRow).select('id').single()
    if (error) { warn(`accessory_unit ${u.id}: ${error.message}`); continue }
    accessoryUnitMap.set(u.id, data.id)
    audit({ alte_tabelle: 'accessory_units', alte_id: u.id, neue_tabelle: 'inventar_units', neue_id: data.id })
    stats.inventar_zubehoer_individual++
  }

  // 3c) accessories WHERE is_bulk=true → bulk
  const { data: bulkAccs, error: bErr } = await supabase
    .from('accessories').select('id, name, category, available_qty, replacement_value, is_bulk').eq('is_bulk', true)
  if (bErr && bErr.code !== '42703') throw bErr  // 42703 = column does not exist (Migration noch nicht durch)

  for (const a of bulkAccs ?? []) {
    const verbrauch = isVerbrauchsmaterial(a.name, a.category)
    const insertRow = {
      bezeichnung: a.name,
      typ: (verbrauch ? 'verbrauch' : 'zubehoer') as 'verbrauch' | 'zubehoer',
      tracking_mode: 'bulk' as const,
      produkt_id: zubMap.get(a.id) ?? null,
      seriennummer: null,
      inventar_code: `BULK-${a.id}`.slice(0, 60),
      bestand: a.available_qty ?? 0,
      kaufpreis_netto: null,
      kaufdatum: null,
      wiederbeschaffungswert: a.replacement_value ?? null,
      wbw_manuell_gesetzt: !!a.replacement_value,
      status: 'verfuegbar' as const,
      beleg_status: 'beleg_fehlt' as const,
      notizen: null,
    }
    if (DRY_RUN) { bulkAccessoryMap.set(a.id, '00000000-0000-0000-0000-000000000000'); stats.inventar_bulk++; continue }
    const { data, error } = await supabase.from('inventar_units').insert(insertRow).select('id').single()
    if (error) { warn(`bulk-accessory ${a.id}: ${error.message}`); continue }
    bulkAccessoryMap.set(a.id, data.id)
    audit({
      alte_tabelle: 'accessories',
      alte_id: a.id,
      neue_tabelle: 'inventar_units',
      neue_id: data.id,
      notizen: `bulk (${verbrauch ? 'verbrauch' : 'zubehoer'})`,
    })
    stats.inventar_bulk++
  }

  await flushAudit()
  console.log(`  → ${stats.inventar_kameras} Kameras, ${stats.inventar_zubehoer_individual} Zubehoer einzeln, ${stats.inventar_bulk} Bulk`)
  return { productUnitMap, accessoryUnitMap, bulkAccessoryMap }
}

function mapInventarStatus(s: string): 'verfuegbar' | 'vermietet' | 'wartung' | 'defekt' | 'ausgemustert' {
  switch (s) {
    case 'available':   return 'verfuegbar'
    case 'rented':      return 'vermietet'
    case 'maintenance': return 'wartung'
    case 'damaged':     return 'defekt'
    case 'lost':        return 'defekt'
    case 'retired':     return 'ausgemustert'
    default:            return 'verfuegbar'
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 4: belege + beleg_positionen ← purchases + purchase_items
// ────────────────────────────────────────────────────────────────────────────
async function migratePurchases(
  lieferantenMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n[4/8] Belege ← purchases')
  const itemMap = new Map<string, string>()  // purchase_item.id → beleg_positionen.id

  const { data: purchases, error } = await supabase
    .from('purchases')
    .select('id, supplier_id, order_date, status, invoice_number, invoice_url, total_amount, notes, payment_method, invoice_date, net_amount, tax_amount, is_test, created_at')
    .order('order_date')
  if (error) throw error

  for (const p of purchases ?? []) {
    const jahr = new Date((p.invoice_date ?? p.order_date ?? p.created_at) as string).getFullYear()
    const belegNr = await nextBelegNr(jahr)

    // Positionen laden
    const { data: items, error: itemErr } = await supabase
      .from('purchase_items')
      .select('id, product_name, quantity, unit_price, classification, tax_rate, net_price, asset_id, expense_id, ai_suggestion')
      .eq('purchase_id', p.id)
    if (itemErr) { warn(`items fuer purchase ${p.id}: ${itemErr.message}`); continue }

    const summeNetto = p.net_amount ?? (items ?? []).reduce((s, i) => s + (Number(i.net_price ?? i.unit_price) * Number(i.quantity)), 0)
    const summeBrutto = p.total_amount ?? summeNetto * 1.19

    const belegRow = {
      beleg_nr: belegNr,
      interne_beleg_no: belegNr,
      lieferant_id: p.supplier_id ? lieferantenMap.get(p.supplier_id) ?? null : null,
      beleg_datum: p.invoice_date ?? p.order_date,
      bezahl_datum: null,
      rechnungsnummer_lieferant: p.invoice_number,
      summe_netto: summeNetto,
      summe_brutto: summeBrutto,
      status: 'festgeschrieben' as const,
      quelle: 'migration' as const,
      ist_eigenbeleg: false,
      eigenbeleg_grund: null,
      notizen: p.notes,
      is_test: !!p.is_test,
      festgeschrieben_at: p.created_at,
    }

    let neueBelegId = '00000000-0000-0000-0000-000000000000'
    if (!DRY_RUN) {
      const { data: belegData, error: belegErr } = await supabase
        .from('belege').insert(belegRow).select('id').single()
      if (belegErr) { warn(`beleg fuer purchase ${p.id}: ${belegErr.message}`); continue }
      neueBelegId = belegData.id
      audit({ alte_tabelle: 'purchases', alte_id: p.id, neue_tabelle: 'belege', neue_id: neueBelegId })
    }

    let pos = 0
    for (const it of items ?? []) {
      const klass = mapClassification(it.classification)
      const positionRow = {
        beleg_id: neueBelegId,
        reihenfolge: pos++,
        bezeichnung: it.product_name,
        menge: it.quantity ?? 1,
        einzelpreis_netto: Number(it.net_price ?? it.unit_price),
        mwst_satz: it.tax_rate ?? 19.00,
        klassifizierung: klass,
        kategorie: null,
        ki_vorschlag: it.ai_suggestion,
        locked: true,
        notizen: null,
      }
      if (DRY_RUN) { itemMap.set(it.id, '00000000-0000-0000-0000-000000000000'); stats.beleg_positionen_total++; continue }
      const { data: posData, error: posErr } = await supabase
        .from('beleg_positionen').insert(positionRow).select('id').single()
      if (posErr) { warn(`pos fuer item ${it.id}: ${posErr.message}`); continue }
      itemMap.set(it.id, posData.id)
      audit({ alte_tabelle: 'purchase_items', alte_id: it.id, neue_tabelle: 'beleg_positionen', neue_id: posData.id })
      stats.beleg_positionen_total++
    }

    stats.belege_aus_purchases++
  }

  await flushAudit()
  console.log(`  → ${stats.belege_aus_purchases} Belege, ${itemMap.size} Positionen`)
  return itemMap
}

function mapClassification(c: string | null): 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'ignoriert' {
  switch (c) {
    case 'asset':    return 'afa'
    case 'gwg':      return 'gwg'
    case 'expense':  return 'ausgabe'
    case 'ignored':  return 'ignoriert'
    case 'pending':  return 'pending'
    default:         return 'pending'
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 5: belege ← expenses (manuelle Ausgaben + Stripe-Aggregation)
// ────────────────────────────────────────────────────────────────────────────
async function migrateExpenses(): Promise<void> {
  console.log('\n[5/8] Belege ← expenses (manuell + Stripe)')

  // expenses, die NICHT bereits über purchase_items.expense_id einer purchase
  // zugeordnet sind. Pragmatik: alle expenses durchgehen — wenn purchase_id
  // gesetzt, schon ueber Schritt 4 abgedeckt; Eigenbeleg wird in dem Fall NICHT
  // erzeugt (würde Doppelung sein).
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, expense_date, category, description, vendor, net_amount, tax_amount, gross_amount, payment_method, notes, is_test, purchase_id, asset_id, created_at')
    .order('expense_date')
  if (error) throw error

  // Stripe-Gebuehren separat aggregieren
  const driCutoff = new Date()
  driCutoff.setMonth(driCutoff.getMonth() - 3)

  const stripeRecent: any[] = []
  const stripePerMonth = new Map<string, any[]>()  // 'YYYY-MM' (+ is_test-Suffix) → expenses[]

  const restExpenses: any[] = []

  for (const e of expenses ?? []) {
    if (e.purchase_id) continue  // schon durch Purchase abgedeckt
    if (e.category === 'stripe_fees') {
      const d = new Date(e.expense_date as string)
      if (d >= driCutoff) {
        stripeRecent.push(e)
      } else {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}__${e.is_test ? 'test' : 'live'}`
        if (!stripePerMonth.has(key)) stripePerMonth.set(key, [])
        stripePerMonth.get(key)!.push(e)
      }
      continue
    }
    restExpenses.push(e)
  }

  // 5a) Normale manuelle Ausgaben → 1 Beleg + 1 Position pro Eintrag
  for (const e of restExpenses) {
    const jahr = new Date(e.expense_date as string).getFullYear()
    const belegNr = await nextBelegNr(jahr)

    const belegRow = {
      beleg_nr: belegNr,
      interne_beleg_no: belegNr,
      lieferant_id: null,
      beleg_datum: e.expense_date,
      bezahl_datum: e.expense_date,
      rechnungsnummer_lieferant: null,
      summe_netto: Number(e.net_amount),
      summe_brutto: Number(e.gross_amount ?? e.net_amount),
      status: 'festgeschrieben' as const,
      quelle: 'migration' as const,
      ist_eigenbeleg: true,
      eigenbeleg_grund: 'Migration aus altem System (manuelle Ausgabe)',
      notizen: e.notes,
      is_test: !!e.is_test,
      festgeschrieben_at: e.created_at,
    }
    if (DRY_RUN) { stats.belege_aus_expenses++; stats.beleg_positionen_total++; continue }
    const { data: belegData, error: belegErr } = await supabase
      .from('belege').insert(belegRow).select('id').single()
    if (belegErr) { warn(`expense-beleg ${e.id}: ${belegErr.message}`); continue }
    audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'belege', neue_id: belegData.id })

    const taxRate = e.gross_amount && e.net_amount && Number(e.net_amount) > 0
      ? Math.round(((Number(e.gross_amount) / Number(e.net_amount)) - 1) * 10000) / 100
      : 19.00

    const positionRow = {
      beleg_id: belegData.id,
      reihenfolge: 0,
      bezeichnung: e.description ?? `Ausgabe ${e.category}`,
      menge: 1,
      einzelpreis_netto: Number(e.net_amount),
      mwst_satz: taxRate,
      klassifizierung: 'ausgabe' as const,
      kategorie: e.category,
      ki_vorschlag: null,
      locked: true,
      notizen: e.vendor ? `Lieferant: ${e.vendor}` : null,
    }
    const { data: posData, error: posErr } = await supabase
      .from('beleg_positionen').insert(positionRow).select('id').single()
    if (posErr) { warn(`expense-pos ${e.id}: ${posErr.message}`); continue }
    audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'beleg_positionen', neue_id: posData.id, notizen: 'expense → position' })
    stats.belege_aus_expenses++
    stats.beleg_positionen_total++
  }

  // 5b) Stripe LETZTE 3 MONATE → pro expense ein Beleg quelle='stripe_sync'
  for (const e of stripeRecent) {
    const jahr = new Date(e.expense_date as string).getFullYear()
    const belegNr = await nextBelegNr(jahr)
    const belegRow = {
      beleg_nr: belegNr,
      interne_beleg_no: belegNr,
      lieferant_id: null,
      beleg_datum: e.expense_date,
      bezahl_datum: e.expense_date,
      rechnungsnummer_lieferant: null,
      summe_netto: Number(e.net_amount),
      summe_brutto: Number(e.gross_amount ?? e.net_amount),
      status: 'festgeschrieben' as const,
      quelle: 'stripe_sync' as const,
      ist_eigenbeleg: true,
      eigenbeleg_grund: 'Stripe-Gebuehr (automatisch importiert)',
      notizen: e.description,
      is_test: !!e.is_test,
      festgeschrieben_at: e.created_at,
    }
    if (DRY_RUN) { stats.belege_aus_stripe++; stats.beleg_positionen_total++; continue }
    const { data: belegData, error: belegErr } = await supabase
      .from('belege').insert(belegRow).select('id').single()
    if (belegErr) { warn(`stripe-beleg ${e.id}: ${belegErr.message}`); continue }
    audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'belege', neue_id: belegData.id, notizen: 'stripe recent' })

    const positionRow = {
      beleg_id: belegData.id,
      reihenfolge: 0,
      bezeichnung: e.description ?? 'Stripe-Gebuehr',
      menge: 1,
      einzelpreis_netto: Number(e.net_amount),
      mwst_satz: 0.00,  // Stripe-Gebuehren sind in DE umsatzsteuerfrei (B2B-Drittland)
      klassifizierung: 'ausgabe' as const,
      kategorie: 'stripe_fees',
      ki_vorschlag: null,
      locked: true,
      notizen: null,
    }
    const { data: posData, error: posErr } = await supabase
      .from('beleg_positionen').insert(positionRow).select('id').single()
    if (posErr) { warn(`stripe-pos ${e.id}: ${posErr.message}`); continue }
    audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'beleg_positionen', neue_id: posData.id, notizen: 'stripe recent → position' })
    stats.belege_aus_stripe++
    stats.beleg_positionen_total++
  }

  // 5c) Stripe DAVOR → pro Monat ein Sammel-Beleg
  for (const [key, list] of stripePerMonth.entries()) {
    const [yearMonth, testFlag] = key.split('__')
    const [yearStr, monthStr] = yearMonth.split('-')
    const jahr = Number(yearStr)
    const month = Number(monthStr)
    const belegNr = await nextBelegNr(jahr)
    const dateLastDay = new Date(jahr, month, 0)  // letzter Tag des Monats
    const sumNetto = list.reduce((s, e) => s + Number(e.net_amount), 0)
    const sumBrutto = list.reduce((s, e) => s + Number(e.gross_amount ?? e.net_amount), 0)
    const belegRow = {
      beleg_nr: belegNr,
      interne_beleg_no: belegNr,
      lieferant_id: null,
      beleg_datum: dateLastDay.toISOString().slice(0, 10),
      bezahl_datum: dateLastDay.toISOString().slice(0, 10),
      rechnungsnummer_lieferant: null,
      summe_netto: sumNetto,
      summe_brutto: sumBrutto,
      status: 'festgeschrieben' as const,
      quelle: 'migration' as const,
      ist_eigenbeleg: true,
      eigenbeleg_grund: `Stripe-Gebuehren Sammelbuchung ${monthStr}/${yearStr} (Migration)`,
      notizen: `${list.length} Einzelbuchungen aggregiert`,
      is_test: testFlag === 'test',
      festgeschrieben_at: list[0]?.created_at ?? null,
    }
    if (DRY_RUN) { stats.belege_aus_stripe++; stats.beleg_positionen_total++; continue }
    const { data: belegData, error: belegErr } = await supabase
      .from('belege').insert(belegRow).select('id').single()
    if (belegErr) { warn(`stripe-sammel ${key}: ${belegErr.message}`); continue }

    const positionRow = {
      beleg_id: belegData.id,
      reihenfolge: 0,
      bezeichnung: `Stripe-Gebuehren ${monthStr}/${yearStr}`,
      menge: 1,
      einzelpreis_netto: sumNetto,
      mwst_satz: 0.00,
      klassifizierung: 'ausgabe' as const,
      kategorie: 'stripe_fees',
      ki_vorschlag: null,
      locked: true,
      notizen: `Aggregiert aus ${list.length} Einzelbuchungen`,
    }
    const { data: posData, error: posErr } = await supabase
      .from('beleg_positionen').insert(positionRow).select('id').single()
    if (posErr) { warn(`stripe-sammel-pos ${key}: ${posErr.message}`); continue }
    // Audit pro alte expense → gleicher beleg/Position
    for (const e of list) {
      audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'belege', neue_id: belegData.id, notizen: `stripe-sammel ${key}` })
      audit({ alte_tabelle: 'expenses', alte_id: e.id, neue_tabelle: 'beleg_positionen', neue_id: posData.id, notizen: `stripe-sammel ${key} → position` })
    }
    stats.belege_aus_stripe++
    stats.beleg_positionen_total++
  }

  await flushAudit()
  console.log(`  → ${stats.belege_aus_expenses} aus manuellen, ${stats.belege_aus_stripe} aus Stripe`)
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 6: assets_neu ← assets (nur die mit beleg_position-Anker)
// ────────────────────────────────────────────────────────────────────────────
async function migrateAssets(itemMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('\n[6/8] assets_neu ← assets')
  const assetMap = new Map<string, string>()

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, kind, name, description, serial_number, manufacturer, model, purchase_price, purchase_date, supplier_id, purchase_id, useful_life_months, depreciation_method, residual_value, current_value, last_depreciation_at, product_id, unit_id, accessory_unit_id, status, disposed_at, disposal_proceeds, is_test, notes, replacement_value_estimate')
  if (error) throw error

  // Pro Asset finde die zugehoerige beleg_position via:
  // 1. Wenn purchase_items.asset_id → asset.id existiert: nimm dessen migration_audit-Eintrag
  // 2. Sonst: erstes purchase_item dieser purchase_id (heuristisch)
  // 3. Sonst: warnen + skippen

  // Bulk-Lookup: purchase_items mit asset_id
  const { data: piWithAsset } = await supabase
    .from('purchase_items')
    .select('id, asset_id, purchase_id')
    .not('asset_id', 'is', null)

  const piByAssetId = new Map<string, string>()  // asset_id → purchase_item.id
  const piByPurchaseId = new Map<string, string[]>()
  for (const pi of (piWithAsset as any[]) ?? []) {
    if (pi.asset_id) piByAssetId.set(pi.asset_id, pi.id)
    if (pi.purchase_id) {
      const arr = piByPurchaseId.get(pi.purchase_id) ?? []
      arr.push(pi.id)
      piByPurchaseId.set(pi.purchase_id, arr)
    }
  }

  for (const a of (assets as any[]) ?? []) {
    let belegPositionId: string | null = null
    const itemId = piByAssetId.get(a.id)
    if (itemId) belegPositionId = itemMap.get(itemId) ?? null
    if (!belegPositionId && a.purchase_id) {
      const candidates = piByPurchaseId.get(a.purchase_id) ?? []
      for (const pid of candidates) {
        const mapped = itemMap.get(pid)
        if (mapped) { belegPositionId = mapped; break }
      }
    }
    if (!belegPositionId) {
      // Verwaistes Asset: kein purchase_item-Anker. Damit das Asset
      // trotzdem ins Anlagenverzeichnis kommt, erzeugen wir einen
      // Eigenbeleg + Position passend zu den Asset-Daten.
      const purchaseDate = (a.purchase_date as string) || new Date().toISOString().slice(0, 10)
      const jahr = new Date(purchaseDate).getFullYear()
      const klassFromMethod: 'afa' | 'gwg' | 'ignoriert' =
        a.depreciation_method === 'immediate' ? 'gwg' :
        a.depreciation_method === 'linear' ? 'afa' : 'ignoriert'

      if (DRY_RUN) {
        belegPositionId = '00000000-0000-0000-0000-000000000000'
        stats.assets_via_eigenbeleg++
        stats.belege_aus_orphan_assets++
        stats.beleg_positionen_total++
      } else {
        const eigenbelegNr = await nextBelegNr(jahr)
        const { data: eigenbeleg, error: ebErr } = await supabase.from('belege').insert({
          beleg_nr: eigenbelegNr,
          interne_beleg_no: eigenbelegNr,
          lieferant_id: null,
          beleg_datum: purchaseDate,
          summe_netto: Number(a.purchase_price ?? 0),
          summe_brutto: Number(a.purchase_price ?? 0),  // Eigenbeleg: 0% MwSt
          status: 'festgeschrieben',
          quelle: 'migration',
          ist_eigenbeleg: true,
          eigenbeleg_grund: `Migration: Asset "${a.name}" hatte keine Belegquelle in der alten DB`,
          notizen: 'Auto-erzeugt waehrend Konsolidierungs-Migration. Beleg kann unter /admin/buchhaltung/belege/[id] mit echter Rechnung als Anhang ergaenzt werden.',
          is_test: !!a.is_test,
          festgeschrieben_at: new Date().toISOString(),
        }).select('id').single()
        if (ebErr) { warn(`eigenbeleg fuer asset ${a.id}: ${ebErr.message}`); stats.assets_verwaist++; continue }
        audit({ alte_tabelle: 'assets', alte_id: a.id, neue_tabelle: 'belege', neue_id: eigenbeleg.id, notizen: 'eigenbeleg fuer orphan asset' })
        stats.belege_aus_orphan_assets++

        const { data: pos, error: posErr } = await supabase.from('beleg_positionen').insert({
          beleg_id: eigenbeleg.id,
          reihenfolge: 0,
          bezeichnung: a.name ?? 'Migration-Asset',
          menge: 1,
          einzelpreis_netto: Number(a.purchase_price ?? 0),
          mwst_satz: 0,  // Eigenbeleg
          klassifizierung: klassFromMethod,
          locked: true,
          notizen: a.serial_number ? `SN: ${a.serial_number}` : null,
        }).select('id').single()
        if (posErr) { warn(`eigenbeleg-position fuer asset ${a.id}: ${posErr.message}`); stats.assets_verwaist++; continue }
        audit({ alte_tabelle: 'assets', alte_id: a.id, neue_tabelle: 'beleg_positionen', neue_id: pos.id, notizen: 'eigenbeleg-position fuer orphan asset' })
        belegPositionId = pos.id
        stats.assets_via_eigenbeleg++
        stats.beleg_positionen_total++
      }
    }

    const insertRow = {
      beleg_position_id: belegPositionId,
      bezeichnung: a.name,
      art: mapAssetArt(a.kind),
      anschaffungsdatum: a.purchase_date,
      anschaffungskosten_netto: Number(a.purchase_price),
      afa_methode: mapAfaMethode(a.depreciation_method),
      nutzungsdauer_monate: a.depreciation_method === 'linear' ? a.useful_life_months : null,
      aktueller_buchwert: Number(a.current_value ?? 0),
      restwert: Number(a.residual_value ?? 0),
      status: mapAssetStatus(a.status),
      notizen: a.notes ?? a.description,
      is_test: !!a.is_test,
    }
    if (DRY_RUN) { assetMap.set(a.id, '00000000-0000-0000-0000-000000000000'); stats.assets_neu_migriert++; continue }
    const { data, error: insErr } = await supabase
      .from('assets_neu').insert(insertRow).select('id').single()
    if (insErr) { warn(`asset ${a.id}: ${insErr.message}`); continue }
    assetMap.set(a.id, data.id)
    audit({ alte_tabelle: 'assets', alte_id: a.id, neue_tabelle: 'assets_neu', neue_id: data.id })
    stats.assets_neu_migriert++
  }

  await flushAudit()
  console.log(`  → ${stats.assets_neu_migriert} migriert (davon ${stats.assets_via_eigenbeleg} via Eigenbeleg), ${stats.assets_verwaist} echt verwaist`)
  return assetMap
}

function mapAssetArt(k: string | null): 'kamera' | 'zubehoer' | 'buero' | 'werkzeug' | 'sonstiges' {
  switch (k) {
    case 'rental_camera':    return 'kamera'
    case 'rental_accessory': return 'zubehoer'
    case 'office_equipment': return 'buero'
    case 'tool':             return 'werkzeug'
    default:                 return 'sonstiges'
  }
}

function mapAfaMethode(m: string | null): 'linear' | 'sofort_gwg' | 'keine' {
  switch (m) {
    case 'linear':    return 'linear'
    case 'immediate': return 'sofort_gwg'
    case 'none':      return 'keine'
    default:          return 'linear'
  }
}

function mapAssetStatus(s: string | null): 'aktiv' | 'verkauft' | 'ausgemustert' | 'verloren' {
  switch (s) {
    case 'active':    return 'aktiv'
    case 'sold':      return 'verkauft'
    case 'disposed':  return 'ausgemustert'
    case 'lost':      return 'verloren'
    default:          return 'aktiv'
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 7: inventar_verknuepfung ← assets.unit_id + assets.accessory_unit_id
// ────────────────────────────────────────────────────────────────────────────
async function migrateInventarVerknuepfung(
  productUnitMap: Map<string, string>,
  accessoryUnitMap: Map<string, string>,
  itemMap: Map<string, string>,
): Promise<void> {
  console.log('\n[7/8] inventar_verknuepfung ← assets')
  const { data: assets } = await supabase
    .from('assets')
    .select('id, unit_id, accessory_unit_id, purchase_id')
    .or('unit_id.not.is.null,accessory_unit_id.not.is.null')

  const { data: piWithAsset } = await supabase
    .from('purchase_items')
    .select('id, asset_id, purchase_id')
    .not('asset_id', 'is', null)
  const piByAssetId = new Map<string, string>()
  const piByPurchaseId = new Map<string, string[]>()
  for (const pi of (piWithAsset as any[]) ?? []) {
    if (pi.asset_id) piByAssetId.set(pi.asset_id, pi.id)
    if (pi.purchase_id) {
      const arr = piByPurchaseId.get(pi.purchase_id) ?? []
      arr.push(pi.id)
      piByPurchaseId.set(pi.purchase_id, arr)
    }
  }

  for (const a of (assets as any[]) ?? []) {
    const inventarUnitId = a.unit_id
      ? productUnitMap.get(a.unit_id)
      : a.accessory_unit_id
        ? accessoryUnitMap.get(a.accessory_unit_id)
        : null
    if (!inventarUnitId) continue

    let belegPositionId: string | null = null
    const itemId = piByAssetId.get(a.id)
    if (itemId) belegPositionId = itemMap.get(itemId) ?? null
    if (!belegPositionId && a.purchase_id) {
      const candidates = piByPurchaseId.get(a.purchase_id) ?? []
      for (const pid of candidates) {
        const mapped = itemMap.get(pid)
        if (mapped) { belegPositionId = mapped; break }
      }
    }
    if (!belegPositionId) continue

    if (DRY_RUN) { stats.inventar_verknuepfungen++; continue }
    const { error } = await supabase
      .from('inventar_verknuepfung')
      .insert({ beleg_position_id: belegPositionId, inventar_unit_id: inventarUnitId, stueck_anteil: 1 })
    if (error && error.code !== '23505') {  // 23505 = unique violation, schon verknuepft
      warn(`verknuepfung asset ${a.id}: ${error.message}`)
      continue
    }
    stats.inventar_verknuepfungen++
  }

  console.log(`  → ${stats.inventar_verknuepfungen} Verknuepfungen`)
}

// ────────────────────────────────────────────────────────────────────────────
// SCHRITT 8: afa_buchungen (Platzhalter — keine alte Quelle)
// ────────────────────────────────────────────────────────────────────────────
async function migrateAfaBuchungen(): Promise<void> {
  console.log('\n[8/8] afa_buchungen ← (leer; AfA-Cron befuellt fortschreitend)')
  // expenses mit category='depreciation' koennten als historische AfA-Eintraege
  // gesehen werden, aber sie haengen an der alten asset-Welt (asset_id auf alte
  // assets-Tabelle). In Session D wird der AfA-Cron auf assets_neu umgestellt
  // und schreibt ab Wechsel-Datum neue Buchungen. Historische AfA-Verlaeufe
  // bleiben als expenses.depreciation lesbar.
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now()
  console.log('═══════════════════════════════════════════════════')
  console.log('  Buchhaltungs-/Inventar-Migration')
  console.log(`  Modus: ${DRY_RUN ? 'DRY-RUN (kein Schreibzugriff)' : 'CONFIRM (echte Migration)'}`)
  console.log('═══════════════════════════════════════════════════')

  await checkPristine()

  const lieferantenMap = await migrateLieferanten()
  const { kameraMap, zubMap } = await migrateProdukte()
  const { productUnitMap, accessoryUnitMap } = await migrateInventar(kameraMap, zubMap)
  const itemMap = await migratePurchases(lieferantenMap)
  await migrateExpenses()
  await migrateAssets(itemMap)
  await migrateInventarVerknuepfung(productUnitMap, accessoryUnitMap, itemMap)
  await migrateAfaBuchungen()

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  ZUSAMMENFASSUNG')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Lieferanten:           ${stats.lieferanten_out} / ${stats.lieferanten_in}`)
  console.log(`  Produkte (Kameras):    ${stats.produkte_kameras}`)
  console.log(`  Produkte (Zubehoer):   ${stats.produkte_zubehoer}`)
  console.log(`  Inventar Kameras:      ${stats.inventar_kameras}`)
  console.log(`  Inventar Zubehoer:     ${stats.inventar_zubehoer_individual}`)
  console.log(`  Inventar Bulk:         ${stats.inventar_bulk}`)
  console.log(`  Belege aus purchases:  ${stats.belege_aus_purchases}`)
  console.log(`  Belege aus expenses:   ${stats.belege_aus_expenses}`)
  console.log(`  Belege aus stripe:     ${stats.belege_aus_stripe}`)
  console.log(`  Belege fuer Orphans:   ${stats.belege_aus_orphan_assets}`)
  console.log(`  Beleg-Positionen:      ${stats.beleg_positionen_total}`)
  console.log(`  Assets migriert:       ${stats.assets_neu_migriert} (davon ${stats.assets_via_eigenbeleg} via Eigenbeleg)`)
  console.log(`  Assets echt verwaist:  ${stats.assets_verwaist}`)
  console.log(`  Verknuepfungen:        ${stats.inventar_verknuepfungen}`)
  console.log(`  Warnings:              ${stats.warnings.length}`)
  if (stats.warnings.length > 0) {
    console.log('\n  Warnings:')
    for (const w of stats.warnings.slice(0, 30)) console.log(`    · ${w}`)
    if (stats.warnings.length > 30) console.log(`    · ... und ${stats.warnings.length - 30} weitere`)
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n  Laufzeit: ${elapsed}s`)
  console.log('═══════════════════════════════════════════════════')
  if (DRY_RUN) {
    console.log('  Dry-Run beendet. Fuer echte Migration: --confirm')
  } else {
    console.log('  Migration abgeschlossen. Naechster Schritt:')
    console.log('    npx tsx scripts/verify-migration.ts')
  }
}

main().catch((err) => {
  console.error('\nFEHLER:', err.message)
  console.error(err.stack)
  process.exit(1)
})
