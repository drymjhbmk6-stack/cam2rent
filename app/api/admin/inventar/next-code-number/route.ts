import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/inventar/next-code-number?seg1=STO&seg2=SAN&seg3=128
 *
 * Liefert die naechste freie laufende Nummer fuer eine Kombi aus
 * Kategorie + Hersteller + Name. Sucht alle inventar_units mit dem
 * Praefix `${seg1}-${seg2}-${seg3}-` und liest die hoechste numerische
 * Endung aus, +1.
 *
 * Beispiel: existieren STO-SAN-128-01, STO-SAN-128-02 → liefert 03.
 * Bei neuer Kombi → liefert 01.
 *
 * Response:
 *   { seg4: '03', preview: 'STO-SAN-128-03', existing_count: 2 }
 */
export async function GET(req: NextRequest) {
  const seg1 = (req.nextUrl.searchParams.get('seg1') ?? '').trim().toUpperCase();
  const seg2 = (req.nextUrl.searchParams.get('seg2') ?? '').trim().toUpperCase();
  const seg3 = (req.nextUrl.searchParams.get('seg3') ?? '').trim();

  if (!seg1 || !seg2 || !seg3) {
    return NextResponse.json({ error: 'seg1, seg2 und seg3 sind erforderlich.' }, { status: 400 });
  }

  const prefix = `${seg1}-${seg2}-${seg3}-`;
  const supabase = createServiceClient();

  // Alle existierenden Codes mit dem Praefix laden — ohne LIMIT, da pro
  // Kombi typisch < 100 Stuecke existieren.
  const { data, error } = await supabase
    .from('inventar_units')
    .select('inventar_code')
    .like('inventar_code', `${prefix}%`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const existing = (data ?? []) as Array<{ inventar_code: string | null }>;
  let maxNum = 0;
  for (const row of existing) {
    if (!row.inventar_code) continue;
    const tail = row.inventar_code.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  const nextNum = maxNum + 1;
  const seg4 = String(nextNum).padStart(2, '0');
  return NextResponse.json({
    seg4,
    preview: `${prefix}${seg4}`,
    existing_count: existing.length,
  });
}
