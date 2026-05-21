import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/belege/[id]/dismiss-ocr-error
 *
 * Blendet einen fehlgeschlagenen OCR-/KI-Analyse-Hinweis aus, nachdem der
 * Admin die Belegdaten manuell erfasst hat. ocr_status/ocr_error sind reine
 * Metadaten zur KI-Analyse — kein steuerlicher Inhalt. Daher ist dieser
 * Schritt auch bei einem bereits festgeschriebenen Beleg erlaubt (anders als
 * inhaltliche Aenderungen, die der PATCH-Endpoint bei festgeschrieben blockt).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg, error: loadErr } = await supabase
    .from('belege').select('id, ocr_status').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (beleg.ocr_status !== 'failed') {
    return NextResponse.json({ error: 'Kein OCR-Fehler aktiv' }, { status: 400 });
  }

  const { error } = await supabase
    .from('belege')
    .update({ ocr_status: 'done', ocr_error: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'beleg.dismiss_ocr_error',
    entityType: 'beleg',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ ok: true });
}
