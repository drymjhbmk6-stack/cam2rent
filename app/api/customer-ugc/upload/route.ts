import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isAllowedImage, isAllowedVideo, detectImageType, detectVideoType } from '@/lib/file-type-check';
import { createAdminNotification } from '@/lib/admin-notifications';
import { isTestMode } from '@/lib/env-mode';

export const runtime = 'nodejs';
export const maxDuration = 60;

const uploadLimiter = rateLimit({ maxAttempts: 5, windowMs: 60 * 60 * 1000 }); // 5/h

type UgcSettings = {
  approve_discount_percent: number;
  approve_min_order_value: number;
  approve_validity_days: number;
  feature_discount_percent: number;
  feature_min_order_value: number;
  feature_validity_days: number;
  max_files_per_submission: number;
  max_file_size_mb: number;
  enabled: boolean;
};

const DEFAULT_SETTINGS: UgcSettings = {
  approve_discount_percent: 15,
  approve_min_order_value: 50,
  approve_validity_days: 120,
  feature_discount_percent: 25,
  feature_min_order_value: 50,
  feature_validity_days: 180,
  max_files_per_submission: 5,
  max_file_size_mb: 50,
  enabled: true,
};

async function loadUgcSettings(supabase: ReturnType<typeof createServiceClient>): Promise<UgcSettings> {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'customer_ugc_rewards')
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data?.value ?? {}) };
}

const IMAGE_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  heic: 'heic',
  heif: 'heif',
  gif: 'gif',
};
const VIDEO_EXT: Record<string, string> = {
  mp4: 'mp4',
  mov: 'mov',
  webm: 'webm',
};

/**
 * POST /api/customer-ugc/upload
 * FormData:
 *   - bookingId (string)
 *   - caption (string, optional)
 *   - consent_use_website, consent_use_social, consent_use_blog,
 *     consent_use_marketing, consent_name_visible (bool, "true"/"false")
 *   - files (File[], 1..max_files_per_submission)
 *
 * Auth: Bearer-Token in Authorization-Header.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success: rateOk } = uploadLimiter.check(ip);
  if (!rateOk) {
    return NextResponse.json(
      { error: 'Zu viele Upload-Versuche. Bitte versuche es später.' },
      { status: 429 },
    );
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const settings = await loadUgcSettings(supabase);

    if (!settings.enabled) {
      return NextResponse.json(
        { error: 'Material-Uploads sind aktuell nicht verfügbar.' },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const bookingId = String(formData.get('bookingId') ?? '').trim();
    const caption = String(formData.get('caption') ?? '').trim().slice(0, 1000);

    const consent = {
      use_website: formData.get('consent_use_website') === 'true',
      use_social: formData.get('consent_use_social') === 'true',
      use_blog: formData.get('consent_use_blog') === 'true',
      use_marketing: formData.get('consent_use_marketing') === 'true',
      name_visible: formData.get('consent_name_visible') === 'true',
    };

    if (!bookingId) {
      return NextResponse.json({ error: 'Buchungsnummer fehlt.' }, { status: 400 });
    }

    // Mindestens eine Kanal-Zustimmung pflicht
    if (!consent.use_website && !consent.use_social && !consent.use_blog && !consent.use_marketing) {
      return NextResponse.json(
        { error: 'Bitte stimme mindestens einem Nutzungskanal zu.' },
        { status: 400 },
      );
    }

    // Buchung laden und Eigentuemer pruefen
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, user_id, customer_email, customer_name, status, rental_to, is_test')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Keine Berechtigung für diese Buchung.' }, { status: 403 });
    }

    // Nur fuer abgeschlossene oder laufende Mieten (picked_up, shipped, returned, completed)
    const allowedStatuses = ['picked_up', 'shipped', 'returned', 'completed'];
    if (!allowedStatuses.includes(booking.status)) {
      return NextResponse.json(
        { error: 'Material kann erst nach Beginn deiner Miete hochgeladen werden.' },
        { status: 400 },
      );
    }

    // Duplikat-Schutz: keine zweite aktive Submission fuer dieselbe Buchung
    const { data: existing } = await supabase
      .from('customer_ugc_submissions')
      .select('id, status')
      .eq('booking_id', bookingId)
      .in('status', ['pending', 'approved', 'featured'])
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            'Für diese Buchung liegt bereits ein Upload vor. Wenn du ersetzen möchtest, ziehe die alte Einreichung zuerst zurück.',
        },
        { status: 409 },
      );
    }

    // Dateien sammeln
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ error: 'Bitte mindestens eine Datei anhängen.' }, { status: 400 });
    }

    if (files.length > settings.max_files_per_submission) {
      return NextResponse.json(
        { error: `Maximal ${settings.max_files_per_submission} Dateien pro Upload.` },
        { status: 400 },
      );
    }

    const maxSize = settings.max_file_size_mb * 1024 * 1024;

    const storagePaths: string[] = [];
    const fileKinds: ('image' | 'video')[] = [];
    const fileSizes: number[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > maxSize) {
        return NextResponse.json(
          { error: `Datei "${file.name}" ist zu groß (max ${settings.max_file_size_mb} MB).` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      const imgType = detectImageType(buffer);
      const vidType = imgType ? null : detectVideoType(buffer);

      let ext: string;
      let kind: 'image' | 'video';
      let contentType: string;

      if (imgType && isAllowedImage(buffer)) {
        kind = 'image';
        ext = IMAGE_EXT[imgType] ?? 'jpg';
        contentType = `image/${imgType === 'jpeg' ? 'jpeg' : imgType}`;
      } else if (vidType && isAllowedVideo(buffer)) {
        kind = 'video';
        ext = VIDEO_EXT[vidType] ?? 'mp4';
        contentType =
          vidType === 'mov'
            ? 'video/quicktime'
            : vidType === 'webm'
              ? 'video/webm'
              : 'video/mp4';
      } else {
        return NextResponse.json(
          {
            error: `Datei "${file.name}" ist kein gültiges Bild (JPG/PNG/WebP/HEIC) oder Video (MP4/MOV/WebM).`,
          },
          { status: 400 },
        );
      }

      // Pfad: {user_id}/{booking_id}/{timestamp}_{index}.{ext}
      const ts = Date.now();
      const filePath = `${user.id}/${bookingId}/${ts}_${i}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('customer-ugc')
        .upload(filePath, buffer, {
          contentType,
          upsert: false,
        });

      if (uploadErr) {
        console.error('[ugc-upload] Storage-Fehler:', uploadErr.message);
        // Was schon hochgeladen wurde aufraeumen
        if (storagePaths.length > 0) {
          await supabase.storage.from('customer-ugc').remove(storagePaths);
        }
        return NextResponse.json(
          { error: `Fehler beim Hochladen von "${file.name}". Bitte später erneut versuchen.` },
          { status: 500 },
        );
      }

      storagePaths.push(filePath);
      fileKinds.push(kind);
      fileSizes.push(file.size);
    }

    // Submission speichern
    const { data: submission, error: insertErr } = await supabase
      .from('customer_ugc_submissions')
      .insert({
        booking_id: bookingId,
        user_id: user.id,
        customer_email: booking.customer_email ?? user.email ?? null,
        customer_name: booking.customer_name ?? null,
        file_paths: storagePaths,
        file_kinds: fileKinds,
        file_sizes: fileSizes,
        caption: caption || null,
        consent_use_website: consent.use_website,
        consent_use_social: consent.use_social,
        consent_use_blog: consent.use_blog,
        consent_use_marketing: consent.use_marketing,
        consent_name_visible: consent.name_visible,
        consent_at: new Date().toISOString(),
        consent_ip: ip,
        status: 'pending',
        is_test: (await isTestMode()) || booking.is_test === true,
      })
      .select('id')
      .single();

    if (insertErr || !submission) {
      console.error('[ugc-upload] DB-Fehler:', insertErr?.message);
      // Rollback: Dateien wieder loeschen
      await supabase.storage.from('customer-ugc').remove(storagePaths);
      return NextResponse.json(
        { error: 'Speichern fehlgeschlagen. Bitte später erneut versuchen.' },
        { status: 500 },
      );
    }

    // Admin-Benachrichtigung (nicht-blockierend)
    await createAdminNotification(supabase, {
      type: 'new_ugc',
      title: 'Neues Kundenmaterial',
      message: `${booking.customer_name ?? user.email ?? 'Ein Kunde'} hat ${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} zur Buchung ${bookingId} hochgeladen.`,
      link: `/admin/kunden-material?open=${submission.id}`,
    });

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      filesCount: files.length,
      reward: {
        discountPercent: settings.approve_discount_percent,
        validityDays: settings.approve_validity_days,
        minOrderValue: settings.approve_min_order_value,
      },
    });
  } catch (err) {
    console.error('[ugc-upload] Unerwarteter Fehler:', err);
    return NextResponse.json(
      { error: 'Fehler beim Hochladen. Bitte später erneut versuchen.' },
      { status: 500 },
    );
  }
}
