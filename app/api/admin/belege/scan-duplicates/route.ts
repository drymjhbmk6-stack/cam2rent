import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { findContentDuplicate, persistDuplicateWarning } from '@/lib/buchhaltung/duplicate-check';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/belege/scan-duplicates
 *
 * Einmalig manuell ausloesbar — scannt alle nicht-festgeschriebenen Belege
 * im aktuellen Modus (Test/Live) auf inhaltliche Duplikate gegen den
 * Gesamtbestand. Setzt das Verdacht-Flag bei Treffern.
 *
 * Festgeschriebene Belege werden NICHT modifiziert (sind eh nicht mehr
 * editierbar), dienen aber als Referenz fuer Treffer.
 *
 * Idempotent: Re-Run setzt das Flag nochmal, dismissed_at wird zurueckgesetzt.
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const isTest = await isTestMode();

  // Alle nicht-festgeschriebenen Belege im aktuellen Modus
  const { data: candidates, error } = await supabase
    .from('belege')
    .select('id, lieferant_id, beleg_datum, rechnungsnummer_lieferant, summe_brutto, is_test')
    .neq('status', 'festgeschrieben')
    .eq('is_test', isTest)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let scanned = 0;
  let flagged = 0;
  const flaggedIds: string[] = [];

  // Sequenziell, weil persistDuplicateWarning RLS-write hat — parallel waere
  // an Supabase-Connection-Pool zu viel. Bei 100 Belegen < 5 s, bei 1000 < 30 s.
  for (const c of candidates ?? []) {
    scanned++;
    const row = c as {
      id: string;
      lieferant_id: string | null;
      beleg_datum: string | null;
      rechnungsnummer_lieferant: string | null;
      summe_brutto: number | string;
      is_test: boolean;
    };
    const dup = await findContentDuplicate(supabase, {
      belegId: row.id,
      lieferantId: row.lieferant_id,
      belegDatum: row.beleg_datum,
      rechnungsnummerLieferant: row.rechnungsnummer_lieferant,
      summeBrutto: Number(row.summe_brutto ?? 0),
      isTest: !!row.is_test,
    });
    if (dup) {
      await persistDuplicateWarning(supabase, row.id, dup);
      flagged++;
      flaggedIds.push(row.id);
    }
  }

  await logAudit({
    action: 'beleg.scan_duplicates',
    entityType: 'beleg',
    entityId: 'bulk',
    changes: { scanned, flagged, is_test: isTest },
    request: req,
  });

  return NextResponse.json({ scanned, flagged, flagged_ids: flaggedIds });
}
