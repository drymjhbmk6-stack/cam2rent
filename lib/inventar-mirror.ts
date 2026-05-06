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
 * Spiegelt eine Inventar-Einheit (typ='kamera', tracking_mode='individual')
 * in die alte product_units-Tabelle. Wenn bereits gespiegelt, werden nur
 * Status + Label synchronisiert. Liefert die product_units.id oder null.
 *
 * Voraussetzungen:
 *  - typ === 'kamera'
 *  - tracking_mode === 'individual'
 *  - produkt_id gesetzt
 *  - migration_audit-Eintrag (admin_config.products → produkte) existiert,
 *    sodass wir die alte product_id rekonstruieren koennen.
 */
export async function mirrorCameraToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ !== 'kamera') return null;
  if (unit.tracking_mode !== 'individual') return null;
  if (!unit.produkt_id) return null;

  const existing = await findExistingMirror(supabase, unit.id, 'product_units');
  const legacyProductId = await reverseLookupLegacyProductId(supabase, unit.produkt_id, 'admin_config.products');
  if (!legacyProductId) {
    // Ohne legacy product_id koennen wir den FK product_units.product_id nicht
    // bedienen — Mirror nicht moeglich. UI-Workaround: User soll erst die
    // Kamera-Stammdaten via /admin/preise/kameras/neu anlegen.
    return null;
  }

  const newStatus = STATUS_INVENTAR_TO_PRODUCT_UNITS[unit.status] ?? 'available';
  const serial = unit.seriennummer ?? unit.inventar_code ?? unit.bezeichnung;
  const label = unit.bezeichnung;

  if (existing) {
    // Synchronisieren — Status, label, notes, purchased_at koennen sich
    // geaendert haben. serial_number ist immutable im Original-Schema.
    await supabase.from('product_units').update({
      label,
      status: newStatus,
      notes: unit.notizen,
      purchased_at: unit.kaufdatum,
    }).eq('id', existing);
    return existing;
  }

  // Neu anlegen
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
  if (error || !inserted) {
    console.error('[inventar-mirror] product_units insert fehlgeschlagen:', error?.message);
    return null;
  }
  const newId = (inserted as { id: string }).id;

  await supabase.from('migration_audit').insert({
    alte_tabelle: 'product_units',
    alte_id: newId,
    neue_tabelle: 'inventar_units',
    neue_id: unit.id,
    notizen: 'auto-mirror (inventar→legacy)',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[inventar-mirror] audit insert fehlgeschlagen:', auditErr.message);
  });

  return newId;
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
    await supabase.from(alteTabelle).delete().eq('id', legacyId);
    await supabase.from('migration_audit')
      .delete()
      .eq('alte_tabelle', alteTabelle)
      .eq('alte_id', legacyId)
      .eq('neue_tabelle', 'inventar_units')
      .eq('neue_id', inventarUnitId);
  }
}
