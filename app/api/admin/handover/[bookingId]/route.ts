import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';
import { getClientIp } from '@/lib/rate-limit';
import { applyScannedUnits, parseScannedUnits } from '@/lib/scan-substitutions';

const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * GET /api/admin/handover/[bookingId]
 *   → liefert die gespeicherten handover_data zurueck (oder null).
 *
 * POST /api/admin/handover/[bookingId]
 *   → multipart/form-data mit:
 *     - data:  JSON-String mit Form-Daten (location, condition, items, signatures)
 *     - photo: File (Pflicht, JPEG/PNG/WebP/HEIC, max 10 MB)
 *
 * Speichert das Übergabeprotokoll und legt das Foto im Storage-Bucket
 * `handover-photos` ab (Pfad in handover_data.photoPath gemerkt).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { bookingId } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('handover_data')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ handoverData: data?.handover_data ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookingId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_body (multipart erwartet)' }, { status: 400 });
  }

  const dataJson = String(formData.get('data') ?? '');
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'Foto ist Pflicht.' }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_SIZE) {
    return NextResponse.json({ error: 'Foto zu gross (max 10 MB).' }, { status: 400 });
  }

  let body: {
    location?: string;
    condition?: { tested?: boolean; noDamage?: boolean; otherNote?: string };
    items?: Array<{ name?: string; ok?: boolean }>;
    signatures?: {
      landlord?: { dataUrl?: string; name?: string };
      renter?: { dataUrl?: string; name?: string };
    };
    // Tatsaechlich gescannte Unit-IDs aus dem Scanner-Workflow (Kamera +
    // Zubehoer-Exemplare, inkl. Substitute). Analog zum Versand-Pack-Flow:
    // applyScannedUnits() tauscht die Buchungs-Zuordnung aus, damit das
    // Schadens-Tracking auf das tatsaechlich uebergebene Stueck zeigt.
    scannedUnits?: unknown;
  };
  try {
    body = JSON.parse(dataJson);
  } catch {
    return NextResponse.json({ error: 'invalid_data_json' }, { status: 400 });
  }

  // Validation — beide Signaturen + Namen sind Pflicht
  const landlordSig = body.signatures?.landlord?.dataUrl?.trim();
  const landlordName = body.signatures?.landlord?.name?.trim();
  const renterSig = body.signatures?.renter?.dataUrl?.trim();
  const renterName = body.signatures?.renter?.name?.trim();
  if (!landlordSig || !landlordName) {
    return NextResponse.json({ error: 'Vermieter-Signatur + Name erforderlich.' }, { status: 400 });
  }
  if (!renterSig || !renterName) {
    return NextResponse.json({ error: 'Mieter-Signatur + Name erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Gescannte Units anwenden (Substitution bei Abholung) — reihenfolge-egal,
  // idempotent, best-effort. Muss vor dem handover_data-Write laufen, damit
  // accessory_unit_ids / unit_id mit dem uebereinstimmen, was wirklich
  // uebergeben wurde.
  await applyScannedUnits(supabase, bookingId, parseScannedUnits(body.scannedUnits));

  // Foto pruefen + hochladen
  const photoBuffer = Buffer.from(await photo.arrayBuffer());
  if (!isAllowedImage(photoBuffer)) {
    return NextResponse.json({
      error: 'Foto-Format nicht unterstuetzt (JPEG/PNG/WebP/HEIC erlaubt).',
    }, { status: 400 });
  }
  const detectedType = detectImageType(photoBuffer);
  const ext = detectedType === 'jpeg' ? 'jpg' :
              detectedType === 'png' ? 'png' :
              detectedType === 'webp' ? 'webp' :
              (detectedType === 'heic' || detectedType === 'heif') ? 'heic' : 'bin';
  const mime = detectedType === 'jpeg' ? 'image/jpeg' :
               detectedType === 'png' ? 'image/png' :
               detectedType === 'webp' ? 'image/webp' : 'image/heic';
  const storagePath = `${bookingId}/${Date.now()}.${ext}`;

  const HANDOVER_BUCKET = 'handover-photos';
  const doUpload = () =>
    supabase.storage
      .from(HANDOVER_BUCKET)
      .upload(storagePath, photoBuffer, { contentType: mime, upsert: true });

  let { error: uploadError } = await doUpload();

  // Bucket existiert nicht (nie manuell angelegt) → einmalig anlegen +
  // Upload wiederholen. Privat (photo-url nutzt Signed URLs).
  if (uploadError && /bucket not found|not found/i.test(uploadError.message || '')) {
    const { error: createErr } = await supabase.storage.createBucket(HANDOVER_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_SIZE,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    });
    // "already exists" = Race mit parallelem Request → trotzdem retry
    if (createErr && !/already exists|exists/i.test(createErr.message || '')) {
      console.error('[handover/save] bucket create error:', createErr);
      return NextResponse.json(
        { error: `Foto-Upload fehlgeschlagen: Bucket konnte nicht angelegt werden (${createErr.message}).` },
        { status: 500 },
      );
    }
    ({ error: uploadError } = await doUpload());
  }

  if (uploadError) {
    console.error('[handover/save] photo upload error:', uploadError);
    return NextResponse.json({ error: `Foto-Upload fehlgeschlagen: ${uploadError.message}` }, { status: 500 });
  }

  const ipFromHelper = getClientIp(req);
  const ip = ipFromHelper === '127.0.0.1' ? 'unknown' : ipFromHelper;
  const now = new Date().toISOString();

  const handoverData = {
    completedAt: now,
    location: (body.location ?? '').toString().trim().slice(0, 200),
    condition: {
      tested: !!body.condition?.tested,
      noDamage: !!body.condition?.noDamage,
      otherNote: (body.condition?.otherNote ?? '').toString().trim().slice(0, 500) || undefined,
    },
    items: Array.isArray(body.items)
      ? body.items.slice(0, 100).map((it) => ({
          name: (it.name ?? '').toString().trim().slice(0, 200),
          ok: !!it.ok,
        }))
      : [],
    photoPath: storagePath,
    signatures: {
      landlord: { dataUrl: landlordSig, name: landlordName.slice(0, 120), signedAt: now, ip },
      renter:   { dataUrl: renterSig,   name: renterName.slice(0, 120),   signedAt: now, ip },
    },
  };

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ handover_data: handoverData })
    .eq('id', bookingId);

  if (updateError) {
    console.error('[handover/save] DB-Update fehlgeschlagen:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit-Log (Admin-User wird im Helper auto-resolved)
  try {
    await logAudit({
      action: 'booking.handover_completed',
      entityType: 'booking',
      entityId: bookingId,
      changes: {
        landlordName,
        renterName,
        location: handoverData.location || null,
        photoPath: storagePath,
      },
      request: req,
    });
  } catch {
    // non-critical
  }

  return NextResponse.json({ success: true, completedAt: now });
}
