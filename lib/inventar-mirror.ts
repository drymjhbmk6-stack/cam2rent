/**
 * Spiegelt Inventar-Einheiten in die alten Tabellen `product_units` /
 * `accessory_units`, damit der Buchungs-Auto-Zuweiser (RPC
 * `assign_free_unit` / `assign_free_accessory_units`) Daten findet und
 * `bookings.unit_id` / `bookings.accessory_unit_ids` weiter ihre FK-Constraints
 * erfuellen koennen.
 *
 * Architektur-Notiz: bookings.unit_id ist FK auf product_units. Ohne diesen
 * Mirror koennten Inventar-Stuecke nicht in Buchungen referenziert werden,
 * waehrend die alten Tabellen exklusiv fuer den Buchungs-Pfad zustaendig
 * waren — mit dem Mirror kann das Inventar als Single Source of Truth fuer
 * den Admin dienen, waehrend die Buchungs-Logik weiter unverandert laeuft.
 *
 * Idempotent: Wenn ein migration_audit-Eintrag bereits existiert, wird die
 * alte Tabelle nur synchronisiert (Status, label).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncAccessoryQty } from './sync-accessory-qty';
import { lookupProdukteId } from './legacy-bridge';

const STATUS_INVENTAR_TO_PRODUCT_UNITS: Record<string, 'available' | 'rented' | 'maintenance' | 'retired'> = {
  verfuegbar: 'available',
  vermietet: 'rented',
  wartung: 'maintenance',
  defekt: 'maintenance',
  ausgemustert: 'retired',
};

const STATUS_INVENTAR_TO_ACCESSORY_UNITS: Record<string, 'available' | 'rented' | 'maintenance' | 'damaged' | 'lost' | 'retired'> = {
  verfuegbar: 'available',
  vermietet: 'rented',
  wartung: 'maintenance',
  defekt: 'damaged',
  ausgemustert: 'retired',
};

interface InventarUnitRow {
  id: string;
  produkt_id: string | null;
  typ: 'kamera' | 'zubehoer' | 'verbrauch';
  tracking_mode: 'individual' | 'bulk';
  bezeichnung: string;
  inventar_code: string | null;
  seriennummer: string | null;
  status: string;
  notizen: string | null;
  kaufdatum: string | null;
}

/**
 * Liefert die alte Legacy-ID (admin_config.products.id bzw. accessories.id)
 * zur produkte.id, oder null wenn keine Brueckenzeile vorliegt.
 */
async function reverseLookupLegacyProductId(
  supabase: SupabaseClient,
  produkteId: string,
  alteTabelle: 'admin_config.products' | 'accessories',
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'produkte')
      .eq('neue_id', produkteId)
      .maybeSingle();
    return (data as { alte_id?: string } | null)?.alte_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Sucht den existierenden Mirror-Eintrag fuer die Inventar-Unit. Liefert die
 * Legacy-ID (product_units.id bzw. accessory_units.id) oder null.
 */
async function findExistingMirror(
  supabase: SupabaseClient,
  inventarUnitId: string,
  alteTabelle: 'product_units' | 'accessory_units',
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'inventar_units')
      .eq('neue_id', inventarUnitId)
      .maybeSingle();
    return (data as { alte_id?: string } | null)?.alte_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Label-Kandidaten fuer den product_units-Spiegel, in Reihenfolge.
 *
 * `product_units.label` ist **global** UNIQUE (nicht pro Produkt, siehe
 * `erledigte supabase/supabase-product-units-label-unique.sql`) — das Label
 * traegt die Scan-URL cam2rent.de/admin/scan/<label>. Der erste Kandidat
 * bleibt bewusst `bezeichnung` (unveraendertes Verhalten fuer alle heute
 * funktionierenden Spiegel); kollidiert der, wird auf garantiert eindeutige
 * Werte ausgewichen, statt den Spiegel scheitern zu lassen.
 */
function mirrorLabelCandidates(unit: InventarUnitRow): string[] {
  const raw = [
    unit.bezeichnung,
    unit.inventar_code,          // in inventar_units global UNIQUE
    unit.seriennummer,
    `${unit.bezeichnung} (${unit.id.slice(0, 8)})`,
  ];
  const out: string[] = [];
  for (const c of raw) {
    const v = (c ?? '').trim();
    if (!v) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }
  return out.length > 0 ? out : [unit.id];
}

/** Postgres-Code fuer unique_violation. */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '23505' || /duplicate key value/i.test(err.message ?? '');
}

/**
 * Spiegelt eine Inventar-Einheit (typ='kamera', tracking_mode='individual')
 * in die alte product_units-Tabelle. Wenn bereits gespiegelt, werden nur
 * Status + Label synchronisiert.
 *
 * Liefert zusaetzlich den DB-Fehlertext, damit der Aufrufer ihn anzeigen kann
 * — sonst landet ein fehlgeschlagener Spiegel nur im Server-Log und der Admin
 * sieht bloss „konnte nicht angelegt werden" ohne Grund.
 *
 * Voraussetzungen:
 *  - typ === 'kamera'
 *  - tracking_mode === 'individual'
 *  - produkt_id gesetzt
 *  - migration_audit-Eintrag (admin_config.products → produkte) existiert,
 *    sodass wir die alte product_id rekonstruieren koennen — oder der
 *    Aufrufer reicht sie als `legacyProductIdHint` durch.
 */
async function mirrorCameraToLegacyDetailed(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
  legacyProductIdHint?: string,
): Promise<{ id: string | null; error?: string }> {
  if (unit.typ !== 'kamera') return { id: null, error: 'Einheit ist keine Kamera.' };
  if (unit.tracking_mode !== 'individual') return { id: null, error: 'Einheit ist Sammelbestand (bulk), kein Einzelstueck.' };
  if (!unit.produkt_id) return { id: null, error: 'Inventar-Einheit hat kein Produkt zugeordnet.' };

  const existing = await findExistingMirror(supabase, unit.id, 'product_units');
  // Kennt der Aufrufer die legacy product_id bereits (z.B.
  // ensureCameraMirrorsForProduct), wird sie direkt genutzt. Der Rueck-Lookup
  // ueber migration_audit ist sonst ein zusaetzlicher Fehlerpunkt: fehlt die
  // Zeile in dieser Richtung ODER gibt es sie doppelt, liefert .maybeSingle()
  // still null und der Mirror waere unmoeglich.
  const legacyProductId = legacyProductIdHint
    ?? await reverseLookupLegacyProductId(supabase, unit.produkt_id, 'admin_config.products');
  if (!legacyProductId) {
    // Ohne legacy product_id koennen wir den FK product_units.product_id nicht
    // bedienen — Mirror nicht moeglich. UI-Workaround: User soll erst die
    // Kamera-Stammdaten via /admin/preise/kameras/neu anlegen.
    return { id: null, error: 'Keine Verknuepfung zwischen Inventar und Kamera-Stammdaten (migration_audit).' };
  }

  const newStatus = STATUS_INVENTAR_TO_PRODUCT_UNITS[unit.status] ?? 'available';
  const serial = unit.seriennummer ?? unit.inventar_code ?? unit.bezeichnung;
  const candidates = mirrorLabelCandidates(unit);

  if (existing) {
    // Synchronisieren — Status, label, notes, purchased_at koennen sich
    // geaendert haben. serial_number ist immutable im Original-Schema.
    // Kollidiert das Label global mit einer anderen Zeile, bleibt das alte
    // Label stehen (Status/Notizen werden trotzdem gezogen) — ein bereits
    // gedrucktes Etikett soll dadurch nicht ungueltig werden.
    const base = { status: newStatus, notes: unit.notizen, purchased_at: unit.kaufdatum };
    const { error: updErr } = await supabase.from('product_units')
      .update({ ...base, label: candidates[0] }).eq('id', existing);
    if (updErr) {
      if (isUniqueViolation(updErr)) {
        const { error: retryErr } = await supabase.from('product_units')
          .update(base).eq('id', existing);
        if (retryErr) {
          console.error('[inventar-mirror] product_units update fehlgeschlagen:', retryErr.message);
          return { id: null, error: retryErr.message };
        }
      } else {
        console.error('[inventar-mirror] product_units update fehlgeschlagen:', updErr.message);
        return { id: null, error: updErr.message };
      }
    }
    return { id: existing };
  }

  // Neu anlegen. Bei Unique-Verletzung auf `label` (global UNIQUE) den
  // naechsten Kandidaten probieren — jeder ANDERE Fehler bricht sofort ab.
  let newId: string | null = null;
  let lastError = 'Unbekannter Fehler beim Anlegen des Legacy-Eintrags.';
  for (const label of candidates) {
    const { data: inserted, error } = await supabase
      .from('product_units')
      .insert({
        product_id: legacyProductId,
        serial_number: serial,
        label,
        status: newStatus,
        notes: unit.notizen,
        purchased_at: unit.kaufdatum,
      })
      .select('id')
      .single();
    if (!error && inserted) {
      newId = (inserted as { id: string }).id;
      break;
    }
    lastError = error?.message ?? lastError;
    console.error('[inventar-mirror] product_units insert fehlgeschlagen:', lastError);
    if (!isUniqueViolation(error)) break;
  }
  if (!newId) return { id: null, error: lastError };

  await supabase.from('migration_audit').insert({
    alte_tabelle: 'product_units',
    alte_id: newId,
    neue_tabelle: 'inventar_units',
    neue_id: unit.id,
    notizen: 'auto-mirror (inventar→legacy)',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[inventar-mirror] audit insert fehlgeschlagen:', auditErr.message);
  });

  return { id: newId };
}

/**
 * Duenner Wrapper mit unveraenderter Signatur — alle bestehenden Aufrufer
 * (Mirror-Backfill, Inventar-CRUD, mirrorInventarToLegacy) bleiben unberuehrt.
 */
export async function mirrorCameraToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
  legacyProductIdHint?: string,
): Promise<string | null> {
  const res = await mirrorCameraToLegacyDetailed(supabase, unit, legacyProductIdHint);
  return res.id;
}

/**
 * Stellt sicher, dass ALLE individuell getrackten Kamera-Einheiten eines
 * Produkts einen `product_units`-Spiegel haben.
 *
 * Hintergrund: Kalender (`availability-gantt`) und Shop-Bestand
 * (`getProducts()`) lesen die NEUE Welt (`inventar_units`) und zeigen eine
 * Kamera auch OHNE Legacy-Zwilling als vorhanden/frei. Der Buchungs-Pfad
 * (`find-free-unit`, RPC `assign_free_camera_units`) liest dagegen
 * ausschliesslich `product_units` — `bookings.unit_id` ist FK darauf. Ohne
 * Spiegel ist eine Kamera also sichtbar und buchbar, bekommt aber nie ein
 * Exemplar zugewiesen.
 *
 * Wird deshalb lazy aufgerufen, wenn der Buchungs-Pfad nichts findet (siehe
 * `find-free-unit` + `assignCamerasToBooking`). Gleiche Wirkung wie der
 * manuelle „Mirror-Backfill" auf /admin/inventar, nur auf ein Produkt
 * begrenzt.
 *
 * Idempotent (mirrorCameraToLegacy synchronisiert bestehende Spiegel) und
 * best-effort: wirft nie.
 *
 * Liefert bewusst ein Diagnose-Objekt statt nur einer Zahl — sonst ist am
 * Aufrufer nicht unterscheidbar, ob es gar keine Inventar-Einheit gibt oder
 * ob die Spiegel-Erzeugung gescheitert ist (z.B. fehlende Bruecken-Zeile).
 * Genau diese Unterscheidung braucht die Fehlermeldung im Admin.
 *
 * @param legacyProductId `admin_config.products[].id`
 */
export interface EnsureCameraMirrorsResult {
  /** Einheiten, die danach einen product_units-Spiegel haben */
  mirrored: number;
  /** Individuell getrackte Kamera-Einheiten in der neuen Welt */
  inventarFound: number;
  /** Existiert die migration_audit-Bruecke legacy → produkte? */
  bridgeOk: boolean;
  /** DB-Fehlertext des letzten fehlgeschlagenen Spiegel-Versuchs. */
  lastError?: string;
}

export async function ensureCameraMirrorsForProduct(
  supabase: SupabaseClient,
  legacyProductId: string,
): Promise<EnsureCameraMirrorsResult> {
  const empty: EnsureCameraMirrorsResult = { mirrored: 0, inventarFound: 0, bridgeOk: false };
  try {
    // Read-only: KEIN autoCreate. Gibt es keine Bruecken-Zeile, existiert die
    // neue Welt fuer dieses Produkt gar nicht → nichts zu spiegeln.
    const produkteId = await lookupProdukteId(
      supabase,
      'admin_config.products',
      legacyProductId,
    );
    if (!produkteId) return empty;

    const { data, error } = await supabase
      .from('inventar_units')
      .select('id, produkt_id, typ, tracking_mode, bezeichnung, inventar_code, seriennummer, status, notizen, kaufdatum')
      .eq('produkt_id', produkteId)
      .eq('typ', 'kamera')
      .eq('tracking_mode', 'individual');
    if (error) {
      console.error('[inventar-mirror] inventar_units laden fehlgeschlagen:', error.message);
      return { ...empty, bridgeOk: true };
    }

    const units = (data ?? []) as InventarUnitRow[];
    let mirrored = 0;
    let lastError: string | undefined;
    for (const unit of units) {
      // legacyProductId als Hint durchreichen — spart den fragilen Rueck-Lookup.
      const res = await mirrorCameraToLegacyDetailed(supabase, unit, legacyProductId);
      if (res.id) mirrored++;
      else if (res.error) lastError = res.error;
    }
    return { mirrored, inventarFound: units.length, bridgeOk: true, lastError };
  } catch (err) {
    console.error('[inventar-mirror] ensureCameraMirrorsForProduct fehlgeschlagen:', err);
    return empty;
  }
}

/**
 * Sicherstellen, dass fuer eine produkte-Row (typ Zubehoer) ein Eintrag in
 * der alten `accessories`-Tabelle existiert. Wird nur fuer Zubehoer/Verbrauch
 * aufgerufen — fuer Kameras existiert kein vergleichbarer Listing-Eintrag.
 *
 * Effekt: zubehoer das vom User direkt im Inventar angelegt wird, erscheint
 * automatisch unter `/admin/zubehoer` mit sinnvollen Defaults — der Admin
 * kann dort spaeter Preis, Kategorie, Bild ergaenzen.
 *
 * Liefert die accessories.id (TEXT-Slug) oder null wenn nicht moeglich.
 */
export async function ensureAccessoryListing(
  supabase: SupabaseClient,
  produkteId: string,
  fallbackName: string,
  isVerbrauch: boolean,
): Promise<string | null> {
  // 1. Audit-Eintrag pruefen — entweder existiert ein Mapping (dann
  //    moeglicherweise nur die accessories-Row wiederherstellen), oder wir
  //    legen einen neuen Slug an.
  const auditedLegacyId = await reverseLookupLegacyProductId(supabase, produkteId, 'accessories');

  // 2. Pruefen, ob die accessories-Row tatsaechlich existiert. Wenn audit ja,
  //    aber Tabelle leer/verloren — wir restoren aus produkte-Daten.
  if (auditedLegacyId) {
    const { data: existing } = await supabase
      .from('accessories')
      .select('id')
      .eq('id', auditedLegacyId)
      .maybeSingle();
    if (existing) return auditedLegacyId; // alles gut
    // sonst: Audit zeigt darauf, aber Row fehlt → restore mit der alten ID
  }

  // 3. produkte-Stammdaten holen, um sinnvolle Defaults zu setzen
  const { data: produkt } = await supabase
    .from('produkte')
    .select('name, modell, default_wbw, bild_url')
    .eq('id', produkteId)
    .maybeSingle();
  const name = (produkt as { name?: string } | null)?.name ?? fallbackName;

  // 4. Slug fuer accessories.id bestimmen — bei Audit-Restore die alte ID
  //    behalten, sonst neu erzeugen mit Kollisions-Schutz.
  let slug: string;
  if (auditedLegacyId) {
    slug = auditedLegacyId;
  } else {
    const baseSlug = name
      .toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'zubehoer';
    slug = baseSlug;
    let suffix = 1;
    while (true) {
      const { data: hit } = await supabase
        .from('accessories')
        .select('id')
        .eq('id', slug)
        .maybeSingle();
      if (!hit) break;
      suffix++;
      slug = `${baseSlug}-${suffix}`;
      if (suffix > 999) return null;
    }
  }

  const insertRow: Record<string, unknown> = {
    id: slug,
    name,
    category: isVerbrauch ? 'verbrauch' : (produkt as { modell?: string | null } | null)?.modell ?? 'sonstiges',
    pricing_mode: 'perDay',
    price: 0,
    available_qty: 0, // wird durch syncAccessoryQty bzw. Mirror-Inserts hochgezaehlt
    available: true,
    image_url: (produkt as { bild_url?: string | null } | null)?.bild_url ?? null,
    sort_order: 999,
    replacement_value: (produkt as { default_wbw?: number | null } | null)?.default_wbw ?? null,
  };

  const { error } = await supabase.from('accessories').insert(insertRow);
  if (error) {
    if (/column .*does not exist/i.test(error.message)) {
      const minimal = {
        id: slug,
        name,
        category: isVerbrauch ? 'verbrauch' : 'sonstiges',
        pricing_mode: 'perDay',
        price: 0,
        available_qty: 0,
        available: true,
      };
      const retry = await supabase.from('accessories').insert(minimal);
      if (retry.error) {
        console.error('[inventar-mirror] accessories minimal insert fehlgeschlagen:', retry.error.message);
        return null;
      }
    } else {
      console.error('[inventar-mirror] accessories insert fehlgeschlagen:', error.message);
      return null;
    }
  }

  // Audit-Eintrag nur dann anlegen, wenn noch keiner existiert (Restore-Fall:
  // Audit war schon da, accessories-Row aber weg).
  if (!auditedLegacyId) {
    await supabase.from('migration_audit').insert({
      alte_tabelle: 'accessories',
      alte_id: slug,
      neue_tabelle: 'produkte',
      neue_id: produkteId,
      notizen: 'auto-promote (inventar→accessories)',
    }).then(({ error: auditErr }) => {
      if (auditErr) console.error('[inventar-mirror] accessories audit insert fehlgeschlagen:', auditErr.message);
    });
  }

  return slug;
}

/**
 * Spiegelt eine Inventar-Einheit (typ='zubehoer'/'verbrauch',
 * tracking_mode='individual') in die alte accessory_units-Tabelle.
 *
 * Erstellt automatisch auch einen `accessories`-Listing-Eintrag, falls noch
 * keiner existiert — sodass das Zubehoer auch unter /admin/zubehoer auftaucht.
 */
export async function mirrorAccessoryToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ === 'kamera') return null;
  if (unit.tracking_mode !== 'individual') return null;
  if (!unit.produkt_id) return null;

  const existing = await findExistingMirror(supabase, unit.id, 'accessory_units');
  let legacyAccessoryId = await reverseLookupLegacyProductId(supabase, unit.produkt_id, 'accessories');
  if (!legacyAccessoryId) {
    // Auto-Promote: erstmal eine accessories-Row anlegen
    legacyAccessoryId = await ensureAccessoryListing(
      supabase,
      unit.produkt_id,
      unit.bezeichnung,
      unit.typ === 'verbrauch',
    );
  }
  if (!legacyAccessoryId) return null;

  const newStatus = STATUS_INVENTAR_TO_ACCESSORY_UNITS[unit.status] ?? 'available';
  const exemplarCode = unit.inventar_code ?? unit.seriennummer ?? unit.bezeichnung;

  if (existing) {
    await supabase.from('accessory_units').update({
      status: newStatus,
      notes: unit.notizen,
      purchased_at: unit.kaufdatum,
    }).eq('id', existing);
    return existing;
  }

  const { data: inserted, error } = await supabase
    .from('accessory_units')
    .insert({
      accessory_id: legacyAccessoryId,
      exemplar_code: exemplarCode,
      status: newStatus,
      notes: unit.notizen,
      purchased_at: unit.kaufdatum,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[inventar-mirror] accessory_units insert fehlgeschlagen:', error?.message);
    return null;
  }
  const newId = (inserted as { id: string }).id;

  await supabase.from('migration_audit').insert({
    alte_tabelle: 'accessory_units',
    alte_id: newId,
    neue_tabelle: 'inventar_units',
    neue_id: unit.id,
    notizen: 'auto-mirror (inventar→legacy)',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[inventar-mirror] audit insert fehlgeschlagen:', auditErr.message);
  });

  // accessories.available_qty mitziehen, damit Shop/Gantt nicht stale bleiben.
  // Bulk-Accessories werden im Helper selbst uebersprungen.
  await syncAccessoryQty(supabase, legacyAccessoryId).catch((e) => {
    console.error('[inventar-mirror] syncAccessoryQty nach insert fehlgeschlagen:', e);
  });

  return newId;
}

/**
 * Wrapper, der die richtige Mirror-Funktion abhaengig vom typ aufruft.
 *
 * Fuer Zubehoer (auch bulk) wird zusaetzlich sichergestellt, dass eine
 * accessories-Listing-Row existiert — damit das Stueck unter /admin/zubehoer
 * sichtbar und auf der Public-Seite buchbar ist.
 */
export async function mirrorInventarToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ === 'kamera') return mirrorCameraToLegacy(supabase, unit);

  // Zubehoer / Verbrauch: zuerst Listing sicherstellen, dann individual mirror
  if (unit.produkt_id) {
    await ensureAccessoryListing(
      supabase,
      unit.produkt_id,
      unit.bezeichnung,
      unit.typ === 'verbrauch',
    );
  }
  if (unit.tracking_mode === 'individual') {
    return mirrorAccessoryToLegacy(supabase, unit);
  }
  return null; // bulk: nur Listing, keine accessory_units
}

/**
 * Loescht den gespiegelten Eintrag (best-effort) — wird beim DELETE der
 * Inventar-Einheit aufgerufen.
 */
export async function deleteMirror(
  supabase: SupabaseClient,
  inventarUnitId: string,
): Promise<void> {
  for (const alteTabelle of ['product_units', 'accessory_units'] as const) {
    const legacyId = await findExistingMirror(supabase, inventarUnitId, alteTabelle);
    if (!legacyId) continue;

    // Fuer accessory_units: accessory_id VOR dem Delete merken, damit wir
    // anschliessend syncAccessoryQty aufrufen koennen (sonst bleibt
    // accessories.available_qty stale → Gantt/Shop zeigen 1 Stueck obwohl 0).
    let accessoryId: string | null = null;
    if (alteTabelle === 'accessory_units') {
      const { data: row } = await supabase
        .from('accessory_units')
        .select('accessory_id')
        .eq('id', legacyId)
        .maybeSingle();
      accessoryId = (row as { accessory_id?: string } | null)?.accessory_id ?? null;
    }

    await supabase.from(alteTabelle).delete().eq('id', legacyId);
    await supabase.from('migration_audit')
      .delete()
      .eq('alte_tabelle', alteTabelle)
      .eq('alte_id', legacyId)
      .eq('neue_tabelle', 'inventar_units')
      .eq('neue_id', inventarUnitId);

    if (accessoryId) {
      await syncAccessoryQty(supabase, accessoryId).catch((e) => {
        console.error('[inventar-mirror] syncAccessoryQty nach delete fehlgeschlagen:', e);
      });
    }
  }
}
