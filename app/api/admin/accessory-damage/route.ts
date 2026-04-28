import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { isAllowedImage, detectImageType } from '@/lib/file-type-check';
import { logAudit } from '@/lib/audit';

const DETECTED_TO_EXT: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: 'jpg',  mime: 'image/jpeg' },
  png:  { ext: 'png',  mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  heic: { ext: 'heic', mime: 'image/heic' },
  heif: { ext: 'heif', mime: 'image/heif' },
  gif:  { ext: 'gif',  mime: 'image/gif' },
};

/**
 * POST /api/admin/accessory-damage
 *
 * Schadensmeldung pro physisch beschaedigtes/verloren gegangenes Zubehoer-
 * Exemplar. Dokumentiert pro Unit eine eigene damage_reports-Row mit Foto +
 * Notiz + WBW. Capture'd am Ende den Summenbetrag aus der Stripe-Pre-Auth.
 *
 * Permission: 'tagesgeschaeft' (siehe API_PATH_PERMISSIONS in middleware.ts).
 *
 * FormData-Schema:
 *   bookingId        — String
 *   units_json       — JSON-String:
 *     [{ accessory_unit_id, condition: 'damaged'|'lost', retained_amount: number, notes: string }]
 *   photos_<unitId>  — File[] (1..5) pro Unit, Key namens "photos_<accessory_unit_id>"
 *
 * Ablauf:
 *   1. Validierung (Buchung, Unit-Zugehoerigkeit, Sum <= Kaution)
 *   2. Pro Unit: Foto-Upload, damage_reports-Insert, accessory_units.status update
 *   3. 1× Stripe-Capture mit Sum (nur wenn deposit_intent_id vorhanden + held)
 *   4. Audit-Log + Response
 *
 * Stripe-Fehler nach erfolgreicher DB-Persistierung → 200 mit
 * { partial: true, stripeError } — Admin kann den Capture spaeter ueber den
 * bestehenden /admin/schaeden-Workflow nachholen.
 */

interface UnitDamageEntry {
  accessory_unit_id: string;
  condition: 'damaged' | 'lost';
  retained_amount: number;
  notes: string;
}

const VALID_CONDITIONS: UnitDamageEntry['condition'][] = ['damaged', 'lost'];
const MAX_PHOTOS_PER_UNIT = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function isUnitDamageEntry(x: unknown): x is UnitDamageEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.accessory_unit_id === 'string' &&
    typeof o.condition === 'string' &&
    (VALID_CONDITIONS as string[]).includes(o.condition) &&
    typeof o.retained_amount === 'number' &&
    o.retained_amount >= 0 &&
    typeof o.notes === 'string'
  );
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Multipart-Body erwartet.' }, { status: 400 });
  }

  const bookingId = formData.get('bookingId');
  const unitsJson = formData.get('units_json');

  if (typeof bookingId !== 'string' || !bookingId) {
    return NextResponse.json({ error: 'bookingId fehlt.' }, { status: 400 });
  }
  if (typeof unitsJson !== 'string') {
    return NextResponse.json({ error: 'units_json fehlt.' }, { status: 400 });
  }

  let units: UnitDamageEntry[];
  try {
    const parsed = JSON.parse(unitsJson);
    if (!Array.isArray(parsed) || !parsed.every(isUnitDamageEntry)) {
      return NextResponse.json({ error: 'units_json ungültig.' }, { status: 400 });
    }
    units = parsed;
  } catch {
    return NextResponse.json({ error: 'units_json ist kein gültiges JSON.' }, { status: 400 });
  }

  if (units.length === 0) {
    return NextResponse.json({ error: 'Mindestens ein Exemplar erforderlich.' }, { status: 400 });
  }

  // Buchung laden + validieren
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, accessory_unit_ids, deposit, deposit_intent_id, deposit_status, customer_name')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const validUnitIds = new Set((booking.accessory_unit_ids as string[] | null) ?? []);

  // Validate: alle Units gehoeren zu dieser Buchung, retained_amount > 0
  for (const u of units) {
    if (!validUnitIds.has(u.accessory_unit_id)) {
      return NextResponse.json(
        { error: `Exemplar ${u.accessory_unit_id} ist nicht in dieser Buchung.` },
        { status: 400 },
      );
    }
    if (u.retained_amount <= 0) {
      return NextResponse.json(
        { error: 'Wiederbeschaffungswert pro Exemplar muss > 0 sein.' },
        { status: 400 },
      );
    }
    if (!u.notes.trim()) {
      return NextResponse.json(
        { error: 'Notiz pro Exemplar ist Pflicht.' },
        { status: 400 },
      );
    }
  }

  const totalRetained = units.reduce((s, u) => s + u.retained_amount, 0);
  const deposit = Number(booking.deposit) || 0;
  if (totalRetained > deposit + 0.005) {
    return NextResponse.json(
      { error: `Summe der Einbehalte (${totalRetained.toFixed(2)} €) übersteigt die Kaution (${deposit.toFixed(2)} €).` },
      { status: 400 },
    );
  }

  // Schritt 1: Pro Unit — Fotos hochladen + damage_reports-Insert + accessory_units.status
  const createdReports: Array<{ unitId: string; reportId: string }> = [];

  for (const u of units) {
    // Fotos für dieses Unit aus FormData
    const photos = formData.getAll(`photos_${u.accessory_unit_id}`) as File[];
    const validPhotos = photos.filter((p): p is File => p instanceof File && p.size > 0);

    if (validPhotos.length === 0) {
      return NextResponse.json(
        { error: `Mindestens 1 Foto pro Exemplar erforderlich (Exemplar ${u.accessory_unit_id}).` },
        { status: 400 },
      );
    }
    if (validPhotos.length > MAX_PHOTOS_PER_UNIT) {
      return NextResponse.json(
        { error: `Maximal ${MAX_PHOTOS_PER_UNIT} Fotos pro Exemplar.` },
        { status: 400 },
      );
    }

    const photoUrls: string[] = [];
    for (const photo of validPhotos) {
      if (photo.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { error: `Datei "${photo.name}" ist zu groß (max 5 MB).` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await photo.arrayBuffer());
      if (!isAllowedImage(buffer)) {
        return NextResponse.json(
          { error: `Datei "${photo.name}" ist kein gültiges Bild (JPEG/PNG/WebP/HEIC/GIF).` },
          { status: 400 },
        );
      }
      const detected = detectImageType(buffer);
      const detectedInfo = detected ? DETECTED_TO_EXT[detected] : undefined;
      const ext = detectedInfo?.ext ?? 'jpg';
      const realMime = detectedInfo?.mime ?? 'image/jpeg';
      const fileName = `${bookingId}/${u.accessory_unit_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('damage-photos')
        .upload(fileName, buffer, { contentType: realMime, upsert: false });

      if (uploadErr) {
        console.error('[accessory-damage] photo upload failed:', uploadErr);
        continue;
      }

      const { data: urlData } = supabase.storage.from('damage-photos').getPublicUrl(fileName);
      if (urlData?.publicUrl) photoUrls.push(urlData.publicUrl);
    }

    if (photoUrls.length === 0) {
      return NextResponse.json(
        { error: 'Keine Fotos konnten hochgeladen werden. Bitte erneut versuchen.' },
        { status: 500 },
      );
    }

    // damage_reports-Insert
    const { data: report, error: insertErr } = await supabase
      .from('damage_reports')
      .insert({
        booking_id: bookingId,
        reported_by: 'admin',
        description: u.notes.trim(),
        photos: photoUrls,
        damage_amount: u.retained_amount,
        deposit_retained: u.retained_amount, // wird beim Stripe-Capture gesetzt
        status: 'confirmed',
        accessory_unit_id: u.accessory_unit_id,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[accessory-damage] insert failed:', insertErr);
      return NextResponse.json(
        { error: 'Schadensmeldung konnte nicht gespeichert werden.', details: insertErr.message },
        { status: 500 },
      );
    }
    createdReports.push({ unitId: u.accessory_unit_id, reportId: report.id as string });

    // accessory_units.status update
    await supabase
      .from('accessory_units')
      .update({
        status: u.condition,
        retired_at: u.condition === 'lost' ? new Date().toISOString().slice(0, 10) : null,
        retirement_reason: u.condition === 'lost' ? `Verloren bei Buchung ${bookingId}: ${u.notes.trim().slice(0, 200)}` : null,
      })
      .eq('id', u.accessory_unit_id);
  }

  // Schritt 2: Stripe-Capture (1× mit Summe)
  let stripeCaptured = false;
  let stripeError: string | null = null;

  if (booking.deposit_intent_id && booking.deposit_status === 'held' && totalRetained > 0) {
    try {
      const stripe = await getStripe();
      await stripe.paymentIntents.capture(booking.deposit_intent_id, {
        amount_to_capture: Math.round(totalRetained * 100),
      });
      stripeCaptured = true;
      await supabase
        .from('bookings')
        .update({ deposit_status: 'captured' })
        .eq('id', bookingId);
    } catch (err) {
      stripeError = err instanceof Error ? err.message : 'Stripe-Capture fehlgeschlagen';
      console.error('[accessory-damage] Stripe capture failed:', err);
    }
  }

  // Audit-Log
  try {
    await logAudit({
      action: 'accessory_damage.confirm',
      entityType: 'booking',
      entityId: bookingId,
      entityLabel: `${booking.customer_name ?? bookingId} — ${units.length} Exemplar(e)`,
      changes: {
        units: units.map((u) => ({
          unit: u.accessory_unit_id,
          condition: u.condition,
          retained: u.retained_amount,
        })),
        total: totalRetained,
        stripeCaptured,
        stripeError,
      },
      request: req,
    });
  } catch (auditErr) {
    console.error('[accessory-damage] audit log failed:', auditErr);
  }

  return NextResponse.json({
    success: true,
    partial: !stripeCaptured && !!booking.deposit_intent_id && booking.deposit_status === 'held',
    reports: createdReports,
    totalRetained,
    stripeCaptured,
    stripeError,
    message: stripeCaptured
      ? `${units.length} Exemplar(e) als Schaden dokumentiert. ${totalRetained.toFixed(2)} € über Stripe einbehalten.`
      : booking.deposit_intent_id
        ? `${units.length} Exemplar(e) dokumentiert — Stripe-Capture fehlgeschlagen, bitte unter /admin/schaeden nachholen.`
        : `${units.length} Exemplar(e) dokumentiert. Kein Stripe-Hold vorhanden — Kaution muss separat geklärt werden.`,
  });
}
