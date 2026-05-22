import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mapAngebotRow } from '@/data/angebote';

export const revalidate = 0;

/**
 * GET /api/angebote/[id] — einzelnes Angebot fuer den Buchungsflow.
 * Liefert das Angebot unabhaengig vom Gueltigkeitsfenster; die Gueltigkeit
 * prueft der Buchungsflow selbst (und blockt ggf. mit Hinweis).
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
    return NextResponse.json({ angebot: mapAngebotRow(data) });
  } catch (err) {
    console.error('GET /api/angebote/[id] error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden des Angebots.' }, { status: 500 });
  }
}
