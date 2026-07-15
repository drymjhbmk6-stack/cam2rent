/**
 * Anhänge für Schadensmeldungen: beliebige Dokumente (PDF/Bild) hochladen +
 * optional den E-Mail-Verlauf der Buchung als PDF anhängen. Freigabe pro Datei
 * (customer_visible_paths) steuert, was der Kunde bekommt.
 */

import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { detectFileType } from '@/lib/file-type-check';
import { getBerlinDateString } from '@/lib/timezone';
import { MailverlaufPDF, type MailverlaufEntry } from '@/lib/mailverlauf-pdf';

export const DAMAGE_ATTACH_BUCKET = 'damage-attachments';
export const DAMAGE_PHOTO_BUCKET = 'damage-photos';

export interface DamageAttachment {
  path: string;
  filename: string;
  mime: string;
  source: 'upload' | 'email_history';
}

const EXT_MIME: Record<string, { ext: string; mime: string }> = {
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
};

const EMAIL_TYPE_LABELS: Record<string, string> = {
  booking_confirmation: 'Buchungsbestätigung',
  booking_admin: 'Admin-Info',
  cancellation_customer: 'Stornierung',
  shipping_confirmation: 'Versandbestätigung',
  contract_signed: 'Mietvertrag',
  damage_report_customer: 'Schadensmeldung',
  damage_documented_customer: 'Schaden dokumentiert',
  damage_resolution: 'Schadensabschluss',
  schadensersatz_forderung: 'Schadensersatz-Forderung',
  payment_link: 'Zahlungslink',
  review_request: 'Bewertungsanfrage',
  extension_confirmation: 'Verlängerung',
  inbound_received: 'Kunde eingehend',
  inbound_reply: 'Antwort an Kunde',
};

let bucketEnsured = false;
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    await supabase.storage.createBucket(DAMAGE_ATTACH_BUCKET, {
      public: false,
      fileSizeLimit: 15 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    });
  } catch {
    // existiert bereits → ok
  }
  bucketEnsured = true;
}

async function uploadBuffer(
  supabase: SupabaseClient,
  bookingId: string,
  buffer: Buffer,
  ext: string,
  mime: string,
): Promise<string | null> {
  const path = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  let { error } = await supabase.storage.from(DAMAGE_ATTACH_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (error && /bucket not found/i.test(error.message)) {
    bucketEnsured = false;
    await ensureBucket(supabase);
    ({ error } = await supabase.storage.from(DAMAGE_ATTACH_BUCKET).upload(path, buffer, { contentType: mime, upsert: false }));
  }
  if (error) {
    console.error('[damage-attachments] Upload-Fehler:', error.message);
    return null;
  }
  return path;
}

/** Lädt eine hochgeladene Dokumentdatei (Magic-Byte-geprüft) hoch. */
export async function uploadDamageDocument(
  supabase: SupabaseClient,
  bookingId: string,
  file: File,
): Promise<DamageAttachment | { error: string }> {
  if (file.size > 15 * 1024 * 1024) {
    return { error: `Datei "${file.name}" ist zu groß (max 15 MB).` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectFileType(buffer);
  const info = detected ? EXT_MIME[detected] : undefined;
  if (!info) {
    return { error: `Datei "${file.name}" muss ein PDF oder Bild (JPG/PNG/WebP) sein.` };
  }
  await ensureBucket(supabase);
  const path = await uploadBuffer(supabase, bookingId, buffer, info.ext, info.mime);
  if (!path) return { error: `Datei "${file.name}" konnte nicht gespeichert werden.` };
  const baseName = (file.name || `Dokument.${info.ext}`).replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
  return { path, filename: baseName.includes('.') ? baseName : `${baseName}.${info.ext}`, mime: info.mime, source: 'upload' };
}

/** Baut aus `email_log` ein Mailverlauf-PDF und legt es als Anhang ab. */
export async function buildEmailHistoryAttachment(
  supabase: SupabaseClient,
  bookingId: string,
  customerName: string,
): Promise<DamageAttachment | null> {
  try {
    const { data: rows } = await supabase
      .from('email_log')
      .select('email_type, subject, status, customer_email, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    const entries: MailverlaufEntry[] = (rows ?? []).map((r) => {
      const d = r.created_at ? new Date(r.created_at as string) : null;
      const datum = d
        ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
        : '—';
      return {
        datum,
        typ: EMAIL_TYPE_LABELS[r.email_type as string] || (r.email_type as string) || '—',
        betreff: (r.subject as string) || '',
        empfaenger: (r.customer_email as string) || '',
        status: r.status === 'sent' ? 'Gesendet' : 'Fehler',
      };
    });

    const pdfBuffer = await renderToBuffer(
      createElement(MailverlaufPDF, {
        data: {
          bookingId,
          customerName,
          erstelltAm: getBerlinDateString(),
          entries,
        },
      }) as ReactElement<DocumentProps>,
    );

    await ensureBucket(supabase);
    const path = await uploadBuffer(supabase, bookingId, Buffer.from(pdfBuffer), 'pdf', 'application/pdf');
    if (!path) return null;
    return { path, filename: `Mailverlauf-${bookingId}.pdf`, mime: 'application/pdf', source: 'email_history' };
  } catch (err) {
    console.error('[damage-attachments] Mailverlauf-PDF fehlgeschlagen:', err);
    return null;
  }
}

/** Signierte URL (5 Min) für einen Anhang- oder Foto-Pfad. */
export async function signedDamageAttachmentUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  // Fotos liegen im damage-photos-Bucket, Dokumente in damage-attachments.
  const bucket = /\.(jpg|jpeg|png|webp|heic|heif|gif)$/i.test(path) && !path.includes('/email') ? DAMAGE_PHOTO_BUCKET : DAMAGE_ATTACH_BUCKET;
  // Beide Buckets probieren (Foto vs. Dokument), damit der Endpoint pfad-robust ist.
  for (const b of [bucket, bucket === DAMAGE_PHOTO_BUCKET ? DAMAGE_ATTACH_BUCKET : DAMAGE_PHOTO_BUCKET]) {
    const { data } = await supabase.storage.from(b).createSignedUrl(path, 300);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

/**
 * Lädt die dem Kunden freigegebenen Dateien (Fotos + Dokumente) als Buffer für
 * den E-Mail-Versand. `photos` liegen im Foto-Bucket, `attachments` im
 * Dokument-Bucket.
 */
export async function loadCustomerVisibleFiles(
  supabase: SupabaseClient,
  opts: { photos: string[]; attachments: DamageAttachment[]; visiblePaths: string[] },
): Promise<{ filename: string; content: Buffer }[]> {
  const visible = new Set(opts.visiblePaths);
  const out: { filename: string; content: Buffer }[] = [];

  for (const p of opts.photos) {
    if (!visible.has(p)) continue;
    const { data } = await supabase.storage.from(DAMAGE_PHOTO_BUCKET).download(p);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      out.push({ filename: p.split('/').pop() || 'Foto.jpg', content: buf });
    }
  }
  for (const a of opts.attachments) {
    if (!visible.has(a.path)) continue;
    const { data } = await supabase.storage.from(DAMAGE_ATTACH_BUCKET).download(a.path);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      out.push({ filename: a.filename, content: buf });
    }
  }
  return out;
}
