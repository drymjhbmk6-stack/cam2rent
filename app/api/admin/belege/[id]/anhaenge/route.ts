import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { attachFileToBeleg } from '@/lib/buchhaltung/beleg-create';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_KINDS = new Set(['rechnung', 'quittung', 'lieferschein', 'sonstiges']);

/**
 * POST /api/admin/belege/[id]/anhaenge
 *
 * Haengt eine Datei an einen Beleg. Die eigentliche Logik (Magic-Byte-Check,
 * SHA-256-Duplikat, Storage-Upload, DB-Insert mit Migrations-Fallback) lebt im
 * geteilten Helfer lib/buchhaltung/beleg-create.ts:attachFileToBeleg, den auch
 * der E-Mail-Import nutzt — damit nichts divergiert.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg } = await supabase
    .from('belege').select('id, status').eq('id', id).single();
  if (!beleg) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschriebener Beleg — keine Aenderung' }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') ?? 'rechnung');
  if (!file) return NextResponse.json({ error: 'file fehlt' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Datei zu gross (max 20 MB)' }, { status: 400 });
  if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'kind ungueltig' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await attachFileToBeleg(supabase, id, { buffer, filename: file.name, kind });

  if (!result.ok) {
    if ('duplicate' in result) {
      return NextResponse.json({
        error: 'duplicate',
        message: result.existingBelegNr
          ? `Diese Datei wurde bereits hochgeladen — siehe Beleg ${result.existingBelegNr}.`
          : 'Diese Datei wurde bereits hochgeladen.',
        existing_beleg_id: result.existingBelegId,
        existing_beleg_nr: result.existingBelegNr,
        existing_dateiname: result.existingDateiname,
      }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logAudit({ action: 'beleg.attach', entityType: 'beleg', entityId: id, changes: { kind, dateiname: file.name }, request: req });
  return NextResponse.json({ anhang: result.anhang });
}
