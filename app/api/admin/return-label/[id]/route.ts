import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getSendcloudKeys } from '@/lib/env-mode';
import { isSendcloudUrl } from '@/lib/url-allowlist';
import { resizePdfToA5Portrait, imageToA5PortraitPdf } from '@/lib/pdf/label-resize';
import { detectFileType, detectImageType } from '@/lib/file-type-check';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

const STORAGE_BUCKET = 'return-labels';

/**
 * GET /api/admin/return-label/[id]
 *
 * Liefert das Retoure-Etikett als A5-Hochformat-PDF aus. Zwei Quellen:
 *
 *   1. Neu: hochgeladenes Etikett aus Supabase-Storage (return-labels-Bucket).
 *      `bookings.return_label_url` enthaelt einen relativen Storage-Pfad
 *      `return-labels/<bookingId>.pdf`. Schon beim Upload auf A5 konvertiert.
 *
 *   2. Legacy: alte Sendcloud-Retoure-URL (`https://panel.sendcloud.sc/...`).
 *      Wird wie das Hin-Etikett heruntergeladen und auf A5 skaliert.
 *
 * Erkennung ueber das URL-Prefix: `https://` → Sendcloud-Proxy, sonst Storage.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_token')?.value;
  if (!adminAuth) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, return_label_url')
    .eq('id', bookingId)
    .single();

  if (error || !booking?.return_label_url) {
    return NextResponse.json({ error: 'Kein Rücksendeetikett vorhanden.' }, { status: 404 });
  }

  const url = booking.return_label_url;
  let pdf: Uint8Array;

  if (url.startsWith('https://')) {
    // Legacy: Sendcloud-URL — herunterladen + skalieren.
    if (!isSendcloudUrl(url)) {
      return NextResponse.json({ error: 'Label-URL ist keine Sendcloud-URL.' }, { status: 502 });
    }
    const { publicKey, secretKey } = await getSendcloudKeys();
    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    const labelRes = await fetch(url, { headers: { Authorization: auth } });
    if (!labelRes.ok) {
      return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    const srcBuffer = await labelRes.arrayBuffer();
    try {
      pdf = await resizePdfToA5Portrait(srcBuffer);
    } catch (e) {
      console.error('[return-label] A5-Skalierung fehlgeschlagen, gebe Original zurueck:', e);
      pdf = new Uint8Array(srcBuffer);
    }
  } else {
    // Neu: Storage-Pfad. Schon beim Upload auf A5 konvertiert.
    const { data, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(stripBucketPrefix(url));
    if (dlErr || !data) {
      console.error('[return-label] Storage-Download fehlgeschlagen:', dlErr?.message);
      return NextResponse.json({ error: 'Etikett konnte nicht geladen werden.' }, { status: 502 });
    }
    pdf = new Uint8Array(await data.arrayBuffer());
  }

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ruecksendeetikett-${bookingId}.pdf"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * POST /api/admin/return-label/[id]
 *
 * Admin laedt das Retoure-Etikett als JPG/PNG/PDF hoch. Wir konvertieren es
 * SOFORT auf A5 Hochformat (lib/pdf/label-resize.ts) und legen das fertige
 * PDF in `return-labels/<bookingId>.pdf` ab. `bookings.return_label_url`
 * wird auf den Storage-Pfad gesetzt.
 *
 * Request: multipart/form-data, Feld `file` (Bild oder PDF, max 10 MB).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const { id: bookingId } = await params;

  // Booking-Existenz pruefen, damit kein verwaister Storage-Eintrag entsteht.
  const supabase = createServiceClient();
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Multipart-Body erforderlich.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Datei-Feld "file" fehlt.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Datei ist leer.' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei zu gross (max. 10 MB).' }, { status: 413 });
  }

  // Optional: bei A4-Hochformat-PDFs nur die obere Haelfte als Etikett
  // verwenden (DHL-Retoure-Etikett-Standard: oben Etikett, unten Mieter-
  // Anleitung). Greift nur fuer PDFs.
  const useTopHalfOnly = formData.get('useTopHalfOnly') === 'true';

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Echten Format-Code via Magic-Byte ermitteln (Client-Content-Type ist
  // nicht vertrauenswuerdig — siehe Sweep 5). detectFileType / detectImageType
  // liefern Kurz-Codes wie 'pdf' / 'jpeg' / 'png'.
  const detected = detectFileType(buffer) ?? detectImageType(buffer);
  let actualMime: 'application/pdf' | 'image/jpeg' | 'image/png';
  if (detected === 'pdf') actualMime = 'application/pdf';
  else if (detected === 'jpeg') actualMime = 'image/jpeg';
  else if (detected === 'png') actualMime = 'image/png';
  else {
    return NextResponse.json(
      { error: 'Dateityp nicht unterstützt — nur JPG, PNG oder PDF.' },
      { status: 415 },
    );
  }

  // Konversion zu A5-Hochformat-PDF. `useTopHalfOnly` wirkt nur fuer PDFs;
  // bei Bildern wird der Toggle ignoriert.
  let a5Pdf: Uint8Array;
  try {
    if (actualMime === 'application/pdf') {
      a5Pdf = await resizePdfToA5Portrait(arrayBuffer, { useTopHalfOnly });
    } else {
      a5Pdf = await imageToA5PortraitPdf(arrayBuffer, actualMime);
    }
  } catch (e) {
    console.error('[return-label POST] A5-Konversion fehlgeschlagen:', e);
    return NextResponse.json({ error: 'Datei konnte nicht zu A5 konvertiert werden.' }, { status: 500 });
  }

  // Storage: Upsert auf festen Pfad pro Buchung — neuer Upload ueberschreibt
  // den alten (Admin kann das Etikett also einfach durch erneutes Hochladen
  // ersetzen).
  const storagePath = `${bookingId}.pdf`;
  const uploadRes = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, a5Pdf, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadRes.error) {
    const msg = uploadRes.error.message;
    if (/Bucket not found|bucket.*not.*exist/i.test(msg)) {
      return NextResponse.json(
        { error: `Storage-Bucket "${STORAGE_BUCKET}" fehlt — bitte im Supabase-Dashboard anlegen (siehe supabase/supabase-return-labels-bucket.sql).` },
        { status: 503 },
      );
    }
    console.error('[return-label POST] Storage-Upload fehlgeschlagen:', msg);
    return NextResponse.json({ error: 'Datei konnte nicht gespeichert werden.' }, { status: 500 });
  }

  // bookings.return_label_url auf den Storage-Pfad setzen (Format mit
  // Bucket-Prefix, damit der GET-Pfad eindeutig vom Sendcloud-Legacy zu
  // unterscheiden ist).
  const dbUrl = `${STORAGE_BUCKET}/${storagePath}`;
  await supabase.from('bookings').update({ return_label_url: dbUrl }).eq('id', bookingId);

  await logAudit({
    action: 'return_label.upload',
    entityType: 'booking',
    entityId: bookingId,
    changes: {
      sourceMime: actualMime,
      sizeBytes: file.size,
      useTopHalfOnly: useTopHalfOnly && actualMime === 'application/pdf',
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    returnLabelUrl: dbUrl,
  });
}

/** Entfernt den Bucket-Prefix `return-labels/` aus dem DB-Pfad. */
function stripBucketPrefix(dbUrl: string): string {
  const prefix = `${STORAGE_BUCKET}/`;
  return dbUrl.startsWith(prefix) ? dbUrl.slice(prefix.length) : dbUrl;
}
