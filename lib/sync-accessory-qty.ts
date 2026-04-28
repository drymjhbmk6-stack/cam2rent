import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Setzt accessories.available_qty auf die Anzahl Exemplare in den Status
 * 'available' oder 'rented'. Diese gelten als "vermietbar" (analog
 * product_units, die als verfuegbar zaehlen sofern status != retired/maintenance).
 *
 * Idempotent. Wird nach jedem POST/PATCH (Status-Change)/DELETE auf
 * accessory_units aufgerufen, damit die bestehende Verfuegbarkeitslogik
 * (die accessories.available_qty liest) konsistent bleibt -- bis Phase 2C
 * den Verfuegbarkeits-Check direkt auf accessory_units umstellt.
 */
export async function syncAccessoryQty(
  supabase: SupabaseClient,
  accessoryId: string
): Promise<void> {
  const { count, error: countError } = await supabase
    .from('accessory_units')
    .select('id', { count: 'exact', head: true })
    .eq('accessory_id', accessoryId)
    .in('status', ['available', 'rented']);

  if (countError) {
    console.error('[syncAccessoryQty] count failed:', countError.message);
    return;
  }

  const { error: updateError } = await supabase
    .from('accessories')
    .update({ available_qty: count ?? 0 })
    .eq('id', accessoryId);

  if (updateError) {
    console.error('[syncAccessoryQty] update failed:', updateError.message);
  }
}
