import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Setzt `accessories.available_qty` auf den maximalen aktiven Bestand
 * aus BEIDEN Inventar-Welten:
 *
 *  - Alte Welt: `accessory_units` (status IN ['available', 'rented']) —
 *    Original-Quelle fuer den Buchungspfad.
 *  - Neue Welt: `inventar_units` (typ IN ['zubehoer', 'verbrauch'],
 *    tracking_mode='individual', status NICHT 'ausgemustert') —
 *    Single Source of Truth fuer das Admin-Inventar.
 *
 * Result = MAX(legacy_count, inventar_count). Damit faellt der Wert nie
 * unter den tatsaechlich existierenden Bestand, auch wenn eine der beiden
 * Welten gerade leer ist (typisch: accessory_units-Mirror wurde nie
 * befuellt, Inventar lebt nur in inventar_units).
 *
 * Idempotent. Wird nach jedem POST/PATCH (Status-Change)/DELETE auf
 * accessory_units aufgerufen, damit der Buchungs-Pfad konsistent bleibt.
 *
 * Bulk-Accessories (`is_bulk=true`) bleiben unangetastet — dort ist
 * available_qty der manuell gepflegte Lagerbestand und hat keine
 * zaehlbare Quelle.
 */
export async function syncAccessoryQty(
  supabase: SupabaseClient,
  accessoryId: string
): Promise<void> {
  const { data: acc, error: accError } = await supabase
    .from('accessories')
    .select('is_bulk')
    .eq('id', accessoryId)
    .maybeSingle();

  if (accError) {
    console.error('[syncAccessoryQty] accessory lookup failed:', accError.message);
    return;
  }

  if ((acc as { is_bulk?: boolean } | null)?.is_bulk === true) {
    return; // Bulk: Lagerbestand wird manuell gepflegt
  }

  // ── Alte Welt: accessory_units ─────────────────────────────────────
  const { count: legacyCount, error: legacyError } = await supabase
    .from('accessory_units')
    .select('id', { count: 'exact', head: true })
    .eq('accessory_id', accessoryId)
    .in('status', ['available', 'rented']);

  if (legacyError) {
    console.error('[syncAccessoryQty] legacy count failed:', legacyError.message);
    return;
  }

  // ── Neue Welt: inventar_units ueber migration_audit-Bruecke ────────
  let inventarCount = 0;
  try {
    const { data: audit } = await supabase
      .from('migration_audit')
      .select('neue_id')
      .eq('alte_tabelle', 'accessories')
      .eq('alte_id', accessoryId)
      .eq('neue_tabelle', 'produkte')
      .maybeSingle();
    const produkteId = (audit as { neue_id?: string } | null)?.neue_id;
    if (produkteId) {
      const { count: invCount } = await supabase
        .from('inventar_units')
        .select('id', { count: 'exact', head: true })
        .eq('produkt_id', produkteId)
        .in('typ', ['zubehoer', 'verbrauch'])
        .eq('tracking_mode', 'individual')
        .neq('status', 'ausgemustert');
      inventarCount = invCount ?? 0;
    }
  } catch (err) {
    // migration_audit / inventar_units fehlen → defensiver Fallback,
    // nur die alte Welt zaehlt. Keine Mutation an dieser Stelle abbrechen.
    console.error('[syncAccessoryQty] new world lookup failed:', err);
  }

  const targetQty = Math.max(legacyCount ?? 0, inventarCount);

  const { error: updateError } = await supabase
    .from('accessories')
    .update({ available_qty: targetQty })
    .eq('id', accessoryId);

  if (updateError) {
    console.error('[syncAccessoryQty] update failed:', updateError.message);
  }
}
