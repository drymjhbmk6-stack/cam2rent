/**
 * Leichte Helfer rund um Gutschriften (credit_notes), ohne schwere
 * Abhaengigkeiten (PDF/E-Mail) — damit sie ueberall importierbar sind.
 *
 * Die PDF-Erzeugung + der Mail-Versand + die Auto-Anlage beim Buchungs-Storno
 * leben bewusst in `lib/buchhaltung/credit-note-document.ts` (zieht react-pdf
 * + Mail-Stack), damit diese Datei schlank bleibt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTestMode } from '@/lib/env-mode';

/**
 * Erzeugt die naechste lueckenlose Gutschriftnummer im Format
 * `GS-YYYY-NNNNNN` (Test-Modus: `TEST-GS-YYYY-NNNNNN`). Jahr in Berlin-Zeit,
 * separater Counter pro Modus. Aus `credit-notes/route.ts` extrahiert, damit
 * der Buchungs-Storno (Auto-Gutschrift) exakt dieselbe Logik nutzt.
 */
export async function nextCreditNoteNumber(supabase: SupabaseClient): Promise<string> {
  const testMode = await isTestMode();
  const year = parseInt(
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 4),
    10,
  );
  const prefix = testMode ? 'TEST-GS' : 'GS';
  const { data: lastCn } = await supabase
    .from('credit_notes')
    .select('credit_note_number')
    .like('credit_note_number', `${prefix}-${year}-%`)
    .eq('is_test', testMode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNum = 1;
  if (lastCn?.credit_note_number) {
    const match = lastCn.credit_note_number.match(new RegExp(`${prefix}-\\d{4}-(\\d+)`));
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(nextNum).padStart(6, '0')}`;
}
