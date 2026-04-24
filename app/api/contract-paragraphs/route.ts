import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getParagraphen } from '@/lib/contracts/contract-template';

/**
 * GET /api/contract-paragraphs
 *
 * Oeffentlicher Read-Only-Endpoint: liefert die aktuell gueltigen Vertrags-
 * paragraphen aus admin_settings.contract_paragraphs, fuer die Anzeige im
 * Buchungsflow (Mietvertrag vor Unterschrift). Fallback auf die hardcoded
 * Default-Paragraphen, falls in der DB noch nichts gepflegt ist.
 *
 * Kein POST/PUT/DELETE — Aenderungen laufen ausschliesslich ueber
 * /api/admin/legal/contract-paragraphs mit Admin-Auth.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'contract_paragraphs')
    .maybeSingle();

  if (data?.value) {
    try {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return NextResponse.json(
          { paragraphs: parsed, source: 'custom' },
          { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
        );
      }
    } catch {
      // Fallback unten
    }
  }

  return NextResponse.json(
    { paragraphs: getParagraphen(200), source: 'default' },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
  );
}
