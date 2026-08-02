import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminNotification } from '@/lib/admin-notifications';

/**
 * Auto-Abzug des Verbrauchsmaterials für eine Buchung.
 *
 * Wird fire-and-forget aufgerufen, sobald eine Buchung auf `shipped` (versendet)
 * oder `picked_up` (abgeholt) gesetzt wird — aus JEDEM der Status-Schreiber
 * (Dashboard-Button, Versand-Formular, Sendcloud-Cron, Übergabe-Protokoll,
 * Status-Dropdown, generische PATCH-Route).
 *
 * Exakt EINMAL pro Buchung: ein atomarer Claim auf
 * `bookings.consumables_deducted_at` (Marker-Muster wie `return_arrived_at`)
 * stellt sicher, dass mehrere/wiederholte Status-Schreiber nicht doppelt
 * abziehen. Test-Buchungen (`is_test = true`) werden ausgenommen — der Zähler
 * ist echte Live-Inventardaten.
 *
 * Der Zähler wird bei 0 gefloored (nie negativ). Unterschreitet ein Artikel
 * seine `warn_threshold`, feuert einmalig eine `verbrauch_low_stock`-Admin-
 * Benachrichtigung (+ Push an Katalog-Mitarbeiter/Owner).
 *
 * Vollständig defensiv: fehlt die Migration (`supabase-verbrauchsartikel.sql`),
 * ist die Funktion ein No-Op. Wirft nie — sicher ohne try/catch aufrufbar.
 */
export async function deductConsumablesForBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // 1. Atomarer Claim: nur der Gewinner (Marker war NULL) zieht ab, und nur
    //    für Nicht-Test-Buchungen. Läuft der Marker-Spalten-Zugriff auf eine
    //    fehlende Migration (bookings.consumables_deducted_at), still aussteigen.
    const claim = await supabase
      .from('bookings')
      .update({ consumables_deducted_at: now })
      .eq('id', bookingId)
      .is('consumables_deducted_at', null)
      .or('is_test.is.null,is_test.eq.false')
      .select('id')
      .maybeSingle();

    if (claim.error) {
      // Migration fehlt / Spalte unbekannt → No-Op (kein Abzug, kein Fehler).
      if (/consumables_deducted_at|column|schema cache|PGRST/i.test(claim.error.message || '')) {
        return;
      }
      console.error('[verbrauch-deduct] Claim-Fehler:', claim.error.message);
      return;
    }
    if (!claim.data) return; // schon abgezogen / Test-Buchung / Race verloren.

    // 2. Alle Artikel mit Auto-Abzug laden.
    const { data: items, error: loadErr } = await supabase
      .from('verbrauchsartikel')
      .select('id, name, bestand, deduct_qty, warn_threshold, low_stock_notified')
      .eq('auto_deduct', true);

    if (loadErr) {
      // Tabelle fehlt → No-Op (Marker bleibt gesetzt, das ist ok — es gibt
      // ohnehin nichts abzuziehen, solange das Feature nicht migriert ist).
      if (/verbrauchsartikel|relation|does not exist|schema cache|PGRST/i.test(loadErr.message || '')) {
        return;
      }
      console.error('[verbrauch-deduct] Laden fehlgeschlagen:', loadErr.message);
      return;
    }
    if (!items || items.length === 0) return;

    // 3. Pro Artikel abziehen (Floor bei 0), optional Nachschub-Warnung.
    for (const it of items) {
      const bestand = Number(it.bestand) || 0;
      const qty = Math.max(1, Number(it.deduct_qty) || 1);
      const neu = Math.max(0, bestand - qty);
      if (neu === bestand) continue; // schon 0 → nichts zu tun.

      const threshold =
        typeof it.warn_threshold === 'number' ? it.warn_threshold : null;
      const shouldWarn =
        threshold !== null && neu <= threshold && !it.low_stock_notified;

      const upd: Record<string, unknown> = { bestand: neu, updated_at: now };
      if (shouldWarn) upd.low_stock_notified = true;

      const { error: updErr } = await supabase
        .from('verbrauchsartikel')
        .update(upd)
        .eq('id', it.id);
      if (updErr) {
        console.error('[verbrauch-deduct] Update-Fehler:', it.id, updErr.message);
        continue;
      }

      if (shouldWarn) {
        await createAdminNotification(supabase, {
          type: 'verbrauch_low_stock',
          title: `Verbrauchsmaterial fast leer: ${it.name}`,
          message: `Nur noch ${neu} übrig (Mindestbestand ${threshold}). Bitte nachbestellen.`,
          link: '/admin/verbrauch',
        });
      }
    }
  } catch (err) {
    // Auto-Abzug darf niemals einen Status-Wechsel beeinträchtigen.
    console.error('[verbrauch-deduct] Unerwarteter Fehler:', err);
  }
}
