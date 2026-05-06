import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/inventar/seg3-suggestions?seg1=STO&seg2=SAN
 *
 * Liefert alle bereits existierenden Werte fuer Segment 3 (Name) zu einer
 * Kombi aus Kategorie + Hersteller. Wird im Anlege-Form als Datalist-Quelle
 * fuer das Combobox-Feld genutzt — der Admin sieht "128, 256, 512" als
 * Vorschlaege wenn er STO-SAN waehlt.
 *
 * Sortiert nach Verwendungshaeufigkeit (Stuecke pro Name absteigend), damit
 * gaengige Werte oben stehen.
 *
 * Response:
 *   { suggestions: [{ name: '128', count: 5 }, { name: '256', count: 3 }] }
 */
export async function GET(req: NextRequest) {
  const seg1 = (req.nextUrl.searchParams.get('seg1') ?? '').trim().toUpperCase();
  const seg2 = (req.nextUrl.searchParams.get('seg2') ?? '').trim().toUpperCase();

  if (!seg1 || !seg2) {
    return NextResponse.json({ suggestions: [] });
  }

  const prefix = `${seg1}-${seg2}-`;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('inventar_units')
    .select('inventar_code')
    .like('inventar_code', `${prefix}%`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aus jedem Code Segment 3 extrahieren (alles zwischen prefix und letztem
  // "-NN" suffix). Pro Name zaehlen.
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ inventar_code: string | null }>) {
    if (!row.inventar_code) continue;
    const tail = row.inventar_code.slice(prefix.length);
    // Letztes "-NN" abschneiden — Seg 3 ist alles davor
    const match = tail.match(/^(.+)-\d+$/);
    const seg3 = match ? match[1] : tail; // wenn kein NN-Suffix, nimm tail
    if (!seg3) continue;
    counts.set(seg3, (counts.get(seg3) ?? 0) + 1);
  }

  const suggestions = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return NextResponse.json({ suggestions });
}
