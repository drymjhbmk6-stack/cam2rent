import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';

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

  const { error: uploadError } = await supabase.storage
    .from('handover-photos')
    .upload(storagePath, photoBuffer, { contentType: mime, upsert: true });

  if (uploadError) {
    console.error('[handover/save] photo upload error:', uploadError);
    return NextResponse.json({ error: `Foto-Upload fehlgeschlagen: ${uploadError.message}` }, { status: 500 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
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
