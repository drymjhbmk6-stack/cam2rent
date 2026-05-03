/**
 * Lueckenlose interne Belegnummer pro Geschaeftsjahr.
 *
 * Format:
 *   - Live-Modus: BELEG-2026-00001
 *   - Test-Modus: TEST-BELEG-2026-00001
 *
 * Gespeichert wird der Counter in admin_settings unter:
 *   - beleg_counter_live_<year>: { count: number, last_at: ISO }
 *   - beleg_counter_test_<year>: { count: number, last_at: ISO }
 *
 * Wird HEUTE noch nicht zwingend von allen Belegtypen genutzt — die Funktion
 * ist als Helper bereit, sobald Etappe 2/3 oder das Belegjournal aktiviert wird.
 *
 * Wichtig: Lueckenlose Sequenz heisst NIE neue Beleg vergeben ohne Counter
 * zu erhoehen. Storno-Belege bekommen eigene Belegnummer (auch bei Stornos
 * gibt es keine Luecken in der Sequenz).
 */

import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';

function getBerlinYear(date: Date = new Date()): number {
  const berlinStr = date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  return parseInt(berlinStr.split('-')[0], 10);
}

function counterKey(year: number, isTest: boolean): string {
  return `beleg_counter_${isTest ? 'test' : 'live'}_${year}`;
}

/**
 * Reserviert eine neue Belegnummer.
 *
 * Verwendet eine atomare Read-Modify-Write-Sequenz mit Optimistic-Concurrency
 * ueber das `updated_at`-Feld. Bei parallelen Requests koennen kurzzeitig
 * Konflikte auftreten — wir retryen bis zu 3x. Fuer hoeheren Durchsatz waere
 * eine Postgres-Sequenz oder ein Advisory-Lock besser; fuer cam2rent-Volumen
 * (~50 Belege/Monat) reicht das aber dicke.
 */
export async function nextBelegNumber(opts?: { year?: number }): Promise<string> {
  const isTest = await isTestMode();
  const year = opts?.year ?? getBerlinYear();
  const key = counterKey(year, isTest);

  const supabase = createServiceClient();
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: row } = await supabase
      .from('admin_settings')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle();

    const current = (row?.value as { count?: number } | null)?.count ?? 0;
    const next = current + 1;
    const newValue = { count: next, last_at: new Date().toISOString() };

    if (!row) {
      // Insert (kein vorhandener Counter)
      const { error: insertError } = await supabase
        .from('admin_settings')
        .insert({ key, value: newValue });

      if (insertError) {
        // Race: jemand anders hat in der Zwischenzeit insertet → retry
        if (attempt < maxRetries - 1) continue;
        throw new Error(`Belegnummer-Insert fehlgeschlagen: ${insertError.message}`);
      }
    } else {
      // Update mit Optimistic-Concurrency: nur wenn updated_at gleich
      const { error: updateError, data: updated } = await supabase
        .from('admin_settings')
        .update({ value: newValue })
        .eq('key', key)
        .eq('updated_at', row.updated_at)
        .select('key');

      if (updateError) {
        if (attempt < maxRetries - 1) continue;
        throw new Error(`Belegnummer-Update fehlgeschlagen: ${updateError.message}`);
      }
      // Wenn 0 Rows updated → Race, retry
      if (!updated || updated.length === 0) {
        if (attempt < maxRetries - 1) continue;
        throw new Error('Belegnummer-Sequenz: zu viele parallele Anfragen, bitte erneut versuchen');
      }
    }

    const prefix = isTest ? 'TEST-BELEG' : 'BELEG';
    return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
  }

  throw new Error('Belegnummer konnte nach 3 Versuchen nicht reserviert werden');
}

/**
 * Parst eine Belegnummer und gibt year + count zurueck.
 * Liefert null bei ungueltigem Format.
 */
export function parseBelegNumber(beleg: string): { isTest: boolean; year: number; count: number } | null {
  const match = beleg.match(/^(TEST-)?BELEG-(\d{4})-(\d{5})$/);
  if (!match) return null;
  return {
    isTest: !!match[1],
    year: parseInt(match[2], 10),
    count: parseInt(match[3], 10),
  };
}
