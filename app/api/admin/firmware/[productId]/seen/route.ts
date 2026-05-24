import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * PATCH /api/admin/firmware/[productId]/seen
 * Body: { version: string }
 *
 * Setzt `seen_version` auf die aktuelle Hersteller-Version. Solange
 * `latest_version != seen_version` zeigt die UI „Update verfügbar".
 * Nach „Als gesehen markieren" verstummt der Hinweis bis zum nächsten
 * Versionswechsel.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { productId } = await params;
  const body = (await req.json().catch(() => null)) as { version?: string } | null;
  const version = body?.version?.trim();
  if (!version) {
    return NextResponse.json({ error: 'version fehlt' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('firmware_checks')
    .update({ seen_version: version })
    .eq('product_id', productId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Firmware-Check für dieses Produkt nicht gefunden' }, { status: 404 });
  }

  await logAudit({
    action: 'firmware.mark_seen',
    entityType: 'firmware_check',
    entityId: productId,
    changes: { version },
    request: req,
  });

  return NextResponse.json({ ok: true, row: data });
}
