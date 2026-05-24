import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mapAngebotRow, isAngebotActive } from '@/data/angebote';

// Zeitkritisch (Verkaufsfenster) — nicht statisch cachen.
export const revalidate = 0;

/**
 * GET /api/angebote — oeffentliche Liste aktuell gueltiger Angebote.
 * Response enthaelt zusaetzlich `accessory_names`: alle in den Angeboten
 * referenzierten Zubehoer-Namen (inkl. interne Varianten, die in
 * `/api/accessories` ausgeblendet sind). So zeigt die oeffentliche
 * Angebote-Seite lesbare Namen statt der rohen Slug-IDs.
 */
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
        return NextResponse.json({ angebote: [], accessory_names: {} });
      }
      throw error;
    }
    const now = new Date();
    const angebote = (data ?? [])
      .map(mapAngebotRow)
      .filter((a) => isAngebotActive(a, now) && a.camera_options.length > 0);

    // Accessory-Namen aus DB direkt aufloesen (inkl. internal). Spart einen
    // zweiten Client-Roundtrip + zeigt auch interne Slug-IDs korrekt an.
    const accIds = new Set<string>();
    for (const a of angebote) {
      for (const c of a.camera_options) {
        for (const it of c.accessory_items) accIds.add(it.accessory_id);
      }
    }
    const accessory_names: Record<string, string> = {};
    if (accIds.size > 0) {
      const { data: accRows } = await supabase
        .from('accessories')
        .select('id, name')
        .in('id', [...accIds]);
      for (const r of (accRows ?? []) as { id: string; name: string }[]) {
        if (r?.id && r.name) accessory_names[r.id] = r.name;
      }
    }
    return NextResponse.json({ angebote, accessory_names });
  } catch (err) {
    console.error('GET /api/angebote error:', err);
    return NextResponse.json({ angebote: [], accessory_names: {} });
  }
}
