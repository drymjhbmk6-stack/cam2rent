import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET ?signed=1     → Signed URL fuer 5 Min (Download)
 * DELETE            → Anhang loeschen (nur wenn Beleg nicht festgeschrieben)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; anhangId: string }> },
) {
  const { id, anhangId } = await params;
  const supabase = createServiceClient();
  const { data: anhang, error } = await supabase
    .from('beleg_anhaenge').select('storage_path, mime_type, dateiname').eq('id', anhangId).eq('beleg_id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  if (req.nextUrl.searchParams.get('signed') === '1') {
    const { data: signed, error: sErr } = await supabase.storage
      .from('purchase-invoices')
      .createSignedUrl(anhang.storage_path, 300);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  return NextResponse.json({ anhang });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; anhangId: string }> },
) {
  const { id, anhangId } = await params;
  const supabase = createServiceClient();

  const { data: beleg } = await supabase.from('belege').select('status').eq('id', id).single();
  if (beleg?.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschrieben' }, { status: 409 });
  }

  const { data: anhang } = await supabase
    .from('beleg_anhaenge').select('storage_path').eq('id', anhangId).single();
  if (anhang) {
    await supabase.storage.from('purchase-invoices').remove([(anhang as { storage_path: string }).storage_path]);
  }

  const { error } = await supabase.from('beleg_anhaenge').delete().eq('id', anhangId).eq('beleg_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ action: 'beleg.detach', entityType: 'beleg', entityId: id, changes: { anhang_id: anhangId }, request: req });
  return NextResponse.json({ ok: true });
}
