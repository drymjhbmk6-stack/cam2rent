import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/produkte → Liste aller Produkt-Stammdaten aus der neuen
 * `produkte`-Tabelle. Wird vom Inventar-Anlege-Formular fuer das
 * Produkt-Dropdown genutzt.
 */
export async function GET(_req: NextRequest) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('produkte')
    .select('id, name, marke, modell, ist_vermietbar')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ produkte: data ?? [] });
}
