import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/invoices/purchase-pdf?path=<storage_path>
 *
 * Erzeugt eine kurzlebige Signed URL fuer eine Rechnung im Bucket
 * 'purchase-invoices' und leitet dorthin weiter. Admin-only via Middleware.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path fehlt' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from('purchase-invoices')
    .createSignedUrl(path, 300); // 5 Minuten

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'Konnte URL nicht erstellen' }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
