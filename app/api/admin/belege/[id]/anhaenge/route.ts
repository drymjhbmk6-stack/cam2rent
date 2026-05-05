import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { detectFileType, isAllowedImage } from '@/lib/file-type-check';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_KINDS = new Set(['rechnung', 'quittung', 'lieferschein', 'sonstiges']);

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
  const detected = detectFileType(buffer);
  if (!detected || (detected !== 'pdf' && !isAllowedImage(buffer))) {
    return NextResponse.json({ error: 'Dateityp nicht erlaubt (PDF/JPEG/PNG/WebP/HEIC)' }, { status: 400 });
  }

  const ext = detected === 'pdf' ? 'pdf' : detected;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const path = `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

  const mime = detected === 'pdf' ? 'application/pdf' : `image/${detected}`;

  const { error: upErr } = await supabase.storage
    .from('purchase-invoices')
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: anhang, error: insErr } = await supabase
    .from('beleg_anhaenge')
    .insert({
      beleg_id: id,
      storage_path: path,
      dateiname: file.name.slice(0, 200),
      typ: kind,
      size_bytes: file.size,
      mime_type: mime,
    })
    .select('*')
    .single();
  if (insErr) {
    await supabase.storage.from('purchase-invoices').remove([path]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await logAudit({ action: 'beleg.attach', entityType: 'beleg', entityId: id, changes: { kind, dateiname: file.name }, request: req });
  return NextResponse.json({ anhang });
}
