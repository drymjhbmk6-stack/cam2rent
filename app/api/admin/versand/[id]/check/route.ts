import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { buildPhotoSlots, overviewPhotoPath } from '@/lib/photo-slots';
import { uploadPhotoSlots } from '@/lib/photo-slot-upload';

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
 *   photo_overview / photo_cam<N>_front / photo_cam<N>_back: Pflicht-Fotos
 *   photo_extra_<i>: freiwillige Zusatzfotos
 *   photo: Legacy-Feld eines alten Clients = Gesamtfoto
 *
 * Pflicht sind EIN Gesamtfoto plus pro Kamera je ein Foto von vorne und von
 * hinten. Welche Fotos verlangt werden, leitet der Server AUS DER BUCHUNG ab
 * (`resolveBookingCameras`) — nicht aus dem Request.
 */

const limiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 1000 });

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
  // Kontrolleur kann das vom Packer erfasste Paketgewicht korrigieren.
  const rawWeight = Number(formData.get('packWeightKg'));
  const packWeightKg = Number.isFinite(rawWeight) && rawWeight > 0
    ? Math.round(rawWeight * 1000) / 1000
    : null;

  if (!checkedBy || checkedBy.length < 2) {
    return NextResponse.json({ error: 'Bitte deinen vollen Namen eintragen.' }, { status: 400 });
  }
  if (!signatureDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Signatur fehlt.' }, { status: 400 });
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
  const BOOKING_COLS = 'pack_status, pack_packed_by, pack_packed_by_user_id, status, delivery_mode, product_id, product_name, unit_id';
  // Defensiv: die Multi-Kamera-Migration (`bookings.cameras`) steht noch aus —
  // faellt der Select darauf, einmal ohne die Spalte laden. resolveBookingCameras
  // greift dann auf den product_name-Komma-Split zurueck (Legacy-Pfad).
  const bookingFirst = await supabase
    .from('bookings')
    .select(`${BOOKING_COLS}, cameras`)
    .eq('id', id)
    .maybeSingle();
  // `cameras` optional: der Retry laedt die Spalte nicht mit (Migration offen).
  let booking: {
    pack_status?: string | null;
    pack_packed_by?: string | null;
    pack_packed_by_user_id?: string | null;
    status?: string | null;
    delivery_mode?: string | null;
    product_id?: string | null;
    product_name?: string | null;
    unit_id?: string | null;
    cameras?: unknown;
  } | null = bookingFirst.data;
  if (bookingFirst.error && /cameras|column|schema cache|PGRST/i.test(bookingFirst.error.message || '')) {
    const retry = await supabase
      .from('bookings')
      .select(BOOKING_COLS)
      .eq('id', id)
      .maybeSingle();
    booking = retry.data;
  }

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

  // Pflicht-Fotos: 1x Gesamtfoto + pro Kamera je vorne/hinten (+ optionale
  // Zusatzfotos). Slot-Liste kommt aus der Buchung, nicht aus dem Request.
  const slots = buildPhotoSlots(
    resolveBookingCameras(booking).map((c) => ({
      product_name: c.product_name,
      unit_id: c.unit_id,
    })),
  );

  const upload = await uploadPhotoSlots(supabase, {
    bucket: 'packing-photos',
    bookingId: id,
    formData,
    slots,
  });
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: upload.status });
  }
  const photos = upload.photos;
  const storagePath = overviewPhotoPath(photos) ?? '';

  // Buchung updaten — atomar gegen Doppelklick: nur wenn Status noch 'packed' ist.
  // Ohne diesen Guard koennten zwei parallele Kontrolleure beide einen Check
  // durchfuehren und doppelte Foto-/Signatur-Daten in dieselbe Buchung schreiben.
  const checkBase: Record<string, unknown> = {
    pack_status: 'checked',
    pack_checked_by: checkedBy,
    pack_checked_by_user_id: checkedByUserId,
    pack_checked_at: new Date().toISOString(),
    pack_checked_signature: signatureDataUrl,
    pack_checked_items: checkedItems,
    pack_checked_notes: notes || null,
    // Gesamtfoto bleibt hier (Rueckwaertskompatibilitaet: photo-url-Route,
    // Packliste-PDF, pack-reset + resetPackWorkflow lesen weiterhin dieses Feld).
    pack_photo_url: storagePath,
  };
  // Wenn der Kontrolleur fertig ist (4-Augen abgeschlossen), Buchungsstatus
  // automatisch auf "Wird versendet" (preparing_shipment) heben — aber nur bei
  // Versand-Buchungen, die noch im Status confirmed stehen. So werden keine
  // bereits weiter fortgeschrittenen oder Abholungs-Buchungen ueberschrieben.
  if (booking.delivery_mode === 'versand' && booking.status === 'confirmed') {
    checkBase.status = 'preparing_shipment';
  }
  // Optionale Spalten (je eigene, noch offene Migration). Fehlt eine, wird sie
  // aus dem Payload gestrippt und der Update einmal wiederholt — der atomare
  // Guard `.eq('pack_status','packed')` bleibt dabei erhalten.
  const optional: Record<string, unknown> = { pack_photos: photos };
  if (packWeightKg != null) optional.pack_weight_kg = packWeightKg;

  const warnings: string[] = [];
  const runUpdate = (payload: Record<string, unknown>) =>
    supabase
      .from('bookings')
      .update(payload)
      .eq('id', id)
      .eq('pack_status', 'packed')
      .select('id');

  let { data: updateRows, error: updateError } = await runUpdate({ ...checkBase, ...optional });

  for (const col of ['pack_photos', 'pack_weight_kg']) {
    if (!updateError || !(col in optional)) continue;
    if (!new RegExp(`${col}|column|schema cache|PGRST`, 'i').test(updateError.message || '')) continue;
    delete optional[col];
    if (col === 'pack_photos') warnings.push('migration_pending:pack_photos');
    ({ data: updateRows, error: updateError } = await runUpdate({ ...checkBase, ...optional }));
  }

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
    changes: { photoCount: photos.length, requiredPhotos: slots.length },
    request: req,
  });

  return NextResponse.json({
    success: true,
    status: 'checked',
    photoCount: photos.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
