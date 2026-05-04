import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { detectFileType } from '@/lib/file-type-check';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB pro Datei
const MAX_FILES_PER_REQUEST = 10;

const ALLOWED_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const KIND_VALUES = ['invoice', 'receipt', 'delivery_note', 'other'] as const;
type Kind = typeof KIND_VALUES[number];

const uploadLimiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 60 * 1000 });

/**
 * GET /api/admin/purchase-attachments?purchase_id=...
 * → Liste aller Anhaenge zu einem Einkauf.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const purchaseId = req.nextUrl.searchParams.get('purchase_id');
  if (!purchaseId) {
    return NextResponse.json({ error: 'purchase_id fehlt' }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('purchase_attachments')
    .select('id, purchase_id, storage_path, filename, mime_type, size_bytes, kind, created_at')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true });

  if (error) {
    // Defensiv: wenn Migration noch nicht durch ist, leere Liste statt 500.
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ attachments: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ attachments: data ?? [] });
}

/**
 * POST /api/admin/purchase-attachments
 *
 * multipart/form-data:
 *   purchase_id: UUID (Pflicht)
 *   files: File[] (1..10, max 20 MB pro Datei)
 *   kinds: optional, JSON-Array gleicher Laenge ('invoice'|'receipt'|'delivery_note'|'other')
 *          oder einzelnes kind als Default fuer alle Dateien
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { success } = uploadLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Uploads. Bitte warte einen Moment.' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body.' }, { status: 400 });
  }

  const purchaseId = (formData.get('purchase_id') as string | null)?.trim();
  if (!purchaseId) {
    return NextResponse.json({ error: 'purchase_id fehlt' }, { status: 400 });
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Keine Dateien uebergeben.' }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `Max ${MAX_FILES_PER_REQUEST} Dateien pro Upload.` }, { status: 400 });
  }

  // kinds parsen: entweder Array (eine pro Datei) oder Single-Value (gilt fuer alle)
  let kinds: Kind[] = [];
  const kindsRaw = formData.get('kinds');
  if (typeof kindsRaw === 'string') {
    try {
      const parsed = JSON.parse(kindsRaw);
      if (Array.isArray(parsed)) {
        kinds = parsed.map((k) => (KIND_VALUES.includes(k) ? k : 'other')) as Kind[];
      } else if (typeof parsed === 'string' && KIND_VALUES.includes(parsed as Kind)) {
        kinds = files.map(() => parsed as Kind);
      }
    } catch {
      // Fallback: kindsRaw selbst ist ein Single-Value
      if (KIND_VALUES.includes(kindsRaw as Kind)) {
        kinds = files.map(() => kindsRaw as Kind);
      }
    }
  }
  if (kinds.length === 0) {
    kinds = files.map(() => 'other');
  }
  if (kinds.length !== files.length) {
    // Auf Files-Laenge auffuellen / kuerzen
    while (kinds.length < files.length) kinds.push('other');
    kinds = kinds.slice(0, files.length);
  }

  const supabase = createServiceClient();

  // Pruefen, dass das Purchase existiert (verhindert Bucket-Pollution mit Fake-IDs)
  const { data: purchase, error: purchaseErr } = await supabase
    .from('purchases')
    .select('id')
    .eq('id', purchaseId)
    .maybeSingle();
  if (purchaseErr) {
    return NextResponse.json({ error: purchaseErr.message }, { status: 500 });
  }
  if (!purchase) {
    return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 });
  }

  // Storage-Pfad nach Berlin-Jahr/Monat
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit',
    timeZone: 'Europe/Berlin',
  }).formatToParts(new Date());
  const yyyy = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '01';

  const created: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const kind = kinds[i];

    if (file.size > MAX_SIZE) {
      errors.push(`${file.name}: zu gross (max 20 MB)`);
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectFileType(buffer);
    if (!detected || !(detected in ALLOWED_MIME)) {
      errors.push(`${file.name}: Format nicht unterstuetzt (PDF, JPG, PNG, WebP)`);
      continue;
    }
    const mimeType = ALLOWED_MIME[detected];
    const ext = detected === 'pdf' ? 'pdf' : detected;
    const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('purchase-invoices')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (uploadErr) {
      errors.push(`${file.name}: Storage-Upload fehlgeschlagen (${uploadErr.message})`);
      continue;
    }

    const { data: row, error: insertErr } = await supabase
      .from('purchase_attachments')
      .insert({
        purchase_id: purchaseId,
        storage_path: storagePath,
        filename: file.name.slice(0, 250),
        mime_type: mimeType,
        size_bytes: file.size,
        kind,
      })
      .select('id, purchase_id, storage_path, filename, mime_type, size_bytes, kind, created_at')
      .single();
    if (insertErr) {
      // Aufraeumen, damit die Datei nicht verwaist im Bucket bleibt
      await supabase.storage.from('purchase-invoices').remove([storagePath]).catch(() => {});
      errors.push(`${file.name}: DB-Insert fehlgeschlagen (${insertErr.message})`);
      continue;
    }
    created.push(row);
  }

  if (created.length > 0) {
    await logAudit({
      action: 'purchase.attach_files',
      entityType: 'purchase',
      entityId: purchaseId,
      changes: { count: created.length, kinds: created.map((r) => r.kind) },
      request: req,
    });
  }

  return NextResponse.json(
    {
      attachments: created,
      errors,
      uploaded: created.length,
      failed: errors.length,
    },
    { status: errors.length === files.length ? 400 : 201 },
  );
}
