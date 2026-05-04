import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/purchase-attachments/:id
 * → loescht Datei aus Storage + DB-Row.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: row, error: fetchErr } = await supabase
    .from('purchase_attachments')
    .select('id, purchase_id, storage_path, filename, kind')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Anhang nicht gefunden.' }, { status: 404 });

  // Storage zuerst loeschen, dann DB. Wenn Storage-Delete fehlschlaegt,
  // bleibt die Datei im Bucket — DB-Row bleibt dann auch erhalten,
  // damit der Admin es nochmal versuchen kann.
  const { error: storageErr } = await supabase.storage
    .from('purchase-invoices')
    .remove([row.storage_path]);
  if (storageErr) {
    return NextResponse.json({ error: `Storage-Delete fehlgeschlagen: ${storageErr.message}` }, { status: 500 });
  }

  const { error: deleteErr } = await supabase
    .from('purchase_attachments')
    .delete()
    .eq('id', id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  await logAudit({
    action: 'purchase.detach_file',
    entityType: 'purchase',
    entityId: row.purchase_id,
    entityLabel: row.filename,
    changes: { kind: row.kind, storage_path: row.storage_path },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
