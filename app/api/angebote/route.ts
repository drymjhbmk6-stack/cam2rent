import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mapAngebotRow, isAngebotActive } from '@/data/angebote';

// Zeitkritisch (Verkaufsfenster) — nicht statisch cachen.
export const revalidate = 0;

/** GET /api/angebote — oeffentliche Liste aktuell gueltiger Angebote. */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('angebote')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      // Migration noch nicht durch → Feature inaktiv, leere Liste.
      if (/angebote|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
        return NextResponse.json({ angebote: [] });
      }
      throw error;
    }
    const now = new Date();
    const angebote = (data ?? [])
      .map(mapAngebotRow)
      .filter((a) => isAngebotActive(a, now) && a.camera_options.length > 0);
    return NextResponse.json({ angebote });
  } catch (err) {
    console.error('GET /api/angebote error:', err);
    return NextResponse.json({ angebote: [] });
  }
}
