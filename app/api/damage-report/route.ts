import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  sendDamageReportConfirmation,
  sendAdminDamageNotification,
} from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';

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

      const ext = photo.name.split('.').pop() || 'jpg';
      const fileName = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const buffer = Buffer.from(await photo.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from('damage-photos')
        .upload(fileName, buffer, {
          contentType: photo.type || 'image/jpeg',
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
