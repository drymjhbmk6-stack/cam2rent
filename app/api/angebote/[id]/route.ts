import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mapAngebotRow } from '@/data/angebote';

export const revalidate = 0;

/**
 * GET /api/angebote/[id] — einzelnes Angebot fuer den Buchungsflow.
 * Liefert das Angebot unabhaengig vom Gueltigkeitsfenster; die Gueltigkeit
 * prueft der Buchungsflow selbst (und blockt ggf. mit Hinweis).
 * Response enthaelt zusaetzlich `accessory_names` (analog zu /api/angebote),
 * damit der Wizard auch interne Zubehoer-Namen lesbar anzeigen kann.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('angebote')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (/angebote|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
        return NextResponse.json({ error: 'Angebot nicht gefunden.' }, { status: 404 });
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: 'Angebot nicht gefunden.' }, { status: 404 });
    const angebot = mapAngebotRow(data);

    // Accessory-Namen direkt aus DB aufloesen (inkl. internal). Im Wizard
    // wuerden sonst Slug-IDs wie "selfi-stick-mo3hl7gy" angezeigt werden,
    // weil das oeffentliche /api/accessories interne Varianten ausfiltert.
    const accIds = new Set<string>();
    for (const c of angebot.camera_options) {
      for (const it of c.accessory_items) accIds.add(it.accessory_id);
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
    return NextResponse.json({ angebot, accessory_names });
  } catch (err) {
    console.error('GET /api/angebote/[id] error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden des Angebots.' }, { status: 500 });
  }
}
