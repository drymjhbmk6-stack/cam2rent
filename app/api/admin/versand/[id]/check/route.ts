import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/versand/[id]/check
 * Schritt 2 — Kontrolleur prueft das Paket + macht Foto + signiert.
 * MUSS eine andere Person als der Packer sein (Server prueft).
 *
 * Body: multipart/form-data mit Feldern:
 *   checkedBy: string
 *   checkedItems: string (JSON-Array)
 *   notes: string
 *   signatureDataUrl: string
 *   photo: File (Bild, max 10 MB)
 */

const limiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 1000 });

const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const { id } = await params;
  const checkedByUserId = user.id !== 'legacy-env' ? user.id : null;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ungueltige Anfrage.' }, { status: 400 });
  }

  const checkedBy = String(formData.get('checkedBy') ?? '').trim();
  const checkedItemsRaw = String(formData.get('checkedItems') ?? '[]');
  const notes = String(formData.get('notes') ?? '').trim();
  const signatureDataUrl = String(formData.get('signatureDataUrl') ?? '');
  const photo = formData.get('photo');

  if (!checkedBy || checkedBy.length < 2) {
    return NextResponse.json({ error: 'Bitte deinen vollen Namen eintragen.' }, { status: 400 });
  }
  if (!signatureDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Signatur fehlt.' }, { status: 400 });
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'Foto vom gepackten Paket fehlt.' }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_SIZE) {
    return NextResponse.json({ error: `Foto zu gross (max ${MAX_PHOTO_SIZE / 1024 / 1024} MB).` }, { status: 400 });
  }

  let checkedItems: string[];
  try {
    const parsed = JSON.parse(checkedItemsRaw);
    checkedItems = Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    checkedItems = [];
  }

  // 4-Augen-Pruefung: Kontrolleur darf nicht der Packer sein.
  // Bevorzugt User-ID-Vergleich (Mitarbeiterkonto). Wenn fuer eine Seite keine
  // User-ID vorhanden ist (Master-Passwort-Login = legacy-env), Notfall-Fallback
  // auf Namensvergleich.
  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('pack_status, pack_packed_by, pack_packed_by_user_id')
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (booking.pack_status !== 'packed') {
    return NextResponse.json({
      error: 'Das Paket wurde noch nicht von einem Packer fertig gemeldet.',
    }, { status: 409 });
  }

  if (booking.pack_packed_by_user_id && checkedByUserId) {
    // Beide Seiten mit Mitarbeiter-Account: harter ID-Vergleich (nicht umgehbar).
    if (booking.pack_packed_by_user_id === checkedByUserId) {
      return NextResponse.json({
        error: 'Kontrolleur und Packer muessen unterschiedliche Mitarbeiter sein (4-Augen-Prinzip).',
      }, { status: 403 });
    }
  } else {
    // Mindestens eine Seite hat kein Mitarbeiter-Konto -> Notfall-Fallback auf
    // Namensvergleich. Schwaecher, aber besser als gar nichts; und ohne diesen
    // Fallback wuerde der bestehende Master-Passwort-Workflow blockiert.
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    if (booking.pack_packed_by && norm(booking.pack_packed_by) === norm(checkedBy)) {
      return NextResponse.json({
        error: 'Kontrolleur und Packer muessen unterschiedliche Personen sein (4-Augen-Prinzip).',
      }, { status: 403 });
    }
  }

  // Foto pruefen + hochladen
  const photoBuffer = Buffer.from(await photo.arrayBuffer());
  if (!isAllowedImage(photoBuffer)) {
    return NextResponse.json({
      error: 'Foto-Format nicht unterstuetzt (JPEG/PNG/WebP/HEIC erlaubt).',
    }, { status: 400 });
  }
  const detectedType = detectImageType(photoBuffer); // 'jpeg' | 'png' | 'webp' | 'heic' | 'heif'
  const ext = detectedType === 'jpeg' ? 'jpg' :
              detectedType === 'png' ? 'png' :
              detectedType === 'webp' ? 'webp' :
              (detectedType === 'heic' || detectedType === 'heif') ? 'heic' : 'bin';
  const mime = detectedType === 'jpeg' ? 'image/jpeg' :
               detectedType === 'png' ? 'image/png' :
               detectedType === 'webp' ? 'image/webp' : 'image/heic';
  const storagePath = `${id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('packing-photos')
    .upload(storagePath, photoBuffer, {
      contentType: mime,
      upsert: true,
    });

  if (uploadError) {
    console.error('[versand/check] photo upload error:', uploadError);
    return NextResponse.json({ error: `Foto-Upload fehlgeschlagen: ${uploadError.message}` }, { status: 500 });
  }

  // Buchung updaten — atomar gegen Doppelklick: nur wenn Status noch 'packed' ist.
  // Ohne diesen Guard koennten zwei parallele Kontrolleure beide einen Check
  // durchfuehren und doppelte Foto-/Signatur-Daten in dieselbe Buchung schreiben.
  const { data: updateRows, error: updateError } = await supabase
    .from('bookings')
    .update({
      pack_status: 'checked',
      pack_checked_by: checkedBy,
      pack_checked_by_user_id: checkedByUserId,
      pack_checked_at: new Date().toISOString(),
      pack_checked_signature: signatureDataUrl,
      pack_checked_items: checkedItems,
      pack_checked_notes: notes || null,
      pack_photo_url: storagePath,
    })
    .eq('id', id)
    .eq('pack_status', 'packed')
    .select('id');

  if (updateError) {
    console.error('[versand/check] update error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updateRows || updateRows.length === 0) {
    // Status hat sich zwischen Read und Update geaendert — paralleler Kontrolleur war schneller.
    // Foto in Storage hinterlassen, da bereits hochgeladen — wird beim naechsten Pack-Reset entfernt.
    return NextResponse.json(
      { error: 'Paket wurde parallel von einem anderen Kontrolleur abgeschlossen — bitte Liste neu laden.' },
      { status: 409 },
    );
  }

  await logAudit({
    action: 'versand.check',
    entityType: 'pack',
    entityId: id,
    entityLabel: checkedBy,
    request: req,
  });

  return NextResponse.json({ success: true, status: 'checked' });
}
