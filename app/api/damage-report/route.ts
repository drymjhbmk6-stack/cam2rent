import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isAllowedImage, detectImageType } from '@/lib/file-type-check';
import {
  sendDamageReportConfirmation,
  sendAdminDamageNotification,
} from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';

// Endgueltiges Mapping vom Magic-Byte-Resultat auf Extension + MIME.
// Vorher wurde die Endung aus dem Client-MIME (`photo.type`) abgeleitet — der ist
// frei manipulierbar. Eine .exe mit `Content-Type: image/jpeg` wuerde dann als
// .jpg gespeichert und mit `image/jpeg` ausgeliefert.
const DETECTED_TO_EXT: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  heic: { ext: 'heic', mime: 'image/heic' },
  heif: { ext: 'heif', mime: 'image/heif' },
  gif: { ext: 'gif', mime: 'image/gif' },
};

const damageLimiter = rateLimit({ maxAttempts: 3, windowMs: 60 * 60 * 1000 }); // 3 pro Stunde

/**
 * POST /api/damage-report
 * Kunde reicht eine Schadensmeldung ein.
 * Body (FormData):
 *   - bookingId: string
 *   - description: string
 *   - photos: File[] (max 5, je max 5MB)
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = damageLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte versuche es später.' }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const bookingId = formData.get('bookingId') as string;
    const description = formData.get('description') as string;

    if (!bookingId || !description) {
      return NextResponse.json(
        { error: 'Buchungs-ID und Beschreibung sind erforderlich.' },
        { status: 400 }
      );
    }

    if (description.length > 2000) {
      return NextResponse.json(
        { error: 'Beschreibung darf maximal 2000 Zeichen lang sein.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Buchung prüfen
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, product_name, customer_name, customer_email, user_id, status')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    // Ownership-Check: nur der Kunde der Buchung (oder ein registrierter
    // Kunde bei Gast-Buchungen über matching E-Mail) darf melden.
    // Schadensberichte können finanzielle Konsequenzen haben — strikt prüfen.
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* no-op */ },
        },
      }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });
    }
    const matchesUser = booking.user_id === user.id;
    const matchesEmail = !booking.user_id && booking.customer_email === user.email;
    if (!matchesUser && !matchesEmail) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
    }

    // Nur shipped/completed Buchungen
    if (!['shipped', 'completed'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'Schadensmeldung nur für versendete oder abgeschlossene Buchungen möglich.' },
        { status: 400 }
      );
    }

    // Fotos hochladen
    const photoUrls: string[] = [];
    const photos = formData.getAll('photos') as File[];

    if (photos.length > 5) {
      return NextResponse.json({ error: 'Maximal 5 Fotos erlaubt.' }, { status: 400 });
    }

    for (const photo of photos) {
      if (!(photo instanceof File) || photo.size === 0) continue;
      if (photo.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: `Datei "${photo.name}" ist zu groß (max 5 MB).` },
          { status: 400 }
        );
      }

      // Magic-Byte-Check: Datei wirklich auf binaer-Signatur pruefen statt auf den
      // Client-gemeldeten MIME-Type zu vertrauen. Die Buchung kann finanzielle
      // Konsequenzen haben (Haftungsfall) → keine getarnten Files in den Bucket.
      const buffer = Buffer.from(await photo.arrayBuffer());
      if (!isAllowedImage(buffer)) {
        return NextResponse.json(
          { error: `Datei "${photo.name}" ist kein gueltiges Bild (JPEG/PNG/WebP/HEIC/GIF erwartet).` },
          { status: 400 },
        );
      }
      const detected = detectImageType(buffer);
      const detectedInfo = detected ? DETECTED_TO_EXT[detected] : undefined;
      const ext = detectedInfo?.ext ?? 'jpg';
      const realMime = detectedInfo?.mime ?? 'image/jpeg';
      const fileName = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('damage-photos')
        .upload(fileName, buffer, {
          contentType: realMime,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Photo upload error:', uploadErr);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('damage-photos')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        photoUrls.push(urlData.publicUrl);
      }
    }

    // Schadensmeldung erstellen
    const { data: report, error: insertErr } = await supabase
      .from('damage_reports')
      .insert({
        booking_id: bookingId,
        reported_by: 'customer',
        description,
        photos: photoUrls,
        status: 'open',
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Insert damage_report error:', insertErr);
      return NextResponse.json(
        { error: 'Schadensmeldung konnte nicht erstellt werden.' },
        { status: 500 }
      );
    }

    // E-Mails senden (fire-and-forget)
    const emailData = {
      bookingId,
      customerName: booking.customer_name || '',
      customerEmail: booking.customer_email || '',
      productName: booking.product_name || '',
      description,
      photoCount: photoUrls.length,
    };

    Promise.all([
      sendDamageReportConfirmation(emailData).catch((e) =>
        console.error('Damage confirmation email error:', e)
      ),
      sendAdminDamageNotification(emailData).catch((e) =>
        console.error('Admin damage notification error:', e)
      ),
    ]);

    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'new_damage',
      title: 'Neuer Schadensbericht',
      message: `${booking.customer_name} — ${booking.product_name}`,
      link: `/admin/schaeden`,
    });

    return NextResponse.json({ success: true, reportId: report.id });
  } catch (err) {
    console.error('POST /api/damage-report error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Einreichen der Schadensmeldung.' },
      { status: 500 }
    );
  }
}
