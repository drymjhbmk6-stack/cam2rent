import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { loadAllowedCountryCodes, optionsForCodes } from '@/lib/allowed-countries';

/**
 * GET /api/allowed-countries
 *
 * Öffentliche Liste der freigeschalteten Lieferländer (aus admin_config →
 * `allowed_countries`, Default: nur DE). Von den Kunden-Adressformularen
 * (Registrierung + Checkout) genutzt. Kurz gecacht.
 */
export const revalidate = 60;

export async function GET() {
  const supabase = createServiceClient();
  const codes = await loadAllowedCountryCodes(supabase);
  return NextResponse.json(
    { codes, options: optionsForCodes(codes) },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } },
  );
}
