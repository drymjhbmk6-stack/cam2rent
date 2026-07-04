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
    // Zeitkritisch: der Handler recomputet bei jedem Origin-Hit mit frischem
    // `now` (revalidate=0). Nur ein sehr kurzer BROWSER-Cache (kein s-maxage,
    // Cloudflare bypassed /api/* ohnehin), damit schnelle Wiederholungs-Fetches
    // auf der Startseite nicht jedes Mal zwei DB-Queries ausloesen. Das
    // Verkaufsfenster bleibt praktisch unberuehrt (max. 15 s Browser-Lag, und
    // die Buchungs-Validierung prueft das Fenster ohnehin serverseitig neu).
    return NextResponse.json(
      { angebote, accessory_names },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    console.error('GET /api/angebote error:', err);
    return NextResponse.json({ angebote: [], accessory_names: {} });
  }
}
